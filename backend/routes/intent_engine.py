"""High-Intent Buyers engine — the intent data cloud + speed-to-lead routing core.

  ingest_events  -> unify raw digital signals (snippet / Events API / analytics pulls)
                    into one account profile (db.intent_leads) with a decayed intent score
  schedule_routing / route_lead -> rule-based, round-robin AE assignment within seconds
                    of a critical trigger; alerts via email, Slack and a CRM owner task
  generate_briefing -> Claude briefing narrating the exact intent sequence + call script
  match_offer    -> red-carpet storefront offer for a qualifying profile
"""
import re
import uuid
import asyncio
import secrets
import logging
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Optional

from database import db
from utils.email import send_email
from routes.ai import _ai_cards
from routes.intent_common import (
    EVENT_TYPES, CRITICAL_EVENTS, DEFAULT_PATTERNS, WON_STAGES, LOST_STAGES,
    now_iso, parse_ts, classify_url, resolve_identity, event_meta, post_slack, crm_task,
)

logger = logging.getLogger(__name__)

STAGE_ORDER = ["lead", "prospect", "qualified", "discovery", "demo", "proposal", "negotiation"]
STAGE_PTS = {"lead": 2, "prospect": 4, "qualified": 8, "discovery": 8, "demo": 12, "proposal": 16, "negotiation": 20}
STATUSES = {"new", "routed", "contacted", "won", "lost", "dismissed"}
HALF_LIFE_DAYS = 7


# ------------------------------------------------------------------ tracking config
async def get_tracking(org_id: str) -> dict:
    t = await db.intent_tracking.find_one({"org_id": org_id}, {"_id": 0})
    if t:
        return t
    t = {"org_id": org_id, "ingest_key": f"ifk_{secrets.token_urlsafe(18)}", "patterns": DEFAULT_PATTERNS,
         "created_at": now_iso(), "last_event_at": None, "app_origin": ""}
    await db.intent_tracking.update_one({"org_id": org_id}, {"$setOnInsert": t}, upsert=True)
    return await db.intent_tracking.find_one({"org_id": org_id}, {"_id": 0})


async def org_for_key(ingest_key: str) -> Optional[dict]:
    if not ingest_key or not ingest_key.startswith("ifk_"):
        return None
    return await db.intent_tracking.find_one({"ingest_key": ingest_key}, {"_id": 0})


# ------------------------------------------------------------------ ingest (the data cloud)
async def resolve_account(org_id: str, email: str, company: str, domain: str) -> tuple[str, str, str]:
    """Identity resolution: explicit company, else a known profile for the email domain, else the domain itself."""
    key, name, dom = resolve_identity(email, company, domain)
    if dom and not (company or "").strip():
        known = await db.intent_leads.find_one({"org_id": org_id, "domain": dom}, {"_id": 0, "account_key": 1, "account": 1})
        if known:
            return known["account_key"], known["account"], dom
    return key, name, dom


