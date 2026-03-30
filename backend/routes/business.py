from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
import uuid

from database import db
from models import User
from dependencies import get_current_user
from utils.crypto import encrypt, decrypt
from routes.stripe_integration import validate_stripe_key, fetch_stripe_data
from routes.shopify_integration import validate_shopify_key, fetch_shopify_data
from routes.hubspot_integration import validate_hubspot_key, fetch_hubspot_data
from routes.salesforce_integration import validate_salesforce_key, fetch_salesforce_data
from routes.quickbooks_integration import validate_quickbooks_key, fetch_quickbooks_data

router = APIRouter()

PLATFORMS = {
    "stripe": {
        "platform_id": "stripe",
        "name": "Stripe",
        "description": "Sync payment data, subscriptions, and revenue metrics directly from your Stripe account.",
        "icon": "CreditCard",
        "color": "#635BFF",
        "category": "Payments",
        "data_types": ["revenue", "subscriptions", "customers", "invoices"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Secret API Key", "placeholder": "sk_test_... or sk_live_...", "type": "password"},
        ],
        "key_help_url": "https://dashboard.stripe.com/apikeys",
        "key_help_text": "Find your API key on the Stripe Dashboard under Developers > API Keys.",
    },
    "shopify": {
        "platform_id": "shopify",
        "name": "Shopify",
        "description": "Import e-commerce orders, customer data, and product performance from your Shopify store.",
        "icon": "ShoppingBag",
        "color": "#96BF48",
        "category": "E-Commerce",
        "data_types": ["orders", "customers", "products", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "store_url", "label": "Store URL", "placeholder": "mystore.myshopify.com", "type": "text"},
            {"name": "api_key", "label": "Admin API Access Token", "placeholder": "shpat_...", "type": "password"},
        ],
        "key_help_url": "https://admin.shopify.com/store/YOUR_STORE/settings/apps/development",
        "key_help_text": "Go to Shopify Admin > Settings > Apps > Develop apps > Create app > Configure Admin API scopes (read_orders, read_customers) > Install > Get Access Token.",
    },
    "hubspot": {
        "platform_id": "hubspot",
        "name": "HubSpot",
        "description": "Sync your CRM deals, contacts, and pipeline data from HubSpot for unified insights.",
        "icon": "Users",
        "color": "#FF7A59",
        "category": "CRM",
        "data_types": ["deals", "contacts", "pipeline", "activities"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Private App Access Token", "placeholder": "pat-na1-...", "type": "password"},
        ],
        "key_help_url": "https://app.hubspot.com/private-apps/",
        "key_help_text": "Go to HubSpot > Settings > Integrations > Private Apps > Create > Grant CRM scopes (crm.objects.deals.read, crm.objects.contacts.read) > Create app > Copy access token.",
    },
    "salesforce": {
        "platform_id": "salesforce",
        "name": "Salesforce",
        "description": "Two-way sync with Salesforce for complete pipeline visibility and deal tracking.",
        "icon": "Cloud",
        "color": "#00A1E0",
        "category": "CRM",
        "data_types": ["opportunities", "accounts", "contacts", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Instance URL", "placeholder": "mycompany.my.salesforce.com", "type": "text"},
            {"name": "api_key", "label": "Access Token", "placeholder": "Your Salesforce access token", "type": "password"},
        ],
        "key_help_url": "https://help.salesforce.com/s/articleView?id=sf.connected_app_create_api_integration.htm",
        "key_help_text": "Use a Connected App or the Salesforce CLI to get an access token. Note: tokens expire after ~2 hours.",
        "token_expires": True,
    },
    "quickbooks": {
        "platform_id": "quickbooks",
        "name": "QuickBooks",
        "description": "Pull financial data, invoices, and expense reports for comprehensive revenue analysis.",
        "icon": "Calculator",
        "color": "#2CA01C",
        "category": "Finance",
        "data_types": ["invoices", "expenses", "revenue", "accounts"],
        "requires_key": True,
        "key_fields": [
            {"name": "company_id", "label": "Company ID (Realm ID)", "placeholder": "1234567890", "type": "text"},
            {"name": "api_key", "label": "Access Token", "placeholder": "Your QuickBooks access token", "type": "password"},
        ],
        "key_help_url": "https://developer.intuit.com/app/developer/playground",
        "key_help_text": "Use the Intuit Developer OAuth Playground to get an access token and Company ID. Note: tokens expire after ~1 hour.",
        "token_expires": True,
    },
}


