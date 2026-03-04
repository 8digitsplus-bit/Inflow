from fastapi import APIRouter, HTTPException, Request, Depends
from datetime import datetime, timezone
import os
import logging

from database import db
from models import User, PaymentTransaction
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

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
        "free": 50
    }
    return limits.get(subscription_tier, 50)


@router.post("/payments/create-checkout")
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


@router.get("/payments/status/{session_id}")
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


@router.post("/webhook/stripe")
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


@router.get("/subscription/plans")
async def get_subscription_plans():
    """Get available subscription plans"""
    return SUBSCRIPTION_PLANS
