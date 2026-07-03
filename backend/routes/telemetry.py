"""Multi-Platform Telemetry Sync — revenue-leak detection + human-in-the-loop upsell.

Cross-references product usage (Mixpanel / Amplitude) against billing contracts
(Stripe). When a customer's actual usage exceeds their contracted entitlement,
a "leak" is flagged. The Account Manager reviews a drafted recovery package
(unbilled-usage Stripe draft invoice + AM email + CRM expansion opportunity)
and approves it with one click — nothing executes autonomously.

Enterprise-tier, owner-only.
"""
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import stripe as stripe_sdk

from database import db
from models import User
from dependencies import get_current_user, require_owner, org_filter
from utils.crypto import decrypt
from utils.email import send_email
from routes.telemetry_sources import fetch_mixpanel_usage, fetch_amplitude_usage

logger = logging.getLogger(__name__)
router = APIRouter()

USAGE_SOURCES = ("mixpanel", "amplitude")
EXPANSION_STAGE = "qualified"


# ---------------------------------------------------------------- request models
class ContractCreate(BaseModel):
    customer_name: str
    account_key: str
    stripe_customer_id: Optional[str] = ""
    usage_source: str = ""            # mixpanel | amplitude
    contracted_seats: int = 0
    contracted_api_calls: Optional[int] = None
    unit_price_per_seat: float = 0.0
    currency: str = "usd"
    am_email: Optional[str] = ""


class ContractUpdate(BaseModel):
    customer_name: Optional[str] = None
    account_key: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    usage_source: Optional[str] = None
    contracted_seats: Optional[int] = None
    contracted_api_calls: Optional[int] = None
    unit_price_per_seat: Optional[float] = None
    currency: Optional[str] = None
    am_email: Optional[str] = None


class SyncRequest(BaseModel):
    account_property: str = "company"
    usage_event: str = ""


class EmailEdit(BaseModel):
    to: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


# ---------------------------------------------------------------- helpers
def _is_real_stripe_key(key: str) -> bool:
    return bool(key) and (key.startswith("sk_live_") or key.startswith("sk_test_")) and key != "sk_test_emergent"


async def require_enterprise(user: User = Depends(require_owner)) -> User:
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    if "enterprise" not in (tier or ""):
        raise HTTPException(
            status_code=403,
            detail="Multi-Platform Telemetry Sync is an Enterprise feature. Upgrade to unlock revenue-leak detection.",
        )
    return user


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------- status
@router.get("/telemetry/status")
async def telemetry_status(user: User = Depends(get_current_user)):
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    connections = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": list(USAGE_SOURCES)}}, {"_id": 0, "platform": 1}
    ).to_list(10)
    return {
        "is_enterprise": "enterprise" in (tier or ""),
        "is_owner": user.role == "owner",
        "usage_sources_connected": [c["platform"] for c in connections],
        "stripe_live": _is_real_stripe_key(os.environ.get("STRIPE_API_KEY")),
    }


# ---------------------------------------------------------------- contracts CRUD
@router.get("/telemetry/contracts")
async def list_contracts(user: User = Depends(require_enterprise)):
    rows = await db.contracts.find(org_filter(user), {"_id": 0}).to_list(500)
    return rows


@router.post("/telemetry/contracts")
async def create_contract(body: ContractCreate, user: User = Depends(require_enterprise)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "contract_id": f"ctr_{uuid.uuid4().hex[:12]}",
        "org_id": user.org_id,
        "created_by": user.user_id,
        "customer_name": body.customer_name.strip(),
        "account_key": body.account_key.strip(),
        "stripe_customer_id": (body.stripe_customer_id or "").strip(),
        "usage_source": body.usage_source if body.usage_source in USAGE_SOURCES else "",
        "contracted_seats": max(0, int(body.contracted_seats)),
        "contracted_api_calls": body.contracted_api_calls,
        "unit_price_per_seat": max(0.0, float(body.unit_price_per_seat)),
        "currency": (body.currency or "usd").lower(),
        "am_email": (body.am_email or "").strip(),
        "created_at": now,
        "updated_at": now,
    }
    await db.contracts.insert_one(dict(doc))
    return _clean(doc)


