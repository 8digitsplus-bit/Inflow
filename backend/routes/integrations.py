from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone

from database import db
from models import User
from dependencies import get_current_user, require_owner, org_filter

router = APIRouter()

AVAILABLE_INTEGRATIONS = [
    {
        "integration_id": "slack",
        "name": "Slack",
        "description": "Send deal updates and alerts to your Slack channels",
        "category": "Communication",
        "icon": "MessageSquare",
        "color": "#4A154B",
    },
    {
        "integration_id": "hubspot",
        "name": "HubSpot",
        "description": "Sync contacts, deals, and pipeline data with HubSpot CRM",
        "category": "CRM",
        "icon": "Users",
        "color": "#FF7A59",
    },
    {
        "integration_id": "salesforce",
        "name": "Salesforce",
        "description": "Two-way sync with Salesforce for complete pipeline visibility",
        "category": "CRM",
        "icon": "Cloud",
        "color": "#00A1E0",
    },
    {
        "integration_id": "google_sheets",
        "name": "Google Sheets",
        "description": "Export reports and analytics data to Google Sheets automatically",
        "category": "Productivity",
        "icon": "Table",
        "color": "#0F9D58",
    },
    {
        "integration_id": "zapier",
        "name": "Zapier",
        "description": "Connect InFlow to 5,000+ apps through Zapier automations",
        "category": "Automation",
        "icon": "Zap",
        "color": "#FF4A00",
    },
    {
        "integration_id": "stripe",
        "name": "Stripe",
        "description": "Track payment events and revenue data from Stripe",
        "category": "Payments",
        "icon": "CreditCard",
        "color": "#635BFF",
    },
    {
        "integration_id": "gmail",
        "name": "Gmail",
        "description": "Log email conversations and track client communications",
        "category": "Communication",
        "icon": "Mail",
        "color": "#EA4335",
    },
    {
        "integration_id": "microsoft_teams",
        "name": "Microsoft Teams",
        "description": "Get real-time notifications and updates in Teams channels",
        "category": "Communication",
        "icon": "Monitor",
        "color": "#6264A7",
    },
    {
        "integration_id": "jira",
        "name": "Jira",
        "description": "Link deals to Jira tickets for cross-team visibility",
        "category": "Productivity",
        "icon": "LayoutGrid",
        "color": "#0052CC",
    },
]


@router.get("/integrations")
async def get_integrations(current_user: User = Depends(get_current_user)):
    """Get all integrations with user's connection status"""
    user_integrations = await db.integrations.find(
        org_filter(current_user),
        {"_id": 0}
    ).to_list(100)

    connected_ids = {i["integration_id"] for i in user_integrations}

    result = []
    for integration in AVAILABLE_INTEGRATIONS:
        item = {**integration, "connected": integration["integration_id"] in connected_ids}
        if item["connected"]:
            user_int = next((i for i in user_integrations if i["integration_id"] == integration["integration_id"]), None)
            if user_int:
                item["connected_at"] = user_int.get("connected_at", "")
        result.append(item)

    return result


@router.post("/integrations/{integration_id}/connect")
async def connect_integration(integration_id: str, current_user: User = Depends(require_owner)):
    """Connect an integration for the org (owner only)."""
    valid_ids = [i["integration_id"] for i in AVAILABLE_INTEGRATIONS]
    if integration_id not in valid_ids:
        raise HTTPException(status_code=404, detail="Integration not found")

    existing = await db.integrations.find_one(
        {**org_filter(current_user), "integration_id": integration_id},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Integration already connected")

    doc = {
        "user_id": current_user.user_id,
        "org_id": current_user.org_id,
        "integration_id": integration_id,
        "connected_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.integrations.insert_one(doc)
    return {"status": "connected", "integration_id": integration_id}


@router.post("/integrations/{integration_id}/disconnect")
async def disconnect_integration(integration_id: str, current_user: User = Depends(require_owner)):
    """Disconnect an integration (owner only)."""
    result = await db.integrations.delete_one(
        {**org_filter(current_user), "integration_id": integration_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Integration not found or not connected")
    return {"status": "disconnected", "integration_id": integration_id}
