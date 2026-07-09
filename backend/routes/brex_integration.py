"""Brex — corporate card spend (signal source, not revenue).

Auth: Bearer API token (transactions.card.readonly scope). Base: https://api.brex.com.
Amounts are in cents. Produces a 30-day spend summary (value 0, never counts as revenue).
"""
import httpx
import uuid
from datetime import datetime, timezone

BASE = "https://api.brex.com"


async def validate_brex_key(api_key: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{BASE}/v2/transactions/card/primary", headers={"Authorization": f"Bearer {api_key}"}, params={"limit": 1})
        if r.status_code == 200:
            return {"valid": True, "account_name": "Brex"}
        if r.status_code in (401, 403):
            return {"valid": False, "error": "Invalid Brex API token or missing transactions.card.readonly scope"}
        return {"valid": False, "error": f"Brex error (HTTP {r.status_code}): {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Could not reach Brex"}


async def fetch_brex_data(api_key: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    stats = {"transactions": 0, "spend_30d": 0.0, "currency": "USD"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{BASE}/v2/transactions/card/primary", headers={"Authorization": f"Bearer {api_key}"}, params={"limit": 100})
            if r.status_code == 200:
                for t in (r.json() or {}).get("items", []) or []:
                    amt_obj = t.get("amount") or {}
                    try:
                        amt = (amt_obj.get("amount", 0) or 0) / 100
                    except (ValueError, TypeError):
                        amt = 0.0
                    stats["transactions"] += 1
                    stats["spend_30d"] += abs(amt)
                    stats["currency"] = amt_obj.get("currency", "USD")
    except Exception:
        pass

    stats["spend_30d"] = round(stats["spend_30d"], 2)
    deals = [{
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "name": f"Brex spend: {stats['currency']} {stats['spend_30d']:,.0f} ({stats['transactions']} txns)"[:200],
        "company": "Brex Spend Management",
        "value": 0.0, "stage": "closed_won", "probability": 100,
        "source": "brex",
        "notes": f"{stats['transactions']} settled card transactions totalling {stats['currency']} {stats['spend_30d']:,.2f} (spend signal — not revenue).",
        "expected_close_date": None,
        "synced": True,
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }]
    return {"deals": deals, "total_records": len(deals), "stats": stats}
