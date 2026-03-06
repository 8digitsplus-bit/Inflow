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
            "subscription_tier": "free",
            "subscription_status": "active",
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
    return user_doc


@router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})
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
        "subscription_tier": "free",
        "subscription_status": "active",
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
    return user_doc


@router.post("/auth/login")
async def login_with_email(req: LoginRequest, response: Response):
    """Login with email and password"""
    user_doc = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    stored_hash = user_doc.get("password_hash")
    if not stored_hash:
        raise HTTPException(status_code=401, detail="This account uses social login. Please sign in with Google or Shopify.")

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
    return safe_user


# ============== SHOPIFY AUTH ==============

SHOPIFY_API_KEY = os.environ.get("SHOPIFY_API_KEY", "")
SHOPIFY_API_SECRET = os.environ.get("SHOPIFY_API_SECRET", "")
SHOPIFY_SCOPES = "read_products,read_orders,read_customers"


@router.get("/auth/shopify")
async def shopify_auth(request: Request):
    """Initiate Shopify OAuth"""
    if not SHOPIFY_API_KEY:
        raise HTTPException(status_code=501, detail="Shopify authentication is not configured yet. Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to your environment.")
    shop = request.query_params.get("shop", "")
    if not shop:
        raise HTTPException(status_code=400, detail="Shop domain is required (e.g. mystore.myshopify.com)")
    origin = request.query_params.get("origin", "")
    redirect_uri = f"{origin}/api/auth/shopify/callback"
    nonce = uuid.uuid4().hex
    url = (
        f"https://{shop}/admin/oauth/authorize?"
        f"client_id={SHOPIFY_API_KEY}&scope={SHOPIFY_SCOPES}"
        f"&redirect_uri={redirect_uri}&state={nonce}"
    )
    return {"url": url, "nonce": nonce}


@router.get("/auth/shopify/callback")
async def shopify_callback(request: Request, response: Response):
    """Shopify OAuth callback"""
    if not SHOPIFY_API_KEY or not SHOPIFY_API_SECRET:
        raise HTTPException(status_code=501, detail="Shopify authentication is not configured")

    code = request.query_params.get("code")
    shop = request.query_params.get("shop")
    if not code or not shop:
        raise HTTPException(status_code=400, detail="Missing code or shop parameter")

    async with httpx.AsyncClient() as client_http:
        token_resp = await client_http.post(
            f"https://{shop}/admin/oauth/access_token",
            json={
                "client_id": SHOPIFY_API_KEY,
                "client_secret": SHOPIFY_API_SECRET,
                "code": code
            }
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=401, detail="Failed to get Shopify access token")

        shop_resp = await client_http.get(
            f"https://{shop}/admin/api/2024-01/shop.json",
            headers={"X-Shopify-Access-Token": access_token}
        )
        shop_data = shop_resp.json().get("shop", {})

    email = shop_data.get("email", "")
    name = shop_data.get("shop_owner", shop_data.get("name", email))
    shop_domain = shop_data.get("domain", shop)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing = await db.users.find_one({"email": email}, {"_id": 0})

    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": name,
                "auth_provider": "shopify",
                "shopify_shop": shop_domain,
                "shopify_access_token": access_token,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": None,
            "auth_provider": "shopify",
            "shopify_shop": shop_domain,
            "shopify_access_token": access_token,
            "subscription_tier": "free",
            "subscription_status": "active",
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

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0, "shopify_access_token": 0})
    return user_doc


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
