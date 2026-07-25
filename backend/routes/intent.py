"""High-Intent Buyer Detection (Discover) — guided AI selling flow.

Detects high-intent buyers from connected-integration signals, then walks each one
through a single decision loop:

  Opportunity detected -> AI analyzes everything -> AI explains WHY this buyer matters
  -> AI predicts the outcome -> AI recommends ONE action -> user executes -> AI measures impact

Signals span Marketing (pricing/inbound, ad engagement, recent activity), Sales
(proposal, multiple stakeholders, demo/late stage) and Product (trial usage, feature
exploration, invited teammates). Paid-tier gated; the act/execute steps are owner-only.
"""
import re
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

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
IMPACT_OUTCOMES = {"replied", "meeting_booked", "won", "no_response", "lost"}
ACTION_TYPES = {"send_email", "book_call", "loop_in_ae", "nurture"}


# ------------------------------------------------------------------ models
class LeadPatch(BaseModel):
    status: Optional[str] = None
    contact_email: Optional[str] = None


class AnalyzeReq(BaseModel):
    pass


class ExecuteReq(BaseModel):
    to: Optional[str] = None
    send: bool = False
    note: Optional[str] = None
    artifact: Optional[str] = None


class ImpactReq(BaseModel):
    outcome: str
    note: Optional[str] = None


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


def _split_subject(text: str) -> tuple[str, str]:
    m = re.search(r"^\s*subject:\s*(.+)$", text or "", re.I | re.M)
    if m:
        subj = m.group(1).strip()
        body = re.sub(r"^\s*subject:\s*.+$", "", text, flags=re.I | re.M).lstrip()
        return subj, body
    return "", text or ""


def _fallback_briefing(lead: dict) -> dict:
    score = lead.get("intent_score", 0)
    value = lead.get("value", 0) or 0
    prob = max(5, min(95, round(0.5 * score + 0.5 * lead.get("probability", 0))))
    stage = lead.get("best_stage", "lead")
    if stage in ("negotiation", "proposal"):
        timeline = "1-2 weeks"
    elif stage in ("demo", "qualified", "discovery"):
        timeline = "3-6 weeks"
    else:
        timeline = "6-10 weeks"
    conf = "high" if score >= 60 else "medium" if score >= 40 else "low"
    sigs = _signal_summary(lead) or "several positive signals"
    if stage in ("proposal", "negotiation"):
        action = {"type": "book_call", "title": "Book a closing call",
                  "rationale": "They're late-stage and warm — a live call removes the last blockers to a decision.",
                  "artifact": f"Hi there,\n\nWe're close on {lead['account']}. I'd love 20 minutes to walk through the final details and answer any open questions so we can get you moving. What time works this week?\n\nBest regards"}
    elif score >= 50:
        action = {"type": "send_email", "title": "Send a value-focused follow-up",
                  "rationale": f"Strong intent ({sigs}). Strike now with a specific, tailored note while attention is high.",
                  "artifact": f"Subject: The results {lead['account']} is set up for\n\nHi there,\n\nI noticed {sigs} — that usually means you're evaluating seriously. Here's exactly how teams like yours see value fast, tailored to what you've explored. Want a quick 20-minute walkthrough this week?\n\nBest regards"}
    else:
        action = {"type": "nurture", "title": "Add to a light nurture",
                  "rationale": "Intent is building but not yet hot — stay top-of-mind with one useful, low-friction touch.",
                  "artifact": f"Send {lead['account']} one relevant case study or resource tied to their use case, then re-check intent in a week."}
    return {
        "why": f"{lead['account']} is showing {sigs}. In your pipeline this pattern signals active evaluation and a real buying window worth about ${value:,.0f}.",
        "prediction": {"close_probability": prob, "expected_value": float(value), "timeline": timeline,
                       "confidence": conf, "summary": f"~{prob}% to close in {timeline} at roughly ${value:,.0f}."},
        "recommended_action": action,
    }


def _parse_briefing(text: str) -> Optional[dict]:
    try:
        s = text[text.index("{"):text.rindex("}") + 1]
        data = json.loads(s)
        if not all(k in data for k in ("why", "prediction", "recommended_action")):
            return None
        p, a = data["prediction"], data["recommended_action"]
        data["prediction"] = {
            "close_probability": max(0, min(100, int(p.get("close_probability", 0) or 0))),
            "expected_value": float(p.get("expected_value", 0) or 0),
            "timeline": str(p.get("timeline", "")),
            "confidence": p.get("confidence", "medium") if p.get("confidence") in ("high", "medium", "low") else "medium",
            "summary": str(p.get("summary", "")),
        }
        atype = a.get("type", "send_email")
        data["recommended_action"] = {
            "type": atype if atype in ACTION_TYPES else "send_email",
            "title": str(a.get("title", "")),
            "rationale": str(a.get("rationale", "")),
            "artifact": str(a.get("artifact", "")),
        }
        data["why"] = str(data["why"])
        return data
    except Exception:
        return None


