"""Pipedrive Live Integration — reads deals via the REST API v2.

Auth: x-api-token header. Base: https://{company-domain}.pipedrive.com/api/v2.
"""
import httpx
import uuid
from datetime import datetime, timezone


def _base(domain: str) -> str:
    d = (domain or "").strip().rstrip("/").replace("https://", "").replace("http://", "")
    if d.endswith(".pipedrive.com"):
        d = d[:-len(".pipedrive.com")]
    if not d:
        return "https://api.pipedrive.com"
    return f"https://{d}.pipedrive.com"


async def validate_pipedrive_key(api_token: str, domain: str = "") -> dict:
    base = _base(domain)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{base}/api/v2/deals", headers={"x-api-token": api_token}, params={"limit": 1})
        if r.status_code == 200:
            return {"valid": True, "account_name": "Pipedrive"}
        return {"valid": False, "error": f"Pipedrive auth failed (HTTP {r.status_code}): {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(status: str):
    s = (status or "").lower()
    if s == "won":
        return "closed_won", 100
    if s == "lost":
        return "closed_lost", 0
    return "negotiation", 50


async def fetch_pipedrive_data(api_token: str, domain: str, user_id: str) -> dict:
    base = _base(domain)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"deals": 0, "open_value": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{base}/api/v2/deals", headers={"x-api-token": api_token}, params={"limit": 100})
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        rows = (r.json() or {}).get("data", []) or []

    for d in rows:
        try:
            amount = float(d.get("value", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        currency = d.get("currency", "USD")
        stage, prob = _stage(d.get("status"))
        stats["deals"] += 1
        if stage != "closed_lost":
            stats["open_value"] += amount
        stats["currency"] = currency

        did = d.get("id") or uuid.uuid4().hex[:12]
        created = str(d.get("add_time") or "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (d.get("title") or f"Deal {did}")[:200],
            "company": "Pipedrive",
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "pipedrive", "notes": f"Pipedrive deal {did} ({d.get('status', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["open_value"] = round(stats["open_value"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
