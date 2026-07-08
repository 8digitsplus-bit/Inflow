"""Square Live Integration — reads real payments via the Square Payments API.

Auth: Bearer access token. Base: connect.squareup.com (prod) / connect.squareupsandbox.com (sandbox).
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
        "Accept": "application/json",
    }


async def validate_square_key(access_token: str, sandbox: bool = False) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{_base(sandbox)}/v2/locations", headers=_headers(access_token))
        if r.status_code != 200:
            return {"valid": False, "error": f"Square auth failed: {r.text[:150]}"}
        locs = r.json().get("locations", []) or []
        name = "Square Account"
        if locs:
            name = locs[0].get("business_name") or locs[0].get("name") or name
        return {"valid": True, "account_name": name}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(status: str):
    s = (status or "").upper()
    if s in ("COMPLETED", "APPROVED", "CAPTURED"):
        return "closed_won", 100
    if s in ("FAILED", "CANCELED", "CANCELLED"):
        return "closed_lost", 0
    return "negotiation", 60


async def fetch_square_data(access_token: str, user_id: str, sandbox: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    begin = (now - timedelta(days=90)).isoformat()
    deals = []
    stats = {"transactions": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{_base(sandbox)}/v2/payments",
            headers=_headers(access_token),
            params={"begin_time": begin, "limit": 100},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        payments = r.json().get("payments", []) or []

    for p in payments:
        money = p.get("amount_money", {}) or {}
        amount = (money.get("amount", 0) or 0) / 100  # smallest denomination -> major
        if amount <= 0:
            continue
        stage, prob = _stage(p.get("status"))
        if stage == "closed_won":
            stats["transactions"] += 1
            stats["revenue"] += amount
            stats["currency"] = money.get("currency", "USD")

        pid = p.get("id") or uuid.uuid4().hex[:12]
        created = p.get("created_at", "") or ""
        email = p.get("buyer_email_address", "") or ""
        company = (email.split("@")[0] if email else "") or "Square Customer"
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (p.get("note") or f"Square {pid[:8]}")[:200],
            "company": company[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "square", "notes": f"Square payment {pid}",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