@router.put("/telemetry/contracts/{contract_id}")
async def update_contract(contract_id: str, body: ContractUpdate, user: User = Depends(require_enterprise)):
    existing = await db.contracts.find_one({"contract_id": contract_id, **org_filter(user)}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contract not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "usage_source" in updates and updates["usage_source"] not in USAGE_SOURCES:
        updates["usage_source"] = ""
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.contracts.update_one({"contract_id": contract_id}, {"$set": updates})
    return _clean(await db.contracts.find_one({"contract_id": contract_id}, {"_id": 0}))


@router.delete("/telemetry/contracts/{contract_id}")
async def delete_contract(contract_id: str, user: User = Depends(require_enterprise)):
    res = await db.contracts.delete_one({"contract_id": contract_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contract not found")
    await db.leaks.delete_many({"contract_id": contract_id, **org_filter(user)})
    return {"status": "deleted"}


# ---------------------------------------------------------------- telemetry sync
@router.post("/telemetry/sync")
async def sync_telemetry(body: SyncRequest, user: User = Depends(require_enterprise)):
    """Pull per-account usage from connected usage sources into telemetry_usage."""
    connections = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": list(USAGE_SOURCES)}}, {"_id": 0}
    ).to_list(10)
    if not connections:
        raise HTTPException(
            status_code=400,
            detail="Connect Mixpanel or Amplitude on the Integration page first, then sync usage telemetry.",
        )

    now = datetime.now(timezone.utc).isoformat()
    total_accounts = 0
    synced_sources = []
    for conn in connections:
        platform = conn["platform"]
        api_key = decrypt(conn.get("api_key_encrypted", "")) if conn.get("api_key_encrypted") else ""
        rows = []
        try:
            if platform == "mixpanel":
                rows = await fetch_mixpanel_usage(
                    conn.get("company_id", ""), api_key, conn.get("instance_url", "us"),
                    body.account_property, body.usage_event,
                )
            elif platform == "amplitude":
                rows = await fetch_amplitude_usage(
                    conn.get("client_id", ""), api_key, conn.get("instance_url", "us"),
                    body.account_property, body.usage_event,
                )
        except Exception as e:
            logger.warning("Telemetry sync failed for %s: %s", platform, e)
            rows = []

        for r in rows:
            await db.telemetry_usage.update_one(
                {"org_id": user.org_id, "source": platform, "account_key": r["account_key"]},
                {"$set": {
                    "org_id": user.org_id, "source": platform,
                    "account_key": r["account_key"],
                    "seats_used": r["seats_used"], "usage_volume": r["usage_volume"],
                    "window_days": 30, "synced_at": now,
                }},
                upsert=True,
            )
        total_accounts += len(rows)
        synced_sources.append({"source": platform, "accounts": len(rows)})

    return {
        "status": "synced",
        "sources": synced_sources,
        "accounts_synced": total_accounts,
        "message": (
            f"Synced usage for {total_accounts} account(s)."
            if total_accounts else
            "No per-account usage returned. Ensure your events carry the account property and re-sync."
        ),
    }


# ---------------------------------------------------------------- leak detection
@router.post("/telemetry/scan")
async def scan_leaks(user: User = Depends(require_enterprise)):
    """Reconcile telemetry_usage against contracts and flag overage leaks."""
    contracts = await db.contracts.find(org_filter(user), {"_id": 0}).to_list(500)
    usage = await db.telemetry_usage.find(org_filter(user), {"_id": 0}).to_list(2000)
    usage_map = {(u["account_key"].strip().lower(), u["source"]): u for u in usage}
    usage_by_key = {}
    for u in usage:
        usage_by_key.setdefault(u["account_key"].strip().lower(), u)

    now = datetime.now(timezone.utc).isoformat()
    leaks_found = 0
    scanned = 0

    for c in contracts:
        if c.get("contracted_seats", 0) <= 0:
            continue
        scanned += 1
        key = (c.get("account_key") or "").strip().lower()
        src = c.get("usage_source") or ""
        row = usage_map.get((key, src)) if src else usage_by_key.get(key)
        if not row:
            continue

        used_seats = int(row.get("seats_used", 0))
        used_calls = int(row.get("usage_volume", 0))
        overage_seats = max(0, used_seats - int(c["contracted_seats"]))
        api_overage = 0
        if c.get("contracted_api_calls"):
            api_overage = max(0, used_calls - int(c["contracted_api_calls"]))

        existing = await db.leaks.find_one({"contract_id": c["contract_id"], **org_filter(user)}, {"_id": 0})

        if overage_seats <= 0 and api_overage <= 0:
            # No overage: close any previously-open leak
            if existing and existing.get("status") == "open":
                await db.leaks.update_one(
                    {"leak_id": existing["leak_id"]},
                    {"$set": {"status": "resolved", "overage_seats": 0, "est_unbilled_amount": 0, "updated_at": now}},
                )
            continue

        est = round(overage_seats * float(c.get("unit_price_per_seat", 0.0)), 2)
        leaks_found += 1
        base = {
            "org_id": user.org_id,
            "contract_id": c["contract_id"],
            "customer_name": c["customer_name"],
            "account_key": c["account_key"],
            "stripe_customer_id": c.get("stripe_customer_id", ""),
            "usage_source": row.get("source", src),
            "contracted_seats": int(c["contracted_seats"]),
            "used_seats": used_seats,
            "overage_seats": overage_seats,
            "contracted_api_calls": c.get("contracted_api_calls"),
            "used_api_calls": used_calls,
            "api_overage": api_overage,
            "unit_price_per_seat": float(c.get("unit_price_per_seat", 0.0)),
            "currency": c.get("currency", "usd"),
            "est_unbilled_amount": est,
            "am_email": c.get("am_email", ""),
            "updated_at": now,
        }
        if existing:
            # keep status unless it was resolved; preserve completed actions
            new_status = existing.get("status")
            if new_status in ("resolved",):
                new_status = "open"
            base["status"] = new_status or "open"
            await db.leaks.update_one({"leak_id": existing["leak_id"]}, {"$set": base})
        else:
            base["leak_id"] = f"leak_{uuid.uuid4().hex[:12]}"
            base["status"] = "open"
            base["draft"] = None
            base["actions"] = {}
            base["detected_at"] = now
            await db.leaks.insert_one(dict(base))

    return {"status": "scanned", "contracts_scanned": scanned, "leaks_found": leaks_found}


@router.get("/telemetry/leaks")
async def list_leaks(user: User = Depends(require_enterprise)):
    rows = await db.leaks.find(org_filter(user), {"_id": 0}).sort("est_unbilled_amount", -1).to_list(500)
    return rows


# ---------------------------------------------------------------- upsell loop
def _fallback_email(leak: dict) -> dict:
    cust = leak["customer_name"]
    over = leak["overage_seats"]
    contracted = leak["contracted_seats"]
    used = leak["used_seats"]
    amt = leak["est_unbilled_amount"]
    cur = leak.get("currency", "usd").upper()
    body = (
        f"Hi team,\n\n"
        f"{cust} is actively using {used} seats against a contracted {contracted} — "
        f"an overage of {over} seats currently going unbilled (approx {cur} {amt:,.2f}/mo).\n\n"
        f"This is a strong, low-friction expansion signal: they're already deriving value beyond "
        f"their plan. Recommended next step is a quick value-alignment call to formalise the "
        f"additional {over} seats and true-up billing.\n\n"
        f"A draft unbilled-usage invoice and a CRM expansion opportunity have been prepared for your review.\n\n"
        f"— InFlow Revenue Intelligence"
    )
    return {
        "to": leak.get("am_email") or "",
        "subject": f"Expansion signal: {cust} is {over} seats over contract (~{cur} {amt:,.0f}/mo)",
        "body": body,
    }


async def _ai_email(leak: dict) -> dict:
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            return _fallback_email(leak)
        chat = LlmChat(
            api_key=api_key,
            session_id=f"leak_{leak['leak_id']}_{uuid.uuid4().hex[:6]}",
            system_message=(
                "You are a revenue operations assistant drafting a concise internal note to an "
                "Account Manager about a detected usage-overage expansion opportunity. "
                "Write in plain professional English. No emojis, no markdown symbols (# * **). "
                "Keep it under 130 words, actionable, and confident but not pushy."
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        cur = leak.get("currency", "usd").upper()
        prompt = (
            f"Customer: {leak['customer_name']}\n"
            f"Contracted seats: {leak['contracted_seats']}\n"
            f"Actively used seats: {leak['used_seats']}\n"
            f"Overage: {leak['overage_seats']} seats\n"
            f"Estimated unbilled monthly value: {cur} {leak['est_unbilled_amount']:,.2f}\n\n"
            f"Draft a short internal AM note recommending how to recover this revenue via an "
            f"expansion conversation. End with a clear recommended next step."
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        fb = _fallback_email(leak)
        return {"to": fb["to"], "subject": fb["subject"], "body": text.strip() or fb["body"]}
    except Exception as e:
        logger.warning("AI email draft failed for %s: %s", leak.get("leak_id"), e)
        return _fallback_email(leak)


@router.post("/telemetry/leaks/{leak_id}/draft")
async def draft_recovery(leak_id: str, user: User = Depends(require_enterprise)):
    """Generate (but do NOT execute) the recovery package for a leak."""
    leak = await db.leaks.find_one({"leak_id": leak_id, **org_filter(user)}, {"_id": 0})
    if not leak:
        raise HTTPException(status_code=404, detail="Leak not found")

    over = leak["overage_seats"]
    unit = leak["unit_price_per_seat"]
    cur = leak.get("currency", "usd")
    amount = round(over * unit, 2)

    invoice_preview = {
        "customer_name": leak["customer_name"],
        "stripe_customer_id": leak.get("stripe_customer_id", ""),
        "description": f"Unbilled usage: {over} seats over contracted {leak['contracted_seats']}",
        "quantity": over,
        "unit_amount": unit,
        "amount": amount,
        "currency": cur,
        "mode": "draft",
    }
    crm_preview = {
        "name": f"Expansion — {leak['customer_name']} (+{over} seats)",
        "company": leak["customer_name"],
        "value": round(amount * 12, 2),
        "stage": EXPANSION_STAGE,
        "probability": 60,
    }
    email_draft = await _ai_email(leak)

    draft = {
        "invoice": invoice_preview,
        "crm_deal": crm_preview,
        "email": email_draft,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.leaks.update_one({"leak_id": leak_id}, {"$set": {"draft": draft}})
    return draft


@router.post("/telemetry/leaks/{leak_id}/approve")
async def approve_recovery(leak_id: str, email: EmailEdit = EmailEdit(), user: User = Depends(require_enterprise)):
    """Execute the recovery package: Stripe draft invoice + CRM deal + AM email."""
    leak = await db.leaks.find_one({"leak_id": leak_id, **org_filter(user)}, {"_id": 0})
    if not leak:
        raise HTTPException(status_code=404, detail="Leak not found")
    if leak.get("status") == "recovered":
        raise HTTPException(status_code=400, detail="This leak has already been recovered.")
    draft = leak.get("draft")
    if not draft:
        raise HTTPException(status_code=400, detail="Generate a recovery draft before approving.")

    now = datetime.now(timezone.utc).isoformat()
    over = leak["overage_seats"]
    unit = leak["unit_price_per_seat"]
    cur = leak.get("currency", "usd")
    actions = {}

    # 1) Stripe draft invoice (real if a live/test key; auto-creates a customer if needed)
    stripe_key = os.environ.get("STRIPE_API_KEY")
    cust_id = leak.get("stripe_customer_id", "")
    desc = draft["invoice"]["description"]
    if _is_real_stripe_key(stripe_key):
        try:
            def _create():
                stripe_sdk.api_key = stripe_key
                cid = cust_id
                if not cid:
                    cust = stripe_sdk.Customer.create(
                        name=leak["customer_name"],
                        metadata={"inflow_leak_id": leak_id, "inflow_account_key": leak.get("account_key", "")},
                    )
                    cid = cust.id
                inv = stripe_sdk.Invoice.create(
                    customer=cid, auto_advance=False, currency=cur,
                    description=desc,
                    metadata={"inflow_leak_id": leak_id, "type": "unbilled_usage"},
                )
                stripe_sdk.InvoiceItem.create(
                    customer=cid, invoice=inv.id, quantity=over,
                    unit_amount_decimal=str(int(round(unit * 100))), currency=cur, description=desc,
                )
                return stripe_sdk.Invoice.retrieve(inv.id), cid
            inv, used_cid = await asyncio.to_thread(_create)
            base = "https://dashboard.stripe.com" + ("/test" if stripe_key.startswith("sk_test_") else "")
            actions["invoice"] = {
                "mode": "live_draft", "invoice_id": inv.get("id"),
                "customer_id": used_cid,
                "amount": round((inv.get("amount_due") or 0) / 100, 2),
                "currency": inv.get("currency", cur),
                "url": f"{base}/invoices/{inv.get('id')}",
                "status": inv.get("status", "draft"),
            }
            if used_cid and used_cid != cust_id:
                await db.contracts.update_one(
                    {"contract_id": leak["contract_id"]}, {"$set": {"stripe_customer_id": used_cid}}
                )
        except Exception as e:
            logger.error("Stripe draft invoice failed for %s: %s", leak_id, e)
            actions["invoice"] = {"mode": "error", "error": str(e)[:200]}
    else:
        actions["invoice"] = {
            "mode": "simulated",
            "invoice_id": f"draft_sim_{uuid.uuid4().hex[:10]}",
            "amount": round(over * unit, 2),
            "currency": cur,
            "note": "Sandbox mode — connect a real Stripe key to create a live draft invoice.",
        }

    # 2) CRM expansion opportunity → pipeline
    deal_id = f"deal_{uuid.uuid4().hex[:12]}"
    await db.deals.insert_one({
        "deal_id": deal_id, "user_id": user.user_id, "org_id": user.org_id,
        "name": draft["crm_deal"]["name"], "company": leak["customer_name"],
        "value": draft["crm_deal"]["value"], "stage": EXPANSION_STAGE, "probability": 60,
        "source": "expansion", "synced": False,
        "notes": f"Auto-created from telemetry leak {leak_id}: {over} seats over contract.",
        "expected_close_date": None,
        "created_at": now, "updated_at": now,
    })
    actions["crm_deal_id"] = deal_id

    # 3) AM email via Resend
    to_addr = (email.to or draft["email"].get("to") or leak.get("am_email") or user.email)
    subject = email.subject or draft["email"]["subject"]
    body_text = email.body or draft["email"]["body"]
    email_result = {"to": to_addr, "sent": False}
    if to_addr:
        try:
            html = "<div style='font-family:sans-serif;white-space:pre-wrap;line-height:1.6'>" + \
                   body_text.replace("<", "&lt;").replace(">", "&gt;") + "</div>"
            res = await send_email(to_addr, subject, html, body_text)
            email_result["sent"] = bool(res and res.get("sent"))
            email_result["provider_id"] = (res or {}).get("id")
            if not email_result["sent"]:
                email_result["reason"] = (res or {}).get("reason")
        except Exception as e:
            logger.warning("AM email send failed for %s: %s", leak_id, e)
            email_result["error"] = str(e)[:200]
    actions["email"] = email_result

    await db.leaks.update_one(
        {"leak_id": leak_id},
        {"$set": {"status": "recovered", "actions": actions, "recovered_at": now, "updated_at": now}},
    )
    return {"status": "recovered", "leak_id": leak_id, "actions": actions}


@router.post("/telemetry/leaks/{leak_id}/dismiss")
async def dismiss_leak(leak_id: str, user: User = Depends(require_enterprise)):
    res = await db.leaks.update_one(
        {"leak_id": leak_id, **org_filter(user)},
        {"$set": {"status": "dismissed", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Leak not found")
    return {"status": "dismissed", "leak_id": leak_id}
