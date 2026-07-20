from fastapi import APIRouter, HTTPException, Request, Depends
from datetime import datetime, timezone
import os
import logging
import stripe as stripe_sdk

from database import db
from models import User, PaymentTransaction
from dependencies import get_current_user, require_owner

logger = logging.getLogger(__name__)

router = APIRouter()

SUBSCRIPTION_PLANS = {
    "essential_monthly": {
        "price": 99.0, "name": "Essential", "period": "monthly",
        "interval": "month",
        "features": ["Sales Pipeline", "Core analytics", "2 live integrations", "Churn monitoring", "Email support"]
    },
    "essential_yearly": {
        "price": 830.0, "name": "Essential", "period": "yearly",
        "interval": "year",
        "features": ["Sales Pipeline", "Core analytics", "2 live integrations", "Churn monitoring", "Email support"]
    },
    "pro_monthly": {
        "price": 149.0, "name": "Pro", "period": "monthly",
        "interval": "month",
        "features": ["4 live integrations", "CSV import", "AI insights", "CRO analysis", "Revenue forecasting", "Priority support"]
    },
    "pro_yearly": {
        "price": 1250.0, "name": "Pro", "period": "yearly",
        "interval": "year",
        "features": ["4 live integrations", "CSV import", "AI insights", "CRO analysis", "Revenue forecasting", "Priority support"]
    },
    "enterprise_monthly": {
        "price": 50.0, "name": "InFlow", "period": "monthly",
        "interval": "month", "tiered": True,
        "features": ["All features included", "Unlimited integrations", "AI insights & forecasting", "Competitor Intelligence", "Smart Assist AI", "Priority support"]
    },
    "enterprise_yearly": {
        "price": 500.0, "name": "InFlow", "period": "yearly",
        "interval": "year", "tiered": True,
        "features": ["All features included", "Unlimited integrations", "AI insights & forecasting", "Competitor Intelligence", "Smart Assist AI", "Priority support"]
    }
}

# Usage-based (value-metric) pricing. The self-serve plan is billed by the number
# of deals tracked, chosen via a slider: $50 base (first 1,000) + $21 per additional
# 1,000, range 1k-20k. Yearly = 10x monthly (2 months free). Above 20k => Contact us.
# Implemented in Stripe as a GRADUATED tiered price; the subscription line-item
# quantity = number of 1,000-deal blocks. Internally the plan uses the top tier
# ("enterprise_*") so a paying customer unlocks all features.
USAGE_PRICING = {
    "unit_size": 1000,
    "min_units": 1,
    "max_units": 20,
    "monthly": {"base_cents": 5000, "per_unit_cents": 2100},
    "yearly": {"base_cents": 50000, "per_unit_cents": 21000},
}


def _clamp_units(units) -> int:
    try:
        u = int(units)
    except (TypeError, ValueError):
        u = USAGE_PRICING["min_units"]
    return max(USAGE_PRICING["min_units"], min(USAGE_PRICING["max_units"], u))


def compute_usage_amount(units, period: str) -> float:
    cfg = USAGE_PRICING["yearly" if period == "yearly" else "monthly"]
    u = _clamp_units(units)
    return round((cfg["base_cents"] + cfg["per_unit_cents"] * (u - 1)) / 100.0, 2)


def _volume_fields(quantity) -> dict:
    q = _clamp_units(quantity)
    return {"volume_units": q, "deal_limit": q * USAGE_PRICING["unit_size"]}

# Cache for Stripe Price IDs (created on demand)
_stripe_price_cache = {}


def is_real_stripe_key(key: str) -> bool:
    return key and (key.startswith("sk_live_") or key.startswith("sk_test_")) and key != "sk_test_emergent"


