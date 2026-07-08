"""OpenCart Live Integration — reads orders via the native REST API (api/order/list).

Auth: HTTP Basic (API Key as username, empty password).
Base: {store_url}/index.php?route=api/order/list.
Response shapes vary across OpenCart versions/extensions, so parsing is defensive.
"""
import httpx
import re
import uuid
from datetime import datetime, timezone


def _normalize_base(store_url: str) -> str:
    u = (store_url or "").strip().rstrip("/")
    if not u.startswith("http"):
        u = "https://" + u
    return u


def _parse_amount(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    m = re.findall(r"[-\d.]+", str(v).replace(",", ""))
    try:
        return float(m[0]) if m else 0.0
    except (ValueError, TypeError):
        return 0.0


def _extract_orders(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in ("orders", "data", "order", "records"):
            v = payload.get(k)
            if isinstance(v, list):
                return v
    return []


async def validate_opencart_key(store_url: str, api_key: str) -> dict:
    base = _normalize_base(store_url)
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(f"{base}/index.php", params={"route": "api/order/list"}, auth=(api_key, ""))
        name = base.replace("https://", "").replace("http://", "")
        if r.status_code == 200:
            try:
                r.json()
                return {"valid": True, "account_name": name, "store_url": base}
            except Exception:
                return {"valid": False, "error": "OpenCart API did not return JSON. Create an API user with 'order:read' and confirm the REST API is enabled."}
        return {"valid": False, "error": f"OpenCart auth failed (HTTP {r.status_code})"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(status: str):
    s = (status or "").lower()
    if any(x in s for x in ("complete", "shipped", "processing")):
        return "closed_won", 100
    if any(x in s for x in ("cancel", "refund", "fail", "denied")):
        return "closed_lost", 0
    if any(x in s for x in ("pending", "hold")):
        return "negotiation", 50
    return "qualified", 30


async def fetch_opencart_data(store_url: str, api_key: str, user_id: str) -> dict:
    base = _normalize_base(store_url)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"orders": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        r = await client.get(f"{base}/index.php", params={"route": "api/order/list"}, auth=(api_key, ""))
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        try:
            payload = r.json()
        except Exception:
            return {"deals": [], "total_records": 0, "stats": stats}

    for o in _extract_orders(payload):
        if not isinstance(o, dict):
            continue
        amount = _parse_amount(o.get("order_total") or o.get("total"))
        stage, prob = _stage(o.get("status") or o.get("order_status"))
        if amount > 0 and stage == "closed_won":
            stats["orders"] += 1
            stats["revenue"] += amount

        oid = o.get("order_id") or o.get("id") or uuid.uuid4().hex[:12]
        company = o.get("customer_name") or o.get("customer") or "OpenCart Customer"
        created = o.get("date_added") or o.get("date") or ""
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Order #{oid}",
            "company": str(company)[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "opencart", "notes": f"OpenCart order {oid}",
            "expected_close_date": (str(created)[:10] or None),
            "synced": True,
            "created_at": str(created) or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
