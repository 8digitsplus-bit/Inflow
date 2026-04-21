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
        "price": 59.0,
        "name": "Essential",
        "period": "monthly",
        "deal_limit": 1500,
        "features": ["1,500 usages/month", "Sales Pipeline", "Core analytics", "Email support", "Churn alerts"]
    },
    "essential_yearly": {
        "price": 664.0,
        "name": "Essential",
        "period": "yearly",
        "deal_limit": 3000,
        "first_year_discount": True,
        "original_price": 948.0,
        "features": ["3,000 usages/year", "Sales Pipeline", "Core analytics", "Email support", "Churn alerts"]
    },
    "pro_monthly": {
        "price": 149.0,
        "name": "Pro",
        "period": "monthly",
        "deal_limit": 7500,
        "features": ["7,500 usages/month", "Sales Performance", "Priority support", "Advanced analytics", "Revenue forecasting", "Churn prediction", "CRO tools"]
    },
    "pro_yearly": {
        "price": 2092.0,
        "name": "Pro",
        "period": "yearly",
        "deal_limit": 15000,
        "first_year_discount": True,
        "original_price": 2988.0,
        "features": ["15,000 usages/year", "Sales Performance", "Priority support", "Advanced analytics", "Revenue forecasting", "Churn prediction", "CRO tools"]
    },
    "enterprise_monthly": {
        "price": 249.0,
        "name": "Enterprise",
        "period": "monthly",
        "deal_limit": 20000,
        "features": ["20,000 usages/month", "Everything in Pro", "Sales Revenue", "Revenue Intelligence", "Custom integrations", "API access"]
    },
    "enterprise_yearly": {
        "price": 4200.0,
        "name": "Enterprise",
        "period": "yearly",
        "deal_limit": 40000,
        "first_year_discount": True,
        "original_price": 6000.0,
        "features": ["40,000 usages/year", "Everything in Pro", "Sales Revenue", "Revenue Intelligence", "Custom integrations", "API access"]
    }
}


def get_user_deal_limit(subscription_tier: str) -> int:
    """Get deal limit based on subscription tier"""
    limits = {
        "essential_monthly": 1500,
        "essential_yearly": 3000,
        "pro_monthly": 7500,
        "pro_yearly": 15000,
        "enterprise_monthly": 20000,
        "enterprise_yearly": 40000,
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

        try:
            data = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid request body")
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


@router.post("/subscription/cancel")
async def cancel_subscription(current_user: User = Depends(get_current_user)):
    """Cancel the current subscription or trial."""
    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "subscription_tier": 1}
    )

    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    tier = user_doc.get("subscription_tier", "trial")

    if tier in ("expired", "cancelled"):
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    now = datetime.now(timezone.utc).isoformat()

    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {
            "subscription_tier": "cancelled",
            "previous_tier": tier,
            "cancelled_at": now,
            "subscription_status": "cancelled",
        }}
    )

    return {
        "status": "cancelled",
        "previous_tier": tier,
        "message": "Your subscription has been cancelled. You can resubscribe at any time.",
    }