async def ingest_events(org_id: str, raw_events: list, source: str) -> dict:
    tracking = await get_tracking(org_id)
    patterns = tracking.get("patterns") or DEFAULT_PATTERNS
    received = now_iso()
    touched, docs = {}, []
    for e in raw_events[:500]:
        etype = (e.get("type") or "").strip().lower()
        if etype not in EVENT_TYPES:
            etype = classify_url(e.get("url") or "", patterns)
        vid = str(e.get("vid") or "")[:64]
        email = str(e.get("email") or "").strip().lower()[:200]
        key, name, dom = await resolve_account(org_id, email, e.get("company"), e.get("domain"))
        if key and vid:
            await db.intent_visitors.update_one(
                {"org_id": org_id, "visitor_id": vid},
                {"$set": {"account_key": key, "account": name, "email": email, "updated_at": received}}, upsert=True)
            await db.intent_events.update_many(
                {"org_id": org_id, "visitor_id": vid, "account_key": None},
                {"$set": {"account_key": key, "account": name}})
        elif vid:
            m = await db.intent_visitors.find_one({"org_id": org_id, "visitor_id": vid}, {"_id": 0})
            if m:
                key, name, email = m["account_key"], m["account"], email or m.get("email", "")
        if e.get("type") == "identify":
            if key:
                touched[key] = name
            continue
        label, weight, cat = event_meta(etype)
        ts = parse_ts(e.get("ts")) or datetime.now(timezone.utc)
        props = e.get("properties") if isinstance(e.get("properties"), dict) else {}
        docs.append({
            "event_id": f"iev_{uuid.uuid4().hex[:14]}", "org_id": org_id,
            "account_key": key or None, "account": name or "", "email": email, "domain": dom,
            "visitor_id": vid, "type": etype, "label": label, "weight": weight, "cat": cat,
            "url": str(e.get("url") or "")[:500], "title": str(e.get("title") or "")[:200],
            "region": str(e.get("region") or props.get("region") or "")[:40].upper(),
            "source": source, "properties": {k: str(v)[:200] for k, v in list(props.items())[:15]},
            "ts": ts.isoformat(), "received_at": received,
        })
        if key:
            touched[key] = name
    if docs:
        await db.intent_events.insert_many([dict(d) for d in docs])
        await db.intent_tracking.update_one({"org_id": org_id}, {"$set": {"last_event_at": received}})
    leads = []
    for key, name in touched.items():
        lead = await refresh_profile(org_id, key, name)
        if lead:
            leads.append(lead)
            await schedule_routing(org_id, lead)
    return {"accepted": len(docs), "profiles_updated": len(leads), "lead_ids": [l["lead_id"] for l in leads]}


def _compute(key: str, name: str, events: list, open_deals: list, usage: dict, now: datetime) -> dict:
    digital, by_type, contacts, regions, sources = 0.0, {}, [], Counter(), set()
    events_24h, critical_24h = 0, False
    for ev in events:
        ts = parse_ts(ev.get("ts")) or now
        age = max(0.0, (now - ts).total_seconds() / 86400)
        label, w, cat = event_meta(ev["type"])
        digital += w * (0.5 ** (age / HALF_LIFE_DAYS))
        t = by_type.setdefault(ev["type"], {"key": ev["type"], "label": label, "cat": cat, "weight": w,
                                             "count": 0, "last_ts": None, "last_received_at": None})
        t["count"] += 1
        t["last_ts"] = max(t["last_ts"] or "", ev["ts"])
        t["last_received_at"] = max(t["last_received_at"] or "", ev.get("received_at") or ev["ts"])
        if ev.get("email") and ev["email"] not in contacts:
            contacts.append(ev["email"])
        if ev.get("region"):
            regions[ev["region"]] += 1
        sources.add(ev.get("source") or "api")
        if age <= 1 and w >= 6:
            events_24h += 1
        if age <= 1 and ev["type"] in CRITICAL_EVENTS:
            critical_24h = True
    value = round(sum(float(d.get("value", 0) or 0) for d in open_deals), 2)
    prob = max([int(d.get("probability", 0) or 0) for d in open_deals] or [0])
    best = "lead"
    for d in open_deals:
        st = (d.get("stage") or "").lower()
        if st in STAGE_ORDER and STAGE_ORDER.index(st) > STAGE_ORDER.index(best):
            best = st
        if d.get("source"):
            sources.add(f"crm:{d['source']}")
    crm_pts = min(30.0, STAGE_PTS.get(best, 0) + prob * 0.1) if open_deals else 0.0
    seats, vol = int(usage.get("seats_used", 0)), int(usage.get("usage_volume", 0))
    product_pts = (5 if seats >= 2 else 0) + (5 if vol > 0 else 0)
    digital_pts = min(70.0, digital)
    score = min(100, round(digital_pts + crm_pts + product_pts))
    signals = sorted(by_type.values(), key=lambda s: (-s["weight"], -s["count"]))
    for s in signals:
        s["detail"] = f"{s['count']}x"
    if open_deals:
        signals.append({"key": "crm_stage", "label": f"CRM stage: {best}", "cat": "Sales", "weight": 0,
                        "count": len(open_deals), "detail": f"{prob}% probability", "last_ts": None})
    last_event = max([e["ts"] for e in events] or [None]) if events else None
    return {
        "account_key": key, "account": name or key.title(),
        "domain": next((e.get("domain") for e in events if e.get("domain")), ""),
        "contacts": contacts[:10], "region": regions.most_common(1)[0][0] if regions else "",
        "value": value, "probability": prob, "best_stage": best, "deals_count": len(open_deals),
        "seats_used": seats, "usage_volume": vol, "signals": signals,
        "intent_score": score, "digital_score": round(digital_pts), "crm_score": round(crm_pts + product_pts),
        "tier": "hot" if score >= 70 else "warm" if score >= 40 else "cool",
        "surge": critical_24h or events_24h >= 3, "events_24h": events_24h,
        "event_count": len(events), "last_event_at": last_event,
        "first_seen_at": events[0]["ts"] if events else None,
        "sources": sorted(sources), "updated_at": now.isoformat(),
    }


