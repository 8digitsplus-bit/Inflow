from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Response
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    subscription_tier: str = "free"  # free, pro, enterprise
    subscription_status: str = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    notification_id: str = Field(default_factory=lambda: f"notif_{uuid.uuid4().hex[:12]}")
    user_id: str
    type: str  # at_risk, churn_alert, deal_update, system
    title: str
    message: str
    deal_id: Optional[str] = None
    read: bool = False
    priority: str = "medium"  # low, medium, high, critical
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Deal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    deal_id: str = Field(default_factory=lambda: f"deal_{uuid.uuid4().hex[:12]}")
    user_id: str
    name: str
    company: str
    value: float
    stage: str = "lead"  # lead, qualified, proposal, negotiation, closed_won, closed_lost
    probability: int = 20
    expected_close_date: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DealCreate(BaseModel):
    name: str
    company: str
    value: float
    stage: str = "lead"
    probability: int = 20
    expected_close_date: Optional[str] = None
    notes: Optional[str] = None

class DealUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None
    probability: Optional[int] = None
    expected_close_date: Optional[str] = None
    notes: Optional[str] = None

class PricingAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")
    analysis_id: str = Field(default_factory=lambda: f"analysis_{uuid.uuid4().hex[:12]}")
    user_id: str
    product_name: str
    current_price: float
    competitor_prices: List[float]
    target_margin: float
    market_segment: str
    ai_recommendation: Optional[str] = None
    optimal_price: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PricingAnalysisRequest(BaseModel):
    product_name: str
    current_price: float
    competitor_prices: List[float]
    target_margin: float
    market_segment: str

class AIInsightRequest(BaseModel):
    context: str
    data: Optional[Dict[str, Any]] = None

class PaymentTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    transaction_id: str = Field(default_factory=lambda: f"txn_{uuid.uuid4().hex[:12]}")
    user_id: str
    session_id: str
    amount: float
    currency: str = "usd"
    plan: str
    payment_status: str = "pending"
    metadata: Optional[Dict[str, str]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============== AUTH HELPERS ==============

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

# ============== AUTH ROUTES ==============

@api_router.post("/auth/session")
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

@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/", samesite="none", secure=True)
    return {"message": "Logged out successfully"}

# ============== EMAIL/PASSWORD AUTH ==============

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class LoginRequest(BaseModel):
    email: str
    password: str

@api_router.post("/auth/register")
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

@api_router.post("/auth/login")
async def login_with_email(req: LoginRequest, response: Response):
    """Login with email and password"""
    user_doc = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    stored_hash = user_doc.get("password_hash")
    if not stored_hash:
        raise HTTPException(status_code=401, detail="This account uses social login. Please sign in with Google or Microsoft.")

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

# ============== MICROSOFT AUTH ==============

MICROSOFT_CLIENT_ID = os.environ.get("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.environ.get("MICROSOFT_CLIENT_SECRET", "")
MICROSOFT_TENANT = os.environ.get("MICROSOFT_TENANT", "common")

@api_router.get("/auth/microsoft")
async def microsoft_auth(request: Request):
    """Redirect to Microsoft OAuth"""
    if not MICROSOFT_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Microsoft authentication is not configured yet")
    origin = request.query_params.get("origin", "")
    redirect_uri = f"{origin}/api/auth/microsoft/callback"
    url = (
        f"https://login.microsoftonline.com/{MICROSOFT_TENANT}/oauth2/v2.0/authorize?"
        f"client_id={MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri={redirect_uri}"
        f"&scope=openid+profile+email+User.Read&response_mode=query"
    )
    return {"url": url}

@api_router.get("/auth/microsoft/callback")
async def microsoft_callback(code: str, response: Response):
    """Microsoft OAuth callback"""
    if not MICROSOFT_CLIENT_ID or not MICROSOFT_CLIENT_SECRET:
        raise HTTPException(status_code=501, detail="Microsoft authentication is not configured")

    origin = str(response.headers.get("referer", "")).rstrip("/")
    redirect_uri = f"{origin}/api/auth/microsoft/callback"

    async with httpx.AsyncClient() as client_http:
        token_resp = await client_http.post(
            f"https://login.microsoftonline.com/{MICROSOFT_TENANT}/oauth2/v2.0/token",
            data={
                "client_id": MICROSOFT_CLIENT_ID,
                "client_secret": MICROSOFT_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "scope": "openid profile email User.Read"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=401, detail="Failed to get Microsoft access token")

        user_resp = await client_http.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        ms_user = user_resp.json()

    email = ms_user.get("mail") or ms_user.get("userPrincipalName")
    name = ms_user.get("displayName", email)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing = await db.users.find_one({"email": email}, {"_id": 0})

    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": name,
                "auth_provider": "microsoft",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": None,
            "auth_provider": "microsoft",
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

# ============== DEALS ROUTES ==============

@api_router.get("/deals", response_model=List[Deal])
async def get_deals(user: User = Depends(get_current_user)):
    """Get all deals for current user"""
    deals = await db.deals.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    return deals

@api_router.post("/deals", response_model=Deal)
async def create_deal(deal_data: DealCreate, user: User = Depends(get_current_user)):
    """Create a new deal"""
    deal = Deal(user_id=user.user_id, **deal_data.model_dump())
    deal_dict = deal.model_dump()
    deal_dict["created_at"] = deal_dict["created_at"].isoformat()
    deal_dict["updated_at"] = deal_dict["updated_at"].isoformat()
    
    await db.deals.insert_one(deal_dict)
    return deal

@api_router.put("/deals/{deal_id}", response_model=Deal)
async def update_deal(deal_id: str, deal_data: DealUpdate, user: User = Depends(get_current_user)):
    """Update a deal"""
    existing = await db.deals.find_one({"deal_id": deal_id, "user_id": user.user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    update_data = {k: v for k, v in deal_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.deals.update_one(
        {"deal_id": deal_id},
        {"$set": update_data}
    )
    
    updated = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    return updated

@api_router.delete("/deals/{deal_id}")
async def delete_deal(deal_id: str, user: User = Depends(get_current_user)):
    """Delete a deal"""
    result = await db.deals.delete_one({"deal_id": deal_id, "user_id": user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deal not found")
    return {"message": "Deal deleted"}

# ============== NOTIFICATIONS ROUTES ==============

async def create_notification(user_id: str, type: str, title: str, message: str, deal_id: str = None, priority: str = "medium"):
    """Helper function to create a notification"""
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        deal_id=deal_id,
        priority=priority
    )
    notif_dict = notification.model_dump()
    notif_dict["created_at"] = notif_dict["created_at"].isoformat()
    await db.notifications.insert_one(notif_dict)
    return notification

async def check_and_create_at_risk_notifications(user_id: str):
    """Check for at-risk deals and create notifications"""
    # Get deals in negotiation with low probability
    at_risk_deals = await db.deals.find({
        "user_id": user_id,
        "stage": {"$in": ["negotiation", "proposal"]},
        "probability": {"$lt": 40}
    }, {"_id": 0}).to_list(100)
    
    for deal in at_risk_deals:
        # Check if we already have a recent notification for this deal
        existing = await db.notifications.find_one({
            "user_id": user_id,
            "deal_id": deal["deal_id"],
            "type": "at_risk",
            "read": False
        })
        
        if not existing:
            priority = "critical" if deal.get("probability", 0) < 20 else "high"
            await create_notification(
                user_id=user_id,
                type="at_risk",
                title=f"At-Risk: {deal['name']}",
                message=f"{deal['company']} deal has {deal.get('probability', 0)}% probability. Consider immediate action.",
                deal_id=deal["deal_id"],
                priority=priority
            )

@api_router.get("/notifications")
async def get_notifications(user: User = Depends(get_current_user)):
    """Get all notifications for current user"""
    # First check for any new at-risk deals
    await check_and_create_at_risk_notifications(user.user_id)
    
    notifications = await db.notifications.find(
        {"user_id": user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    unread_count = len([n for n in notifications if not n.get("read", False)])
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: User = Depends(get_current_user)):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": user.user_id, "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}

@api_router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user: User = Depends(get_current_user)):
    """Delete a notification"""
    result = await db.notifications.delete_one(
        {"notification_id": notification_id, "user_id": user.user_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted"}

# ============== ANALYTICS ROUTES ==============

@api_router.get("/analytics/revenue")
async def get_revenue_analytics(user: User = Depends(get_current_user)):
    """Get revenue analytics for dashboard"""
    deals = await db.deals.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    
    total_pipeline = sum(d.get("value", 0) for d in deals)
    closed_won = [d for d in deals if d.get("stage") == "closed_won"]
    closed_revenue = sum(d.get("value", 0) for d in closed_won)
    
    stages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]
    stage_counts = {stage: 0 for stage in stages}
    stage_values = {stage: 0 for stage in stages}
    
    for deal in deals:
        stage = deal.get("stage", "lead")
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
        stage_values[stage] = stage_values.get(stage, 0) + deal.get("value", 0)
    
    win_rate = (len(closed_won) / max(len(deals), 1)) * 100
    avg_deal_size = total_pipeline / max(len(deals), 1)
    
    monthly_data = []
    for i in range(6):
        month_offset = 5 - i
        monthly_data.append({
            "month": (datetime.now(timezone.utc) - timedelta(days=30 * month_offset)).strftime("%b"),
            "revenue": closed_revenue * (0.6 + (i * 0.08)),
            "deals": max(1, len(closed_won) - month_offset),
            "forecast": closed_revenue * (0.7 + (i * 0.1))
        })
    
    return {
        "total_pipeline": round(total_pipeline, 2),
        "closed_revenue": round(closed_revenue, 2),
        "win_rate": round(win_rate, 1),
        "avg_deal_size": round(avg_deal_size, 2),
        "total_deals": len(deals),
        "stage_breakdown": [{"stage": s, "count": stage_counts[s], "value": round(stage_values[s], 2)} for s in stages],
        "monthly_data": monthly_data
    }

@api_router.get("/analytics/pipeline")
async def get_pipeline_analytics(user: User = Depends(get_current_user)):
    """Get pipeline analytics"""
    deals = await db.deals.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    
    stage_probabilities = {
        "lead": 10,
        "qualified": 25,
        "proposal": 50,
        "negotiation": 75,
        "closed_won": 100,
        "closed_lost": 0
    }
    
    weighted_pipeline = sum(
        d.get("value", 0) * (stage_probabilities.get(d.get("stage", "lead"), 10) / 100)
        for d in deals if d.get("stage") not in ["closed_won", "closed_lost"]
    )
    
    return {
        "weighted_pipeline": round(weighted_pipeline, 2),
        "deals_by_stage": {
            stage: [d for d in deals if d.get("stage") == stage]
            for stage in stage_probabilities.keys()
        }
    }

# ============== AI ROUTES ==============

@api_router.post("/ai/pricing-analysis")
async def analyze_pricing(
    analysis_request: PricingAnalysisRequest,
    user: User = Depends(get_current_user)
):
    """Get AI-powered pricing analysis"""
    if user.subscription_tier == "free":
        raise HTTPException(
            status_code=403, 
            detail="Upgrade to Pro or Enterprise for AI pricing analysis"
        )
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"pricing_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert pricing strategist and revenue optimization consultant. 
            Analyze pricing data and provide actionable recommendations. Be concise but thorough.
            Always include: 1) Optimal price recommendation, 2) Key reasoning, 3) Risk factors, 4) Implementation tips."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        
        avg_competitor = sum(analysis_request.competitor_prices) / max(len(analysis_request.competitor_prices), 1)
        
        prompt = f"""Analyze this pricing scenario and provide optimization recommendations:

Product: {analysis_request.product_name}
Current Price: ${analysis_request.current_price}
Competitor Prices: {', '.join([f'${p}' for p in analysis_request.competitor_prices])}
Average Competitor Price: ${avg_competitor:.2f}
Target Margin: {analysis_request.target_margin}%
Market Segment: {analysis_request.market_segment}

Provide:
1. Optimal price recommendation with specific number
2. Pricing strategy (penetration, premium, competitive)
3. Expected impact on revenue and market share
4. Key risks and mitigation strategies
5. A/B testing suggestions"""

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)
        
        price_diff = avg_competitor - analysis_request.current_price
        suggested_adjustment = min(max(price_diff * 0.3, -analysis_request.current_price * 0.15), analysis_request.current_price * 0.25)
        optimal_price = round(analysis_request.current_price + suggested_adjustment, 2)
        
        analysis = PricingAnalysis(
            user_id=user.user_id,
            product_name=analysis_request.product_name,
            current_price=analysis_request.current_price,
            competitor_prices=analysis_request.competitor_prices,
            target_margin=analysis_request.target_margin,
            market_segment=analysis_request.market_segment,
            ai_recommendation=ai_response,
            optimal_price=optimal_price
        )
        
        analysis_dict = analysis.model_dump()
        analysis_dict["created_at"] = analysis_dict["created_at"].isoformat()
        await db.pricing_analyses.insert_one(analysis_dict)
        
        return {
            "analysis_id": analysis.analysis_id,
            "optimal_price": optimal_price,
            "recommendation": ai_response,
            "competitor_average": round(avg_competitor, 2),
            "price_position": "below" if analysis_request.current_price < avg_competitor else "above"
        }
        
    except ImportError:
        raise HTTPException(status_code=500, detail="AI service not available")
    except Exception as e:
        logger.error(f"AI analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

@api_router.post("/ai/insights")
async def get_ai_insights(
    insight_request: AIInsightRequest,
    user: User = Depends(get_current_user)
):
    """Get AI insights for various contexts"""
    if user.subscription_tier == "free":
        raise HTTPException(
            status_code=403,
            detail="Upgrade to Pro or Enterprise for AI insights"
        )
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"insight_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert business intelligence analyst specializing in B2B SaaS.
            Provide concise, actionable insights. Use bullet points for clarity.
            Focus on revenue optimization, deal velocity, and pipeline health."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        
        data_context = ""
        if insight_request.data:
            data_context = f"\n\nRelevant data:\n{insight_request.data}"
        
        prompt = f"{insight_request.context}{data_context}\n\nProvide 3-5 key insights and recommended actions."
        
        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)
        
        return {"insight": ai_response}
        
    except Exception as e:
        logger.error(f"AI insight error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI insight failed: {str(e)}")

# ============== SUBSCRIPTION PLANS ==============

SUBSCRIPTION_PLANS = {
    "essential_monthly": {
        "price": 49.0,
        "name": "Essential",
        "period": "monthly",
        "deal_limit": 1000,
        "features": ["1,000 deals/month", "Core analytics", "Email support", "Pipeline view", "Churn alerts"]
    },
    "essential_yearly": {
        "price": 490.0,
        "name": "Essential",
        "period": "yearly",
        "deal_limit": 2500,
        "features": ["2,500 deals/year", "Core analytics", "Email support", "Pipeline view", "Churn alerts"]
    },
    "pro_monthly": {
        "price": 99.0,
        "name": "Pro",
        "period": "monthly",
        "deal_limit": 5000,
        "features": ["5,000 deals/month", "AI pricing insights", "Priority support", "Advanced analytics", "Revenue forecasting", "Churn prediction", "CRO tools"]
    },
    "pro_yearly": {
        "price": 990.0,
        "name": "Pro",
        "period": "yearly",
        "deal_limit": 12000,
        "features": ["12,000 deals/year", "AI pricing insights", "Priority support", "Advanced analytics", "Revenue forecasting", "Churn prediction", "CRO tools"]
    },
    "enterprise_monthly": {
        "price": 179.0,
        "name": "Enterprise",
        "period": "monthly",
        "deal_limit": 12000,
        "features": ["12,000 deals/month", "Everything in Pro", "Custom integrations", "API access", "Advanced churn analytics", "Request for Quote"]
    },
    "enterprise_yearly": {
        "price": 1799.0,
        "name": "Enterprise",
        "period": "yearly",
        "deal_limit": 30000,
        "features": ["30,000 deals/year", "Everything in Pro", "Custom integrations", "API access", "Advanced churn analytics", "Request for Quote"]
    }
}

def get_user_deal_limit(subscription_tier: str) -> int:
    """Get deal limit based on subscription tier"""
    limits = {
        "essential_monthly": 1000,
        "essential_yearly": 2500,
        "pro_monthly": 5000,
        "pro_yearly": 12000,
        "enterprise_monthly": 12000,
        "enterprise_yearly": 30000,
        "free": 50  # Legacy free tier limit
    }
    return limits.get(subscription_tier, 50)

@api_router.post("/payments/create-checkout")
async def create_checkout_session(
    request: Request,
    user: User = Depends(get_current_user)
):
    """Create Stripe checkout session"""
    try:
        from emergentintegrations.payments.stripe.checkout import (
            StripeCheckout, CheckoutSessionRequest
        )
        
        data = await request.json()
        plan = data.get("plan", "pro_monthly")
        origin_url = data.get("origin_url")
        
        if not origin_url:
            raise HTTPException(status_code=400, detail="origin_url required")
        
        if plan not in SUBSCRIPTION_PLANS:
            raise HTTPException(status_code=400, detail="Invalid plan")
        
        amount = SUBSCRIPTION_PLANS[plan]["price"]
        
        api_key = os.environ.get("STRIPE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Payment service not configured")
        
        host_url = str(request.base_url).rstrip("/")
        webhook_url = f"{host_url}/api/webhook/stripe"
        
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
        
        success_url = f"{origin_url}/settings?session_id={{CHECKOUT_SESSION_ID}}&success=true"
        cancel_url = f"{origin_url}/settings?cancelled=true"
        
        checkout_request = CheckoutSessionRequest(
            amount=float(amount),
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "user_id": user.user_id,
                "plan": plan,
                "user_email": user.email
            }
        )
        
        session = await stripe_checkout.create_checkout_session(checkout_request)
        
        transaction = PaymentTransaction(
            user_id=user.user_id,
            session_id=session.session_id,
            amount=amount,
            currency="usd",
            plan=plan,
            payment_status="pending",
            metadata={"plan": plan}
        )
        
        txn_dict = transaction.model_dump()
        txn_dict["created_at"] = txn_dict["created_at"].isoformat()
        txn_dict["updated_at"] = txn_dict["updated_at"].isoformat()
        await db.payment_transactions.insert_one(txn_dict)
        
        return {"url": session.url, "session_id": session.session_id}
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Payment service not available")
    except Exception as e:
        logger.error(f"Checkout error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, request: Request, user: User = Depends(get_current_user)):
    """Get payment status and update subscription"""
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        
        api_key = os.environ.get("STRIPE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Payment service not configured")
        
        host_url = str(request.base_url).rstrip("/")
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=f"{host_url}/api/webhook/stripe")
        
        status = await stripe_checkout.get_checkout_status(session_id)
        
        transaction = await db.payment_transactions.find_one(
            {"session_id": session_id, "user_id": user.user_id},
            {"_id": 0}
        )
        
        if transaction and status.payment_status == "paid" and transaction.get("payment_status") != "paid":
            plan = transaction.get("plan", "pro")
            
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "payment_status": "paid",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {
                    "subscription_tier": plan,
                    "subscription_status": "active",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        
        return {
            "status": status.status,
            "payment_status": status.payment_status,
            "amount": status.amount_total / 100,
            "currency": status.currency
        }
        
    except Exception as e:
        logger.error(f"Payment status error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        
        body = await request.body()
        signature = request.headers.get("Stripe-Signature")
        
        api_key = os.environ.get("STRIPE_API_KEY")
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
        
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            metadata = webhook_response.metadata
            
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "payment_status": "paid",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            if metadata and "user_id" in metadata:
                await db.users.update_one(
                    {"user_id": metadata["user_id"]},
                    {"$set": {
                        "subscription_tier": metadata.get("plan", "pro"),
                        "subscription_status": "active"
                    }}
                )
        
        return {"received": True}
        
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return {"received": True}

@api_router.get("/subscription/plans")
async def get_subscription_plans():
    """Get available subscription plans"""
    return SUBSCRIPTION_PLANS

# ============== CHURN & RETENTION ROUTES ==============

@api_router.get("/analytics/churn")
async def get_churn_analytics(user: User = Depends(get_current_user)):
    """Get churn and retention analytics"""
    deals = await db.deals.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    
    total_deals = len(deals)
    closed_won = len([d for d in deals if d.get("stage") == "closed_won"])
    closed_lost = len([d for d in deals if d.get("stage") == "closed_lost"])
    
    # Calculate churn metrics
    churn_rate = (closed_lost / max(total_deals, 1)) * 100
    retention_rate = 100 - churn_rate
    
    # Simulated monthly churn data
    monthly_churn = []
    for i in range(6):
        month_offset = 5 - i
        base_churn = 5 + (i * 0.5)
        monthly_churn.append({
            "month": (datetime.now(timezone.utc) - timedelta(days=30 * month_offset)).strftime("%b"),
            "churn_rate": round(base_churn + (closed_lost * 0.1), 1),
            "retention_rate": round(100 - base_churn - (closed_lost * 0.1), 1),
            "at_risk": max(2, closed_lost - month_offset),
            "churned": max(1, int(closed_lost * 0.3) - month_offset)
        })
    
    # At-risk deals (in negotiation with low probability)
    at_risk_deals = [d for d in deals if d.get("stage") == "negotiation" and d.get("probability", 50) < 40]
    
    # Cohort analysis (simulated)
    cohorts = [
        {"cohort": "Jan 2026", "month_0": 100, "month_1": 92, "month_2": 85, "month_3": 80},
        {"cohort": "Dec 2025", "month_0": 100, "month_1": 88, "month_2": 82, "month_3": 78},
        {"cohort": "Nov 2025", "month_0": 100, "month_1": 90, "month_2": 84, "month_3": 79},
    ]
    
    return {
        "churn_rate": round(churn_rate, 1),
        "retention_rate": round(retention_rate, 1),
        "total_customers": total_deals,
        "at_risk_count": len(at_risk_deals),
        "churned_count": closed_lost,
        "monthly_data": monthly_churn,
        "at_risk_deals": at_risk_deals[:5],
        "cohorts": cohorts,
        "health_score": round(min(100, retention_rate + 10), 0)
    }

@api_router.post("/ai/churn-prediction")
async def predict_churn(
    request: Request,
    user: User = Depends(get_current_user)
):
    """Get AI-powered churn predictions"""
    if user.subscription_tier in ["free", "essential_monthly", "essential_yearly"]:
        raise HTTPException(
            status_code=403,
            detail="Upgrade to Pro or Priority for AI churn prediction"
        )
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        data = await request.json()
        deal_data = data.get("deal_data", {})
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"churn_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert customer success analyst specializing in B2B SaaS churn prediction.
            Analyze customer data and provide actionable retention strategies. Be concise and data-driven.
            Focus on: 1) Churn risk score (0-100), 2) Key risk factors, 3) Recommended actions, 4) Timeline."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        
        prompt = f"""Analyze this customer/deal for churn risk:
{deal_data}

Provide:
1. Churn risk score (0-100) with reasoning
2. Top 3 risk factors
3. Recommended retention actions
4. Urgency level and timeline"""

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)
        
        return {"prediction": ai_response}
        
    except Exception as e:
        logger.error(f"Churn prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== CONVERSION RATE OPTIMIZATION ROUTES ==============

@api_router.get("/analytics/cro")
async def get_cro_analytics(user: User = Depends(get_current_user)):
    """Get conversion rate optimization analytics"""
    deals = await db.deals.find({"user_id": user.user_id}, {"_id": 0}).to_list(1000)
    
    stages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]
    stage_counts = {stage: len([d for d in deals if d.get("stage") == stage]) for stage in stages}
    
    # Calculate conversion rates between stages
    funnel_data = []
    total_leads = stage_counts.get("lead", 0) + stage_counts.get("qualified", 0) + stage_counts.get("proposal", 0) + stage_counts.get("negotiation", 0) + stage_counts.get("closed_won", 0)
    
    running_total = total_leads
    for i, stage in enumerate(["lead", "qualified", "proposal", "negotiation", "closed_won"]):
        count = stage_counts.get(stage, 0)
        if i > 0:
            running_total -= stage_counts.get(stages[i-1], 0)
        conversion = (running_total / max(total_leads, 1)) * 100
        funnel_data.append({
            "stage": stage.replace("_", " ").title(),
            "count": count if stage != "closed_won" else stage_counts.get("closed_won", 0),
            "conversion": round(conversion, 1),
            "drop_off": round(100 - conversion, 1) if i > 0 else 0
        })
    
    # Stage conversion rates
    stage_conversions = []
    prev_count = total_leads
    for i, stage in enumerate(stages[:-1]):  # Exclude closed_lost
        current_count = sum(stage_counts.get(s, 0) for s in stages[i:] if s != "closed_lost")
        rate = (current_count / max(prev_count, 1)) * 100 if i > 0 else 100
        stage_conversions.append({
            "from_stage": stages[i-1].replace("_", " ").title() if i > 0 else "Entry",
            "to_stage": stage.replace("_", " ").title(),
            "rate": round(rate, 1)
        })
        prev_count = current_count
    
    # A/B test suggestions (simulated)
    ab_tests = [
        {"name": "Proposal Template A vs B", "status": "running", "improvement": "+12%", "confidence": 87},
        {"name": "Follow-up Timing", "status": "completed", "improvement": "+8%", "confidence": 95},
        {"name": "Pricing Display", "status": "planned", "improvement": "TBD", "confidence": 0}
    ]
    
    # Bottleneck analysis
    bottlenecks = []
    for i in range(len(stages) - 2):
        current = stage_counts.get(stages[i], 0)
        next_stage = stage_counts.get(stages[i+1], 0)
        if current > 0:
            drop_rate = ((current - next_stage) / current) * 100
            if drop_rate > 30:
                bottlenecks.append({
                    "stage": stages[i].replace("_", " ").title(),
                    "drop_rate": round(drop_rate, 1),
                    "severity": "high" if drop_rate > 50 else "medium"
                })
    
    return {
        "overall_conversion": round((stage_counts.get("closed_won", 0) / max(total_leads, 1)) * 100, 1),
        "funnel_data": funnel_data,
        "stage_conversions": stage_conversions,
        "ab_tests": ab_tests,
        "bottlenecks": bottlenecks,
        "total_opportunities": total_leads,
        "won_deals": stage_counts.get("closed_won", 0),
        "avg_cycle_days": 28  # Simulated
    }

