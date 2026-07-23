"""Upsell Engine — grow revenue from existing customers.

Pulls customer metrics from connected integrations (product-usage telemetry from
Mixpanel/Amplitude via telemetry_usage, plus revenue/accounts synced into deals)
and scores each account for EXPANSION potential. For each candidate the owner can:
  1) generate an upgrade email (with a link to the org's OWN plan/pricing page),
  2) create a discount offer,
  3) notify the sales team of the opportunity,
  4) launch a focused upgrade campaign across selected candidates.

Nothing executes autonomously — every send is human-approved. Enterprise, owner-only.
"""
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from models import User
from dependencies import get_current_user, org_filter
from utils.crypto import decrypt
from utils.email import send_email
from routes.telemetry import require_enterprise, USAGE_SOURCES
from routes.telemetry_sources import fetch_mixpanel_usage, fetch_amplitude_usage

logger = logging.getLogger(__name__)
router = APIRouter()

# Accounts in these stages are lost/inactive — never upsell targets.
EXCLUDED_STAGES = {"lost", "closed_lost", "churned", "cancelled"}


# ------------------------------------------------------------------ models
class PlanCreate(BaseModel):
    name: str
    price: float = 0.0
    period: str = "monthly"          # monthly | yearly | one-time
    upgrade_url: str = ""
    description: str = ""


class CandidatePatch(BaseModel):
    status: Optional[str] = None
    contact_email: Optional[str] = None


class DraftRequest(BaseModel):
    target_plan_id: Optional[str] = None
    discount_percent: Optional[float] = None


class SendEmailRequest(BaseModel):
    candidate_id: Optional[str] = None
    to: str
    subject: str
    body: str
    mark_status: Optional[str] = None


class NotifySalesRequest(BaseModel):
    to: Optional[str] = None


class CampaignCreate(BaseModel):
    name: str
    target_plan_id: Optional[str] = None
    message: Optional[str] = None
    candidate_ids: List[str] = []


class CampaignPatch(BaseModel):
    status: Optional[str] = None


# ------------------------------------------------------------------ helpers
def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _median(nums: list) -> float:
    vals = sorted(v for v in nums if v is not None)
    if not vals:
        return 0.0
    n = len(vals)
    mid = n // 2
    return float(vals[mid] if n % 2 else (vals[mid - 1] + vals[mid]) / 2)


