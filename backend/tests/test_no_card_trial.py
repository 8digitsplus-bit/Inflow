"""
Backend tests for the no-card free trial model.

Verifies:
1. POST /api/auth/register → subscription_tier='trial', trial_days_left=14 (no payment required)
2. GET /api/auth/me → returns subscription_tier + trial_days_left; flips to 'expired' when trial_end is past
3. POST /api/payments/create-checkout → creates Stripe subscription session WITHOUT trial_period_days
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

# Load backend .env if run directly
if not BASE_URL or not MONGO_URL or not DB_NAME:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    load_dotenv("/app/frontend/.env")
    BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    MONGO_URL = os.environ.get("MONGO_URL")
    DB_NAME = os.environ.get("DB_NAME")

EXISTING_EMAIL = "testpro@test.com"
EXISTING_PASSWORD = "password"


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _unique_email():
    return f"TEST_nocard_{uuid.uuid4().hex[:8]}@test.com"


# ---------- Register ----------

class TestRegisterNoCard:
    def test_register_creates_trial_user_without_payment(self, api, mongo):
        email = _unique_email()
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "password123", "name": "Nocard Tester"
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == email
        assert body["subscription_tier"] == "trial"
        assert body["subscription_status"] == "active"
        assert body.get("trial_days_left") == 14
        # No payment/card fields expected
        assert "stripe_subscription_id" not in body or body.get("stripe_subscription_id") in (None, "")

        # DB: verify trial_end ~ now + 14d
        doc = mongo.users.find_one({"email": email})
        assert doc is not None
        assert doc["subscription_tier"] == "trial"
        trial_end = doc.get("trial_end")
        assert trial_end is not None
        end = datetime.fromisoformat(trial_end.replace("Z", "+00:00")) if isinstance(trial_end, str) else trial_end
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        delta_days = (end - datetime.now(timezone.utc)).days
        assert 13 <= delta_days <= 14

        # cleanup
        mongo.users.delete_one({"email": email})
        mongo.organizations.delete_one({"org_id": doc.get("org_id")})
        mongo.user_sessions.delete_many({"user_id": doc["user_id"]})


# ---------- /auth/me trial flip ----------

class TestAuthMeTrialFlip:
    def test_me_returns_trial_days_left_and_flips_expired(self, api, mongo):
        email = _unique_email()
        r = api.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "password123", "name": "Expiry Tester"
        })
        assert r.status_code == 200
        cookies = r.cookies

        # /auth/me while trial active
        me = api.get(f"{BASE_URL}/api/auth/me", cookies=cookies)
        assert me.status_code == 200
        data = me.json()
        assert data["subscription_tier"] == "trial"
        assert data.get("trial_days_left", 0) >= 13

        # Force trial_end into the past
        user_id = data["user_id"]
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        mongo.users.update_one({"user_id": user_id}, {"$set": {"trial_end": past}})

        me2 = api.get(f"{BASE_URL}/api/auth/me", cookies=cookies)
        assert me2.status_code == 200
        data2 = me2.json()
        assert data2["subscription_tier"] == "expired", data2

        # DB persisted the flip
        doc = mongo.users.find_one({"user_id": user_id})
        assert doc["subscription_tier"] == "expired"

        # cleanup
        mongo.users.delete_one({"user_id": user_id})
        mongo.organizations.delete_one({"org_id": data["org_id"]})
        mongo.user_sessions.delete_many({"user_id": user_id})


# ---------- Stripe checkout without trial ----------

class TestCheckoutNoTrialPeriod:
    def _login(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login", json={
            "email": EXISTING_EMAIL, "password": EXISTING_PASSWORD
        })
        assert r.status_code == 200, r.text
        body = r.json()
        if body.get("requires_2fa"):
            pytest.skip("2FA enabled on testpro — disable for this test run")
        return r.cookies

    def test_create_checkout_has_no_trial_period_days(self, api, mongo):
        cookies = self._login(api)
        r = api.post(
            f"{BASE_URL}/api/payments/create-checkout",
            json={"plan": "pro_monthly", "origin_url": "https://example.com", "users": 1},
            cookies=cookies,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        session_id = body.get("session_id")
        assert session_id

        # If real Stripe key, fetch the session directly and assert no trial
        import stripe as stripe_sdk
        api_key = os.environ.get("STRIPE_API_KEY")
        if api_key and (api_key.startswith("sk_live_") or api_key.startswith("sk_test_")) and api_key != "sk_test_emergent":
            stripe_sdk.api_key = api_key
            session = stripe_sdk.checkout.Session.retrieve(session_id)
            sub_data = session.get("subscription_data") or {}
            # Must NOT include trial_period_days
            assert "trial_period_days" not in sub_data or sub_data.get("trial_period_days") in (None, 0), sub_data
            # If a subscription was created, verify it too
            sub_id = session.get("subscription")
            if sub_id:
                sub = stripe_sdk.Subscription.retrieve(sub_id)
                assert sub.get("trial_end") in (None, 0), f"trial_end set on sub: {sub.get('trial_end')}"
                assert sub.get("status") != "trialing", f"status=trialing: {sub}"
        else:
            # Sandbox fallback uses one-time checkout — no subscription to inspect.
            # Verify source code has no trial_period_days in the subscription path.
            src = open("/app/backend/routes/payments.py").read()
            assert "trial_period_days" not in src, (
                "trial_period_days must not appear anywhere in payments.py"
            )