async def get_or_create_stripe_price(plan_key: str, plan: dict) -> str:
    """Get or create a Stripe Price for subscription billing.

    Signature-aware: if the plan's amount (or tier config) changes, a NEW Stripe
    Price is created instead of reusing a stale cached one. Supports flat prices
    (legacy) and GRADUATED tiered prices (usage/value-metric plans).
    """
    interval = plan.get("interval", "month")
    if plan.get("tiered"):
        period = "yearly" if interval == "year" else "monthly"
        cfg = USAGE_PRICING[period]
        signature = f"tiered:{cfg['base_cents']}:{cfg['per_unit_cents']}:{interval}"
    else:
        signature = f"flat:{int(plan['price'] * 100)}:{interval}"

    mem = _stripe_price_cache.get(plan_key)
    if mem and mem.get("signature") == signature:
        return mem["price_id"]

    cached = await db.stripe_prices.find_one({"plan_key": plan_key}, {"_id": 0})
    if cached and cached.get("signature") == signature:
        _stripe_price_cache[plan_key] = {"price_id": cached["price_id"], "signature": signature}
        return cached["price_id"]

    product = stripe_sdk.Product.create(
        name=f"InFlow {plan['name']} ({plan['period'].title()})",
        metadata={"plan_key": plan_key}
    )

    if plan.get("tiered"):
        period = "yearly" if interval == "year" else "monthly"
        cfg = USAGE_PRICING[period]
        price = stripe_sdk.Price.create(
            product=product.id,
            currency="usd",
            recurring={"interval": interval},
            billing_scheme="tiered",
            tiers_mode="graduated",
            tiers=[
                {"up_to": 1, "flat_amount": cfg["base_cents"]},
                {"up_to": "inf", "unit_amount": cfg["per_unit_cents"]},
            ],
        )
    else:
        price = stripe_sdk.Price.create(
            product=product.id,
            unit_amount=int(plan["price"] * 100),
            currency="usd",
            recurring={"interval": interval}
        )

    await db.stripe_prices.update_one(
        {"plan_key": plan_key},
        {"$set": {
            "plan_key": plan_key,
            "price_id": price.id,
            "product_id": product.id,
            "signature": signature,
            "interval": interval,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    _stripe_price_cache[plan_key] = {"price_id": price.id, "signature": signature}
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


async def create_subscription_checkout(plan_key: str, plan: dict, user: User, origin_url: str, use_trial: bool = True, quantity: int = 1):
    """Create a Stripe Checkout Session in subscription + embedded mode.

    Embedded mode renders Stripe's hosted checkout form inside an iframe on our
    own page. Returns a `client_secret` (instead of a redirect URL) which the
    frontend passes to <EmbeddedCheckoutProvider>. After payment, Stripe redirects
    the user's browser to `return_url` with `session_id={CHECKOUT_SESSION_ID}`.

    If the user is currently on a no-card free trial with days remaining, we pass
    Stripe `subscription_data.trial_end` so they aren't charged until their
    original 14-day trial ends. Total trial time is capped at 14 days from
    signup — upgrading mid-trial does NOT extend the trial.
    """
    price_id = await get_or_create_stripe_price(plan_key, plan)

    # Preserve plan in the return URL so the post-payment screen can
    # render the correct order summary even after the redirect.
    return_url = f"{origin_url}/checkout/return?session_id={{CHECKOUT_SESSION_ID}}"

    subscription_data = {
        "metadata": {
            "user_id": user.user_id,
            "plan": plan_key,
            "quantity": str(quantity),
        }
    }

    # Honor remaining trial days: if the user opted into the trial and still has
    # free trial time left, pass `trial_end` (Unix timestamp) so Stripe defers
    # charging until that moment. Stripe requires `trial_end` to be at least 48
    # hours in the future, so we only set it if the remaining trial covers that.
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "trial_end": 1})
    if use_trial and user_doc and user_doc.get("trial_end"):
        trial_end_raw = user_doc["trial_end"]
        try:
            if isinstance(trial_end_raw, str):
                end_dt = datetime.fromisoformat(trial_end_raw.replace("Z", "+00:00"))
            else:
                end_dt = trial_end_raw.replace(tzinfo=timezone.utc) if trial_end_raw.tzinfo is None else trial_end_raw
            now = datetime.now(timezone.utc)
            seconds_left = (end_dt - now).total_seconds()
            # Stripe min trial = 48 hours
            if seconds_left >= 48 * 3600:
                subscription_data["trial_end"] = int(end_dt.timestamp())
                # When using a trial, Stripe requires payment method to be
                # collected for after-trial billing. Default behavior already
                # collects PM for embedded checkout subscription mode.
        except Exception as e:
            logger.warning(f"Could not parse trial_end for user {user.user_id}: {e}")

    session_params = {
        "mode": "subscription",
        "ui_mode": "embedded",
        "return_url": return_url,
        "line_items": [{"price": price_id, "quantity": quantity}],
        "customer_email": user.email,
        "subscription_data": subscription_data,
        "metadata": {
            "user_id": user.user_id,
            "plan": plan_key,
            "user_email": user.email,
            "quantity": str(quantity),
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
async def create_checkout_session(request: Request, user: User = Depends(require_owner)):
    """Create Stripe checkout session — subscription mode for real keys, one-time for test."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    plan_key = data.get("plan", "pro_monthly")
    origin_url = data.get("origin_url")
    use_trial = bool(data.get("trial", True))

    if not origin_url:
        raise HTTPException(status_code=400, detail="origin_url required")
    if plan_key not in SUBSCRIPTION_PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan = SUBSCRIPTION_PLANS[plan_key]
    quantity = _clamp_units(data.get("quantity", 1)) if plan.get("tiered") else 1
    if plan.get("tiered"):
        final_price = compute_usage_amount(quantity, "yearly" if plan.get("interval") == "year" else "monthly")
    else:
        final_price = plan["price"]

    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    try:
        if is_real_stripe_key(api_key):
            stripe_sdk.api_key = api_key
            session = await create_subscription_checkout(plan_key, plan, user, origin_url, use_trial=use_trial, quantity=quantity)
            session_id = session.id
            session_url = None
            client_secret = session.client_secret  # embedded mode
            mode = "subscription"
        else:
            session = await create_onetime_checkout(plan_key, plan, user, origin_url, request, amount=final_price)
            session_id = session.session_id
            session_url = session.url
            client_secret = None  # sandbox fallback uses redirect
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

        return {
            "session_id": session_id,
            "client_secret": client_secret,  # embedded mode (real key)
            "url": session_url,              # redirect mode (sandbox fallback)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Checkout error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Payment failed: {str(e)}")


@router.get("/payments/session-status/{session_id}")
async def get_session_status(session_id: str, user: User = Depends(get_current_user)):
    """Stripe-canonical endpoint for the embedded-checkout return flow.

    Retrieves the Checkout Session from Stripe and returns its status so the
    frontend's /checkout/return page can branch:
      - status == 'complete' → show success screen
      - status == 'open'     → user closed the iframe early; redirect back to /checkout
      - status == 'expired'  → session expired

    Idempotently syncs the DB (payment_transactions + user.subscription_tier +
    org.subscription_tier) when the session is complete, so this single call
    covers both the read and the side-effect Stripe's pattern expects.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment service not configured")

    transaction = await db.payment_transactions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if not is_real_stripe_key(api_key):
        # Sandbox fallback — emergentintegrations doesn't expose embedded mode.
        return {"status": "complete", "payment_status": "paid", "customer_email": user.email}

    stripe_sdk.api_key = api_key
    try:
        session = stripe_sdk.checkout.Session.retrieve(session_id)
    except Exception as e:
        logger.error(f"Stripe session retrieve failed: {e}")
        raise HTTPException(status_code=502, detail="Could not retrieve session from Stripe")

    status = session.status                      # 'complete' | 'open' | 'expired'
    payment_status = session.payment_status      # 'paid' | 'unpaid' | 'no_payment_required'
    customer_email = (session.customer_details or {}).get("email") if session.customer_details else user.email

    # Idempotent DB sync — only flip if not already paid
    if (status == "complete" or payment_status == "paid") and transaction.get("payment_status") != "paid":
        plan = transaction.get("plan", "pro_monthly")
        subscription_id = session.subscription
        customer_id = session.customer
        now = datetime.now(timezone.utc).isoformat()
        vol = _volume_fields((transaction.get("metadata") or {}).get("quantity", 1)) if plan in ("enterprise_monthly", "enterprise_yearly") else {}

        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": "paid",
                "stripe_subscription_id": subscription_id,
                "stripe_customer_id": customer_id,
                "updated_at": now,
            }}
        )
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {
                "subscription_tier": plan,
                "subscription_status": "active",
                "stripe_subscription_id": subscription_id,
                "stripe_customer_id": customer_id,
                "updated_at": now,
                **vol,
            }}
        )
        if user.org_id:
            await db.organizations.update_one(
                {"org_id": user.org_id},
                {"$set": {
                    "subscription_tier": plan,
                    "subscription_status": "active",
                    "stripe_subscription_id": subscription_id,
                    "stripe_customer_id": customer_id,
                    "updated_at": now,
                    **vol,
                }}
            )

    return {
        "status": status,
        "payment_status": payment_status,
        "customer_email": customer_email,
        "plan": transaction.get("plan"),
    }


