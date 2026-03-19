from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import random

from database import db
from models import User
from dependencies import get_current_user
from routes.stripe_integration import validate_stripe_key, fetch_stripe_data

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
        "key_placeholder": "sk_live_... or sk_test_...",
        "key_help": "Find your API key at dashboard.stripe.com/apikeys",
    },
    "shopify": {
        "platform_id": "shopify",
        "name": "Shopify",
        "description": "Import e-commerce orders, customer data, and product performance from your Shopify store.",
        "icon": "ShoppingBag",
        "color": "#96BF48",
        "category": "E-Commerce",
        "data_types": ["orders", "customers", "products", "revenue"],
        "requires_key": False,
    },
    "hubspot": {
        "platform_id": "hubspot",
        "name": "HubSpot",
        "description": "Sync your CRM deals, contacts, and pipeline data from HubSpot for unified insights.",
        "icon": "Users",
        "color": "#FF7A59",
        "category": "CRM",
        "data_types": ["deals", "contacts", "pipeline", "activities"],
        "requires_key": False,
    },
    "salesforce": {
        "platform_id": "salesforce",
        "name": "Salesforce",
        "description": "Two-way sync with Salesforce for complete pipeline visibility and deal tracking.",
        "icon": "Cloud",
        "color": "#00A1E0",
        "category": "CRM",
        "data_types": ["opportunities", "accounts", "contacts", "pipeline"],
        "requires_key": False,
    },
    "quickbooks": {
        "platform_id": "quickbooks",
        "name": "QuickBooks",
        "description": "Pull financial data, invoices, and expense reports for comprehensive revenue analysis.",
        "icon": "Calculator",
        "color": "#2CA01C",
        "category": "Finance",
        "data_types": ["invoices", "expenses", "revenue", "accounts"],
        "requires_key": False,
    },
}

COMPANY_NAMES = [
    "TechVision Labs", "Meridian Corp", "Apex Solutions", "NovaByte Inc",
    "CrestLine Digital", "Pinnacle SaaS", "Orbit Analytics", "Zenith Group",
    "BlueShift AI", "Catalyst Partners", "Evergreen Media", "FusionPoint",
    "Momentum Dynamics", "Prism Ventures", "Quantum Reach", "SilverArc",
    "TrueNorth Software", "Vertex Cloud", "Wavelength IO", "Atlas Enterprise",
]

DEAL_NAMES = [
    "Annual Platform License", "Enterprise Upgrade", "Custom Integration",
    "Premium Support Package", "Data Analytics Suite", "API Access Plan",
    "Multi-seat Expansion", "Strategic Partnership", "Pilot Program",
    "Cloud Migration", "Security Audit Package", "Training & Onboarding",
    "White-label Solution", "Consulting Engagement", "Renewal - Q2",
    "Upsell - Premium Tier", "New Business - Inbound", "Referral Deal",
    "Expansion Revenue", "Cross-sell Bundle",
]

STAGES = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]


class ConnectRequest(BaseModel):
    api_key: Optional[str] = None