# ------------------------------------------------------------------ status
@router.get("/intent/status")
async def intent_status(user: User = Depends(get_current_user)):
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    is_paid = (tier or "trial") not in {"trial", "expired", "cancelled", "free"}
    connections = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": list(USAGE_SOURCES)}}, {"_id": 0, "platform": 1}
    ).to_list(10)
    open_leads = await db.intent_leads.count_documents(
        {**org_filter(user), "status": {"$nin": ["dismissed", "won", "lost"]}}
    )
    return {
        "is_paid": is_paid,
        "is_owner": user.role == "owner",
        "usage_sources_connected": [c["platform"] for c in connections],
        "open_leads": open_leads,
    }


# ------------------------------------------------------------------ scan
def _build_signals(acct: dict, medians: dict) -> tuple[list, int]:
    signals = []
    src = {s.lower() for s in acct["sources"]}
    stages = {s.lower() for s in acct["stages"]}
    seats = acct["seats_used"]
    usage = acct["usage_volume"]
    dc = acct["deals_count"]
    notes = (acct["notes"] or "").lower()

    inbound = src & INBOUND_SOURCES
    if inbound:
        signals.append({"key": "pricing_page_visit", "cat": "Marketing", "label": "Visited pricing / inbound", "detail": ", ".join(sorted(inbound))[:40]})
    ads = src & AD_SOURCES
    if ads:
        signals.append({"key": "ad_engagement", "cat": "Marketing", "label": "Engaged with ads", "detail": ", ".join(sorted(ads))[:40]})
    if acct["days_since_update"] is not None and acct["days_since_update"] <= 14:
        signals.append({"key": "returning_visitor", "cat": "Marketing", "label": "Recently active", "detail": f"touched {acct['days_since_update']}d ago"})

    if "proposal" in stages:
        signals.append({"key": "proposal_viewed", "cat": "Sales", "label": "Proposal stage", "detail": "proposal in play"})
    if (stages & {"demo", "negotiation"}) or "demo" in notes:
        signals.append({"key": "demo_completed", "cat": "Sales", "label": "Demo / late stage", "detail": acct["best_stage"]})
    if dc >= 2:
        signals.append({"key": "multiple_stakeholders", "cat": "Sales", "label": "Multiple stakeholders", "detail": f"{dc} open threads"})

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
            continue
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
            prev_status = existing.get("status", "new")
            base["status"] = prev_status if prev_status in {"new", "analyzed", "executed", "won", "lost", "dismissed"} else "new"
            base["contact_email"] = existing.get("contact_email", "")
            await db.intent_leads.update_one({"lead_id": existing["lead_id"]}, {"$set": base})
        else:
            base["lead_id"] = f"lead_{uuid.uuid4().hex[:12]}"
            base["status"] = "new"
            base["contact_email"] = ""
            base["briefing"] = None
            base["executed"] = None
            base["impact"] = None
            base["activity"] = [{"ts": now_iso, "type": "detected", "detail": f"Opportunity detected — intent score {score}/100", "by": "InFlow"}]
            await db.intent_leads.insert_one(dict(base))

    return {"status": "scanned", "accounts_analyzed": len(accounts), "leads_found": found, "hot_leads": hot}


@router.get("/intent/leads")
async def list_leads(user: User = Depends(require_paid)):
    return await db.intent_leads.find(org_filter(user), {"_id": 0}).sort("intent_score", -1).to_list(500)


@router.patch("/intent/leads/{lead_id}")
async def patch_lead(lead_id: str, body: LeadPatch, user: User = Depends(require_paid)):
    updates = {}
    if body.status is not None:
        if body.status not in ("new", "analyzed", "executed", "won", "lost", "dismissed"):
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


