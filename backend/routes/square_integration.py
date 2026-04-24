"""Square Live Integration — Personal Access Token (Bearer).

Fetches recent completed payments and converts them into deals/revenue records.
"""
import httpx
import uuid
from datetime import datetime, timezone, timedelta

LIVE_BASE = "https://connect.squareup.com"
SANDBOX_BASE = "https://connect.squareupsandbox.com"


def _base_url(sandbox: bool) -> str:
    return SANDBOX_BASE if sandbox else LIVE_BASE


async def validate_square_token(access_token: str, sandbox: bool = False) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{_base_url(sandbox)}/v2/locations",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Square-Version": "2024-12-01",
                },
            )
            if r.status_code != 200:
                return {"valid": False, "error": f"Square API returned {r.status_code}: {r.text[:150]}"}
            body = r.json()
            locs = body.get("locations", [])
            account_name = locs[0]["business_name"] if locs and locs[0].get("business_name") else "Square Account"
            return {"valid": True, "account_name": account_name, "locations": len(locs)}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_square_data(access_token: str, sandbox: bool, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    begin_time = (now - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    deals = []
    stats = {"payments": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{_base_url(sandbox)}/v2/payments",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Square-Version": "2024-12-01",
            },
            params={"begin_time": begin_time, "limit": 100, "sort_order": "DESC"},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        payments = r.json().get("payments", [])

    for p in payments:
        if p.get("status") not in ("COMPLETED", "APPROVED"):
            continue
        amount_money = p.get("amount_money") or {}
        amount_cents = amount_money.get("amount", 0)
        currency = amount_money.get("currency", "USD")
        amount = amount_cents / 100.0 if amount_cents else 0.0
        if amount <= 0:
            continue
        stats["payments"] += 1
        stats["revenue"] += amount
        stats["currency"] = currency

        pid = p.get("id") or uuid.uuid4().hex[:12]
        buyer_email = p.get("buyer_email_address") or ""
        company = buyer_email.split("@")[0] if buyer_email else "Square Customer"
        note = p.get("note") or f"Square payment {pid}"
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": note[:200], "company": company[:200],
            "value": round(amount, 2), "stage": "closed_won",
            "probability": 100, "source": "square",
            "notes": f"Square payment {pid} · {currency}",
            "expected_close_date": (p.get("created_at", "") or "")[:10] or None,
            "synced": True,
            "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
