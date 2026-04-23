from fastapi import APIRouter, HTTPException, Request, Depends
from datetime import datetime, timezone
import os
import logging
import stripe as stripe_sdk

from database import db
from models import User, PaymentTransaction
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

SUBSCRIPTION_PLANS = {
    "essential_monthly": {
        "price": 299.0, "name": "Essential", "period": "monthly",
        "deal_limit": 1500, "interval": "month",
        "features": ["1,500 usages/month", "Sales Pipeline", "Core analytics", "Email support", "Churn alerts"]
    },
    "essential_yearly": {
        "price": 2512.0, "name": "Essential", "period": "yearly",
        "deal_limit": 3000, "interval": "year",
        "renewal_price": 3588.0, "first_year_discount": True,
        "features": ["3,000 usages/year", "Sales Pipeline", "Core analytics", "Email support", "Churn alerts"]
    },
    "pro_monthly": {
        "price": 699.0, "name": "Pro", "period": "monthly",
        "deal_limit": 7500, "interval": "month",
        "features": ["7,500 usages/month", "Sales Performance", "Priority support", "Advanced analytics", "Revenue forecasting", "Churn prediction", "CRO tools"]
    },
    "pro_yearly": {
        "price": 5872.0, "name": "Pro", "period": "yearly",
        "deal_limit": 15000, "interval": "year",
        "renewal_price": 8388.0, "first_year_discount": True,
        "features": ["15,000 usages/year", "Sales Performance", "Priority support", "Advanced analytics", "Revenue forecasting", "Churn prediction", "CRO tools"]
    },
    "enterprise_monthly": {
        "price": 260.0, "name": "Enterprise", "period": "monthly",
        "deal_limit": 20000, "interval": "month",
        "per_user": True,
        "features": ["20,000 usages/month", "Everything in Pro", "Sales Revenue", "Revenue Intelligence", "Custom integrations", "API access"]
    },
    "enterprise_yearly": {
        "price": 2184.0, "name": "Enterprise", "period": "yearly",
        "deal_limit": 40000, "interval": "year",
        "renewal_price": 3120.0, "first_year_discount": True,
        "per_user": True,
        "features": ["40,000 usages/year", "Everything in Pro", "Sales Revenue", "Revenue Intelligence", "Custom integrations", "API access"]
    }
}

# Cache for Stripe Price IDs (created on demand)
_stripe_price_cache = {}


def is_real_stripe_key(key: str) -> bool:
    return key and (key.startswith("sk_live_") or key.startswith("sk_test_")) and key != "sk_test_emergent"