async def refresh_profile(org_id: str, key: str, name_hint: str = "") -> Optional[dict]:
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=90)).isoformat()
    events = await db.intent_events.find(
        {"org_id": org_id, "account_key": key, "ts": {"$gte": since}}, {"_id": 0}
    ).sort("ts", 1).to_list(3000)
    deals = await db.deals.find(
        {"org_id": org_id, "company": {"$regex": f"^{re.escape(key)}$", "$options": "i"}}, {"_id": 0}
    ).to_list(200)
    open_deals = [d for d in deals if (d.get("stage") or "").lower() not in WON_STAGES | LOST_STAGES]
    usage_rows = await db.telemetry_usage.find({"org_id": org_id, "account_key": key}, {"_id": 0}).to_list(50)
    usage = {"seats_used": max([int(u.get("seats_used", 0)) for u in usage_rows] or [0]),
             "usage_volume": sum(int(u.get("usage_volume", 0)) for u in usage_rows)}
    name = name_hint or (deals[0].get("company") if deals else "") or (events[-1].get("account") if events else "")
    existing = await db.intent_leads.find_one({"org_id": org_id, "account_key": key}, {"_id": 0})
    prof = _compute(key, name, events, open_deals, usage, now)
    if not existing and not events and prof["intent_score"] < 25:
        return None
    if existing:
        if existing.get("account"):
            prof["account"] = existing["account"] if not name_hint else prof["account"]
        st = existing.get("status")
        prof["status"] = st if st in STATUSES else ("routed" if existing.get("assignment") else "new")
        if not existing.get("contact_email") and prof["contacts"]:
            prof["contact_email"] = prof["contacts"][0]
        await db.intent_leads.update_one({"lead_id": existing["lead_id"]}, {"$set": prof})
    else:
        prof.update({
            "lead_id": f"lead_{uuid.uuid4().hex[:12]}", "org_id": org_id, "status": "new",
            "contact_email": prof["contacts"][0] if prof["contacts"] else "",
            "assignment": None, "agent_briefing": None, "needs_routing": False, "pushes": [],
            "activity": [{"ts": now.isoformat(), "type": "detected", "by": "InFlow",
                          "detail": f"Profile unified — intent score {prof['intent_score']}/100"}],
        })
        await db.intent_leads.insert_one(dict(prof))
    return await db.intent_leads.find_one({"org_id": org_id, "account_key": key}, {"_id": 0})


async def rebuild_all(org_id: str) -> dict:
    keys = {k for k in await db.intent_events.distinct("account_key", {"org_id": org_id}) if k}
    deals = await db.deals.find({"org_id": org_id}, {"_id": 0, "company": 1, "stage": 1}).to_list(5000)
    names = {}
    for d in deals:
        c = (d.get("company") or "").strip()
        if c and (d.get("stage") or "").lower() not in WON_STAGES | LOST_STAGES:
            names[c.lower()] = c
            keys.add(c.lower())
    found = hot = 0
    for k in keys:
        lead = await refresh_profile(org_id, k, names.get(k, ""))
        if lead:
            found += 1
            hot += lead["intent_score"] >= 70
            await schedule_routing(org_id, lead)
    return {"accounts_analyzed": len(keys), "profiles": found, "hot": hot}


async def log_activity(lead_id: str, atype: str, detail: str, by: str = "InFlow"):
    await db.intent_leads.update_one(
        {"lead_id": lead_id}, {"$push": {"activity": {"ts": now_iso(), "type": atype, "detail": detail, "by": by}}})


