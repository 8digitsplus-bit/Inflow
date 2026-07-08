"""WooCommerce Live Integration — reads orders via the WooCommerce REST API v3.

Auth: HTTP Basic (consumer_key:consumer_secret). Base: {store_url}/wp-json/wc/v3.
Amounts (`total`) are strings in major units.
"""
import httpx
import uuid
from datetime import datetime, timezone


def _normalize_base(store_url: str) -> str:
    u = (store_url or "").strip().rstrip("/")
    if not u.startswith("http"):
        u = "https://" + u
    return u


async def validate_woocommerce_key(store_url: str, consumer_key: str, consumer_secret: str) -> dict:
    base = _normalize_base(store_url)
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(
                f"{base}/wp-json/wc/v3/orders",
                params={"per_page": 1},
                auth=(consumer_key, consumer_secret),
            )
        if r.status_code == 200:
            name = base.replace("https://", "").replace("http://", "")
            return {"valid": True, "account_name": name, "store_url": base}
        return {"valid": False, "error": f"WooCommerce auth failed (HTTP {r.status_code}): {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _stage(status: str):
    s = (status or "").lower()
    if s in ("completed", "processing"):
        return "closed_won", 100
    if s in ("cancelled", "canceled", "refunded", "failed"):
        return "closed_lost", 0
    if s in ("pending", "on-hold"):
        return "negotiation", 50
    return "qualified", 30


async def fetch_woocommerce_data(store_url: str, consumer_key: str, consumer_secret: str, user_id: str) -> dict:
    base = _normalize_base(store_url)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"orders": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        r = await client.get(
            f"{base}/wp-json/wc/v3/orders",
            params={"per_page": 100},
            auth=(consumer_key, consumer_secret),
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        orders = r.json() or []

    for o in orders:
        try:
            amount = float(o.get("total", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        currency = o.get("currency", "USD")
        stage, prob = _stage(o.get("status"))
        if amount > 0 and stage == "closed_won":
            stats["orders"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        oid = o.get("id") or uuid.uuid4().hex[:12]
        billing = o.get("billing", {}) or {}
        company = (billing.get("company")
                   or f"{billing.get('first_name', '')} {billing.get('last_name', '')}".strip()
                   or "WooCommerce Customer")
        created = o.get("date_created", "") or ""
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Order #{oid}",
            "company": company[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "woocommerce", "notes": f"WooCommerce order {oid} ({o.get('status', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