# ------------------------------------------------------------------ step: AI analyze (why + predict + recommend ONE action)
@router.post("/intent/leads/{lead_id}/analyze")
async def analyze_lead(lead_id: str, body: AnalyzeReq = AnalyzeReq(), user: User = Depends(require_paid_owner)):
    lead = await _get_lead(lead_id, user)
    system = (
        "You are an elite revenue-intelligence strategist analyzing a single buyer. Respond with STRICT JSON only "
        "(no markdown, no prose outside the JSON). The JSON must have exactly these keys: "
        '"why" (2 sentences on why this buyer matters right now), '
        '"prediction" (object: close_probability int 0-100, expected_value number, timeline short string, '
        'confidence one of high|medium|low, summary one sentence), and '
        '"recommended_action" (object: type one of send_email|book_call|loop_in_ae|nurture, title short, '
        "rationale one sentence on why THIS action now, artifact = the ready-to-use content — for send_email a full "
        "email starting with a 'Subject:' line; for book_call short call talking points; for loop_in_ae an internal "
        "handoff note; for nurture a one-line nurture suggestion). Recommend exactly ONE action."
    )
    prompt = (
        f"Buyer account: {lead['account']}\n"
        f"Open pipeline value: ${lead['value']:,.0f}\n"
        f"Stage: {lead['best_stage']} | deal probability: {lead['probability']}%\n"
        f"Intent score: {lead['intent_score']}/100\n"
        f"Buying-intent signals: {_signal_summary(lead) or 'inbound interest'}\n\n"
        f"Return the analysis JSON now."
    )
    text, ok = await _ai_text(system, prompt, f"intent_analyze_{lead_id}", "")
    briefing = _parse_briefing(text) if (ok and text) else None
    if not briefing:
        briefing = _fallback_briefing(lead)
    briefing["generated_at"] = _now()
    new_status = "analyzed" if lead.get("status") == "new" else lead.get("status")
    await db.intent_leads.update_one(
        {"lead_id": lead_id}, {"$set": {"briefing": briefing, "status": new_status, "updated_at": _now()}}
    )
    await _log_activity(lead_id, user, "analyze", "AI generated buyer briefing")
    return briefing


# ------------------------------------------------------------------ step: user executes the ONE action
@router.post("/intent/leads/{lead_id}/execute")
async def execute_action(lead_id: str, body: ExecuteReq = ExecuteReq(), user: User = Depends(require_paid_owner)):
    lead = await _get_lead(lead_id, user)
    briefing = lead.get("briefing")
    if not briefing:
        raise HTTPException(status_code=400, detail="Run the AI analysis first")
    action = briefing.get("recommended_action", {})
    artifact = (body.artifact if body.artifact is not None else action.get("artifact", "")) or ""
    sent = False
    detail = f"Executed: {action.get('title') or 'recommended action'}"

    if body.send and action.get("type") == "send_email":
        to = (body.to or lead.get("contact_email") or "").strip()
        if not to or "@" not in to:
            raise HTTPException(status_code=400, detail="A valid recipient email is required to send")
        subj, bod = _split_subject(artifact)
        result = await send_email(to=to, subject=subj or f"Following up — {lead['account']}", html=_email_html(bod), text=bod)
        if not result.get("sent"):
            reason = result.get("reason") or "unknown"
            if reason == "no_api_key":
                raise HTTPException(status_code=400, detail="Email sending isn't configured yet. Add a RESEND_API_KEY to send.")
            raise HTTPException(status_code=422, detail=f"Could not send email: {reason}")
        sent = True
        detail = f"Sent email to {to}"
        await db.intent_leads.update_one({"lead_id": lead_id}, {"$set": {"contact_email": to}})

    executed = {"action_type": action.get("type"), "title": action.get("title"),
                "note": (body.note or "").strip(), "sent": sent, "executed_at": _now()}
    await db.intent_leads.update_one(
        {"lead_id": lead_id}, {"$set": {"executed": executed, "status": "executed", "updated_at": _now()}}
    )
    await _log_activity(lead_id, user, "execute", detail)
    return {"executed": executed, "sent": sent}


# ------------------------------------------------------------------ step: AI measures impact
@router.post("/intent/leads/{lead_id}/impact")
async def measure_impact(lead_id: str, body: ImpactReq, user: User = Depends(require_paid_owner)):
    lead = await _get_lead(lead_id, user)
    if body.outcome not in IMPACT_OUTCOMES:
        raise HTTPException(status_code=400, detail="Invalid outcome")
    value = lead.get("value", 0) or 0
    value_influenced = value if body.outcome in ("won", "meeting_booked", "replied") else 0
    summaries = {
        "won": f"Won — ${value:,.0f} in new revenue attributed to acting on this buyer's intent at the right moment.",
        "meeting_booked": f"Meeting booked — ${value:,.0f} of pipeline advanced to a live conversation.",
        "replied": f"Positive reply — the buyer re-engaged; ${value:,.0f} kept in active play.",
        "no_response": "No response yet — recommend one more tailored touch, then re-evaluate intent on the next scan.",
        "lost": "Lost this cycle — log the reason; the account stays available for future re-engagement.",
    }
    new_status = "won" if body.outcome == "won" else "lost" if body.outcome == "lost" else "executed"
    impact = {"outcome": body.outcome, "summary": summaries[body.outcome],
              "value_influenced": round(value_influenced, 2), "note": (body.note or "").strip(), "measured_at": _now()}
    await db.intent_leads.update_one(
        {"lead_id": lead_id}, {"$set": {"impact": impact, "status": new_status, "updated_at": _now()}}
    )
    await _log_activity(lead_id, user, "impact", f"Impact measured: {body.outcome} (${value_influenced:,.0f} influenced)")
    return impact