# ------------------------------------------------------------------ speed-to-lead routing
def rule_matches(rule: dict, lead: dict, now: datetime) -> Optional[dict]:
    if lead.get("intent_score", 0) < int(rule.get("min_score", 0) or 0):
        return None
    if float(rule.get("min_value", 0) or 0) > float(lead.get("value", 0) or 0):
        return None
    types = rule.get("event_types") or []
    if not types:
        return {"key": "score", "label": f"Intent score reached {lead.get('intent_score')}", "received_at": lead.get("updated_at")}
    window = int(rule.get("window_hours", 72) or 72) * 3600
    hits = [s for s in lead.get("signals", []) if s.get("key") in types and s.get("last_ts")
            and (now - (parse_ts(s["last_ts"]) or now)).total_seconds() <= window]
    if not hits:
        return None
    h = max(hits, key=lambda s: s.get("last_received_at") or "")
    return {"key": h["key"], "label": h["label"], "received_at": h.get("last_received_at")}


async def schedule_routing(org_id: str, lead: dict):
    if lead.get("assignment") or lead.get("status") in ("dismissed", "won", "lost"):
        return
    now = datetime.now(timezone.utc)
    rules = await db.intent_routing_rules.find({"org_id": org_id, "enabled": True}, {"_id": 0}).to_list(50)
    if not any(rule_matches(r, lead, now) for r in rules):
        return
    await db.intent_leads.update_one({"lead_id": lead["lead_id"]}, {"$set": {"needs_routing": True}})
    asyncio.create_task(_safe_route(org_id, lead["lead_id"]))


async def _safe_route(org_id: str, lead_id: str):
    try:
        await route_lead(org_id, lead_id)
    except Exception as e:
        logger.error("speed-to-lead routing failed for %s: %s", lead_id, e)


async def pick_ae(org_id: str, rule: dict, lead: dict) -> Optional[dict]:
    q = {"org_id": org_id, "active": True}
    if rule.get("ae_ids"):
        q["ae_id"] = {"$in": rule["ae_ids"]}
    pool = await db.intent_aes.find(q, {"_id": 0}).to_list(200)
    if not pool:
        return None
    region, value = (lead.get("region") or "").upper(), float(lead.get("value", 0) or 0)

    def eligible(ae):
        terr = [t.upper() for t in ae.get("territories") or []]
        if terr and region and region not in terr:
            return False
        if ae.get("min_deal") and value < float(ae["min_deal"]):
            return False
        if ae.get("max_deal") and value > float(ae["max_deal"]):
            return False
        return True

    cands = [a for a in pool if eligible(a)] or pool
    return sorted(cands, key=lambda a: a.get("last_assigned_at") or "")[0]


async def route_lead(org_id: str, lead_id: str) -> Optional[dict]:
    lead = await db.intent_leads.find_one_and_update(
        {"org_id": org_id, "lead_id": lead_id, "needs_routing": True},
        {"$set": {"needs_routing": False}}, projection={"_id": 0})
    if not lead or lead.get("assignment"):
        return None
    now = datetime.now(timezone.utc)
    rules = await db.intent_routing_rules.find({"org_id": org_id, "enabled": True}, {"_id": 0}).sort("priority", 1).to_list(50)
    for rule in rules:
        trig = rule_matches(rule, lead, now)
        if trig:
            ae = await pick_ae(org_id, rule, lead)
            if not ae:
                await log_activity(lead_id, "routing", f"Rule '{rule['name']}' matched but no active AE is on the roster")
                return None
            start = max(filter(None, [trig.get("received_at"), rule.get("updated_at")]), default=None)
            return await assign_lead(org_id, lead, ae, rule, trig, start)
    return None


