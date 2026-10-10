"""High-Intent Buyers hub — intent data cloud, agent briefings and integration pushes.

Authenticated surface for /discover:
  - status / tracking config (ingest key, URL→intent patterns, snippet + Events API)
  - unified account profiles (one per account, real-time intent score + event timeline)
  - live signal feed, test-signal injector, full rebuild, analytics pull
  - contextual agent briefings (Claude) and push of assignment/briefing/offer to a
    connected CRM (HubSpot / Salesforce / Pipedrive) or Slack
Public surface (no auth, keyed by the org's ingest key): tracking snippet, beacon
collector, server-to-server Events API and the storefront personalization lookup.
"""
import json
import secrets
import logging
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from database import db
from models import User
from dependencies import get_current_user, org_filter, require_paid, require_paid_owner
from utils.rate_limit import limiter
from routes.intent_common import (
    EVENT_TYPES, DEFAULT_PATTERNS, PUSH_DESTINATIONS,
    now_iso, connected_destinations, post_slack, crm_task, crm_note, org_conn,
)
from routes.intent_engine import (
    STATUSES, get_tracking, org_for_key, resolve_account, ingest_events, rebuild_all, generate_briefing,
    match_offer, log_activity, _signal_line,
)
from routes.intent_sources import FETCHERS
from routes.storefront_snippet import build_snippet

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()

PUBLIC_HEADERS = {"Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"}


class SimulateReq(BaseModel):
    account: str
    type: str
    email: Optional[str] = ""
    region: Optional[str] = ""
    url: Optional[str] = ""


class PatternsReq(BaseModel):
    patterns: dict


class ProfilePatch(BaseModel):
    status: Optional[str] = None
    contact_email: Optional[str] = None


class PushReq(BaseModel):
    destination: str
    kind: str  # assignment | briefing | offer


class EventsApiReq(BaseModel):
    key: Optional[str] = ""
    events: List[dict]