async def get_or_create_stripe_price(plan_key: str, plan: dict) -> str:
    """Get or create a Stripe Price for subscription billing."""
    if plan_key in _stripe_price_cache:
        return _stripe_price_cache[plan_key]

    # Check DB cache
    cached = await db.stripe_prices.find_one({"plan_key": plan_key}, {"_id": 0})
    if cached:
        _stripe_price_cache[plan_key] = cached["price_id"]
        return cached["price_id"]

    # Create Stripe Product + Price
    product = stripe_sdk.Product.create(
        name=f"InFlow {plan['name']} ({plan['period'].title()})",
        metadata={"plan_key": plan_key}
    )

    amount_cents = int(plan["price"] * 100)
    interval = plan.get("interval", "month")

    price = stripe_sdk.Price.create(
        product=product.id,
        unit_amount=amount_cents,
        currency="usd",
        recurring={"interval": interval}
    )

    # Cache it
    await db.stripe_prices.insert_one({
        "plan_key": plan_key,
        "price_id": price.id,
        "product_id": product.id,
        "amount": plan["price"],
        "interval": interval,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    _stripe_price_cache[plan_key] = price.id
    return price.id


async def get_or_create_coupon() -> str:
    """Get or create a 30% first-year discount coupon."""
    cached = await db.stripe_coupons.find_one({"name": "first_year_30"}, {"_id": 0})
    if cached:
        return cached["coupon_id"]

    coupon = stripe_sdk.Coupon.create(
        percent_off=30,
        duration="once",
        name="30% Off First Year"
    )

    await db.stripe_coupons.insert_one({
        "name": "first_year_30",
        "coupon_id": coupon.id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return coupon.id


async def create_subscription_checkout(plan_key: str, plan: dict, user: User, origin_url: str, quantity: int = 1):
    """Create a Stripe Checkout Session in subscription mode."""
    price_id = await get_or_create_stripe_price(plan_key, plan)

    success_url = f"{origin_url}/settings?session_id={{CHECKOUT_SESSION_ID}}&success=true"
    cancel_url = f"{origin_url}/settings?cancelled=true"

    session_params = {
        "mode": "subscription",
        "line_items": [{"price": price_id, "quantity": quantity}],
        "success_url": success_url,
        "cancel_url": cancel_url,
        "customer_email": user.email,
        "subscription_data": {
            "trial_period_days": 14,
            "metadata": {
                "user_id": user.user_id,
                "plan": plan_key,
                "quantity": str(quantity),
            }
        },
        "metadata": {
            "user_id": user.user_id,
            "plan": plan_key,
            "user_email": user.email,
            "quantity": str(quantity)
        }
    }

    # Apply 30% coupon for yearly first-year discount
    if plan.get("first_year_discount"):
        coupon_id = await get_or_create_coupon()
        session_params["discounts"] = [{"coupon": coupon_id}]

    session = stripe_sdk.checkout.Session.create(**session_params)
    return session


async def create_onetime_checkout(plan_key: str, plan: dict, user: User, origin_url: str, request: Request, amount: float = None):
    """Fallback: one-time checkout via emergentintegrations for test key."""
    from emergentintegrations.payments.stripe.checkout import (
        StripeCheckout, CheckoutSessionRequest
    )

    api_key = os.environ.get("STRIPE_API_KEY")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"

    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)

    success_url = f"{origin_url}/settings?session_id={{CHECKOUT_SESSION_ID}}&success=true"
    cancel_url = f"{origin_url}/settings?cancelled=true"

    checkout_request = CheckoutSessionRequest(
        amount=float(amount if amount is not None else plan["price"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user.user_id,
            "plan": plan_key,
            "user_email": user.email
        }
    )

    session = await stripe_checkout.create_checkout_session(checkout_request)
    return session


@router.post("/payments/create-checkout")
async def create_checkout_session(request: Request, user: User = Depends(get_current_user)):
    """Create Stripe checkout session — subscription mode for real keys, one-time for test."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    plan_key = data.get("plan", "pro_monthly")
    origin_url = data.get("origin_url")
    users = int(data.get("users", 1))
    if users < 1:
        users = 1

    if not origin_url:
        raise HTTPException(status_code=400, detail="origin_url required")
    if plan_key not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan = SUBSCRIPTION_PLANS[plan_key]
    is_per_user = plan.get("per_user", False)
    quantity = users if is_per_user else 1
    final_price = plan["price"] * quantity

    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    try:
        if is_real_stripe_key(api_key):
            stripe_sdk.api_key = api_key
            session = await create_subscription_checkout(plan_key, plan, user, origin_url, quantity=quantity)
            session_id = session.id
            session_url = session.url
            mode = "subscription"
        else:
            session = await create_onetime_checkout(plan_key, plan, user, origin_url, request, amount=final_price)
            session_id = session.session_id
            session_url = session.url
            mode = "one_time"

        txn = PaymentTransaction(
            user_id=user.user_id,
            session_id=session_id,
            amount=final_price,
            currency="usd",
            plan=plan_key,
            payment_status="pending",
            metadata={"plan": plan_key, "mode": mode, "quantity": str(quantity)}
        )
        txn_dict = txn.model_dump()
        txn_dict["created_at"] = txn_dict["created_at"].isoformat()
        txn_dict["updated_at"] = txn_dict["updated_at"].isoformat()
        await db.payment_transactions.insert_one(txn_dict)

        return {"url": session_url, "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Checkout error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Payment failed: {str(e)}")


@router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, request: Request, user: User = Depends(get_current_user)):
    """Get payment status and update subscription."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    try:
        transaction = await db.payment_transactions.find_one(
            {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
        )
        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found")

        if is_real_stripe_key(api_key):
            stripe_sdk.api_key = api_key
            session = stripe_sdk.checkout.Session.retrieve(session_id)
            payment_status = "paid" if session.payment_status == "paid" or session.status == "complete" else session.payment_status
            status = session.status
            amount = (session.amount_total or 0) / 100
            currency = session.currency or "usd"
            subscription_id = session.subscription
        else:
            from emergentintegrations.payments.stripe.checkout import StripeCheckout
            host_url = str(request.base_url).rstrip("/")
            sc = StripeCheckout(api_key=api_key, webhook_url=f"{host_url}/api/webhook/stripe")
            st = await sc.get_checkout_status(session_id)
            payment_status = st.payment_status
            status = st.status
            amount = st.amount_total / 100
            currency = st.currency
            subscription_id = None

        if payment_status == "paid" and transaction.get("payment_status") != "paid":
            plan = transaction.get("plan", "pro_monthly")
            update_fields = {
                "payment_status": "paid",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            if subscription_id:
                update_fields["stripe_subscription_id"] = subscription_id

            await db.payment_transactions.update_one(
                {"session_id": session_id}, {"$set": update_fields}
            )

            user_update = {
                "subscription_tier": plan,
                "subscription_status": "active",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            if subscription_id:
                user_update["stripe_subscription_id"] = subscription_id

            await db.users.update_one(
                {"user_id": user.user_id}, {"$set": user_update}
            )

        return {
            "status": status,
            "payment_status": payment_status,
            "amount": amount,
            "currency": currency
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Payment status error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks for subscription lifecycle."""
    try:
        body = await request.body()
        api_key = os.environ.get("STRIPE_API_KEY")

        if is_real_stripe_key(api_key):
            # Parse event (signature verification would need webhook secret in production)
            import json
            event = json.loads(body)
            event_type = event.get("type", "")
            data_obj = event.get("data", {}).get("object", {})

            if event_type == "checkout.session.completed":
                session_id = data_obj.get("id")
                metadata = data_obj.get("metadata", {})
                subscription_id = data_obj.get("subscription")

                update_fields = {
                    "payment_status": "paid",
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                if subscription_id:
                    update_fields["stripe_subscription_id"] = subscription_id

                await db.payment_transactions.update_one(
                    {"session_id": session_id}, {"$set": update_fields}
                )

                if metadata.get("user_id"):
                    user_update = {
                        "subscription_tier": metadata.get("plan", "pro_monthly"),
                        "subscription_status": "active"
                    }
                    if subscription_id:
                        user_update["stripe_subscription_id"] = subscription_id

                    await db.users.update_one(
                        {"user_id": metadata["user_id"]}, {"$set": user_update}
                    )

            elif event_type == "customer.subscription.deleted":
                sub_id = data_obj.get("id")
                user_doc = await db.users.find_one(
                    {"stripe_subscription_id": sub_id}, {"_id": 0, "user_id": 1, "subscription_tier": 1}
                )
                if user_doc:
                    await db.users.update_one(
                        {"user_id": user_doc["user_id"]},
                        {"$set": {
                            "subscription_status": "cancelled",
                            "previous_tier": user_doc.get("subscription_tier"),
                            "subscription_tier": "cancelled",
                            "cancelled_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )

            elif event_type == "invoice.payment_failed":
                sub_id = data_obj.get("subscription")
                if sub_id:
                    user_doc = await db.users.find_one(
                        {"stripe_subscription_id": sub_id}, {"_id": 0, "user_id": 1}
                    )
                    if user_doc:
                        await db.users.update_one(
                            {"user_id": user_doc["user_id"]},
                            {"$set": {"subscription_status": "past_due"}}
                        )

        else:
            from emergentintegrations.payments.stripe.checkout import StripeCheckout
            signature = request.headers.get("Stripe-Signature")
            sc = StripeCheckout(api_key=api_key, webhook_url="")
            webhook_response = await sc.handle_webhook(body, signature)

            if webhook_response.payment_status == "paid":
                session_id = webhook_response.session_id
                metadata = webhook_response.metadata

                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc).isoformat()}}
                )

                if metadata and "user_id" in metadata:
                    await db.users.update_one(
                        {"user_id": metadata["user_id"]},
                        {"$set": {
                            "subscription_tier": metadata.get("plan", "pro_monthly"),
                            "subscription_status": "active"
                        }}
                    )

        return {"received": True}

    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return {"received": True}


@router.get("/subscription/plans")
async def get_subscription_plans():
    """Get available subscription plans."""
    return SUBSCRIPTION_PLANS


@router.post("/subscription/cancel")
async def cancel_subscription(current_user: User = Depends(get_current_user)):
    """Cancel the current subscription."""
    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "subscription_tier": 1, "stripe_subscription_id": 1}
    )

    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    tier = user_doc.get("subscription_tier", "trial")
    if tier in ("expired", "cancelled"):
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    api_key = os.environ.get("STRIPE_API_KEY")
    sub_id = user_doc.get("stripe_subscription_id")

    # Cancel on Stripe if real subscription exists
    if sub_id and api_key and is_real_stripe_key(api_key):
        try:
            stripe_sdk.api_key = api_key
            stripe_sdk.Subscription.cancel(sub_id)
        except Exception as e:
            logger.error(f"Stripe cancel error: {e}")

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
