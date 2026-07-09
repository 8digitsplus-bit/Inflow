"""Freshsales (Freshworks CRM) Live Integration — reads deals via a view.

Auth: Authorization: Token token=<API_KEY>.
Base: https://{domain}.myfreshworks.com/crm/sales/api.
Listing deals requires a view_id (fetched from /deals/filters).
"""
import httpx
import uuid
from datetime import datetime, timezone


def _base(domain: str) -> str:
    d = (domain or "").strip().rstrip("/").replace("https://", "").replace("http://", "")
    if "myfreshworks.com" in d:
        return f"https://{d.split('/')[0]}/crm/sales/api"
    return f"https://{d}.myfreshworks.com/crm/sales/api"


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Token token={api_key}", "Content-Type": "application/json"}


async def validate_freshsales_key(api_key: str, domain: str) -> dict:
    base = _base(domain)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{base}/deals/filters", headers=_headers(api_key))
        if r.status_code == 200:
            return {"valid": True, "account_name": "Freshsales"}
        return {"valid": False, "error": f"Freshsales auth failed (HTTP {r.status_code}). Check API key and domain."}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_freshsales_data(api_key: str, domain: str, user_id: str) -> dict:
    base = _base(domain)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"deals": 0, "open_value": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        fr = await client.get(f"{base}/deals/filters", headers=_headers(api_key))
        if fr.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        filters = (fr.json() or {}).get("filters", []) or []
        if not filters:
            return {"deals": [], "total_records": 0, "stats": stats}
        view = next((f for f in filters if "all" in (f.get("name", "").lower())), filters[0])
        view_id = view.get("id")
        r = await client.get(f"{base}/deals/view/{view_id}", headers=_headers(api_key), params={"per_page": 100})
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        rows = (r.json() or {}).get("deals", []) or []

    for d in rows:
        try:
            amount = float(d.get("amount", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        stage, prob = "negotiation", 50
        if d.get("is_won") or d.get("is_deal_won"):
            stage, prob = "closed_won", 100
        elif d.get("is_lost") or d.get("is_deal_lost"):
            stage, prob = "closed_lost", 0
        stats["deals"] += 1
        if stage != "closed_lost":
            stats["open_value"] += amount

        did = d.get("id") or uuid.uuid4().hex[:12]
        created = str(d.get("created_at") or "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (d.get("name") or f"Deal {did}")[:200],
            "company": "Freshsales",
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "freshsales", "notes": f"Freshsales deal {did}",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["open_value"] = round(stats["open_value"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
