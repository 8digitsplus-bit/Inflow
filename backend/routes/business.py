from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
import uuid

from database import db
from models import User
from dependencies import get_current_user, require_owner, org_filter
from utils.crypto import encrypt, decrypt
from routes.stripe_integration import validate_stripe_key, fetch_stripe_data
from routes.shopify_integration import validate_shopify_key, fetch_shopify_data
from routes.hubspot_integration import validate_hubspot_key, fetch_hubspot_data
from routes.salesforce_integration import validate_salesforce_key, fetch_salesforce_data
from routes.quickbooks_integration import validate_quickbooks_key, fetch_quickbooks_data
from routes.paypal_integration import validate_paypal_credentials, fetch_paypal_data
from routes.square_integration import validate_square_token, fetch_square_data
from routes.mixpanel_integration import validate_mixpanel_creds, fetch_mixpanel_data
from routes.zoho_integration import validate_zoho_credentials, fetch_zoho_data
from routes.xero_integration import validate_xero_credentials, fetch_xero_data

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
    "paypal": {
        "platform_id": "paypal",
        "name": "PayPal",
        "description": "Import PayPal transactions and revenue from your PayPal Business account.",
        "icon": "DollarSign",
        "color": "#0070BA",
        "category": "Payments",
        "data_types": ["transactions", "revenue", "customers"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "PayPal app client_id", "type": "text"},
            {"name": "client_secret", "label": "Client Secret", "placeholder": "PayPal app secret", "type": "password"},
            {"name": "sandbox", "label": "Use Sandbox", "type": "checkbox"},
        ],
        "key_help_url": "https://developer.paypal.com/dashboard/applications",
        "key_help_text": "Create a REST app in PayPal Developer Dashboard. Copy the Client ID and Secret for your Live (or Sandbox) app.",
    },
    "square": {
        "platform_id": "square",
        "name": "Square",
        "description": "Sync Square payments and orders for unified revenue analytics.",
        "icon": "CreditCard",
        "color": "#006AFF",
        "category": "Payments",
        "data_types": ["payments", "revenue", "customers"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Personal Access Token", "placeholder": "EAAAl...", "type": "password"},
            {"name": "sandbox", "label": "Use Sandbox", "type": "checkbox"},
        ],
        "key_help_url": "https://developer.squareup.com/apps",
        "key_help_text": "In the Square Developer Dashboard, open your app and copy the Personal Access Token (Production or Sandbox).",
    },
    "mixpanel": {
        "platform_id": "mixpanel",
        "name": "Mixpanel",
        "description": "Ingest product analytics events to correlate user behavior with revenue.",
        "icon": "BarChart3",
        "color": "#7856FF",
        "category": "Analytics",
        "data_types": ["events", "funnels", "cohorts"],
        "requires_key": True,
        "key_fields": [
            {"name": "company_id", "label": "Project ID", "placeholder": "12345", "type": "text"},
            {"name": "api_key", "label": "Project API Secret", "placeholder": "a1b2c3...", "type": "password"},
            {"name": "instance_url", "label": "Region", "placeholder": "us or eu", "type": "text"},
        ],
        "key_help_url": "https://mixpanel.com/report",
        "key_help_text": "Find your Project ID in Project Settings > Overview. Generate a Service Account (or legacy API Secret) in Project Settings > Service Accounts.",
    },
    "zoho": {
        "platform_id": "zoho",
        "name": "Zoho CRM",
        "description": "Pull deals, pipeline, and contacts from your Zoho CRM.",
        "icon": "Users",
        "color": "#C82127",
        "category": "CRM",
        "data_types": ["deals", "contacts", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "1000.XXXXX", "type": "text"},
            {"name": "client_secret", "label": "Client Secret", "placeholder": "Zoho app secret", "type": "password"},
            {"name": "api_key", "label": "Refresh Token", "placeholder": "1000.xxx.xxx", "type": "password"},
            {"name": "instance_url", "label": "Data Center", "placeholder": "com, eu, in, com.au, jp", "type": "text"},
        ],
        "key_help_url": "https://api-console.zoho.com/",
        "key_help_text": "Create a Self-Client in Zoho API Console. Generate a grant token with scope ZohoCRM.modules.deals.READ ZohoCRM.users.READ and exchange it for a refresh_token.",
    },
    "xero": {
        "platform_id": "xero",
        "name": "Xero",
        "description": "Sync accounts-receivable invoices and revenue from your Xero organisation.",
        "icon": "Calculator",
        "color": "#13B5EA",
        "category": "Finance",
        "data_types": ["invoices", "revenue", "customers"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "Xero app client_id", "type": "text"},
            {"name": "client_secret", "label": "Client Secret", "placeholder": "Xero app secret", "type": "password"},
            {"name": "api_key", "label": "Refresh Token", "placeholder": "Xero refresh_token", "type": "password"},
            {"name": "company_id", "label": "Tenant ID", "placeholder": "Xero tenantId (organisation)", "type": "text"},
        ],
        "key_help_url": "https://developer.xero.com/app/manage",
        "key_help_text": "In the Xero Developer portal, create a Web/Mobile app, complete OAuth2 once to obtain a refresh_token and the Tenant ID of the organisation you want to sync.",
    },
}