async def assign_lead(org_id: str, lead: dict, ae: dict, rule: Optional[dict], trig: dict,
                      start_iso: Optional[str] = None, by: str = "InFlow") -> dict:
    now = datetime.now(timezone.utc)
    t0 = parse_ts(start_iso) or now
    latency = max(0, int((now - t0).total_seconds() * 1000))
    actions = (rule or {}).get("actions") or {"email": True, "slack": False, "crm": "", "briefing": True}
    assignment = {
        "ae_id": ae["ae_id"], "ae_name": ae["name"], "ae_email": ae["email"],
        "rule_id": (rule or {}).get("rule_id"), "rule_name": (rule or {}).get("name") or "Manual assignment",
        "trigger": {"type": trig.get("key"), "label": trig.get("label")},
        "assigned_at": now.isoformat(), "latency_ms": latency, "manual": rule is None, "deliveries": {},
    }
    await db.intent_leads.update_one({"lead_id": lead["lead_id"]}, {"$set": {"assignment": assignment, "status": "routed"}})
    await db.intent_aes.update_one({"ae_id": ae["ae_id"]}, {"$set": {"last_assigned_at": now.isoformat()}, "$inc": {"assigned_count": 1}})
    await log_activity(lead["lead_id"], "routed", f"Assigned to {ae['name']} via '{assignment['rule_name']}' in {latency / 1000:.1f}s", by)
    lead = {**lead, "assignment": assignment}
    deliveries = await deliver_assignment(org_id, lead, ae, actions)
    alerted_ms = max(0, int((datetime.now(timezone.utc) - t0).total_seconds() * 1000))
    await db.intent_leads.update_one({"lead_id": lead["lead_id"]}, {"$set": {
        "assignment.deliveries": deliveries, "assignment.alerted_ms": alerted_ms}})
    await db.intent_routing_log.insert_one({
        "log_id": f"rl_{uuid.uuid4().hex[:12]}", "org_id": org_id, "lead_id": lead["lead_id"],
        "account": lead.get("account"), "intent_score": lead.get("intent_score"), "value": lead.get("value"),
        "ae_name": ae["name"], "ae_email": ae["email"], "rule_name": assignment["rule_name"],
        "trigger": assignment["trigger"], "latency_ms": latency, "alerted_ms": alerted_ms,
        "deliveries": deliveries, "manual": rule is None, "created_at": now.isoformat(),
    })
    if actions.get("briefing", True) and not lead.get("agent_briefing"):
        asyncio.create_task(_safe_briefing(org_id, lead["lead_id"]))
    return {**assignment, "deliveries": deliveries, "alerted_ms": alerted_ms}


def _signal_line(lead: dict) -> str:
    return ", ".join(f"{s['label']} ({s['detail']})" for s in lead.get("signals", [])[:5]) or "strong intent"


async def deliver_assignment(org_id: str, lead: dict, ae: dict, actions: dict) -> dict:
    out = {}
    score, value = lead.get("intent_score", 0), float(lead.get("value", 0) or 0)
    trig = (lead.get("assignment") or {}).get("trigger", {}).get("label", "critical intent")
    title = f"Speed-to-lead: {lead.get('account')} is hot right now ({score}/100)"
    lines = (f"Trigger: {trig}\nIntent score: {score}/100\nOpen pipeline: ${value:,.0f}\n"
             f"Signals: {_signal_line(lead)}\nContact: {lead.get('contact_email') or 'unknown'}\n\n"
             "Reach out now — buyers contacted within 5 minutes convert dramatically better.")
    if actions.get("email", True):
        tracking = await db.intent_tracking.find_one({"org_id": org_id}, {"_id": 0, "app_origin": 1})
        link = f"{(tracking or {}).get('app_origin')}/discover" if (tracking or {}).get("app_origin") else ""
        html = ("<div style=\"font-family:-apple-system,Segoe UI,sans-serif;color:#111;font-size:15px;line-height:1.6;max-width:560px\">"
                f"<h2 style=\"margin:0 0 8px\">{lead.get('account')} needs you now</h2>"
                + lines.replace("\n", "<br/>")
                + (f"<p><a href=\"{link}\" style=\"color:#0052ff\">Open the briefing in InFlow</a></p>" if link else "")
                + "</div>")
        r = await send_email(to=ae["email"], subject=title, html=html, text=lines)
        out["email"] = {"ok": bool(r.get("sent")), **({} if r.get("sent") else {"error": r.get("reason") or "send failed"})}
    if actions.get("slack"):
        out["slack"] = await post_slack(org_id, title, [("Assigned AE", ae["name"]), ("Intent", f"{score}/100"),
                                                         ("Pipeline", f"${value:,.0f}"), ("Trigger", trig)],
                                        f"*Signals:* {_signal_line(lead)}", "InFlow Speed-to-Lead")
    provider = actions.get("crm") or ""
    if provider:
        owner = (ae.get("crm_owner_ids") or {}).get(provider, "")
        res = await crm_task(org_id, provider, f"Call {lead.get('account')} now — speed-to-lead", lines, owner, lead)
        out["crm"] = {"provider": provider, "ok": bool(res.get("ok")),
                      **({"id": res.get("id")} if res.get("ok") else {"error": res.get("error")})}
    return out