async def _lead(lead_id: str, user: User) -> dict:
    lead = await db.intent_leads.find_one({"lead_id": lead_id, **org_filter(user)}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Profile not found")
    return lead


def _summary(l: dict) -> dict:
    keep = ("lead_id", "account", "account_key", "domain", "contacts", "contact_email", "region", "value", "probability",
            "best_stage", "intent_score", "digital_score", "crm_score", "tier", "surge", "events_24h", "event_count",
            "last_event_at", "first_seen_at", "sources", "signals", "status", "assignment", "updated_at")
    out = {k: l.get(k) for k in keep}
    b = l.get("agent_briefing")
    out["briefing_ready"] = bool(b)
    out["briefing_headline"] = (b or {}).get("headline")
    return out


# ------------------------------------------------------------------ status + tracking
@router.get("/intent/status")
async def intent_status(request: Request, user: User = Depends(get_current_user)):
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or "trial"
    is_paid = tier not in {"trial", "expired", "cancelled", "free"}
    origin = request.headers.get("origin") or ""
    tracking = await get_tracking(user.org_id)
    if origin and origin != tracking.get("app_origin"):
        await db.intent_tracking.update_one({"org_id": user.org_id}, {"$set": {"app_origin": origin}})
    analytics = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": list(FETCHERS)}}, {"_id": 0, "platform": 1}).to_list(20)
    return {
        "is_paid": is_paid, "is_owner": user.role == "owner",
        "destinations": await connected_destinations(user.org_id),
        "analytics_connected": sorted({c["platform"] for c in analytics}),
        "tracking_live": bool(tracking.get("last_event_at")),
        "open_profiles": await db.intent_leads.count_documents({**org_filter(user), "status": {"$nin": ["dismissed", "won", "lost"]}}),
        "event_types": {k: {"label": v[0], "weight": v[1], "cat": v[2]} for k, v in EVENT_TYPES.items()},
    }


def _tracking_view(t: dict, request: Request) -> dict:
    base = str(request.base_url).rstrip("/").replace("http://", "https://")
    fwd = request.headers.get("x-forwarded-host")
    if fwd:
        base = f"https://{fwd}"
    return {"ingest_key": t["ingest_key"], "patterns": t.get("patterns") or DEFAULT_PATTERNS,
            "last_event_at": t.get("last_event_at"),
            "snippet_url": f"{base}/api/public/intent/{t['ingest_key']}/snippet.js",
            "events_api_url": f"{base}/api/public/intent/events"}


@router.get("/intent/tracking")
async def tracking_config(request: Request, user: User = Depends(require_paid)):
    return _tracking_view(await get_tracking(user.org_id), request)


@router.put("/intent/tracking/patterns")
async def set_patterns(body: PatternsReq, request: Request, user: User = Depends(require_paid_owner)):
    clean = {}
    for etype, pats in (body.patterns or {}).items():
        if etype in EVENT_TYPES and etype != "page_view" and isinstance(pats, list):
            clean[etype] = [str(p).strip()[:80] for p in pats if str(p).strip()][:10]
    await get_tracking(user.org_id)
    await db.intent_tracking.update_one({"org_id": user.org_id}, {"$set": {"patterns": clean}})
    return _tracking_view(await get_tracking(user.org_id), request)


@router.post("/intent/tracking/rotate")
async def rotate_key(request: Request, user: User = Depends(require_paid_owner)):
    await get_tracking(user.org_id)
    await db.intent_tracking.update_one({"org_id": user.org_id}, {"$set": {"ingest_key": f"ifk_{secrets.token_urlsafe(18)}"}})
    return _tracking_view(await get_tracking(user.org_id), request)


# ------------------------------------------------------------------ profiles + feed
@router.get("/intent/profiles")
async def list_profiles(user: User = Depends(require_paid)):
    leads = await db.intent_leads.find(org_filter(user), {"_id": 0, "activity": 0}).sort("intent_score", -1).to_list(500)
    return [_summary(l) for l in leads]


@router.get("/intent/profiles/{lead_id}")
async def get_profile(lead_id: str, user: User = Depends(require_paid)):
    lead = await _lead(lead_id, user)
    events = await db.intent_events.find(
        {**org_filter(user), "account_key": lead["account_key"]}, {"_id": 0, "properties": 0}
    ).sort("ts", -1).to_list(150)
    routing = await db.intent_routing_log.find({**org_filter(user), "lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    offer = await match_offer(user.org_id, lead)
    return {**lead, "events": events, "routing_log": routing, "offer": offer}


@router.patch("/intent/profiles/{lead_id}")
async def patch_profile(lead_id: str, body: ProfilePatch, user: User = Depends(require_paid_owner)):
    await _lead(lead_id, user)
    upd = {}
    if body.status is not None:
        if body.status not in STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        upd["status"] = body.status
    if body.contact_email is not None:
        upd["contact_email"] = body.contact_email.strip()
    if not upd:
        raise HTTPException(status_code=400, detail="Nothing to update")
    await db.intent_leads.update_one({"lead_id": lead_id}, {"$set": upd})
    if body.status:
        await log_activity(lead_id, "status", f"Status set to {body.status}", user.name or user.email)
    return _summary(await _lead(lead_id, user))


@router.get("/intent/feed")
async def signal_feed(limit: int = 40, user: User = Depends(require_paid)):
    return await db.intent_events.find(
        {**org_filter(user), "account_key": {"$ne": None}}, {"_id": 0, "properties": 0}
    ).sort("received_at", -1).to_list(max(1, min(limit, 100)))


@router.post("/intent/events/simulate")
async def simulate_event(body: SimulateReq, user: User = Depends(require_paid_owner)):
    if body.type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unknown intent event type")
    if not body.account.strip():
        raise HTTPException(status_code=400, detail="Account is required")
    res = await ingest_events(user.org_id, [{
        "type": body.type, "company": body.account.strip(), "email": body.email or "",
        "region": body.region or "", "url": body.url or "", "properties": {"test": "true"},
    }], "test")
    return res


@router.post("/intent/rebuild")
async def rebuild(user: User = Depends(require_paid)):
    return await rebuild_all(user.org_id)


@router.post("/intent/sync-analytics")
async def sync_analytics(user: User = Depends(require_paid_owner)):
    results = []
    for platform, fetch in FETCHERS.items():
        conn = await org_conn(user.org_id, platform)
        if not conn:
            continue
        events, err = await fetch(conn)
        accepted = 0
        if events:
            accepted = (await ingest_events(user.org_id, events, platform))["accepted"]
        results.append({"platform": platform, "fetched": len(events), "accepted": accepted, "error": err or None})
    if not results:
        raise HTTPException(status_code=400, detail="Connect GA4, Mixpanel, Amplitude or PostHog on the Integrations page first.")
    return {"results": results}


# ------------------------------------------------------------------ agent briefings
@router.post("/intent/profiles/{lead_id}/briefing")
async def make_briefing(lead_id: str, user: User = Depends(require_paid)):
    await _lead(lead_id, user)
    return await generate_briefing(user.org_id, lead_id)


@router.get("/intent/briefings")
async def list_briefings(user: User = Depends(require_paid)):
    leads = await db.intent_leads.find(
        {**org_filter(user), "status": {"$nin": ["dismissed", "lost"]}}, {"_id": 0, "activity": 0}
    ).sort("intent_score", -1).to_list(300)
    return [{**_summary(l), "briefing": l.get("agent_briefing")} for l in leads]


# ------------------------------------------------------------------ push to a connected integration
def _payload(kind: str, lead: dict, offer: Optional[dict]) -> tuple[str, str, list]:
    acct, score = lead.get("account"), lead.get("intent_score", 0)
    if kind == "assignment":
        a = lead.get("assignment")
        if not a:
            raise HTTPException(status_code=400, detail="Route this profile to an AE first.")
        body = (f"Assigned AE: {a['ae_name']} ({a['ae_email']})\nRule: {a['rule_name']}\nTrigger: {a['trigger'].get('label')}\n"
                f"Intent score: {score}/100\nSignals: {_signal_line(lead)}")
        return f"Speed-to-lead: {acct} → {a['ae_name']}", body, [("AE", a["ae_name"]), ("Intent", f"{score}/100")]
    if kind == "briefing":
        b = lead.get("agent_briefing")
        if not b:
            raise HTTPException(status_code=400, detail="Generate the agent briefing first.")
        s = b["script"]
        body = (f"{b['summary']}\n\nOPENER: {s['opener']}\n\nDISCOVERY:\n" + "\n".join(f"- {q}" for q in s["discovery_questions"])
                + "\n\nVALUE POINTS:\n" + "\n".join(f"- {v}" for v in s["value_points"])
                + "\n\nOBJECTIONS:\n" + "\n".join(f"- {o['objection']}: {o['response']}" for o in s["objection_handling"])
                + f"\n\nCLOSE: {s['close']}\n\nOFFER: {b['recommended_offer']}")
        return f"Agent briefing: {acct} — {b['headline']}", body, [("Stage", b["buying_stage"].replace("_", " ")), ("Intent", f"{score}/100")]
    if kind == "offer":
        if not offer:
            raise HTTPException(status_code=400, detail="No red-carpet storefront rule matches this profile yet.")
        body = (f"{offer['headline']}\n{offer['message']}\nPre-approved discount: {offer['discount_pct']}%\n"
                f"Contract terms: {offer['contract_terms'] or 'standard'}\n"
                f"Promo code: {offer['promo_code'] or 'none'}\nValid for {offer['expires_days']} days")
        return f"Red-carpet offer for {acct}: {offer['discount_pct']}% off", body, [("Rule", offer["name"]), ("Discount", f"{offer['discount_pct']}%")]
    raise HTTPException(status_code=400, detail="Unknown push kind")


@router.post("/intent/profiles/{lead_id}/push")
async def push_profile(lead_id: str, body: PushReq, user: User = Depends(require_paid_owner)):
    if body.destination not in PUSH_DESTINATIONS:
        raise HTTPException(status_code=400, detail="Unsupported destination")
    lead = await _lead(lead_id, user)
    offer = await match_offer(user.org_id, lead) if body.kind == "offer" else None
    title, text, fields = _payload(body.kind, lead, offer)
    if body.destination == "slack":
        res = await post_slack(user.org_id, title, fields, text[:2800], f"Pushed by {user.name or user.email} · InFlow")
    elif body.kind == "assignment":
        owner = ""
        ae = await db.intent_aes.find_one({"ae_id": lead["assignment"]["ae_id"]}, {"_id": 0})
        if ae:
            owner = (ae.get("crm_owner_ids") or {}).get(body.destination, "")
        res = await crm_task(user.org_id, body.destination, title, text, owner, lead)
    else:
        res = await crm_note(user.org_id, body.destination, title, text, lead)
    label = PUSH_DESTINATIONS[body.destination]
    if not res.get("ok"):
        raise HTTPException(status_code=422, detail=res.get("error") or f"{label} push failed")
    entry = {"ts": now_iso(), "destination": body.destination, "kind": body.kind, "id": res.get("id"), "by": user.name or user.email}
    await db.intent_leads.update_one({"lead_id": lead_id}, {"$push": {"pushes": entry}})
    await log_activity(lead_id, "push", f"Pushed {body.kind} to {label}", user.name or user.email)
    return {"ok": True, **entry}


# ------------------------------------------------------------------ public: snippet, collector, Events API, personalize
def _pub(data: dict, status: int = 200) -> JSONResponse:
    return JSONResponse(data, status_code=status, headers=PUBLIC_HEADERS)


@public_router.get("/public/intent/{key}/snippet.js")
async def snippet(key: str):
    t = await org_for_key(key)
    if not t:
        return Response("/* InFlow: invalid tracking key */", media_type="application/javascript", headers=PUBLIC_HEADERS)
    return Response(build_snippet(key, t.get("patterns") or DEFAULT_PATTERNS), media_type="application/javascript",
                    headers={**PUBLIC_HEADERS, "Cache-Control": "public, max-age=300"})


@public_router.post("/public/intent/{key}/collect")
@limiter.limit("240/minute")
async def collect(key: str, request: Request):
    t = await org_for_key(key)
    if not t:
        return _pub({"ok": False}, 404)
    try:
        data = json.loads((await request.body())[:20000] or b"{}")
    except Exception:
        return _pub({"ok": False, "error": "bad payload"}, 400)
    events = data if isinstance(data, list) else [data]
    res = await ingest_events(t["org_id"], [e for e in events if isinstance(e, dict)][:20], "snippet")
    return _pub({"ok": True, "accepted": res["accepted"]})


@public_router.post("/public/intent/events")
@limiter.limit("120/minute")
async def events_api(body: EventsApiReq, request: Request):
    t = await org_for_key(request.headers.get("x-inflow-key") or body.key or "")
    if not t:
        raise HTTPException(status_code=401, detail="Invalid or missing X-InFlow-Key")
    if not body.events:
        raise HTTPException(status_code=400, detail="events must be a non-empty list")
    res = await ingest_events(t["org_id"], body.events[:500], "api")
    return {"ok": True, "accepted": res["accepted"], "profiles_updated": res["profiles_updated"]}


@public_router.get("/public/intent/{key}/personalize")
@limiter.limit("240/minute")
async def personalize(key: str, request: Request, vid: str = "", email: str = "", company: str = ""):
    t = await org_for_key(key)
    if not t:
        return _pub({"qualified": False})
    org_id = t["org_id"]
    akey, _, _ = await resolve_account(org_id, email, company, "")
    if not akey and vid:
        m = await db.intent_visitors.find_one({"org_id": org_id, "visitor_id": vid[:64]}, {"_id": 0})
        akey = (m or {}).get("account_key", "")
    if not akey:
        return _pub({"qualified": False})
    lead = await db.intent_leads.find_one({"org_id": org_id, "account_key": akey}, {"_id": 0, "activity": 0})
    offer = await match_offer(org_id, lead)
    if not offer:
        return _pub({"qualified": False})
    await db.storefront_rules.update_one({"rule_id": offer["rule_id"]}, {"$inc": {"impressions": 1}})
    return _pub({"qualified": True, "account": lead.get("account"), "offer": offer})
