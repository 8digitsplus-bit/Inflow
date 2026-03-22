"""
Shopify Live Integration - Fetches real data from a user's Shopify store.
Requires: Store URL (mystore.myshopify.com) + Admin API Access Token.
"""
import httpx
from datetime import datetime, timezone
import uuid


async def validate_shopify_key(access_token: str, store_url: str) -> dict:
    """Validate Shopify credentials by fetching shop info."""
    store_url = store_url.strip().rstrip("/")
    if not store_url.startswith("http"):
        store_url = f"https://{store_url}"
    # Normalize to just the domain
    store_url = store_url.replace("http://", "https://")

    headers = {"X-Shopify-Access-Token": access_token, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{store_url}/admin/api/2024-01/shop.json", headers=headers)
        if resp.status_code == 401:
            return {"valid": False, "error": "Invalid access token"}
        if resp.status_code == 404:
            return {"valid": False, "error": "Store not found. Check your store URL."}
        if resp.status_code >= 400:
            return {"valid": False, "error": f"Shopify returned status {resp.status_code}"}

        shop = resp.json().get("shop", {})
        return {
            "valid": True,
            "account_name": shop.get("name") or shop.get("domain") or "Shopify Store",
            "store_url": store_url,
        }
    except httpx.ConnectError:
        return {"valid": False, "error": "Could not connect to Shopify. Check your store URL."}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Connection timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_shopify_data(access_token: str, store_url: str, user_id: str) -> dict:
    """Fetch orders and customers from Shopify, transform into deals."""
    store_url = store_url.strip().rstrip("/")
    if not store_url.startswith("http"):
        store_url = f"https://{store_url}"

    headers = {"X-Shopify-Access-Token": access_token, "Content-Type": "application/json"}
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"customers": 0, "orders": 0, "revenue": 0, "products": 0}

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch orders
        try:
            resp = await client.get(
                f"{store_url}/admin/api/2024-01/orders.json",
                headers=headers,
                params={"status": "any", "limit": 250}
            )
            orders = resp.json().get("orders", []) if resp.status_code == 200 else []
            stats["orders"] = len(orders)
        except Exception:
            orders = []

        # Fetch customers
        try:
            resp = await client.get(
                f"{store_url}/admin/api/2024-01/customers.json",
                headers=headers,
                params={"limit": 250}
            )
            customers = resp.json().get("customers", []) if resp.status_code == 200 else []
            stats["customers"] = len(customers)
        except Exception:
            pass

    # Transform orders into deals
    for order in orders:
        total = float(order.get("total_price", 0) or 0)
        stats["revenue"] += total
        financial_status = order.get("financial_status", "")

        if financial_status == "paid":
            stage = "closed_won"
            probability = 100
        elif financial_status == "refunded" or financial_status == "voided":
            stage = "closed_lost"
            probability = 0
        elif financial_status == "pending":
            stage = "negotiation"
            probability = 60
        elif financial_status == "partially_paid":
            stage = "proposal"
            probability = 50
        else:
            stage = "lead"
            probability = 20

        customer_name = "Unknown Customer"
        if order.get("customer"):
            c = order["customer"]
            first = c.get("first_name", "")
            last = c.get("last_name", "")
            customer_name = f"{first} {last}".strip() or c.get("email", "Unknown Customer")

        created = order.get("created_at", now.isoformat())

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Order #{order.get('order_number', order.get('id', ''))}",
            "company": customer_name,
            "value": round(total, 2),
            "stage": stage,
            "probability": probability,
            "expected_close_date": None,
            "notes": f"Shopify order {order.get('name', '')} - {financial_status}",
            "source": "shopify",
            "synced": True,
            "created_at": created,
            "updated_at": now.isoformat(),
        })

    return {
        "deals": deals,
        "stats": stats,
        "total_records": len(deals),
    }
