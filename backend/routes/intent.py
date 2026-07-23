"""High-Intent Buyer Detection (Discover) — find who is most likely to buy.

Monitors buying-intent signals across connected integrations and scores each open
opportunity/account. Signals span three categories, derived transparently from the
data InFlow already ingests:
  Marketing : pricing/inbound source, ad engagement, recent (returning) activity
  Sales     : proposal stage, multiple stakeholders (open threads), demo/late stage
  Product   : active trial usage, feature exploration, invited teammates (seats)

Actions per hot lead:
  1) Fast-track  — assign/route the lead to an account executive (+ optional email)
  2) Outreach    — AI-drafted, hyper-specific email addressing exactly what they engaged with
  3) Direct book — a personalized scheduling link for instant demo booking
  4) Sandbox     — a personalized proof-of-concept package (setup brief + link + status)

Every lead carries an activity log (the shared "action layer"). Paid-tier gated;
send/route actions are owner-only.
"""
import uuid
import logging
from datetime import datetime, timezone
from urllib.parse import quote
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from models import User
from dependencies import get_current_user, org_filter, require_paid, require_paid_owner
from utils.email import send_email
from routes.telemetry import USAGE_SOURCES
from routes.upsell import _ai_text, _email_html, _median

logger = logging.getLogger(__name__)
router = APIRouter()

WON_STAGES = {"won", "closed_won", "closed won", "closed", "customer"}
LOST_STAGES = {"lost", "closed_lost", "closed lost", "churned", "cancelled", "disqualified"}
AD_SOURCES = {"ads", "ad", "paid", "google ads", "linkedin ads", "facebook ads", "facebook",
              "ppc", "paid search", "paid social", "adwords", "capterra"}
INBOUND_SOURCES = {"website", "organic", "inbound", "pricing", "referral", "content", "seo",
                   "demo request", "contact form", "webinar", "blog", "g2"}
STAGE_ORDER = ["lead", "prospect", "qualified", "discovery", "demo", "proposal", "negotiation"]
SANDBOX_BASE = "https://sandbox.inflowft.com"


# ------------------------------------------------------------------ models
class LeadPatch(BaseModel):
    status: Optional[str] = None
    contact_email: Optional[str] = None


class SettingsBody(BaseModel):
    scheduling_url: Optional[str] = None


class FastTrackBody(BaseModel):
    assignee_id: str
    notify: bool = True


class DraftReq(BaseModel):
    pass


class SendEmailReq(BaseModel):
    lead_id: Optional[str] = None
    to: str
    subject: str
    body: str
    mark_status: Optional[str] = None


# ------------------------------------------------------------------ helpers
def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_lead(lead_id: str, user: User) -> dict:
    lead = await db.intent_leads.find_one({"lead_id": lead_id, **org_filter(user)}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


async def _log_activity(lead_id: str, user: User, atype: str, detail: str):
    await db.intent_leads.update_one(
        {"lead_id": lead_id},
        {"$push": {"activity": {"ts": _now(), "type": atype, "detail": detail, "by": user.name or user.email}}},
    )


def _signal_summary(lead: dict) -> str:
    return "; ".join(f"{s['label']} ({s['detail']})" for s in lead.get("signals", []))


# ------------------------------------------------------------------ status / settings / team
@router.get("/intent/status")
async def intent_status(user: User = Depends(get_current_user)):
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    is_paid = (tier or "trial") not in {"trial", "expired", "cancelled", "free"}
    connections = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": list(USAGE_SOURCES)}}, {"_id": 0, "platform": 1}
    ).to_list(10)
    settings = await db.intent_settings.find_one(org_filter(user), {"_id": 0})
    open_leads = await db.intent_leads.count_documents(
        {**org_filter(user), "status": {"$nin": ["dismissed", "won"]}}
    )
    team = await db.users.count_documents({"org_id": user.org_id})
    return {
        "is_paid": is_paid,
        "is_owner": user.role == "owner",
        "usage_sources_connected": [c["platform"] for c in connections],
        "scheduling_url": (settings or {}).get("scheduling_url", ""),
        "open_leads": open_leads,
        "team_size": team,
    }


@router.get("/intent/settings")
async def get_settings(user: User = Depends(require_paid)):
    s = await db.intent_settings.find_one(org_filter(user), {"_id": 0})
    return s or {"scheduling_url": ""}


