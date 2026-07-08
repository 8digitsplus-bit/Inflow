"""Airwallex Live Integration — reads payment intents.

Auth: POST /api/v1/authentication/login with x-client-id + x-api-key -> bearer token.
Base: api.airwallex.com (prod) / api-demo.airwallex.com (demo/sandbox).
Amounts are in major currency units.
"""
import httpx
import uuid
from datetime import datetime, timezone

PROD_BASE = "https://api.airwallex.com"
DEMO_BASE = "https://api-demo.airwallex.com"


def _base(sandbox: bool) -> str:
    return DEMO_BASE if sandbox else PROD_BASE


async def _login(client_id: str, api_key: str, sandbox: bool) -> str:
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{_base(sandbox)}/api/v1/authentication/login",
            headers={
                "x-client-id": client_id,
                "x-api-key": api_key,
                "Content-Type": "application/json",
                "User-Agent": "InFlow-Integration/1.0",
            },
        )
    if r.status_code != 200:
        try:
            msg = r.json().get("message") or r.json().get("error") or r.text[:150]
        except Exception:
            msg = (
                "Airwallex rejected the request (HTTP "
                f"{r.status_code}). Verify your Client ID/API Key and that this "
                "environment is permitted to reach the Airwallex API."
            )
        raise ValueError(f"Airwallex auth failed: {msg}")
    return r.json()["token"]


async def validate_airwallex_credentials(client_id: str, api_key: str, sandbox: bool = False) -> dict:
    try:
        await _login(client_id, api_key, sandbox)
        return {"valid": True, "account_name": "Airwallex Demo" if sandbox else "Airwallex Account"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(status: str):
    s = (status or "").upper()
    if s == "SUCCEEDED":
        return "closed_won", 100
    if s in ("FAILED", "CANCELLED", "CANCELED", "EXPIRED"):
        return "closed_lost", 0
    return "negotiation", 60


async def fetch_airwallex_data(client_id: str, api_key: str, user_id: str, sandbox: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    token = await _login(client_id, api_key, sandbox)
    deals = []
    stats = {"transactions": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{_base(sandbox)}/api/v1/pa/payment_intents",
            headers={"Authorization": f"Bearer {token}"},
            params={"page_num": 0, "page_size": 100},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        items = r.json().get("items", []) or []

    for p in items:
        try:
            amount = float(p.get("amount", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        currency = p.get("currency", "USD")
        stage, prob = _stage(p.get("status"))
        if amount > 0 and stage == "closed_won":
            stats["transactions"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        pid = p.get("id") or uuid.uuid4().hex[:12]
        created = p.get("created_at", "") or ""
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (p.get("merchant_order_id") or f"Airwallex {pid[:12]}")[:200],
            "company": "Airwallex Customer",
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "airwallex", "notes": f"Airwallex payment intent {pid} ({p.get('status', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