async def _resolve_stripe_customer_id(user: User) -> str | None:
    """Look up the user's Stripe customer ID from cache or via their last paid txn."""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "stripe_customer_id": 1})
    cached = (user_doc or {}).get("stripe_customer_id")
    if cached:
        return cached
    # Fall back: pull it from the latest paid payment_transaction for this user
    txn = await db.payment_transactions.find_one(
        {"user_id": user.user_id, "payment_status": "paid"},
        sort=[("updated_at", -1)],
        projection={"_id": 0, "stripe_customer_id": 1, "session_id": 1},
    )
    if not txn:
        return None
    if txn.get("stripe_customer_id"):
        return txn["stripe_customer_id"]
    # Last resort: ask Stripe directly using the session_id (legacy txns from before we cached)
    sid = txn.get("session_id")
    if not sid:
        return None
    try:
        session = stripe_sdk.checkout.Session.retrieve(sid)
        cust_id = session.customer
        if cust_id:
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {"stripe_customer_id": cust_id}},
            )
        return cust_id
    except Exception:
        return None


@router.post("/billing/portal-session")
async def create_billing_portal_session(request: Request, user: User = Depends(require_owner)):
    """Create a Stripe Customer Portal session.

    The portal lets the subscriber self-serve: update card, view + download
    invoice PDFs, see payment history, change plan, cancel/reactivate, and
    update billing address. Stripe hosts and maintains the entire UI.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key or not is_real_stripe_key(api_key):
        raise HTTPException(status_code=503, detail="Billing portal is not available in sandbox mode")

    customer_id = await _resolve_stripe_customer_id(user)
    if not customer_id:
        raise HTTPException(
            status_code=400,
            detail="No active subscription found for this account. Subscribe first before opening the billing portal.",
        )

    body = await request.json() if (await request.body()) else {}
    return_url = body.get("return_url") or os.environ.get("FRONTEND_URL") or "https://app.local"

    stripe_sdk.api_key = api_key
    try:
        session = stripe_sdk.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{return_url}/settings",
        )
    except stripe_sdk.error.InvalidRequestError as e:
        # Most common cause: portal not configured yet in the Stripe Dashboard.
        msg = str(e)
        if "configuration" in msg.lower() or "no configuration" in msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Stripe Customer Portal is not configured yet. Open Stripe Dashboard → Settings → Billing → Customer portal and click Save to activate it.",
            )
        raise HTTPException(status_code=400, detail=msg)
    except Exception as e:
        logger.error(f"Billing portal session create failed: {e}")
        raise HTTPException(status_code=502, detail="Could not create billing portal session")

    return {"url": session.url}


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
            vol = _volume_fields((transaction.get("metadata") or {}).get("quantity", 1)) if plan in ("enterprise_monthly", "enterprise_yearly") else {}
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
                "updated_at": datetime.now(timezone.utc).isoformat(),
                **vol,
            }
            if subscription_id:
                user_update["stripe_subscription_id"] = subscription_id

            await db.users.update_one(
                {"user_id": user.user_id}, {"$set": user_update}
            )

            # Sync the organization's subscription
            if user.org_id:
                org_update = {
                    "subscription_tier": plan,
                    "subscription_status": "active",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    **vol,
                }
                if subscription_id:
                    org_update["stripe_subscription_id"] = subscription_id
                await db.organizations.update_one(
                    {"org_id": user.org_id}, {"$set": org_update}
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
    """Handle Stripe webhooks for subscription lifecycle.

    Verifies the Stripe-Signature header against STRIPE_WEBHOOK_SECRET to
    reject spoofed payloads. Handles 5 event types we actually care about:

      - checkout.session.completed   (initial subscription start)
      - customer.subscription.updated (plan/seat change via Stripe Portal)
      - customer.subscription.deleted (cancellation)
      - invoice.paid                  (successful renewal)
      - invoice.payment_failed        (failed renewal → past_due)
    """
    try:
        body = await request.body()
        api_key = os.environ.get("STRIPE_API_KEY")
        webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
        signature = request.headers.get("Stripe-Signature", "")

        if is_real_stripe_key(api_key):
            import json
            import stripe as stripe_sdk

            # Verify signature when secret is configured (production path)
            if webhook_secret:
                try:
                    stripe_sdk.api_key = api_key
                    event = stripe_sdk.Webhook.construct_event(
                        payload=body,
                        sig_header=signature,
                        secret=webhook_secret,
                    )
                except stripe_sdk.error.SignatureVerificationError as e:
                    logger.warning("Stripe webhook signature verification failed: %s", e)
                    raise HTTPException(status_code=400, detail="Invalid signature")
                except ValueError as e:
                    logger.warning("Stripe webhook payload could not be parsed: %s", e)
                    raise HTTPException(status_code=400, detail="Invalid payload")
                # construct_event returns a stripe Event object; normalize to dict-like access
                event_type = event["type"]
                data_obj = event["data"]["object"]
            else:
                # Dev / unconfigured fallback — accept but log loudly
                logger.warning("STRIPE_WEBHOOK_SECRET not set; webhook accepted WITHOUT signature verification")
                event = json.loads(body)
                event_type = event.get("type", "")
                data_obj = event.get("data", {}).get("object", {})

            now_iso = datetime.now(timezone.utc).isoformat()

            if event_type == "checkout.session.completed":
                session_id = data_obj.get("id")
                metadata = data_obj.get("metadata", {}) or {}
                subscription_id = data_obj.get("subscription")

                update_fields = {"payment_status": "paid", "updated_at": now_iso}
                if subscription_id:
                    update_fields["stripe_subscription_id"] = subscription_id

                await db.payment_transactions.update_one(
                    {"session_id": session_id}, {"$set": update_fields}
                )

                if metadata.get("user_id"):
                    plan = metadata.get("plan", "pro_monthly")
                    vol = _volume_fields(metadata.get("quantity", 1)) if plan in ("enterprise_monthly", "enterprise_yearly") else {}
                    user_update = {
                        "subscription_tier": plan,
                        "subscription_status": "active",
                        **vol,
                    }
                    if subscription_id:
                        user_update["stripe_subscription_id"] = subscription_id

                    await db.users.update_one(
                        {"user_id": metadata["user_id"]}, {"$set": user_update}
                    )

                    # Sync the user's organization
                    u_doc = await db.users.find_one(
                        {"user_id": metadata["user_id"]}, {"_id": 0, "org_id": 1}
                    )
                    if u_doc and u_doc.get("org_id"):
                        org_update = {
                            "subscription_tier": plan,
                            "subscription_status": "active",
                            **vol,
                        }
                        if subscription_id:
                            org_update["stripe_subscription_id"] = subscription_id
                        await db.organizations.update_one(
                            {"org_id": u_doc["org_id"]}, {"$set": org_update}
                        )

            elif event_type == "customer.subscription.updated":
                # Fires when the plan changes via the Stripe Customer Portal.
                # Without this handler the DB silently drifts from Stripe.
                sub_id = data_obj.get("id")
                status = data_obj.get("status")  # active / past_due / canceled / etc
                # Plan key was stored on the subscription's metadata at checkout time.
                plan = (data_obj.get("metadata") or {}).get("plan")
                # Volume (quantity) can change via the portal / update-volume; keep deal_limit in sync.
                try:
                    _sub_items = ((data_obj.get("items") or {}).get("data") or [])
                    sub_qty = _sub_items[0].get("quantity") if _sub_items else None
                except Exception:
                    sub_qty = None

                if sub_id:
                    user_doc = await db.users.find_one(
                        {"stripe_subscription_id": sub_id},
                        {"_id": 0, "user_id": 1, "org_id": 1},
                    )
                    if user_doc:
                        u_set = {"subscription_status": status} if status else {}
                        if plan:
                            u_set["subscription_tier"] = plan
                        if sub_qty:
                            u_set.update(_volume_fields(sub_qty))
                        if u_set:
                            await db.users.update_one(
                                {"user_id": user_doc["user_id"]}, {"$set": u_set}
                            )
                        if user_doc.get("org_id"):
                            o_set = {"subscription_status": status} if status else {}
                            if plan:
                                o_set["subscription_tier"] = plan
                            if sub_qty:
                                o_set.update(_volume_fields(sub_qty))
                            if o_set:
                                await db.organizations.update_one(
                                    {"org_id": user_doc["org_id"]}, {"$set": o_set}
                                )

            elif event_type == "customer.subscription.deleted":
                sub_id = data_obj.get("id")
                user_doc = await db.users.find_one(
                    {"stripe_subscription_id": sub_id},
                    {"_id": 0, "user_id": 1, "subscription_tier": 1, "org_id": 1},
                )
                if user_doc:
                    cancel_set = {
                        "subscription_status": "cancelled",
                        "previous_tier": user_doc.get("subscription_tier"),
                        "subscription_tier": "cancelled",
                        "cancelled_at": now_iso,
                    }
                    await db.users.update_one(
                        {"user_id": user_doc["user_id"]}, {"$set": cancel_set}
                    )
                    if user_doc.get("org_id"):
                        await db.organizations.update_one(
                            {"org_id": user_doc["org_id"]}, {"$set": cancel_set}
                        )

            elif event_type == "invoice.paid":
                # Successful renewal — clear past_due flag if it was set, reaffirm active.
                sub_id = data_obj.get("subscription")
                if sub_id:
                    user_doc = await db.users.find_one(
                        {"stripe_subscription_id": sub_id},
                        {"_id": 0, "user_id": 1, "org_id": 1},
                    )
                    if user_doc:
                        await db.users.update_one(
                            {"user_id": user_doc["user_id"]},
                            {"$set": {"subscription_status": "active", "last_paid_at": now_iso}},
                        )
                        if user_doc.get("org_id"):
                            await db.organizations.update_one(
                                {"org_id": user_doc["org_id"]},
                                {"$set": {"subscription_status": "active", "last_paid_at": now_iso}},
                            )

            elif event_type == "invoice.payment_failed":
                sub_id = data_obj.get("subscription")
                if sub_id:
                    user_doc = await db.users.find_one(
                        {"stripe_subscription_id": sub_id},
                        {"_id": 0, "user_id": 1, "org_id": 1},
                    )
                    if user_doc:
                        await db.users.update_one(
                            {"user_id": user_doc["user_id"]},
                            {"$set": {"subscription_status": "past_due"}},
                        )
                        if user_doc.get("org_id"):
                            await db.organizations.update_one(
                                {"org_id": user_doc["org_id"]},
                                {"$set": {"subscription_status": "past_due"}},
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

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        return {"received": True}


@router.get("/subscription/plans")
async def get_subscription_plans():
    """Get available subscription plans."""
    return SUBSCRIPTION_PLANS


@router.get("/subscription/usage-pricing")
async def get_usage_pricing():
    """Public pricing config for the volume slider (deals tracked)."""
    return {
        "unit_size": USAGE_PRICING["unit_size"],
        "min_units": USAGE_PRICING["min_units"],
        "max_units": USAGE_PRICING["max_units"],
        "monthly": {
            "base": USAGE_PRICING["monthly"]["base_cents"] / 100.0,
            "per_unit": USAGE_PRICING["monthly"]["per_unit_cents"] / 100.0,
        },
        "yearly": {
            "base": USAGE_PRICING["yearly"]["base_cents"] / 100.0,
            "per_unit": USAGE_PRICING["yearly"]["per_unit_cents"] / 100.0,
        },
        "plan_keys": {"monthly": "enterprise_monthly", "yearly": "enterprise_yearly"},
    }


@router.post("/subscription/update-volume")
async def update_volume(request: Request, current_user: User = Depends(require_owner)):
    """Increase/decrease the tracked-deal volume on an active usage subscription.
    Modifies the Stripe subscription item quantity (prorated) and updates the
    org/user deal_limit so the soft cap moves with it."""
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")
    quantity = _clamp_units(data.get("quantity"))

    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "stripe_subscription_id": 1, "subscription_tier": 1},
    )
    tier = (user_doc or {}).get("subscription_tier")
    if tier not in ("enterprise_monthly", "enterprise_yearly"):
        raise HTTPException(status_code=400, detail="Volume changes apply to an active usage plan only.")
    sub_id = (user_doc or {}).get("stripe_subscription_id")
    api_key = os.environ.get("STRIPE_API_KEY")
    if not sub_id or not api_key or not is_real_stripe_key(api_key):
        raise HTTPException(status_code=400, detail="No active subscription found.")

    stripe_sdk.api_key = api_key
    try:
        sub = stripe_sdk.Subscription.retrieve(sub_id)
        item_id = sub["items"]["data"][0]["id"]
        stripe_sdk.Subscription.modify(
            sub_id,
            items=[{"id": item_id, "quantity": quantity}],
            proration_behavior="always_invoice",
            metadata={"plan": tier, "user_id": current_user.user_id, "quantity": str(quantity)},
        )
    except Exception as e:
        logger.error(f"update-volume error: {e}")
        raise HTTPException(status_code=500, detail="Could not update your plan volume.")

    vol = _volume_fields(quantity)
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"user_id": current_user.user_id}, {"$set": {**vol, "updated_at": now}})
    if current_user.org_id:
        await db.organizations.update_one({"org_id": current_user.org_id}, {"$set": {**vol, "updated_at": now}})
    period = "yearly" if tier == "enterprise_yearly" else "monthly"
    return {"ok": True, **vol, "period": period, "amount": compute_usage_amount(quantity, period)}


@router.post("/subscription/cancel")
async def cancel_subscription(current_user: User = Depends(require_owner)):
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



@router.get("/subscription/details")
async def get_subscription_details(current_user: User = Depends(get_current_user)):
    """Return live Stripe subscription details: auto-renew, period end, status."""
    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "stripe_subscription_id": 1, "subscription_tier": 1, "trial_end": 1}
    )
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    sub_id = user_doc.get("stripe_subscription_id")
    api_key = os.environ.get("STRIPE_API_KEY")

    # Default response for users without an active Stripe subscription (trial-only / cancelled / free)
    default = {
        "has_subscription": False,
        "auto_renew": False,
        "status": user_doc.get("subscription_tier", "trial"),
        "current_period_end": None,
        "trial_end": user_doc.get("trial_end"),
        "cancel_at_period_end": False,
    }

    if not sub_id or not api_key or not is_real_stripe_key(api_key):
        return default

    try:
        stripe_sdk.api_key = api_key
        sub = stripe_sdk.Subscription.retrieve(sub_id)
        cpe = sub.get("current_period_end")
        return {
            "has_subscription": True,
            "auto_renew": not sub.get("cancel_at_period_end", False),
            "status": sub.get("status"),
            "current_period_end": datetime.fromtimestamp(cpe, tz=timezone.utc).isoformat() if cpe else None,
            "trial_end": datetime.fromtimestamp(sub["trial_end"], tz=timezone.utc).isoformat() if sub.get("trial_end") else None,
            "cancel_at_period_end": bool(sub.get("cancel_at_period_end", False)),
        }
    except Exception as e:
        logger.warning(f"Could not fetch Stripe subscription {sub_id}: {e}")
        return default


@router.post("/subscription/auto-renew")
async def set_auto_renew(request: Request, current_user: User = Depends(require_owner)):
    """Toggle auto-renew on/off via Stripe `cancel_at_period_end`.

    enabled=True  → cancel_at_period_end=False (renews automatically)
    enabled=False → cancel_at_period_end=True  (keeps access until period end, then cancels)
    """
    body = await request.json()
    enabled = bool(body.get("enabled", True))

    user_doc = await db.users.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0, "stripe_subscription_id": 1}
    )
    sub_id = user_doc.get("stripe_subscription_id") if user_doc else None
    api_key = os.environ.get("STRIPE_API_KEY")

    if not sub_id or not api_key or not is_real_stripe_key(api_key):
        raise HTTPException(status_code=400, detail="No active subscription to update")

    try:
        stripe_sdk.api_key = api_key
        sub = stripe_sdk.Subscription.modify(
            sub_id,
            cancel_at_period_end=(not enabled),
        )
        cpe = sub.get("current_period_end")
        return {
            "auto_renew": enabled,
            "cancel_at_period_end": bool(sub.get("cancel_at_period_end", False)),
            "current_period_end": datetime.fromtimestamp(cpe, tz=timezone.utc).isoformat() if cpe else None,
        }
    except Exception as e:
        logger.error(f"Stripe modify error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update auto-renew: {str(e)}")