@router.put("/intent/settings")
async def put_settings(body: SettingsBody, user: User = Depends(require_paid_owner)):
    url = (body.scheduling_url or "").strip()
    await db.intent_settings.update_one(
        org_filter(user),
        {"$set": {"org_id": user.org_id, "scheduling_url": url, "updated_at": _now()}},
        upsert=True,
    )
    return {"scheduling_url": url}


@router.get("/intent/team")
async def list_team(user: User = Depends(require_paid)):
    members = await db.users.find(
        {"org_id": user.org_id}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1}
    ).to_list(200)
    return members


# ------------------------------------------------------------------ scan
def _build_signals(acct: dict, medians: dict) -> tuple[list, int]:
    signals = []
    src = {s.lower() for s in acct["sources"]}
    stages = {s.lower() for s in acct["stages"]}
    seats = acct["seats_used"]
    usage = acct["usage_volume"]
    dc = acct["deals_count"]
    notes = (acct["notes"] or "").lower()

    # Marketing
    inbound = src & INBOUND_SOURCES
    if inbound:
        signals.append({"key": "pricing_page_visit", "cat": "Marketing", "label": "Visited pricing / inbound", "detail": ", ".join(sorted(inbound))[:40]})
    ads = src & AD_SOURCES
    if ads:
        signals.append({"key": "ad_engagement", "cat": "Marketing", "label": "Engaged with ads", "detail": ", ".join(sorted(ads))[:40]})
    if acct["days_since_update"] is not None and acct["days_since_update"] <= 14:
        signals.append({"key": "returning_visitor", "cat": "Marketing", "label": "Recently active", "detail": f"touched {acct['days_since_update']}d ago"})

    # Sales
    if "proposal" in stages:
        signals.append({"key": "proposal_viewed", "cat": "Sales", "label": "Proposal stage", "detail": "proposal in play"})
    if (stages & {"demo", "negotiation"}) or "demo" in notes:
        signals.append({"key": "demo_completed", "cat": "Sales", "label": "Demo / late stage", "detail": acct["best_stage"]})
    if dc >= 2:
        signals.append({"key": "multiple_stakeholders", "cat": "Sales", "label": "Multiple stakeholders", "detail": f"{dc} open threads"})

    # Product
    if usage > 0:
        signals.append({"key": "trial_usage", "cat": "Product", "label": "Active trial usage", "detail": f"{usage:,} events"})
    if usage > 0 and usage >= max(500.0, medians["usage"] * 1.15):
        signals.append({"key": "feature_exploration", "cat": "Product", "label": "Exploring features", "detail": f"{usage:,} events / 30d"})
    if seats >= 2:
        signals.append({"key": "invited_teammates", "cat": "Product", "label": "Invited teammates", "detail": f"{seats} active users"})

    weights = {"pricing_page_visit": 12, "ad_engagement": 8, "returning_visitor": 10,
               "proposal_viewed": 20, "demo_completed": 22, "multiple_stakeholders": 14,
               "trial_usage": 12, "feature_exploration": 16, "invited_teammates": 14}
    score = sum(weights.get(s["key"], 0) for s in signals)
    score = min(100, score + round(acct["probability"] * 0.15))
    return signals, score


