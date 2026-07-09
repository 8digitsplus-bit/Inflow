"""Chargebee — reads invoices (revenue source).

Auth: HTTP Basic (API key as username, empty password). Base: {site}.chargebee.com/api/v2.
Amounts (`total`) are in the minor currency unit.
"""
import httpx
import uuid
from datetime import datetime, timezone


def _base(site: str) -> str:
    s = (site or "").strip().replace("https://", "").replace("http://", "").rstrip("/")
    if s.endswith(".chargebee.com"):
        s = s[:-len(".chargebee.com")]
    return f"https://{s}.chargebee.com/api/v2"


async def validate_chargebee_key(api_key: str, site: str) -> dict:
    if not site:
        return {"valid": False, "error": "Chargebee site is required"}
    base = _base(site)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{base}/invoices", auth=(api_key, ""), params={"limit": 1})
        if r.status_code == 200:
            return {"valid": True, "account_name": f"Chargebee ({site})"}
        if r.status_code in (401, 403):
            return {"valid": False, "error": "Invalid Chargebee API key or site"}
        return {"valid": False, "error": f"Chargebee error (HTTP {r.status_code}): {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Could not reach Chargebee"}


def _stage(status: str):
    s = (status or "").lower()
    if s == "paid":
        return "closed_won", 100
    if s == "voided":
        return "closed_lost", 0
    return "negotiation", 60


async def fetch_chargebee_data(api_key: str, site: str, user_id: str) -> dict:
    base = _base(site)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"invoices": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{base}/invoices", auth=(api_key, ""), params={"limit": 100})
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        rows = (r.json() or {}).get("list", []) or []

    for wrap in rows:
        inv = wrap.get("invoice", {}) or {}
        amount = (inv.get("total", 0) or 0) / 100
        currency = inv.get("currency_code", "USD")
        stage, prob = _stage(inv.get("status"))
        if amount > 0 and stage == "closed_won":
            stats["invoices"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        iid = inv.get("id") or uuid.uuid4().hex[:12]
        ts = inv.get("date") or inv.get("generated_at")
        created = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else ""
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Invoice {iid}"[:200],
            "company": (inv.get("customer_id") or "Chargebee Customer")[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "chargebee", "notes": f"Chargebee invoice {iid} ({inv.get('status', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
