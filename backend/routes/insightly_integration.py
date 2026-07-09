"""Insightly Live Integration — reads opportunities via the REST API v3.1.

Auth: HTTP Basic (API key as username, empty password).
Base: https://api.{pod}.insightly.com/v3.1 (pod e.g. na1, eu1).
"""
import httpx
import uuid
from datetime import datetime, timezone


def _base(pod: str) -> str:
    p = (pod or "").strip().replace("https://", "").replace("http://", "")
    if "insightly.com" in p:
        return f"https://{p.split('/')[0]}/v3.1"
    if not p:
        p = "na1"
    return f"https://api.{p}.insightly.com/v3.1"


async def validate_insightly_key(api_key: str, pod: str = "") -> dict:
    base = _base(pod)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{base}/Users/Me", auth=(api_key, ""))
        if r.status_code == 200:
            u = r.json() or {}
            name = f"{u.get('FIRST_NAME', '')} {u.get('LAST_NAME', '')}".strip() or "Insightly"
            return {"valid": True, "account_name": name}
        return {"valid": False, "error": f"Insightly auth failed (HTTP {r.status_code}). Check API key and pod."}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(state: str):
    s = (state or "").upper()
    if s == "WON":
        return "closed_won", 100
    if s in ("LOST", "ABANDONED"):
        return "closed_lost", 0
    return "negotiation", 50


async def fetch_insightly_data(api_key: str, pod: str, user_id: str) -> dict:
    base = _base(pod)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"opportunities": 0, "open_value": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{base}/Opportunities", auth=(api_key, ""), params={"top": 100})
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        rows = r.json() or []

    for o in rows:
        try:
            amount = float(o.get("OPPORTUNITY_VALUE", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        currency = o.get("BID_CURRENCY") or "USD"
        stage, prob = _stage(o.get("OPPORTUNITY_STATE"))
        stats["opportunities"] += 1
        if stage != "closed_lost":
            stats["open_value"] += amount
        stats["currency"] = currency

        oid = o.get("OPPORTUNITY_ID") or uuid.uuid4().hex[:12]
        created = str(o.get("DATE_CREATED_UTC") or "").replace(" ", "T")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (o.get("OPPORTUNITY_NAME") or f"Opportunity {oid}")[:200],
            "company": "Insightly",
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "insightly", "notes": f"Insightly opportunity {oid} ({o.get('OPPORTUNITY_STATE', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["open_value"] = round(stats["open_value"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
