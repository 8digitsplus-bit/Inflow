"""Amazon Seller Central (Selling Partner API) — reads orders (revenue source).

Auth: LWA refresh token -> access token (x-amz-access-token header). No SigV4 required.
Base: https://sellingpartnerapi-{region}.amazon.com. Amounts are strings in major units.
"""
import httpx
import uuid
from datetime import datetime, timezone, timedelta

REGION_HOSTS = {
    "na": "https://sellingpartnerapi-na.amazon.com",
    "eu": "https://sellingpartnerapi-eu.amazon.com",
    "fe": "https://sellingpartnerapi-fe.amazon.com",
}
DEFAULT_MARKETPLACE = {"na": "ATVPDKIKX0DER", "eu": "A1F83G8C2ARO7P", "fe": "A1VC38T7YXB528"}


def _region(region: str) -> str:
    r = (region or "na").strip().lower()
    return r if r in REGION_HOSTS else "na"


async def _access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            "https://api.amazon.com/auth/o2/token",
            data={"grant_type": "refresh_token", "refresh_token": refresh_token, "client_id": client_id, "client_secret": client_secret},
        )
    if r.status_code != 200:
        raise ValueError(f"Amazon LWA token failed (HTTP {r.status_code}): {r.text[:120]}")
    return r.json()["access_token"]


async def validate_amazon_credentials(client_id: str, client_secret: str, refresh_token: str, region: str = "na", marketplace_id: str = "") -> dict:
    try:
        token = await _access_token(client_id, client_secret, refresh_token)
    except Exception as e:
        return {"valid": False, "error": str(e) or "Amazon LWA authentication failed"}
    reg = _region(region)
    mk = marketplace_id or DEFAULT_MARKETPLACE[reg]
    created_after = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                f"{REGION_HOSTS[reg]}/orders/v0/orders",
                headers={"x-amz-access-token": token},
                params={"MarketplaceIds": mk, "CreatedAfter": created_after},
            )
        if r.status_code == 200:
            return {"valid": True, "account_name": f"Amazon Seller ({reg.upper()})"}
        return {"valid": False, "error": f"Amazon SP-API error (HTTP {r.status_code}): {r.text[:150]}"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Could not reach Amazon SP-API"}


def _stage(status: str):
    s = (status or "").lower()
    if s in ("shipped", "invoiceunconfirmed"):
        return "closed_won", 100
    if s in ("canceled", "cancelled"):
        return "closed_lost", 0
    return "negotiation", 60


async def fetch_amazon_data(client_id: str, client_secret: str, refresh_token: str, region: str, marketplace_id: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"orders": 0, "revenue": 0.0, "currency": "USD"}
    reg = _region(region)
    mk = marketplace_id or DEFAULT_MARKETPLACE[reg]

    try:
        token = await _access_token(client_id, client_secret, refresh_token)
    except Exception:
        return {"deals": [], "total_records": 0, "stats": stats}

    created_after = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{REGION_HOSTS[reg]}/orders/v0/orders",
            headers={"x-amz-access-token": token},
            params={"MarketplaceIds": mk, "CreatedAfter": created_after},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        orders = ((r.json() or {}).get("payload") or {}).get("Orders", []) or []

    for o in orders:
        ot = o.get("OrderTotal") or {}
        try:
            amount = float(ot.get("Amount", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        currency = ot.get("CurrencyCode", "USD")
        stage, prob = _stage(o.get("OrderStatus"))
        if amount > 0 and stage == "closed_won":
            stats["orders"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency

        oid = o.get("AmazonOrderId") or uuid.uuid4().hex[:12]
        created = str(o.get("PurchaseDate") or "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Amazon Order {oid}"[:200],
            "company": "Amazon Marketplace",
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "amazon_seller", "notes": f"Amazon order {oid} ({o.get('OrderStatus', '')})",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