@router.post("/intent/scan")
async def scan_leads(user: User = Depends(require_paid)):
    """Analyze open opportunities + integration signals to surface high-intent buyers."""
    deals = await db.deals.find(org_filter(user), {"_id": 0}).to_list(5000)
    usage_rows = await db.telemetry_usage.find(org_filter(user), {"_id": 0}).to_list(5000)

    usage_map = {}
    for u in usage_rows:
        k = (u.get("account_key") or "").strip().lower()
        if not k:
            continue
        cur = usage_map.setdefault(k, {"seats_used": 0, "usage_volume": 0})
        cur["seats_used"] = max(cur["seats_used"], int(u.get("seats_used", 0)))
        cur["usage_volume"] += int(u.get("usage_volume", 0))

    now = datetime.now(timezone.utc)
    accounts = {}
    for d in deals:
        stage = (d.get("stage") or "").lower()
        if stage in WON_STAGES or stage in LOST_STAGES:
            continue  # Discover targets OPEN prospects, not customers/lost
        company = (d.get("company") or d.get("name") or "").strip()
        if not company:
            continue
        key = company.lower()
        a = accounts.setdefault(key, {
            "company": company, "value": 0.0, "deals_count": 0, "sources": set(), "stages": set(),
            "probability": 0, "notes": "", "seats_used": 0, "usage_volume": 0,
            "last_update": None, "best_stage": stage or "lead",
        })
        a["value"] += float(d.get("value", 0) or 0)
        a["deals_count"] += 1
        if d.get("source"):
            a["sources"].add(str(d["source"]))
        if stage:
            a["stages"].add(stage)
        a["probability"] = max(a["probability"], int(d.get("probability", 0) or 0))
        if d.get("notes"):
            a["notes"] += " " + str(d["notes"])
        if stage in STAGE_ORDER and (a["best_stage"] not in STAGE_ORDER or STAGE_ORDER.index(stage) > STAGE_ORDER.index(a["best_stage"])):
            a["best_stage"] = stage
        upd = d.get("updated_at") or d.get("created_at")
        if isinstance(upd, str):
            try:
                dt = datetime.fromisoformat(upd)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                a["last_update"] = max(a["last_update"], dt) if a["last_update"] else dt
            except Exception:
                pass
        elif isinstance(upd, datetime):
            dt = upd if upd.tzinfo else upd.replace(tzinfo=timezone.utc)
            a["last_update"] = max(a["last_update"], dt) if a["last_update"] else dt

    for key, a in accounts.items():
        u = usage_map.get(key)
        if u:
            a["seats_used"] = u["seats_used"]
            a["usage_volume"] = u["usage_volume"]
        a["days_since_update"] = (now - a["last_update"]).days if a["last_update"] else None

    medians = {"usage": _median([a["usage_volume"] for a in accounts.values() if a["usage_volume"] > 0])}

    found = 0
    hot = 0
    now_iso = now.isoformat()
    for key, a in accounts.items():
        signals, score = _build_signals(a, medians)
        if not signals or score < 25:
            continue
        found += 1
        if score >= 60:
            hot += 1
        existing = await db.intent_leads.find_one({"org_id": user.org_id, "account_key": key}, {"_id": 0})
        base = {
            "org_id": user.org_id,
            "account_key": key,
            "account": a["company"],
            "value": round(a["value"], 2),
            "probability": a["probability"],
            "best_stage": a["best_stage"],
            "deals_count": a["deals_count"],
            "sources": sorted([s for s in a["sources"] if s]),
            "seats_used": a["seats_used"],
            "usage_volume": a["usage_volume"],
            "signals": signals,
            "intent_score": score,
            "updated_at": now_iso,
        }
        if existing:
            base["status"] = existing.get("status", "new")
            base["contact_email"] = existing.get("contact_email", "")
            base["assigned_to"] = existing.get("assigned_to")
            base["assigned_name"] = existing.get("assigned_name")
            await db.intent_leads.update_one({"lead_id": existing["lead_id"]}, {"$set": base})
        else:
            base["lead_id"] = f"lead_{uuid.uuid4().hex[:12]}"
            base["status"] = "new"
            base["contact_email"] = ""
            base["assigned_to"] = None
            base["assigned_name"] = None
            base["activity"] = [{"ts": now_iso, "type": "detected", "detail": f"Detected with intent score {score}/100", "by": "InFlow"}]
            base["sandbox"] = None
            await db.intent_leads.insert_one(dict(base))

    return {"status": "scanned", "accounts_analyzed": len(accounts), "leads_found": found, "hot_leads": hot}


@router.get("/intent/leads")
async def list_leads(user: User = Depends(require_paid)):
    return await db.intent_leads.find(org_filter(user), {"_id": 0}).sort("intent_score", -1).to_list(500)


