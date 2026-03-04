from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    subscription_tier: str = "free"
    subscription_status: str = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    notification_id: str = Field(default_factory=lambda: f"notif_{uuid.uuid4().hex[:12]}")
    user_id: str
    type: str
    title: str
    message: str
    deal_id: Optional[str] = None
    read: bool = False
    priority: str = "medium"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Deal(BaseModel):
    model_config = ConfigDict(extra="ignore")
    deal_id: str = Field(default_factory=lambda: f"deal_{uuid.uuid4().hex[:12]}")
    user_id: str
    name: str
    company: str
    value: float
    stage: str = "lead"
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


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class OnboardingData(BaseModel):
    company_name: str
    team_size: str
    industry: str
    goals: List[str]
