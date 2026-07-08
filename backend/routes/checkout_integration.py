"""Checkout.com Live Integration — reads payments via POST /payments/search.

Auth: Bearer secret key (sk_... live / sk_sbox_... sandbox).
Base: api.checkout.com (live) / api.sandbox.checkout.com (sandbox).
Amounts are in the minor currency unit.
"""
import httpx
import uuid
from datetime import datetime, timezone, timedelta


def _is_sandbox(secret_key: str) -> bool:
    return secret_key.startswith("sk_sbox_") or "sbox" in secret_key[:10]


def _base(sandbox: bool) -> str:
    return "https://api.sandbox.checkout.com" if sandbox else "https://api.checkout.com"


def _headers(secret_key: str) -> dict:
    return {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}


async def validate_checkout_key(secret_key: str) -> dict:
    sandbox = _is_sandbox(secret_key)
    now = datetime.now(timezone.utc)
    body = {
        "from": (now - timedelta(days=1)).strftime("%Y-%m-%d"),
        "to": now.strftime("%Y-%m-%d"),
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(f"{_base(sandbox)}/payments/search", headers=_headers(secret_key), json=body)
        if r.status_code in (200, 201):
            return {"valid": True, "account_name": "Checkout.com Sandbox" if sandbox else "Checkout.com Account", "sandbox": sandbox}
        if r.status_code in (401, 403):
            return {"valid": False, "error": "Invalid Checkout.com secret key"}
        return {"valid": False, "error": f"Checkout.com error: {r.text[:150]}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(status: str):
    s = (status or "").lower()
    if s in ("captured", "authorized", "paid", "partially captured"):
        return "closed_won", 100
    if s in ("declined", "voided", "expired", "canceled", "cancelled", "refunded", "partially refunded"):
        return "closed_lost", 0
    if s == "pending":
        return "negotiation", 60
    return "qualified", 40


async def fetch_checkout_data(secret_key: str, user_id: str) -> dict:
    sandbox = _is_sandbox(secret_key)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"transactions": 0, "revenue": 0.0, "currency": "USD"}

    body = {
        "from": (now - timedelta(days=90)).strftime("%Y-%m-%d"),
        "to": now.strftime("%Y-%m-%d"),
        "limit": 100,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(f"{_base(sandbox)}/payments/search", headers=_headers(secret_key), json=body)
        if r.status_code not in (200, 201):
            return {"deals": [], "total_records": 0, "stats": stats}
        payments = r.json().get("data", []) or []

    for p in payments:
        amount = (p.get("amount", 0) or 0) / 100  # minor unit -> major
        currency = p.get("currency", "USD")
        stage, prob = _stage(p.get("status"))
        if amount > 0 and stage == "closed_won":
            stats["transactions"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        pid = p.get("id") or uuid.uuid4().hex[:12]
        created = p.get("processed_on") or p.get("requested_on") or ""
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (p.get("reference") or f"Checkout {pid[:12]}")[:200],
            "company": "Checkout.com Customer",
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "checkout", "notes": f"Checkout.com payment {pid}",
            "expected_close_date": (created[:10] if created else None),
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
