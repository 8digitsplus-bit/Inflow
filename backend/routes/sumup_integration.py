"""SumUp Live Integration — reads transaction history.

Auth: Bearer API key (sk_...). Base: api.sumup.com.
Resolves the merchant_code via /v0.1/me, then reads /v2.1/merchants/{code}/transactions/history.
Amounts are in major currency units.
"""
import httpx
import uuid
from datetime import datetime, timezone

BASE = "https://api.sumup.com"


async def _get_merchant(api_key: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{BASE}/v0.1/me", headers={"Authorization": f"Bearer {api_key}"})
    if r.status_code != 200:
        raise ValueError(f"SumUp auth failed: {r.text[:150]}")
    data = r.json()
    mp = data.get("merchant_profile", {}) or {}
    code = mp.get("merchant_code", "") or ""
    name = mp.get("company_name") or (data.get("personal_profile", {}) or {}).get("first_name") or "SumUp Account"
    return code, name


async def validate_sumup_key(api_key: str) -> dict:
    try:
        code, name = await _get_merchant(api_key)
        return {"valid": True, "account_name": name, "merchant_code": code}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(status: str):
    s = (status or "").upper()
    if s in ("SUCCESSFUL", "PAID"):
        return "closed_won", 100
    if s in ("FAILED", "CANCELLED", "CANCELED"):
        return "closed_lost", 0
    return "negotiation", 60


async def fetch_sumup_data(api_key: str, merchant_code: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"transactions": 0, "revenue": 0.0, "currency": "EUR"}

    if not merchant_code:
        merchant_code, _ = await _get_merchant(api_key)

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{BASE}/v2.1/merchants/{merchant_code}/transactions/history",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"limit": 100},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        items = r.json().get("items", []) or []

    for t in items:
        try:
            amount = float(t.get("amount", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        currency = t.get("currency", "EUR")
        stage, prob = _stage(t.get("status"))
        if amount > 0 and stage == "closed_won":
            stats["transactions"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        tid = t.get("transaction_code") or t.get("id") or uuid.uuid4().hex[:12]
        created = t.get("timestamp", "") or ""
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"SumUp {str(tid)[:12]}",
            "company": (t.get("payment_type") or "SumUp Customer")[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "sumup", "notes": f"SumUp transaction {tid} ({t.get('status', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
