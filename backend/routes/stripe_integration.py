"""
Stripe Live Integration - Fetches real data from a user's Stripe account.
"""
import stripe
from datetime import datetime, timezone, timedelta
import uuid


async def validate_stripe_key(api_key: str) -> dict:
    """Validate a Stripe API key by making a test request."""
    try:
        s = stripe.StripeClient(api_key)
        account = s.accounts.retrieve("me")  # type: ignore
        return {
            "valid": True,
            "account_name": account.get("business_profile", {}).get("name") or account.get("settings", {}).get("dashboard", {}).get("display_name") or "Stripe Account",
            "account_id": account.get("id", ""),
        }
    except stripe.AuthenticationError:
        return {"valid": False, "error": "Invalid API key"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_stripe_data(api_key: str, user_id: str) -> dict:
    """Fetch real business data from Stripe and transform into deals/records."""
    s = stripe.StripeClient(api_key)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"customers": 0, "subscriptions": 0, "charges": 0, "revenue": 0}

    # Fetch customers
    try:
        customers_resp = s.customers.list(params={"limit": 100})
        customers = customers_resp.data if hasattr(customers_resp, 'data') else []
        stats["customers"] = len(customers)
    except Exception:
        customers = []

    # Fetch charges (last 90 days)
    try:
        since = int((now - timedelta(days=90)).timestamp())
        charges_resp = s.charges.list(params={"limit": 100, "created": {"gte": since}})
        charges = charges_resp.data if hasattr(charges_resp, 'data') else []
        stats["charges"] = len(charges)
    except Exception:
        charges = []

    # Fetch subscriptions
    try:
        subs_resp = s.subscriptions.list(params={"limit": 100, "status": "all"})
        subscriptions = subs_resp.data if hasattr(subs_resp, 'data') else []
        stats["subscriptions"] = len(subscriptions)
    except Exception:
        subscriptions = []

    # Transform charges into deals
    for charge in charges:
        amount = (charge.get("amount", 0) or 0) / 100  # cents to dollars
        stats["revenue"] += amount
        status = charge.get("status", "")
        
        if status == "succeeded":
            stage = "closed_won"
            probability = 100
        elif status == "failed":
            stage = "closed_lost"
            probability = 0
        elif status == "pending":
            stage = "negotiation"
            probability = 70
        else:
            stage = "lead"
            probability = 10

        created_ts = charge.get("created", 0)
        created_dt = datetime.fromtimestamp(created_ts, tz=timezone.utc) if created_ts else now

        customer_email = ""
        customer_name = "Unknown Customer"
        if charge.get("billing_details"):
            bd = charge["billing_details"]
            customer_name = bd.get("name") or customer_name
            customer_email = bd.get("email") or ""

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": charge.get("description") or f"Charge #{charge.get('id', '')[-8:]}",
            "company": customer_name,
            "value": round(amount, 2),
            "stage": stage,
            "probability": probability,
            "expected_close_date": None,
            "notes": f"Stripe charge {charge.get('id', '')}",
            "source": "stripe",
            "synced": True,
            "stripe_id": charge.get("id", ""),
            "created_at": created_dt.isoformat(),
            "updated_at": now.isoformat(),
        })

    # Transform subscriptions into deals
    for sub in subscriptions:
        sub_status = sub.get("status", "")
        plan_amount = 0
        plan_name = "Subscription"
        
        if sub.get("items") and sub["items"].get("data"):
            item = sub["items"]["data"][0]
            price = item.get("price", {})
            plan_amount = (price.get("unit_amount", 0) or 0) / 100
            plan_name = price.get("nickname") or price.get("product", "Subscription")
            interval = price.get("recurring", {}).get("interval", "month")
            if interval == "year":
                plan_amount = plan_amount  # yearly price as-is
            plan_name = f"{plan_name} ({interval}ly)"

        if sub_status == "active":
            stage = "closed_won"
            probability = 100
        elif sub_status == "trialing":
            stage = "proposal"
            probability = 60
        elif sub_status in ("past_due", "unpaid"):
            stage = "negotiation"
            probability = 40
        elif sub_status == "canceled":
            stage = "closed_lost"
            probability = 0
        else:
            stage = "qualified"
            probability = 30

        created_ts = sub.get("created", 0)
        created_dt = datetime.fromtimestamp(created_ts, tz=timezone.utc) if created_ts else now

        # Avoid duplicating with charges
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": plan_name,
            "company": sub.get("customer", "Unknown"),
            "value": round(plan_amount, 2),
            "stage": stage,
            "probability": probability,
            "expected_close_date": None,
            "notes": f"Stripe subscription {sub.get('id', '')} ({sub_status})",
            "source": "stripe",
            "synced": True,
            "stripe_id": sub.get("id", ""),
            "created_at": created_dt.isoformat(),
            "updated_at": now.isoformat(),
        })

    return {
        "deals": deals,
        "stats": stats,
        "total_records": len(deals),
    }