async def _ai_text(system: str, prompt: str, session_prefix: str, fallback: str) -> tuple[str, bool]:
    """Draft text via Claude with a template fallback. Never raises."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            return fallback, False
        chat = LlmChat(
            api_key=api_key,
            session_id=f"{session_prefix}_{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=40)
        text = (resp if isinstance(resp, str) else str(resp)).strip()
        return (text or fallback), bool(text)
    except Exception as e:
        logger.warning("upsell AI draft failed (%s): %s", session_prefix, e)
        return fallback, False


def _email_html(body: str) -> str:
    safe = (body or "").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return (
        "<div style=\"font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;"
        "font-size:15px;line-height:1.6;max-width:560px;\">" + safe + "</div>"
    )


async def _pick_plan(user: User, target_plan_id: Optional[str]) -> Optional[dict]:
    if target_plan_id:
        p = await db.upsell_plans.find_one({"plan_id": target_plan_id, **org_filter(user)}, {"_id": 0})
        if p:
            return p
    plans = await db.upsell_plans.find(org_filter(user), {"_id": 0}).to_list(100)
    if not plans:
        return None
    # Default target = highest-priced plan (the premium upsell tier).
    return sorted(plans, key=lambda x: x.get("price", 0), reverse=True)[0]


# ------------------------------------------------------------------ status
@router.get("/upsell/status")
async def upsell_status(user: User = Depends(get_current_user)):
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    connections = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": list(USAGE_SOURCES)}}, {"_id": 0, "platform": 1}
    ).to_list(10)
    plans_count = await db.upsell_plans.count_documents(org_filter(user))
    candidates_count = await db.upsell_candidates.count_documents({**org_filter(user), "status": "open"})
    return {
        "is_enterprise": "enterprise" in (tier or ""),
        "is_owner": user.role == "owner",
        "usage_sources_connected": [c["platform"] for c in connections],
        "plans_count": plans_count,
        "open_candidates": candidates_count,
        "owner_email": user.email,
    }


# ------------------------------------------------------------------ plans CRUD
@router.get("/upsell/plans")
async def list_plans(user: User = Depends(require_enterprise)):
    return await db.upsell_plans.find(org_filter(user), {"_id": 0}).sort("price", 1).to_list(100)


@router.post("/upsell/plans")
async def create_plan(body: PlanCreate, user: User = Depends(require_enterprise)):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Plan name is required")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "plan_id": f"plan_{uuid.uuid4().hex[:12]}",
        "org_id": user.org_id,
        "name": body.name.strip(),
        "price": max(0.0, float(body.price)),
        "period": body.period if body.period in ("monthly", "yearly", "one-time") else "monthly",
        "upgrade_url": body.upgrade_url.strip(),
        "description": body.description.strip(),
        "created_at": now,
    }
    await db.upsell_plans.insert_one(dict(doc))
    return _clean(doc)


@router.delete("/upsell/plans/{plan_id}")
async def delete_plan(plan_id: str, user: User = Depends(require_enterprise)):
    res = await db.upsell_plans.delete_one({"plan_id": plan_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")
    return {"status": "deleted"}


# ------------------------------------------------------------------ usage sync
@router.post("/upsell/sync")
async def sync_usage(user: User = Depends(require_enterprise)):
    """Refresh per-account product-usage metrics from connected analytics sources."""
    connections = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": list(USAGE_SOURCES)}}, {"_id": 0}
    ).to_list(10)
    if not connections:
        raise HTTPException(
            status_code=400,
            detail="Connect Mixpanel or Amplitude on the Integration page to pull product-usage metrics, or run a scan on your revenue/account data.",
        )
    now = datetime.now(timezone.utc).isoformat()
    total = 0
    for conn in connections:
        platform = conn["platform"]
        api_key = decrypt(conn.get("api_key_encrypted", "")) if conn.get("api_key_encrypted") else ""
        rows = []
        try:
            if platform == "mixpanel":
                rows = await fetch_mixpanel_usage(conn.get("company_id", ""), api_key, conn.get("instance_url", "us"), "company", "")
            elif platform == "amplitude":
                rows = await fetch_amplitude_usage(conn.get("client_id", ""), api_key, conn.get("instance_url", "us"), "company", "")
        except Exception as e:
            logger.warning("upsell usage sync failed for %s: %s", platform, e)
            rows = []
        for r in rows:
            await db.telemetry_usage.update_one(
                {"org_id": user.org_id, "source": platform, "account_key": r["account_key"]},
                {"$set": {
                    "org_id": user.org_id, "source": platform, "account_key": r["account_key"],
                    "seats_used": r["seats_used"], "usage_volume": r["usage_volume"],
                    "window_days": 30, "synced_at": now,
                }},
                upsert=True,
            )
        total += len(rows)
    return {"status": "synced", "accounts_synced": total,
            "message": f"Synced usage metrics for {total} account(s)." if total else "No per-account usage returned — your events need an account property."}


# ------------------------------------------------------------------ candidate scan
def _build_signals(acct: dict, medians: dict) -> tuple[list, int, float]:
    """Return (signals, score 0-100, est_expansion_value)."""
    signals = []
    value = acct["value"]
    seats = acct["seats_used"]
    usage = acct["usage_volume"]
    contracted = acct["contracted_seats"]
    tenure_days = acct["tenure_days"]
    deals_count = acct["deals_count"]

    if usage > 0 and usage >= max(500.0, medians["usage"] * 1.15):
        signals.append({"key": "heavy_usage", "label": "Heavy product usage", "detail": f"{usage:,} events / 30d"})
    if seats >= max(5, int(medians["seats"]) + 1):
        signals.append({"key": "team_growth", "label": "Team growth", "detail": f"{seats} active seats"})
    if usage > 0 and seats > 0 and (usage / seats) >= 50:
        signals.append({"key": "frequent_logins", "label": "Frequent engagement", "detail": f"{round(usage / seats)} events/seat"})
    if contracted > 0 and seats >= 0.8 * contracted:
        signals.append({"key": "plan_limit", "label": "Nearing plan limit", "detail": f"{seats}/{contracted} seats used"})
    if value > 0 and value >= medians["value"]:
        signals.append({"key": "high_value", "label": "High-value account", "detail": f"${value:,.0f}"})
    if deals_count >= 2:
        signals.append({"key": "multi_product", "label": "Multi-product footprint", "detail": f"{deals_count} deals"})
    if tenure_days >= 180:
        signals.append({"key": "loyal", "label": "Long tenure", "detail": f"{tenure_days // 30} months"})

    # Score: weighted by signal strength, capped at 100.
    weights = {"heavy_usage": 22, "team_growth": 20, "frequent_logins": 16, "plan_limit": 20,
               "high_value": 14, "multi_product": 12, "loyal": 8}
    score = min(100, sum(weights.get(s["key"], 0) for s in signals))

    # Estimated annual expansion value.
    uplift = min(0.6, 0.15 + 0.05 * len(signals))
    est = round(value * uplift, 2)
    if est <= 0 and seats > 0:
        est = round(seats * 1200.0, 2)  # nominal per-seat annual value when revenue unknown
    return signals, score, est


@router.post("/upsell/scan")
async def scan_candidates(user: User = Depends(require_enterprise)):
    """Aggregate customer accounts from integration data and score expansion potential."""
    deals = await db.deals.find(org_filter(user), {"_id": 0}).to_list(5000)
    usage_rows = await db.telemetry_usage.find(org_filter(user), {"_id": 0}).to_list(5000)
    contracts = await db.contracts.find(org_filter(user), {"_id": 0}).to_list(2000)

    usage_map = {}
    for u in usage_rows:
        k = (u.get("account_key") or "").strip().lower()
        if not k:
            continue
        cur = usage_map.setdefault(k, {"seats_used": 0, "usage_volume": 0, "sources": set()})
        cur["seats_used"] = max(cur["seats_used"], int(u.get("seats_used", 0)))
        cur["usage_volume"] += int(u.get("usage_volume", 0))
        cur["sources"].add(u.get("source", ""))
    contract_map = {}
    for c in contracts:
        k = (c.get("account_key") or "").strip().lower()
        if k:
            contract_map[k] = c

    now = datetime.now(timezone.utc)
    accounts = {}
    for d in deals:
        stage = (d.get("stage") or "").lower()
        if stage in EXCLUDED_STAGES:
            continue
        company = (d.get("company") or d.get("name") or "").strip()
        if not company:
            continue
        key = company.lower()
        a = accounts.setdefault(key, {
            "company": company, "value": 0.0, "deals_count": 0, "sources": set(),
            "first_seen": now, "seats_used": 0, "usage_volume": 0, "contracted_seats": 0,
        })
        a["value"] += float(d.get("value", 0) or 0)
        a["deals_count"] += 1
        if d.get("source"):
            a["sources"].add(d["source"])
        created = d.get("created_at")
        if isinstance(created, str):
            try:
                cdt = datetime.fromisoformat(created)
                if cdt.tzinfo is None:
                    cdt = cdt.replace(tzinfo=timezone.utc)
                a["first_seen"] = min(a["first_seen"], cdt)
            except Exception:
                pass
        elif isinstance(created, datetime):
            cdt = created if created.tzinfo else created.replace(tzinfo=timezone.utc)
            a["first_seen"] = min(a["first_seen"], cdt)

    # Enrich with usage/contract metrics.
    for key, a in accounts.items():
        u = usage_map.get(key)
        if u:
            a["seats_used"] = u["seats_used"]
            a["usage_volume"] = u["usage_volume"]
            a["sources"] |= {s for s in u["sources"] if s}
        c = contract_map.get(key)
        if c:
            a["contracted_seats"] = int(c.get("contracted_seats", 0))
        a["tenure_days"] = max(0, (now - a["first_seen"]).days)

    medians = {
        "value": _median([a["value"] for a in accounts.values() if a["value"] > 0]),
        "usage": _median([a["usage_volume"] for a in accounts.values() if a["usage_volume"] > 0]),
        "seats": _median([a["seats_used"] for a in accounts.values() if a["seats_used"] > 0]),
    }

    now_iso = now.isoformat()
    found = 0
    total_potential = 0.0
    for key, a in accounts.items():
        signals, score, est = _build_signals(a, medians)
        if not signals or score < 20:
            continue
        found += 1
        total_potential += est
        existing = await db.upsell_candidates.find_one(
            {"org_id": user.org_id, "account_key": key}, {"_id": 0}
        )
        base = {
            "org_id": user.org_id,
            "account_key": key,
            "account": a["company"],
            "current_value": round(a["value"], 2),
            "seats_used": a["seats_used"],
            "usage_volume": a["usage_volume"],
            "deals_count": a["deals_count"],
            "sources": sorted([s for s in a["sources"] if s]),
            "signals": signals,
            "expansion_score": score,
            "est_expansion_value": est,
            "updated_at": now_iso,
        }
        if existing:
            keep_status = existing.get("status", "open")
            if keep_status == "dismissed":
                keep_status = "dismissed"
            base["status"] = keep_status
            base["contact_email"] = existing.get("contact_email", "")
            await db.upsell_candidates.update_one({"candidate_id": existing["candidate_id"]}, {"$set": base})
        else:
            base["candidate_id"] = f"cand_{uuid.uuid4().hex[:12]}"
            base["status"] = "open"
            base["contact_email"] = ""
            base["created_at"] = now_iso
            await db.upsell_candidates.insert_one(dict(base))

    return {"status": "scanned", "accounts_analyzed": len(accounts),
            "candidates_found": found, "total_potential": round(total_potential, 2)}


@router.get("/upsell/candidates")
async def list_candidates(user: User = Depends(require_enterprise)):
    rows = await db.upsell_candidates.find(org_filter(user), {"_id": 0}).sort("est_expansion_value", -1).to_list(500)
    return rows


@router.patch("/upsell/candidates/{candidate_id}")
async def patch_candidate(candidate_id: str, body: CandidatePatch, user: User = Depends(require_enterprise)):
    updates = {}
    if body.status is not None:
        if body.status not in ("open", "emailed", "offered", "notified", "won", "dismissed"):
            raise HTTPException(status_code=400, detail="Invalid status")
        updates["status"] = body.status
    if body.contact_email is not None:
        updates["contact_email"] = body.contact_email.strip()
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.upsell_candidates.update_one({"candidate_id": candidate_id, **org_filter(user)}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return _clean(await db.upsell_candidates.find_one({"candidate_id": candidate_id}, {"_id": 0}))


async def _get_candidate(candidate_id: str, user: User) -> dict:
    c = await db.upsell_candidates.find_one({"candidate_id": candidate_id, **org_filter(user)}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return c


def _signal_summary(cand: dict) -> str:
    return ", ".join(f"{s['label']} ({s['detail']})" for s in cand.get("signals", []))


# ------------------------------------------------------------------ action 1: upgrade email
@router.post("/upsell/candidates/{candidate_id}/email")
async def draft_upgrade_email(candidate_id: str, body: DraftRequest = DraftRequest(), user: User = Depends(require_enterprise)):
    cand = await _get_candidate(candidate_id, user)
    plan = await _pick_plan(user, body.target_plan_id)
    plan_name = plan["name"] if plan else "our next plan tier"
    plan_price = f"${plan['price']:,.0f}/{plan['period']}" if plan else ""
    link = plan.get("upgrade_url") if plan else ""

    fallback = (
        f"Subject: An upgrade tailored to how {cand['account']} is growing\n\n"
        f"Hi there,\n\nWe've noticed {cand['account']} is getting real traction — "
        f"{_signal_summary(cand) or 'strong, consistent usage'}. That's exactly the point where teams "
        f"get the most out of upgrading.\n\nMoving up to {plan_name}{(' (' + plan_price + ')') if plan_price else ''} "
        f"unlocks more headroom and capabilities to match your momentum.\n\n"
        f"{('Upgrade here: ' + link) if link else 'Reply and we will set you up in minutes.'}\n\nBest regards"
    )
    system = (
        "You are a senior account executive writing a short, warm, non-pushy upgrade email to an existing "
        "customer who is showing strong expansion signals. Reference their momentum specifically, tie the upgrade "
        "to value they will get, and include a clear call to action. No emojis, no markdown symbols. "
        "Output a 'Subject:' line, then the email body. Keep under 160 words."
    )
    prompt = (
        f"Existing customer: {cand['account']}\n"
        f"Current annual value: ${cand['current_value']:,.0f}\n"
        f"Detected expansion signals: {_signal_summary(cand) or 'consistent usage'}\n"
        f"Recommended upgrade plan: {plan_name} {plan_price}\n"
        f"Upgrade link to include verbatim if present: {link or 'none'}\n\n"
        f"Write the upgrade email now."
    )
    text, _ = await _ai_text(system, prompt, f"upsell_email_{candidate_id}", fallback)
    return {"draft": text, "plan": plan, "candidate_id": candidate_id}


# ------------------------------------------------------------------ action 2: discount offer
@router.post("/upsell/candidates/{candidate_id}/offer")
async def draft_discount_offer(candidate_id: str, body: DraftRequest = DraftRequest(), user: User = Depends(require_enterprise)):
    cand = await _get_candidate(candidate_id, user)
    plan = await _pick_plan(user, body.target_plan_id)
    plan_name = plan["name"] if plan else "the upgraded plan"
    pct = body.discount_percent if body.discount_percent is not None else 15
    price_line = ""
    if plan and plan.get("price"):
        discounted = plan["price"] * (1 - pct / 100.0)
        price_line = f"Standard {plan['name']} is ${plan['price']:,.0f}/{plan['period']}; with {pct:.0f}% off it's ${discounted:,.0f}/{plan['period']} for the first term."
    link = plan.get("upgrade_url") if plan else ""

    fallback = (
        f"Subject: A {pct:.0f}% upgrade offer for {cand['account']}\n\n"
        f"Hi there,\n\nBecause {cand['account']} has been such an engaged customer, we'd like to offer "
        f"{pct:.0f}% off your upgrade to {plan_name} for the first term. {price_line}\n\n"
        f"This offer is valid for the next 14 days. {('Claim it here: ' + link) if link else 'Reply to lock it in.'}\n\nBest regards"
    )
    system = (
        "You are a retention/expansion strategist drafting a concise, ROI-justified discount offer to move an "
        "existing customer to a higher plan. State the offer, why it fits them, the guardrail (expiry), and a clear "
        "call to action. No emojis, no markdown symbols. Output a 'Subject:' line then the body. Keep under 150 words."
    )
    prompt = (
        f"Customer: {cand['account']}\nExpansion signals: {_signal_summary(cand) or 'strong usage'}\n"
        f"Target plan: {plan_name}\nDiscount: {pct:.0f}% off first term\n{price_line}\n"
        f"Link to include verbatim if present: {link or 'none'}\n\nWrite the offer now."
    )
    text, _ = await _ai_text(system, prompt, f"upsell_offer_{candidate_id}", fallback)
    return {"draft": text, "plan": plan, "discount_percent": pct, "candidate_id": candidate_id}


# ------------------------------------------------------------------ send email (upgrade or offer)
@router.post("/upsell/send-email")
async def send_upsell_email(body: SendEmailRequest, user: User = Depends(require_enterprise)):
    to = (body.to or "").strip()
    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="A valid recipient email is required")
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Subject and body are required")
    result = await send_email(to=to, subject=body.subject.strip(), html=_email_html(body.body), text=body.body)
    if not result.get("sent"):
        reason = result.get("reason") or "unknown"
        if reason == "no_api_key":
            raise HTTPException(status_code=503, detail="Email sending isn't configured yet (missing RESEND_API_KEY).")
        raise HTTPException(status_code=502, detail=f"Could not send email: {reason}")
    if body.candidate_id:
        await db.upsell_candidates.update_one(
            {"candidate_id": body.candidate_id, **org_filter(user)},
            {"$set": {"status": body.mark_status or "emailed", "contact_email": to,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"sent": True, "id": result.get("id"), "to": to}


# ------------------------------------------------------------------ action 3: notify sales team
@router.post("/upsell/candidates/{candidate_id}/notify-sales")
async def notify_sales(candidate_id: str, body: NotifySalesRequest = NotifySalesRequest(), user: User = Depends(require_enterprise)):
    cand = await _get_candidate(candidate_id, user)
    to = (body.to or user.email or "").strip()
    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="A valid recipient email is required")
    subject = f"Upsell opportunity: {cand['account']} (~${cand['est_expansion_value']:,.0f}/yr expansion)"
    lines = [
        f"{cand['account']} is a strong expansion candidate.",
        "",
        f"Current annual value: ${cand['current_value']:,.0f}",
        f"Estimated expansion potential: ${cand['est_expansion_value']:,.0f}/yr",
        f"Expansion score: {cand['expansion_score']}/100",
        "",
        "Signals detected:",
    ] + [f"  - {s['label']}: {s['detail']}" for s in cand.get("signals", [])] + [
        "",
        "Recommended next step: reach out to align on an upgrade before the momentum cools.",
        "",
        "— InFlow Upsell Engine",
    ]
    text = "\n".join(lines)
    result = await send_email(to=to, subject=subject, html=_email_html(text), text=text)
    if not result.get("sent"):
        reason = result.get("reason") or "unknown"
        if reason == "no_api_key":
            raise HTTPException(status_code=503, detail="Email sending isn't configured yet (missing RESEND_API_KEY).")
        raise HTTPException(status_code=502, detail=f"Could not notify sales: {reason}")
    await db.upsell_candidates.update_one(
        {"candidate_id": candidate_id, **org_filter(user)},
        {"$set": {"status": "notified", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"sent": True, "id": result.get("id"), "to": to}


# ------------------------------------------------------------------ action 4: upgrade campaigns
@router.get("/upsell/campaigns")
async def list_campaigns(user: User = Depends(require_enterprise)):
    return await db.upsell_campaigns.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/upsell/campaigns")
async def create_campaign(body: CampaignCreate, user: User = Depends(require_enterprise)):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Campaign name is required")
    plan = await _pick_plan(user, body.target_plan_id)
    cands = await db.upsell_candidates.find(
        {**org_filter(user), "candidate_id": {"$in": body.candidate_ids}}, {"_id": 0}
    ).to_list(500)
    total_potential = round(sum(c.get("est_expansion_value", 0) for c in cands), 2)

    message = (body.message or "").strip()
    if not message:
        plan_name = plan["name"] if plan else "a higher plan"
        fallback = (
            f"Campaign: {body.name.strip()}\n\nObjective: move {len(cands)} engaged account(s) up to {plan_name}, "
            f"protecting and growing ~${total_potential:,.0f}/yr of expansion revenue.\n\n"
            f"Play: 1) personalized upgrade email referencing each account's usage momentum, 2) a time-boxed upgrade "
            f"offer for fence-sitters, 3) sales follow-up on the highest-value accounts. Track replies and upgrades weekly."
        )
        system = (
            "You are a growth marketer outlining a focused, tasteful upgrade campaign to move existing customers to a "
            "higher plan tier. Give a short objective and a 3-step play. No emojis, no markdown symbols. Under 130 words."
        )
        prompt = (
            f"Campaign name: {body.name.strip()}\nTarget plan: {plan['name'] if plan else 'higher tier'}\n"
            f"Accounts in campaign: {len(cands)}\nTotal expansion potential: ${total_potential:,.0f}/yr\n\n"
            f"Write the campaign brief now."
        )
        message, _ = await _ai_text(system, prompt, "upsell_campaign", fallback)

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "campaign_id": f"camp_{uuid.uuid4().hex[:12]}",
        "org_id": user.org_id,
        "name": body.name.strip(),
        "target_plan_id": plan["plan_id"] if plan else None,
        "target_plan_name": plan["name"] if plan else None,
        "candidate_ids": [c["candidate_id"] for c in cands],
        "candidate_count": len(cands),
        "total_potential": total_potential,
        "message": message,
        "status": "draft",
        "created_at": now,
        "updated_at": now,
    }
    await db.upsell_campaigns.insert_one(dict(doc))
    return _clean(doc)


@router.patch("/upsell/campaigns/{campaign_id}")
async def patch_campaign(campaign_id: str, body: CampaignPatch, user: User = Depends(require_enterprise)):
    if body.status not in ("draft", "launched", "completed", "archived"):
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.upsell_campaigns.update_one(
        {"campaign_id": campaign_id, **org_filter(user)},
        {"$set": {"status": body.status, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _clean(await db.upsell_campaigns.find_one({"campaign_id": campaign_id}, {"_id": 0}))


@router.delete("/upsell/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user: User = Depends(require_enterprise)):
    res = await db.upsell_campaigns.delete_one({"campaign_id": campaign_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return {"status": "deleted"}