async def process_intent_routing_once() -> int:
    """Safety sweep: route any profile flagged needs_routing (e.g. after a restart)."""
    pending = await db.intent_leads.find({"needs_routing": True}, {"_id": 0, "org_id": 1, "lead_id": 1}).to_list(50)
    n = 0
    for p in pending:
        if await route_lead(p["org_id"], p["lead_id"]):
            n += 1
    return n


# ------------------------------------------------------------------ contextual agent briefings
def build_sequence(events: list) -> list:
    steps = []
    for ev in events:
        day = (ev.get("ts") or "")[:10]
        if steps and steps[-1]["type"] == ev["type"] and steps[-1]["day"] == day:
            steps[-1]["count"] += 1
            steps[-1]["ts_last"] = ev["ts"]
            continue
        path = re.sub(r"^https?://[^/]+", "", ev.get("url") or "") or ev.get("title") or ""
        steps.append({"type": ev["type"], "label": ev.get("label") or event_meta(ev["type"])[0], "day": day,
                      "ts": ev["ts"], "ts_last": ev["ts"], "count": 1, "detail": path[:120],
                      "who": ev.get("email") or "", "source": ev.get("source")})
    return steps[-15:]


def _fallback_briefing(lead: dict, seq: list) -> dict:
    acct = lead.get("account")
    steps = "; then ".join(f"{s['label'].lower()}{' x' + str(s['count']) if s['count'] > 1 else ''}" for s in seq[-5:]) or "showed intent"
    ready = any(s["type"] in ("quote_request", "demo_request", "pricing_view") for s in seq[-5:])
    return {
        "headline": f"{acct} is {'ready to talk commercials' if ready else 'actively researching'}",
        "summary": f"Over the last few days {acct} {steps}. Intent score {lead.get('intent_score')}/100 with "
                   f"${float(lead.get('value', 0) or 0):,.0f} in open pipeline — act while attention is high.",
        "buying_stage": "ready_to_buy" if ready else "evaluating",
        "script": {
            "opener": f"Hi, this is your account executive at our team — I saw {acct} has been looking at how we'd fit, "
                      "so I wanted to make sure you have everything you need to decide quickly.",
            "discovery_questions": ["What prompted you to start evaluating options right now?",
                                    "Who else is involved in choosing a solution?",
                                    "What would a successful first 90 days look like for you?"],
            "value_points": ["Fast time-to-value with guided onboarding",
                             "Pricing that scales with the outcomes you get",
                             "Proven results with teams at a similar stage"],
            "objection_handling": [
                {"objection": "We're just researching", "response": "Totally fair — I can share how similar teams decided, so your research goes faster."},
                {"objection": "Price is a concern", "response": "Let's anchor on the ROI first; I may also have pre-approved terms available for you."},
            ],
            "close": "Would 20 minutes this week work to map this to your goals and send a tailored quote?",
        },
        "recommended_offer": "Lead with a tailored quote; use a pre-approved discount only to accelerate signature." if ready else
                             "Share a relevant case study and book a discovery call.",
    }


