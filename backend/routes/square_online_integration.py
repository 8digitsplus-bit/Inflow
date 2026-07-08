"""Square Online Live Integration — reads e-commerce orders via the Square Orders API.

Auth: Bearer access token (same credential as Square). Base: connect.squareup.com / sandbox.
Reads orders (POST /v2/orders/search) rather than payments, so it complements the Square
payments connector. Amounts (`total_money.amount`) are in the smallest currency unit.
"""
import httpx
import uuid
from datetime import datetime, timezone, timedelta

SQUARE_VERSION = "2025-01-22"
PROD_BASE = "https://connect.squareup.com"
SANDBOX_BASE = "https://connect.squareupsandbox.com"


def _base(sandbox: bool) -> str:
    return SANDBOX_BASE if sandbox else PROD_BASE


def _headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json",
    }


async def _get_locations(access_token: str, sandbox: bool):
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{_base(sandbox)}/v2/locations", headers=_headers(access_token))
    if r.status_code != 200:
        raise ValueError(f"Square auth failed: {r.text[:150]}")
    locs = r.json().get("locations", []) or []
    ids = [l.get("id") for l in locs if l.get("id")]
    name = (locs[0].get("business_name") or locs[0].get("name")) if locs else "Square Online"
    return ids[:10], name


async def validate_square_online_key(access_token: str, sandbox: bool = False) -> dict:
    try:
        ids, name = await _get_locations(access_token, sandbox)
        if not ids:
            return {"valid": False, "error": "No Square locations found for this account"}
        return {"valid": True, "account_name": name or "Square Online"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(state: str):
    s = (state or "").upper()
    if s == "COMPLETED":
        return "closed_won", 100
    if s == "CANCELED":
        return "closed_lost", 0
    return "negotiation", 60


async def fetch_square_online_data(access_token: str, user_id: str, sandbox: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"orders": 0, "revenue": 0.0, "currency": "USD"}

    ids, _ = await _get_locations(access_token, sandbox)
    if not ids:
        return {"deals": [], "total_records": 0, "stats": stats}

    body = {
        "location_ids": ids,
        "limit": 200,
        "query": {
            "filter": {
                "date_time_filter": {"created_at": {"start_at": (now - timedelta(days=90)).isoformat()}}
            }
        },
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(f"{_base(sandbox)}/v2/orders/search", headers=_headers(access_token), json=body)
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        orders = r.json().get("orders", []) or []

    for o in orders:
        tm = o.get("total_money", {}) or {}
        amount = (tm.get("amount", 0) or 0) / 100
        currency = tm.get("currency", "USD")
        stage, prob = _stage(o.get("state"))
        if amount > 0 and stage == "closed_won":
            stats["orders"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        oid = o.get("id") or uuid.uuid4().hex[:12]
        created = o.get("created_at", "") or ""
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Square Online {str(oid)[:12]}",
            "company": "Square Online Customer",
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "square_online", "notes": f"Square order {oid} ({o.get('state', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