def _generate_synced_deals(user_id: str, platform: str, count: int = 15):
    """Generate mock business data for non-Stripe platforms."""
    deals = []
    now = datetime.now(timezone.utc)

    for i in range(count):
        stage = random.choices(STAGES, weights=[20, 20, 20, 15, 15, 10], k=1)[0]
        prob_map = {
            "lead": random.randint(10, 25), "qualified": random.randint(25, 45),
            "proposal": random.randint(45, 65), "negotiation": random.randint(65, 85),
            "closed_won": 100, "closed_lost": 0,
        }
        value = round(random.uniform(2000, 85000), 2)
        days_ago = random.randint(1, 120)
        created = now - timedelta(days=days_ago)

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": random.choice(DEAL_NAMES) + f" ({platform.title()})",
            "company": random.choice(COMPANY_NAMES),
            "value": value, "stage": stage, "probability": prob_map[stage],
            "expected_close_date": (now + timedelta(days=random.randint(10, 90))).strftime("%Y-%m-%d") if stage not in ["closed_won", "closed_lost"] else None,
            "notes": f"Synced from {platform.title()}", "source": platform,
            "synced": True, "created_at": created.isoformat(), "updated_at": now.isoformat(),
        })
    return deals


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
            "is_live": pid == "stripe" and conn is not None,
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

    if platform == "stripe":
        # Real Stripe integration
        if not body.api_key:
            raise HTTPException(status_code=400, detail="Stripe API key is required")

        # Validate key
        validation = await validate_stripe_key(body.api_key)
        if not validation["valid"]:
            raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Stripe API key"))

        # Fetch real data
        stripe_data = await fetch_stripe_data(body.api_key, current_user.user_id)

        if stripe_data["deals"]:
            await db.deals.insert_many(stripe_data["deals"])

        connection = {
            "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
            "user_id": current_user.user_id,
            "platform": "stripe",
            "connected_at": now,
            "last_synced": now,
            "records_synced": stripe_data["total_records"],
            "sync_status": "synced",
            "account_name": validation.get("account_name", "Stripe Account"),
            "account_id": validation.get("account_id", ""),
            "api_key_last4": body.api_key[-4:],
            "api_key_encrypted": body.api_key,  # In production, encrypt this
            "stats": stripe_data["stats"],
            "is_live": True,
        }
        await db.business_connections.insert_one(connection)
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"has_business_connected": True}}
        )

        return {
            "status": "connected",
            "platform": "stripe",
            "is_live": True,
            "account_name": validation.get("account_name"),
            "records_synced": stripe_data["total_records"],
            "stats": stripe_data["stats"],
            "message": f"Connected to {validation.get('account_name', 'Stripe')}. {stripe_data['total_records']} records synced from live data.",
        }
    else:
        # Mock integration for other platforms
        deal_count = random.randint(12, 20)
        deals = _generate_synced_deals(current_user.user_id, platform, deal_count)
        if deals:
            await db.deals.insert_many(deals)

        connection = {
            "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
            "user_id": current_user.user_id,
            "platform": platform,
            "connected_at": now,
            "last_synced": now,
            "records_synced": len(deals),
            "sync_status": "synced",
            "is_live": False,
        }
        await db.business_connections.insert_one(connection)
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"has_business_connected": True}}
        )

        return {
            "status": "connected",
            "platform": platform,
            "is_live": False,
            "records_synced": len(deals),
            "message": f"Connected {PLATFORMS[platform]['name']}. {len(deals)} records synced.",
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

    # Remove old synced deals
    await db.deals.delete_many({"user_id": current_user.user_id, "source": platform, "synced": True})

    now = datetime.now(timezone.utc).isoformat()

    if platform == "stripe" and connection.get("api_key_encrypted"):
        # Real Stripe re-sync
        stripe_data = await fetch_stripe_data(connection["api_key_encrypted"], current_user.user_id)
        if stripe_data["deals"]:
            await db.deals.insert_many(stripe_data["deals"])

        await db.business_connections.update_one(
            {"user_id": current_user.user_id, "platform": "stripe"},
            {"$set": {
                "last_synced": now,
                "records_synced": stripe_data["total_records"],
                "sync_status": "synced",
                "stats": stripe_data["stats"],
            }}
        )
        return {
            "status": "synced", "platform": "stripe", "is_live": True,
            "records_synced": stripe_data["total_records"],
            "stats": stripe_data["stats"],
            "message": f"Synced {stripe_data['total_records']} live records from Stripe.",
        }
    else:
        # Mock re-sync
        deal_count = random.randint(12, 20)
        deals = _generate_synced_deals(current_user.user_id, platform, deal_count)
        if deals:
            await db.deals.insert_many(deals)

        await db.business_connections.update_one(
            {"user_id": current_user.user_id, "platform": platform},
            {"$set": {"last_synced": now, "records_synced": len(deals), "sync_status": "synced"}}
        )
        return {
            "status": "synced", "platform": platform,
            "records_synced": len(deals),
            "message": f"Synced {len(deals)} records from {PLATFORMS[platform]['name']}.",
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