class ConnectRequest(BaseModel):
    api_key: Optional[str] = None
    store_url: Optional[str] = None
    instance_url: Optional[str] = None
    company_id: Optional[str] = None
    sandbox: Optional[bool] = False


async def _connect_stripe(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Stripe API key is required")
    validation = await validate_stripe_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Stripe API key"))
    data = await fetch_stripe_data(body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "stripe",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Stripe Account"),
        "account_id": validation.get("account_id", ""),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_shopify(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Shopify access token is required")
    if not body.store_url:
        raise HTTPException(status_code=400, detail="Store URL is required")
    validation = await validate_shopify_key(body.api_key, body.store_url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Shopify credentials"))
    data = await fetch_shopify_data(body.api_key, validation["store_url"], user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "shopify",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Shopify Store"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "store_url": validation["store_url"],
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_hubspot(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="HubSpot access token is required")
    validation = await validate_hubspot_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid HubSpot credentials"))
    data = await fetch_hubspot_data(body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "hubspot",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "HubSpot Account"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_salesforce(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Salesforce access token is required")
    if not body.instance_url:
        raise HTTPException(status_code=400, detail="Instance URL is required")
    validation = await validate_salesforce_key(body.api_key, body.instance_url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Salesforce credentials"))
    data = await fetch_salesforce_data(body.api_key, validation["instance_url"], user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "salesforce",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Salesforce Org"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "instance_url": validation["instance_url"],
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_quickbooks(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="QuickBooks access token is required")
    if not body.company_id:
        raise HTTPException(status_code=400, detail="Company ID is required")
    validation = await validate_quickbooks_key(body.api_key, body.company_id, body.sandbox or False)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid QuickBooks credentials"))
    data = await fetch_quickbooks_data(body.api_key, body.company_id, user_id, body.sandbox or False)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "quickbooks",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "QuickBooks Company"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "company_id": body.company_id,
        "sandbox": body.sandbox or False,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


CONNECT_HANDLERS = {
    "stripe": _connect_stripe,
    "shopify": _connect_shopify,
    "hubspot": _connect_hubspot,
    "salesforce": _connect_salesforce,
    "quickbooks": _connect_quickbooks,
}


@router.get("/business/platforms")
async def get_platforms(current_user: User = Depends(get_current_user)):
    connections = await db.business_connections.find(
        {"user_id": current_user.user_id}, {"_id": 0}
    ).to_list(20)
    connected_map = {c["platform"]: c for c in connections}

    result = []
    for pid, info in PLATFORMS.items():
        conn = connected_map.get(pid)
        platform_data = {
            **info,
            "connected": conn is not None,
            "connected_at": conn.get("connected_at") if conn else None,
            "last_synced": conn.get("last_synced") if conn else None,
            "records_synced": conn.get("records_synced", 0) if conn else 0,
            "sync_status": conn.get("sync_status", "idle") if conn else "idle",
            "is_live": conn.get("is_live", False) if conn else False,
        }
        if conn and conn.get("account_name"):
            platform_data["account_name"] = conn["account_name"]
        if conn and conn.get("stats"):
            platform_data["stats"] = conn["stats"]
        result.append(platform_data)
    return result


@router.post("/business/connect/{platform}")
async def connect_platform(platform: str, body: ConnectRequest = ConnectRequest(), current_user: User = Depends(get_current_user)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    existing = await db.business_connections.find_one(
        {"user_id": current_user.user_id, "platform": platform}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Platform already connected")

    now = datetime.now(timezone.utc).isoformat()
    handler = CONNECT_HANDLERS.get(platform)
    if not handler:
        raise HTTPException(status_code=400, detail="Integration not available")

    data, connection, account_name = await handler(body, current_user.user_id, now)

    if data["deals"]:
        await db.deals.insert_many(data["deals"])

    await db.business_connections.insert_one(connection)
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"has_business_connected": True}}
    )

    # Auto-sync pricing data from the newly connected platform
    try:
        from routes.analytics import sync_pricing_from_integrations
        await sync_pricing_from_integrations(current_user)
    except Exception:
        pass  # Non-blocking: pricing sync failure shouldn't break connect flow

    return {
        "status": "connected",
        "platform": platform,
        "is_live": True,
        "account_name": account_name,
        "records_synced": data["total_records"],
        "stats": data.get("stats"),
        "message": f"Connected to {account_name or PLATFORMS[platform]['name']}. {data['total_records']} records synced from live data.",
    }


@router.post("/business/disconnect/{platform}")
async def disconnect_platform(platform: str, current_user: User = Depends(get_current_user)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    result = await db.business_connections.delete_one(
        {"user_id": current_user.user_id, "platform": platform}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Platform not connected")

    delete_result = await db.deals.delete_many(
        {"user_id": current_user.user_id, "source": platform, "synced": True}
    )

    remaining = await db.business_connections.count_documents({"user_id": current_user.user_id})
    if remaining == 0:
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"has_business_connected": False}}
        )

    return {"status": "disconnected", "platform": platform, "records_removed": delete_result.deleted_count}


@router.post("/business/sync/{platform}")
async def sync_platform(platform: str, current_user: User = Depends(get_current_user)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    connection = await db.business_connections.find_one(
        {"user_id": current_user.user_id, "platform": platform}, {"_id": 0}
    )
    if not connection:
        raise HTTPException(status_code=404, detail="Platform not connected")

    api_key = connection.get("api_key_encrypted")
    if not api_key:
        raise HTTPException(status_code=400, detail="No API key found. Please reconnect.")
    api_key = decrypt(api_key)

    # Remove old synced deals
    await db.deals.delete_many({"user_id": current_user.user_id, "source": platform, "synced": True})
    now = datetime.now(timezone.utc).isoformat()

    try:
        if platform == "stripe":
            data = await fetch_stripe_data(api_key, current_user.user_id)
        elif platform == "shopify":
            data = await fetch_shopify_data(api_key, connection.get("store_url", ""), current_user.user_id)
        elif platform == "hubspot":
            data = await fetch_hubspot_data(api_key, current_user.user_id)
        elif platform == "salesforce":
            data = await fetch_salesforce_data(api_key, connection.get("instance_url", ""), current_user.user_id)
        elif platform == "quickbooks":
            data = await fetch_quickbooks_data(api_key, connection.get("company_id", ""), current_user.user_id, connection.get("sandbox", False))
        else:
            raise HTTPException(status_code=400, detail="Sync not supported for this platform")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {str(e)}")

    if data["deals"]:
        await db.deals.insert_many(data["deals"])

    await db.business_connections.update_one(
        {"user_id": current_user.user_id, "platform": platform},
        {"$set": {
            "last_synced": now,
            "records_synced": data["total_records"],
            "sync_status": "synced",
            "stats": data.get("stats"),
        }}
    )
    return {
        "status": "synced", "platform": platform, "is_live": True,
        "records_synced": data["total_records"],
        "stats": data.get("stats"),
        "message": f"Synced {data['total_records']} live records from {PLATFORMS[platform]['name']}.",
    }


@router.get("/business/summary")
async def get_business_summary(current_user: User = Depends(get_current_user)):
    connections = await db.business_connections.find(
        {"user_id": current_user.user_id}, {"_id": 0}
    ).to_list(20)

    total_records = sum(c.get("records_synced", 0) for c in connections)

    synced_deals = await db.deals.find(
        {"user_id": current_user.user_id, "synced": True},
        {"_id": 0, "source": 1, "value": 1, "stage": 1}
    ).to_list(1000)

    by_platform = {}
    for d in synced_deals:
        src = d.get("source", "unknown")
        if src not in by_platform:
            by_platform[src] = {"count": 0, "value": 0}
        by_platform[src]["count"] += 1
        by_platform[src]["value"] += d.get("value", 0)

    platform_summaries = []
    for c in connections:
        p = c["platform"]
        info = PLATFORMS.get(p, {})
        bp = by_platform.get(p, {"count": 0, "value": 0})
        platform_summaries.append({
            "platform": p,
            "name": info.get("name", p),
            "connected_at": c.get("connected_at"),
            "last_synced": c.get("last_synced"),
            "records": bp["count"],
            "total_value": round(bp["value"], 2),
            "is_live": c.get("is_live", False),
            "account_name": c.get("account_name"),
        })

    return {
        "connected_count": len(connections),
        "total_records": total_records,
        "total_synced_value": round(sum(bp["value"] for bp in by_platform.values()), 2),
        "platforms": platform_summaries,
    }