class ConnectRequest(BaseModel):
    api_key: Optional[str] = None
    store_url: Optional[str] = None
    instance_url: Optional[str] = None
    company_id: Optional[str] = None
    sandbox: Optional[bool] = False
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


# Integration slot limits by subscription tier
INTEGRATION_LIMITS = {
    "trial": 2,
    "essential_monthly": 2,
    "essential_yearly": 2,
    "pro_monthly": 4,
    "pro_yearly": 4,
    "enterprise_monthly": None,  # unlimited
    "enterprise_yearly": None,
    "expired": 0,
    "cancelled": 0,
}


def get_integration_limit(tier: str):
    """Returns max integration count or None for unlimited."""
    return INTEGRATION_LIMITS.get(tier, 2)


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


async def _connect_paypal(body: ConnectRequest, user_id: str, now: str):
    if not body.client_id or not body.client_secret:
        raise HTTPException(status_code=400, detail="PayPal Client ID and Secret are required")
    validation = await validate_paypal_credentials(body.client_id, body.client_secret, body.sandbox or False)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid PayPal credentials"))
    data = await fetch_paypal_data(body.client_id, body.client_secret, body.sandbox or False, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "paypal",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "PayPal Account"),
        "api_key_last4": body.client_secret[-4:],
        "api_key_encrypted": encrypt(body.client_secret),
        "client_id": body.client_id,
        "sandbox": body.sandbox or False,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_square(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Square Personal Access Token is required")
    validation = await validate_square_token(body.api_key, body.sandbox or False)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Square token"))
    data = await fetch_square_data(body.api_key, body.sandbox or False, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "square",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Square Account"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "sandbox": body.sandbox or False,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_mixpanel(body: ConnectRequest, user_id: str, now: str):
    if not body.company_id or not body.api_key:
        raise HTTPException(status_code=400, detail="Mixpanel Project ID and API Secret are required")
    region = (body.instance_url or "us").strip().lower() or "us"
    validation = await validate_mixpanel_creds(body.company_id, body.api_key, region)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Mixpanel credentials"))
    data = await fetch_mixpanel_data(body.company_id, body.api_key, region, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "mixpanel",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Mixpanel Project"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "company_id": body.company_id,
        "instance_url": region,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_zoho(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key or not body.client_id or not body.client_secret:
        raise HTTPException(status_code=400, detail="Zoho Refresh Token, Client ID, and Client Secret are required")
    dc = (body.instance_url or "com").strip().lower() or "com"
    validation = await validate_zoho_credentials(body.api_key, body.client_id, body.client_secret, dc)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Zoho credentials"))
    data = await fetch_zoho_data(body.api_key, body.client_id, body.client_secret, dc, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "zoho",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Zoho CRM"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "client_id": body.client_id,
        "client_secret_encrypted": encrypt(body.client_secret),
        "instance_url": dc,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_xero(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key or not body.client_id or not body.client_secret or not body.company_id:
        raise HTTPException(status_code=400, detail="Xero Refresh Token, Client ID, Client Secret, and Tenant ID are required")
    validation = await validate_xero_credentials(body.api_key, body.client_id, body.client_secret, body.company_id)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Xero credentials"))
    data = await fetch_xero_data(body.api_key, body.client_id, body.client_secret, body.company_id, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "xero",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Xero Organisation"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "client_id": body.client_id,
        "client_secret_encrypted": encrypt(body.client_secret),
        "company_id": body.company_id,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


CONNECT_HANDLERS = {
    "stripe": _connect_stripe,
    "shopify": _connect_shopify,
    "hubspot": _connect_hubspot,
    "salesforce": _connect_salesforce,
    "quickbooks": _connect_quickbooks,
    "paypal": _connect_paypal,
    "square": _connect_square,
    "mixpanel": _connect_mixpanel,
    "zoho": _connect_zoho,
    "xero": _connect_xero,
}


@router.get("/business/platforms")
async def get_platforms(current_user: User = Depends(get_current_user)):
    connections = await db.business_connections.find(
        org_filter(current_user), {"_id": 0}
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


@router.get("/business/integration-usage")
async def get_integration_usage(current_user: User = Depends(get_current_user)):
    """Returns integration quota + usage for the user's org tier."""
    org = await db.organizations.find_one({"org_id": current_user.org_id}, {"_id": 0}) if current_user.org_id else None
    tier = (org or {}).get("subscription_tier") or current_user.subscription_tier or "trial"
    limit = get_integration_limit(tier)
    used = await db.business_connections.count_documents(org_filter(current_user))
    return {
        "tier": tier,
        "used": used,
        "limit": limit,  # None == unlimited
        "available": (None if limit is None else max(0, limit - used)),
        "at_limit": (False if limit is None else used >= limit),
    }


@router.post("/business/connect/{platform}")
async def connect_platform(platform: str, body: ConnectRequest = ConnectRequest(), current_user: User = Depends(require_owner)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    existing = await db.business_connections.find_one(
        {**org_filter(current_user), "platform": platform}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Platform already connected")

    # Tier gate — count-based integration limit
    org = await db.organizations.find_one({"org_id": current_user.org_id}, {"_id": 0}) if current_user.org_id else None
    tier = (org or {}).get("subscription_tier") or current_user.subscription_tier or "trial"
    limit = get_integration_limit(tier)
    if limit is not None:
        used = await db.business_connections.count_documents(org_filter(current_user))
        if used >= limit:
            tier_name = tier.replace("_monthly", "").replace("_yearly", "").title()
            raise HTTPException(
                status_code=403,
                detail=f"Your {tier_name} plan allows {limit} integration{'s' if limit != 1 else ''}. Upgrade to connect more platforms."
            )

    now = datetime.now(timezone.utc).isoformat()
    handler = CONNECT_HANDLERS.get(platform)
    if not handler:
        raise HTTPException(status_code=400, detail="Integration not available")

    data, connection, account_name = await handler(body, current_user.user_id, now)
    connection["org_id"] = current_user.org_id

    if data["deals"]:
        for d in data["deals"]:
            d["org_id"] = current_user.org_id
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
async def disconnect_platform(platform: str, current_user: User = Depends(require_owner)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    result = await db.business_connections.delete_one(
        {**org_filter(current_user), "platform": platform}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Platform not connected")

    delete_result = await db.deals.delete_many(
        {**org_filter(current_user), "source": platform, "synced": True}
    )

    remaining = await db.business_connections.count_documents(org_filter(current_user))
    if remaining == 0:
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"has_business_connected": False}}
        )

    return {"status": "disconnected", "platform": platform, "records_removed": delete_result.deleted_count}


@router.post("/business/sync/{platform}")
async def sync_platform(platform: str, current_user: User = Depends(require_owner)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    connection = await db.business_connections.find_one(
        {**org_filter(current_user), "platform": platform}, {"_id": 0}
    )
    if not connection:
        raise HTTPException(status_code=404, detail="Platform not connected")

    api_key = connection.get("api_key_encrypted")
    if not api_key:
        raise HTTPException(status_code=400, detail="No API key found. Please reconnect.")
    api_key = decrypt(api_key)

    # Remove old synced deals for this org+platform
    await db.deals.delete_many({**org_filter(current_user), "source": platform, "synced": True})
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
        elif platform == "paypal":
            data = await fetch_paypal_data(
                connection.get("client_id", ""),
                api_key,  # client_secret stored in api_key slot
                connection.get("sandbox", False),
                current_user.user_id,
            )
        elif platform == "square":
            data = await fetch_square_data(api_key, connection.get("sandbox", False), current_user.user_id)
        elif platform == "mixpanel":
            data = await fetch_mixpanel_data(
                connection.get("company_id", ""),
                api_key,
                connection.get("instance_url", "us"),
                current_user.user_id,
            )
        elif platform == "zoho":
            client_secret = decrypt(connection.get("client_secret_encrypted", ""))
            data = await fetch_zoho_data(
                api_key,  # refresh_token
                connection.get("client_id", ""),
                client_secret,
                connection.get("instance_url", "com"),
                current_user.user_id,
            )
        elif platform == "xero":
            client_secret = decrypt(connection.get("client_secret_encrypted", ""))
            data = await fetch_xero_data(
                api_key,  # refresh_token
                connection.get("client_id", ""),
                client_secret,
                connection.get("company_id", ""),
                current_user.user_id,
            )
        else:
            raise HTTPException(status_code=400, detail="Sync not supported for this platform")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {str(e)}")

    if data["deals"]:
        for d in data["deals"]:
            d["org_id"] = current_user.org_id
        await db.deals.insert_many(data["deals"])

    await db.business_connections.update_one(
        {**org_filter(current_user), "platform": platform},
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
        org_filter(current_user), {"_id": 0}
    ).to_list(20)

    total_records = sum(c.get("records_synced", 0) for c in connections)

    synced_deals = await db.deals.find(
        {**org_filter(current_user), "synced": True},
        {"_id": 0, "source": 1, "value": 1, "stage": 1}
    ).to_list(2000)

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
