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
        "price": 59.0, "name": "Essential", "period": "monthly",
        "interval": "month",
        "per_user": True,
        "features": ["Sales Pipeline", "Core analytics", "2 live integrations", "Churn monitoring", "Email support"]
    },
    "essential_yearly": {
        "price": 499.0, "name": "Essential", "period": "yearly",
        "interval": "year",
        "renewal_price": 708.0, "first_year_discount": True,
        "per_user": True,
        "features": ["Sales Pipeline", "Core analytics", "2 live integrations", "Churn monitoring", "Email support"]
    },
    "pro_monthly": {
        "price": 139.0, "name": "Pro", "period": "monthly",
        "interval": "month",
        "per_user": True,
        "features": ["4 live integrations", "CSV import", "AI insights", "CRO analysis", "Revenue forecasting", "Priority support"]
    },
    "pro_yearly": {
        "price": 1170.0, "name": "Pro", "period": "yearly",
        "interval": "year",
        "renewal_price": 1668.0, "first_year_discount": True,
        "per_user": True,
        "features": ["4 live integrations", "CSV import", "AI insights", "CRO analysis", "Revenue forecasting", "Priority support"]
    },
    "enterprise_monthly": {
        "price": 260.0, "name": "Enterprise", "period": "monthly",
        "interval": "month",
        "per_user": True,
        "features": ["Unlimited integrations", "Custom API access", "Smart Assist AI", "Revenue Intelligence", "Dedicated support"]
    },
    "enterprise_yearly": {
        "price": 2184.0, "name": "Enterprise", "period": "yearly",
        "interval": "year",
        "renewal_price": 3120.0, "first_year_discount": True,
        "per_user": True,
        "features": ["Unlimited integrations", "Custom API access", "Smart Assist AI", "Revenue Intelligence", "Dedicated support"]
    }
}

# Cache for Stripe Price IDs (created on demand)
_stripe_price_cache = {}


def is_real_stripe_key(key: str) -> bool:
    return key and (key.startswith("sk_live_") or key.startswith("sk_test_")) and key != "sk_test_emergent"


async def sync_stripe_seat_count(org_id: str) -> dict:
    """Align the org's Stripe subscription quantity to its current member count.
    The change is deferred to the next renewal cycle (proration_behavior='none'),
    so the owner keeps paid-for seats through the end of the current period.

    Returns a dict describing what happened. Never raises — any failure is logged
    so business flows (member removal, invite accept) complete regardless.
    """
    result = {"synced": False, "reason": None, "new_quantity": None, "sub_id": None}

    org = await db.organizations.find_one({"org_id": org_id}, {"_id": 0})
    if not org:
        result["reason"] = "org_not_found"
        return result

    sub_id = org.get("stripe_subscription_id")
    if not sub_id:
        result["reason"] = "no_subscription"
        return result

    tier = org.get("subscription_tier", "")
    if not tier.startswith("enterprise_"):
        # Non-enterprise plans are flat-rate, quantity is always 1
        result["reason"] = "not_per_user"
        return result

    api_key = os.environ.get("STRIPE_API_KEY")
    if not is_real_stripe_key(api_key):
        result["reason"] = "sandbox_mode"
        return result

    member_count = await db.users.count_documents({"org_id": org_id})
    new_quantity = max(1, member_count)

    try:
        stripe_sdk.api_key = api_key
        subscription = stripe_sdk.Subscription.retrieve(sub_id)
        items = subscription.get("items", {}).get("data", [])
        if not items:
            result["reason"] = "no_items"
            return result
        item_id = items[0]["id"]
        current_qty = items[0].get("quantity", 1)

        if current_qty == new_quantity:
            result["reason"] = "already_synced"
            result["new_quantity"] = new_quantity
            result["sub_id"] = sub_id
            return result

        stripe_sdk.Subscription.modify(
            sub_id,
            items=[{"id": item_id, "quantity": new_quantity}],
            proration_behavior="none",
        )
        result.update({
            "synced": True,
            "new_quantity": new_quantity,
            "previous_quantity": current_qty,
            "sub_id": sub_id,
        })
        logger.info("Stripe seat sync for %s: %d → %d (effective at renewal)", org_id, current_qty, new_quantity)
    except Exception as e:
        result["reason"] = f"stripe_error: {e}"
        logger.error("Stripe seat sync failed for %s: %s", org_id, e)

    return result


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

    # Preserve plan + users in the return URL so the post-payment screen can
    # render the correct order summary even after the redirect.
    return_url = f"{origin_url}/checkout/return?session_id={{CHECKOUT_SESSION_ID}}"

    subscription_data = {
        "metadata": {
            "user_id": user.user_id,
            "plan": plan_key,
            "quantity": str(quantity),
        }
    }

    # Honor remaining trial days: if user still has free trial time left, pass
    # `trial_end` (Unix timestamp) so Stripe defers charging until that moment.
    # Stripe requires `trial_end` to be at least 48 hours in the future, so we
    # only set it if the remaining trial covers that minimum.
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "trial_end": 1})
    if user_doc and user_doc.get("trial_end"):
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
async def create_checkout_session(request: Request, user: User = Depends(require_owner)):
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
            }}
        )
        if user.org_id:
            quantity = int(transaction.get("metadata", {}).get("quantity", 1))
            await db.organizations.update_one(
                {"org_id": user.org_id},
                {"$set": {
                    "subscription_tier": plan,
                    "subscription_status": "active",
                    "seat_count": quantity,
                    "stripe_subscription_id": subscription_id,
                    "stripe_customer_id": customer_id,
                    "updated_at": now,
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

            # Sync the organization's subscription + seat count
            if user.org_id:
                quantity = int(transaction.get("metadata", {}).get("quantity", 1))
                org_update = {
                    "subscription_tier": plan,
                    "subscription_status": "active",
                    "seat_count": quantity,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
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
                    user_update = {
                        "subscription_tier": plan,
                        "subscription_status": "active",
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
                        quantity = int(metadata.get("quantity", 1))
                        org_update = {
                            "subscription_tier": plan,
                            "subscription_status": "active",
                            "seat_count": quantity,
                        }
                        if subscription_id:
                            org_update["stripe_subscription_id"] = subscription_id
                        await db.organizations.update_one(
                            {"org_id": u_doc["org_id"]}, {"$set": org_update}
                        )

            elif event_type == "customer.subscription.updated":
                # Fires when plan or seat count changes via the Stripe Customer Portal.
                # Without this handler the DB silently drifts from Stripe.
                sub_id = data_obj.get("id")
                status = data_obj.get("status")  # active / past_due / canceled / etc
                items = (data_obj.get("items") or {}).get("data") or []
                seat_qty = items[0].get("quantity") if items else None
                # Plan key was stored on the subscription's metadata at checkout time.
                plan = (data_obj.get("metadata") or {}).get("plan")

                if sub_id:
                    user_doc = await db.users.find_one(
                        {"stripe_subscription_id": sub_id},
                        {"_id": 0, "user_id": 1, "org_id": 1},
                    )
                    if user_doc:
                        u_set = {"subscription_status": status} if status else {}
                        if plan:
                            u_set["subscription_tier"] = plan
                        if u_set:
                            await db.users.update_one(
                                {"user_id": user_doc["user_id"]}, {"$set": u_set}
                            )
                        if user_doc.get("org_id"):
                            o_set = {"subscription_status": status} if status else {}
                            if plan:
                                o_set["subscription_tier"] = plan
                            if seat_qty:
                                o_set["seat_count"] = int(seat_qty)
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
