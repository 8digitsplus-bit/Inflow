"""Paddle Billing Live Integration — reads transactions via GET /transactions.

Auth: Bearer API key. Base: api.paddle.com (live) / sandbox-api.paddle.com (sandbox).
Amounts are returned in the smallest currency unit as strings (details.totals.grand_total).
"""
import httpx
import uuid
from datetime import datetime, timezone

LIVE_BASE = "https://api.paddle.com"
SANDBOX_BASE = "https://sandbox-api.paddle.com"


def _base(sandbox: bool) -> str:
    return SANDBOX_BASE if sandbox else LIVE_BASE


async def validate_paddle_key(api_key: str, sandbox: bool = False) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{_base(sandbox)}/transactions",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"per_page": 1},
            )
        if r.status_code != 200:
            return {"valid": False, "error": f"Paddle auth failed: {r.text[:150]}"}
        return {"valid": True, "account_name": "Paddle Sandbox" if sandbox else "Paddle Account"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(status: str):
    s = (status or "").lower()
    if s in ("completed", "paid"):
        return "closed_won", 100
    if s in ("canceled", "cancelled"):
        return "closed_lost", 0
    if s == "past_due":
        return "negotiation", 40
    if s in ("billed", "ready"):
        return "proposal", 60
    return "qualified", 30


async def fetch_paddle_data(api_key: str, user_id: str, sandbox: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"transactions": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{_base(sandbox)}/transactions",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"per_page": 100},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        txns = r.json().get("data", []) or []

    for t in txns:
        totals = (t.get("details") or {}).get("totals") or {}
        raw = totals.get("grand_total") or totals.get("total") or "0"
        try:
            amount = float(raw) / 100  # smallest unit -> major
        except (ValueError, TypeError):
            amount = 0.0
        currency = t.get("currency_code") or "USD"
        stage, prob = _stage(t.get("status"))
        if amount > 0 and stage == "closed_won":
            stats["transactions"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        tid = t.get("id") or uuid.uuid4().hex[:12]
        created = t.get("created_at", "") or ""
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Paddle {tid[:12]}",
            "company": (t.get("customer_id") or "Paddle Customer")[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "paddle", "notes": f"Paddle transaction {tid} ({t.get('status', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
