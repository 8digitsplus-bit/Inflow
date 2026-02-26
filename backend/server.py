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

# ============== STRIPE PAYMENT ROUTES ==============

SUBSCRIPTION_PLANS = {
    "free": {"price": 0.0, "name": "Free", "features": ["5 deals", "Basic analytics", "Email support"]},
    "pro": {"price": 49.0, "name": "Pro", "features": ["Unlimited deals", "AI insights", "Priority support", "Advanced analytics"]},
    "enterprise": {"price": 199.0, "name": "Enterprise", "features": ["Everything in Pro", "Custom integrations", "Dedicated account manager", "SLA"]}
}

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
        plan = data.get("plan", "pro")
        origin_url = data.get("origin_url")
        
        if not origin_url:
            raise HTTPException(status_code=400, detail="origin_url required")
        
        if plan not in SUBSCRIPTION_PLANS or plan == "free":
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
async def get_payment_status(session_id: str, user: User = Depends(get_current_user)):
    """Get payment status and update subscription"""
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        
        api_key = os.environ.get("STRIPE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Payment service not configured")
        
        host_url = "https://example.com"
        stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=f"{host_url}/webhook")
        
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