@router.patch("/intent/leads/{lead_id}")
async def patch_lead(lead_id: str, body: LeadPatch, user: User = Depends(require_paid)):
    updates = {}
    if body.status is not None:
        if body.status not in ("new", "assigned", "contacted", "booked", "sandbox", "won", "dismissed"):
            raise HTTPException(status_code=400, detail="Invalid status")
        updates["status"] = body.status
    if body.contact_email is not None:
        updates["contact_email"] = body.contact_email.strip()
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = _now()
    res = await db.intent_leads.update_one({"lead_id": lead_id, **org_filter(user)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return _clean(await db.intent_leads.find_one({"lead_id": lead_id}, {"_id": 0}))


# ------------------------------------------------------------------ action 1: fast-track to AE
@router.post("/intent/leads/{lead_id}/fast-track")
async def fast_track(lead_id: str, body: FastTrackBody, user: User = Depends(require_paid_owner)):
    lead = await _get_lead(lead_id, user)
    ae = await db.users.find_one({"user_id": body.assignee_id, "org_id": user.org_id}, {"_id": 0})
    if not ae:
        raise HTTPException(status_code=404, detail="Assignee not found on your team")
    await db.intent_leads.update_one(
        {"lead_id": lead_id},
        {"$set": {"assigned_to": ae["user_id"], "assigned_name": ae.get("name") or ae.get("email"),
                  "status": "assigned", "updated_at": _now()}},
    )
    await _log_activity(lead_id, user, "fast_track", f"Routed to {ae.get('name') or ae.get('email')}")
    notified = False
    if body.notify and ae.get("email"):
        subject = f"Hot lead routed to you: {lead['account']} ({lead['intent_score']}/100 intent)"
        text = (
            f"Hi {ae.get('name') or 'there'},\n\n{lead['account']} is showing strong buying intent "
            f"(score {lead['intent_score']}/100) and has been routed to you for immediate outreach.\n\n"
            f"Signals: {_signal_summary(lead) or 'multiple positive signals'}\n"
            f"Open pipeline value: ${lead['value']:,.0f}\n\n"
            f"Reach out while the intent is hot.\n\n— InFlow Discover"
        )
        res = await send_email(to=ae["email"], subject=subject, html=_email_html(text), text=text)
        notified = bool(res and res.get("sent"))
    return {"assigned_to": ae["user_id"], "assigned_name": ae.get("name") or ae.get("email"), "notified": notified}


# ------------------------------------------------------------------ action 2: custom outreach
@router.post("/intent/leads/{lead_id}/outreach")
async def draft_outreach(lead_id: str, body: DraftReq = DraftReq(), user: User = Depends(require_paid_owner)):
    lead = await _get_lead(lead_id, user)
    fallback = (
        f"Subject: Saw your interest in what we're building, {lead['account']}\n\n"
        f"Hi there,\n\nI noticed {lead['account']} has been engaging with us — {_signal_summary(lead) or 'a few strong signals'}. "
        f"That usually means there's a real problem you're trying to solve right now.\n\n"
        f"I'd love to show you exactly how teams like yours get value fast. Would a quick 20-minute walkthrough this week help?\n\n"
        f"Happy to tailor it to what you've already looked at.\n\nBest regards"
    )
    system = (
        "You are a top SDR writing a hyper-specific, non-generic outreach email to a prospect showing buying intent. "
        "Reference the EXACT signals/pages they engaged with, be concise and human, and end with a low-friction call to action "
        "(a short demo). No emojis, no markdown symbols. Output a 'Subject:' line then the body. Under 150 words."
    )
    prompt = (
        f"Prospect account: {lead['account']}\nStage: {lead['best_stage']}\n"
        f"Buying-intent signals to reference specifically: {_signal_summary(lead) or 'inbound interest'}\n"
        f"Open pipeline value: ${lead['value']:,.0f}\n\nWrite the outreach email now."
    )
    text, _ = await _ai_text(system, prompt, f"intent_outreach_{lead_id}", fallback)
    return {"draft": text, "lead_id": lead_id}


# ------------------------------------------------------------------ action 3: direct booking
@router.post("/intent/leads/{lead_id}/booking")
async def draft_booking(lead_id: str, body: DraftReq = DraftReq(), user: User = Depends(require_paid_owner)):
    lead = await _get_lead(lead_id, user)
    settings = await db.intent_settings.find_one(org_filter(user), {"_id": 0})
    base_url = (settings or {}).get("scheduling_url", "").strip()
    if not base_url:
        raise HTTPException(status_code=400, detail="Set your scheduling link in Discover settings first (e.g. your Calendly/Cal.com URL).")
    sep = "&" if "?" in base_url else "?"
    booking_link = f"{base_url}{sep}utm_source=inflow&utm_campaign=high_intent&account={quote(lead['account'])}"
    if lead.get("contact_email"):
        booking_link += f"&email={quote(lead['contact_email'])}"

    fallback = (
        f"Subject: Grab a time that works for you, {lead['account']}\n\n"
        f"Hi there,\n\nBased on your interest ({_signal_summary(lead) or 'recent activity'}), I'd love to give you a focused "
        f"demo tailored to your use case. Pick any time that suits you here:\n\n{booking_link}\n\n"
        f"Looking forward to it.\n\nBest regards"
    )
    system = (
        "You are an AE writing a short, warm email inviting a high-intent prospect to book a demo. Reference their interest "
        "briefly and present the scheduling link clearly. No emojis, no markdown symbols. Output a 'Subject:' line then the body. "
        "You MUST include this exact scheduling link verbatim on its own line: " + booking_link + ". Under 130 words."
    )
    prompt = (
        f"Prospect: {lead['account']}\nSignals: {_signal_summary(lead) or 'inbound interest'}\n"
        f"Scheduling link (include verbatim): {booking_link}\n\nWrite the booking invite now."
    )
    text, _ = await _ai_text(system, prompt, f"intent_booking_{lead_id}", fallback)
    if booking_link not in text:
        text = text.rstrip() + f"\n\nBook here: {booking_link}"
    return {"draft": text, "booking_link": booking_link, "lead_id": lead_id}


# ------------------------------------------------------------------ shared send
@router.post("/intent/send-email")
async def send_intent_email(body: SendEmailReq, user: User = Depends(require_paid_owner)):
    to = (body.to or "").strip()
    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="A valid recipient email is required")
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Subject and body are required")
    result = await send_email(to=to, subject=body.subject.strip(), html=_email_html(body.body), text=body.body)
    if not result.get("sent"):
        reason = result.get("reason") or "unknown"
        if reason == "no_api_key":
            raise HTTPException(status_code=400, detail="Email sending isn't configured yet. Add a RESEND_API_KEY to send outreach.")
        raise HTTPException(status_code=422, detail=f"Could not send email: {reason}")
    if body.lead_id:
        await db.intent_leads.update_one(
            {"lead_id": body.lead_id, **org_filter(user)},
            {"$set": {"status": body.mark_status or "contacted", "contact_email": to, "updated_at": _now()}},
        )
        await _log_activity(body.lead_id, user, body.mark_status or "contacted", f"Email sent to {to}")
    return {"sent": True, "id": result.get("id"), "to": to}


# ------------------------------------------------------------------ action 4: custom sandbox
@router.post("/intent/leads/{lead_id}/sandbox")
async def build_sandbox(lead_id: str, body: DraftReq = DraftReq(), user: User = Depends(require_paid_owner)):
    lead = await _get_lead(lead_id, user)
    if lead.get("sandbox"):
        return lead["sandbox"]  # idempotent — don't overwrite an existing POC package
    sandbox_id = f"sbx_{uuid.uuid4().hex[:10]}"
    link = f"{SANDBOX_BASE}/{sandbox_id}"
    fallback = (
        f"Personalized proof-of-concept for {lead['account']}\n\n"
        f"Pre-loaded with sample data modeled on this account's profile and use case. "
        f"Based on their signals ({_signal_summary(lead) or 'active evaluation'}), the environment highlights the exact "
        f"workflows they explored so they can see value on day one.\n\n"
        f"Suggested setup: 1) seed their team/accounts, 2) enable the features they explored, "
        f"3) pre-build one dashboard tied to their goal, 4) share the link for a guided first session."
    )
    system = (
        "You are a solutions engineer writing a short internal setup brief for a personalized proof-of-concept (sandbox) "
        "environment for a high-intent prospect. Describe what data to pre-load and which workflows to highlight based on "
        "their signals. No emojis, no markdown symbols. Under 130 words."
    )
    prompt = (
        f"Prospect: {lead['account']}\nStage: {lead['best_stage']}\n"
        f"Signals: {_signal_summary(lead) or 'active evaluation'}\nOpen value: ${lead['value']:,.0f}\n\n"
        f"Write the sandbox setup brief now."
    )
    brief, _ = await _ai_text(system, prompt, f"intent_sandbox_{lead_id}", fallback)
    sandbox = {"sandbox_id": sandbox_id, "link": link, "brief": brief, "status": "ready", "created_at": _now()}
    await db.intent_leads.update_one(
        {"lead_id": lead_id}, {"$set": {"sandbox": sandbox, "status": "sandbox", "updated_at": _now()}}
    )
    await _log_activity(lead_id, user, "sandbox", f"Built personalized POC sandbox {sandbox_id}")
    return sandbox