@api_router.post("/ai/cro-recommendations")
async def get_cro_recommendations(
    request: Request,
    user: User = Depends(get_current_user)
):
    """Get AI-powered CRO recommendations"""
    if user.subscription_tier in ["free", "essential_monthly", "essential_yearly"]:
        raise HTTPException(
            status_code=403,
            detail="Upgrade to Pro or Priority for AI CRO recommendations"
        )
    
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")
        
        data = await request.json()
        funnel_data = data.get("funnel_data", {})
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"cro_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert conversion rate optimization specialist for B2B SaaS.
            Analyze funnel data and provide actionable recommendations to improve conversion rates.
            Focus on: 1) Quick wins, 2) High-impact changes, 3) A/B test ideas, 4) Process improvements."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        
        prompt = f"""Analyze this sales funnel data and provide CRO recommendations:
{funnel_data}

Provide:
1. Top 3 quick wins to improve conversion
2. Biggest bottleneck and how to fix it
3. A/B test recommendations
4. Process improvements for each stage"""

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)
        
        return {"recommendations": ai_response}
        
    except Exception as e:
        logger.error(f"CRO recommendation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============== INTEGRATIONS ==============

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
        "description": "Connect Vector to 5,000+ apps through Zapier automations",
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

@api_router.get("/integrations")
async def get_integrations(current_user: User = Depends(get_current_user)):
    """Get all integrations with user's connection status"""
    user_integrations = await db.integrations.find(
        {"user_id": current_user.user_id},
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

@api_router.post("/integrations/{integration_id}/connect")
async def connect_integration(integration_id: str, current_user: User = Depends(get_current_user)):
    """Connect an integration for the user"""
    valid_ids = [i["integration_id"] for i in AVAILABLE_INTEGRATIONS]
    if integration_id not in valid_ids:
        raise HTTPException(status_code=404, detail="Integration not found")

    existing = await db.integrations.find_one(
        {"user_id": current_user.user_id, "integration_id": integration_id},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Integration already connected")

    doc = {
        "user_id": current_user.user_id,
        "integration_id": integration_id,
        "connected_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.integrations.insert_one(doc)
    return {"status": "connected", "integration_id": integration_id}

@api_router.post("/integrations/{integration_id}/disconnect")
async def disconnect_integration(integration_id: str, current_user: User = Depends(get_current_user)):
    """Disconnect an integration for the user"""
    result = await db.integrations.delete_one(
        {"user_id": current_user.user_id, "integration_id": integration_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Integration not found or not connected")
    return {"status": "disconnected", "integration_id": integration_id}

# ============== BASIC ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "Vector API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
