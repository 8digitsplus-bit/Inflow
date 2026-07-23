from fastapi import HTTPException, Request, Depends
from typing import Optional
from datetime import datetime, timezone
from database import db
from models import User


async def get_current_user(request: Request) -> User:
    """Get current user from session token"""
    session_token = request.cookies.get("session_token")

    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]

    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )

    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )

    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    return User(**user_doc)


async def get_optional_user(request: Request) -> Optional[User]:
    """Get current user if authenticated, None otherwise"""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def require_owner(user: User = Depends(get_current_user)) -> User:
    """Gate an endpoint to org owners only."""
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Only the organization owner can perform this action")
    return user


async def require_paid(user: User = Depends(get_current_user)) -> User:
    """Gate a feature to accounts with an active (paid) subscription.

    Under the value-based plan every paying customer maps to a top-tier
    subscription internally, so 'paid' simply means not trial/expired/cancelled/free.
    """
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    if (tier or "trial") in {"trial", "expired", "cancelled", "free"}:
        raise HTTPException(status_code=403, detail="This feature requires an active InFlow subscription.")
    return user


async def require_paid_owner(user: User = Depends(require_paid)) -> User:
    """Paid subscription + org owner (for send/route actions)."""
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Only the organization owner can perform this action")
    return user


def org_filter(user: User) -> dict:
    """MongoDB filter to scope a query to the user's organization.

    Falls back to user_id for pre-migration users (should be rare).
    """
    if user.org_id:
        return {"org_id": user.org_id}
    return {"user_id": user.user_id}


async def get_org_user_ids(org_id: str) -> list:
    """All user_ids belonging to an organization (used for backward-compat queries)."""
    members = await db.users.find({"org_id": org_id}, {"_id": 0, "user_id": 1}).to_list(1000)
    return [m["user_id"] for m in members]