async def generate_briefing(org_id: str, lead_id: str) -> dict:
    lead = await db.intent_leads.find_one({"org_id": org_id, "lead_id": lead_id}, {"_id": 0})
    if not lead:
        return {}
    events = await db.intent_events.find({"org_id": org_id, "account_key": lead["account_key"]}, {"_id": 0}).sort("ts", 1).to_list(400)
    seq = build_sequence(events)
    fallback = _fallback_briefing(lead, seq)
    system = (
        "You are an elite sales-intelligence analyst preparing an account executive to call a high-intent buyer in the next "
        "5 minutes. Respond with STRICT JSON only (no markdown) with keys: headline (one line), summary (3 sentences that "
        "narrate the buyer's EXACT sequence of intent actions in order and what it reveals), buying_stage (one of "
        "researching|evaluating|ready_to_buy), script (object: opener (2 sentences, personalized to what they viewed), "
        "discovery_questions (3 strings), value_points (3 strings tied to the content they consumed), objection_handling "
        "(2 objects with objection and response), close (1 sentence ask)), recommended_offer (one sentence)."
    )
    seq_txt = "\n".join(f"- {s['ts'][:16].replace('T', ' ')} {s['label']}{' x' + str(s['count']) if s['count'] > 1 else ''}"
                        f"{' — ' + s['detail'] if s['detail'] else ''}{' (' + s['who'] + ')' if s['who'] else ''}" for s in seq) or "- no digital events yet"
    prompt = (f"Account: {lead['account']}\nIntent score: {lead.get('intent_score')}/100 (digital {lead.get('digital_score')}, "
              f"CRM {lead.get('crm_score')})\nOpen pipeline: ${float(lead.get('value', 0) or 0):,.0f} | stage {lead.get('best_stage')} | "
              f"{lead.get('probability')}% probability\nKnown contacts: {', '.join(lead.get('contacts') or []) or 'unknown'}\n"
              f"Intent sequence (oldest first):\n{seq_txt}\n\nReturn the briefing JSON now.")
    data, ai_used = await _ai_cards(system, prompt, f"intent_brief_{lead_id}", fallback)
    script = data.get("script") if isinstance(data.get("script"), dict) else fallback["script"]
    briefing = {
        "headline": str(data.get("headline") or fallback["headline"]),
        "summary": str(data.get("summary") or fallback["summary"]),
        "buying_stage": data.get("buying_stage") if data.get("buying_stage") in ("researching", "evaluating", "ready_to_buy") else fallback["buying_stage"],
        "script": {
            "opener": str(script.get("opener") or fallback["script"]["opener"]),
            "discovery_questions": [str(x) for x in (script.get("discovery_questions") or fallback["script"]["discovery_questions"])][:4],
            "value_points": [str(x) for x in (script.get("value_points") or fallback["script"]["value_points"])][:4],
            "objection_handling": [{"objection": str(o.get("objection", "")), "response": str(o.get("response", ""))}
                                   for o in (script.get("objection_handling") or fallback["script"]["objection_handling"]) if isinstance(o, dict)][:3],
            "close": str(script.get("close") or fallback["script"]["close"]),
        },
        "recommended_offer": str(data.get("recommended_offer") or fallback["recommended_offer"]),
        "sequence": seq, "ai_used": ai_used, "generated_at": now_iso(),
    }
    await db.intent_leads.update_one({"lead_id": lead_id}, {"$set": {"agent_briefing": briefing}})
    await log_activity(lead_id, "briefing", "Contextual agent briefing generated" + ("" if ai_used else " (template)"))
    return briefing


async def _safe_briefing(org_id: str, lead_id: str):
    try:
        await generate_briefing(org_id, lead_id)
    except Exception as e:
        logger.warning("background briefing failed for %s: %s", lead_id, e)


# ------------------------------------------------------------------ red-carpet storefront matching
async def match_offer(org_id: str, lead: Optional[dict]) -> Optional[dict]:
    if not lead:
        return None
    rules = await db.storefront_rules.find({"org_id": org_id, "enabled": True}, {"_id": 0}).sort("priority", 1).to_list(50)
    keys = {s.get("key") for s in lead.get("signals", [])}
    for r in rules:
        if lead.get("intent_score", 0) < int(r.get("min_score", 0) or 0):
            continue
        if r.get("event_types") and not keys & set(r["event_types"]):
            continue
        accts = {a.strip().lower() for a in r.get("accounts") or [] if a.strip()}
        if accts and lead.get("account_key") not in accts:
            continue
        promo = r.get("stripe") or {}
        return {"rule_id": r["rule_id"], "name": r["name"], "headline": r.get("headline"), "message": r.get("message", ""),
                "discount_pct": r.get("discount_pct", 0), "contract_terms": r.get("contract_terms", ""),
                "cta_label": r.get("cta_label") or "Claim your offer", "cta_url": r.get("cta_url", ""),
                "promo_code": promo.get("code", "") if promo.get("active") else "",
                "expires_days": r.get("expires_days", 14)}
    return None
