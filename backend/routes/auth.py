from fastapi import APIRouter, HTTPException, Request, Response, Depends
from datetime import datetime, timezone, timedelta
import uuid
import os
import httpx
import bcrypt

from database import db
from models import User, RegisterRequest, LoginRequest, OnboardingData
from dependencies import get_current_user

router = APIRouter()

# ============== GOOGLE SESSION AUTH ==============

@router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    data = await request.json()
    session_id = data.get("session_id")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )

        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")

        auth_data = resp.json()

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing_user = await db.users.find_one({"email": auth_data["email"]}, {"_id": 0})

    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": auth_data["name"],
                "picture": auth_data.get("picture"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        await db.users.insert_one({
            "user_id": user_id,
            "email": auth_data["email"],
            "name": auth_data["name"],
            "picture": auth_data.get("picture"),
            "subscription_tier": "trial",
            "subscription_status": "active",
            "trial_start": datetime.now(timezone.utc).isoformat(),
            "trial_end": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    session_token = auth_data.get("session_token", f"session_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    # Compute trial days left for trial users
    if user_doc and user_doc.get("subscription_tier") == "trial":
        trial_end = user_doc.get("trial_end")
        if trial_end:
            now = datetime.now(timezone.utc)
            if isinstance(trial_end, str):
                end = datetime.fromisoformat(trial_end.replace("Z", "+00:00"))
            else:
                end = trial_end.replace(tzinfo=timezone.utc) if trial_end.tzinfo is None else trial_end
            days_left = (end - now).days
            user_doc["trial_days_left"] = max(0, days_left)
            if days_left <= 0:
                user_doc["subscription_tier"] = "expired"
                await db.users.update_one({"user_id": user_id}, {"$set": {"subscription_tier": "expired"}})
    
    return user_doc


@router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user with trial status"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})

    # Check trial expiration
    if user_doc and user_doc.get("subscription_tier") == "trial":
        trial_end = user_doc.get("trial_end")
        if trial_end:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            # Handle both string and datetime objects
            if isinstance(trial_end, str):
                end = datetime.fromisoformat(trial_end.replace("Z", "+00:00"))
            else:
                # Ensure datetime has timezone info
                end = trial_end.replace(tzinfo=timezone.utc) if trial_end.tzinfo is None else trial_end
            days_left = (end - now).days
            user_doc["trial_days_left"] = max(0, days_left)
            if days_left <= 0:
                user_doc["subscription_tier"] = "expired"
                await db.users.update_one(
                    {"user_id": user.user_id},
                    {"$set": {"subscription_tier": "expired"}}
                )

    return user_doc


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})

    response.delete_cookie(key="session_token", path="/", samesite="none", secure=True)
    return {"message": "Logged out successfully"}


# ============== EMAIL/PASSWORD AUTH ==============

@router.post("/auth/register")
async def register_with_email(req: RegisterRequest, response: Response):
    """Register with email and password"""
    existing = await db.users.find_one({"email": req.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = f"user_{uuid.uuid4().hex[:12]}"

    await db.users.insert_one({
        "user_id": user_id,
        "email": req.email,
        "name": req.name,
        "picture": None,
        "password_hash": hashed,
        "auth_provider": "email",
        "subscription_tier": "trial",
        "subscription_status": "active",
        "trial_start": datetime.now(timezone.utc).isoformat(),
        "trial_end": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    session_token = f"session_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    user_doc["trial_days_left"] = 14
    return user_doc
@router.post("/auth/login")
async def login_with_email(req: LoginRequest, response: Response):
    """Login with email and password"""
    user_doc = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    stored_hash = user_doc.get("password_hash")
    if not stored_hash:
        raise HTTPException(status_code=401, detail="This account uses social login. Please sign in with Google.")

    if not bcrypt.checkpw(req.password.encode("utf-8"), stored_hash.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    session_token = f"session_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )

    safe_user = {k: v for k, v in user_doc.items() if k != "password_hash"}

    # Compute trial days left for trial users
    if safe_user.get("subscription_tier") == "trial":
        trial_end = safe_user.get("trial_end")
        if trial_end:
            now = datetime.now(timezone.utc)
            if isinstance(trial_end, str):
                end = datetime.fromisoformat(trial_end.replace("Z", "+00:00"))
            else:
                end = trial_end.replace(tzinfo=timezone.utc) if trial_end.tzinfo is None else trial_end
            days_left = (end - now).days
            safe_user["trial_days_left"] = max(0, days_left)
            if days_left <= 0:
                safe_user["subscription_tier"] = "expired"
                await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"subscription_tier": "expired"}})

    return safe_user


# ============== ONBOARDING ==============

@router.get("/auth/onboarding-status")
async def get_onboarding_status(current_user: User = Depends(get_current_user)):
    """Check if user has completed onboarding"""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    return {"onboarded": user_doc.get("onboarded", False)}


@router.post("/auth/onboarding")
async def complete_onboarding(data: OnboardingData, current_user: User = Depends(get_current_user)):
    """Save onboarding data and mark user as onboarded"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {
            "onboarded": True,
            "company_name": data.company_name,
            "team_size": data.team_size,
            "industry": data.industry,
            "goals": data.goals,
            "onboarded_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"status": "completed"}
