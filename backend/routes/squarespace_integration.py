"""Squarespace Commerce Live Integration — reads orders.

Auth: Bearer API key + required User-Agent. Base: https://api.squarespace.com/1.0/commerce.
Amounts (`grandTotal.value`) are strings in major units. Orders API needs Commerce Advanced.
"""
import httpx
import uuid
from datetime import datetime, timezone

BASE = "https://api.squarespace.com/1.0/commerce"
UA = "InFlow-Integration/1.0"


async def validate_squarespace_key(api_key: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{BASE}/orders",
                headers={"Authorization": f"Bearer {api_key}", "User-Agent": UA},
            )
        if r.status_code == 200:
            return {"valid": True, "account_name": "Squarespace Store"}
        if r.status_code in (401, 403):
            return {"valid": False, "error": "Invalid Squarespace API key or missing Orders permission (requires Commerce Advanced)."}
        return {"valid": False, "error": f"Squarespace error: {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_squarespace_data(api_key: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"orders": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{BASE}/orders",
            headers={"Authorization": f"Bearer {api_key}", "User-Agent": UA},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        orders = r.json().get("result", []) or []

    for o in orders:
        gt = o.get("grandTotal", {}) or {}
        try:
            amount = float(gt.get("value", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        currency = gt.get("currency", "USD")
        # Squarespace orders are placed/paid — treat as closed revenue
        if amount > 0:
            stats["orders"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        oid = o.get("id") or uuid.uuid4().hex[:12]
        created = o.get("createdOn", "") or ""
        email = o.get("customerEmail", "") or ""
        company = (email.split("@")[0] if email else "") or "Squarespace Customer"
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Order {o.get('orderNumber') or str(oid)[:12]}",
            "company": company[:200],
            "value": round(amount, 2), "stage": "closed_won", "probability": 100,
            "source": "squarespace", "notes": f"Squarespace order {oid}",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
