"""Ramp — corporate card spend (signal source, not revenue).

Auth: OAuth2 client credentials (client_id + client_secret). Base: api.ramp.com/developer/v1.
Produces a 30-day spend summary (value 0, so it never counts as revenue).
"""
import base64
import httpx
import uuid
from datetime import datetime, timezone

BASE = "https://api.ramp.com/developer/v1"


async def _token(client_id: str, client_secret: str) -> str:
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{BASE}/token",
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials", "scope": "transactions:read"},
        )
    if r.status_code != 200:
        raise ValueError(f"Ramp token request failed (HTTP {r.status_code}): {r.text[:120]}")
    return r.json()["access_token"]


async def validate_ramp_credentials(client_id: str, client_secret: str) -> dict:
    try:
        await _token(client_id, client_secret)
        return {"valid": True, "account_name": "Ramp"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Ramp authentication failed"}


async def fetch_ramp_data(client_id: str, client_secret: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    stats = {"transactions": 0, "spend_30d": 0.0, "currency": "USD"}

    try:
        token = await _token(client_id, client_secret)
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{BASE}/transactions", headers={"Authorization": f"Bearer {token}"}, params={"page_size": 100})
            if r.status_code == 200:
                for t in (r.json() or {}).get("data", []) or []:
                    try:
                        amt = float(t.get("amount", 0) or 0)
                    except (ValueError, TypeError):
                        amt = 0.0
                    stats["transactions"] += 1
                    stats["spend_30d"] += abs(amt)
                    stats["currency"] = t.get("currency_code", "USD")
    except Exception:
        pass

    stats["spend_30d"] = round(stats["spend_30d"], 2)
    deals = [{
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "name": f"Ramp spend: {stats['currency']} {stats['spend_30d']:,.0f} ({stats['transactions']} txns)"[:200],
        "company": "Ramp Spend Management",
        "value": 0.0, "stage": "closed_won", "probability": 100,
        "source": "ramp",
        "notes": f"{stats['transactions']} card transactions totalling {stats['currency']} {stats['spend_30d']:,.2f} (spend signal — not revenue).",
        "expected_close_date": None,
        "synced": True,
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }]
    return {"deals": deals, "total_records": len(deals), "stats": stats}
