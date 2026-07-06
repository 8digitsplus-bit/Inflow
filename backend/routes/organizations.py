"""Organization info route (single-user workspaces)."""
import logging

from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User
from dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


async def _get_org(org_id: str) -> dict:
    org = await db.organizations.find_one({"org_id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("/org/me")
async def get_my_org(user: User = Depends(get_current_user)):
    """Current user's organization + their role."""
    if not user.org_id:
        raise HTTPException(status_code=404, detail="User has no organization")
    org = await _get_org(user.org_id)
    return {
        "org_id": org["org_id"],
        "name": org.get("name"),
        "owner_user_id": org.get("owner_user_id"),
        "subscription_tier": org.get("subscription_tier", "trial"),
        "subscription_status": org.get("subscription_status", "active"),
        "role": user.role or "owner",
    }
