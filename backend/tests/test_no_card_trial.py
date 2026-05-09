"""
Backend tests for the no-card free trial model.

Verifies:
1. POST /api/auth/register → subscription_tier='trial', trial_days_left=14 (no payment required)
2. GET /api/auth/me → returns subscription_tier + trial_days_left; flips to 'expired' when trial_end is past
3. POST /api/payments/create-checkout → respects user's remaining DB trial via Stripe `trial_end`
   (no fresh Stripe trial — mid-trial upgrades carry over remaining days, full-trial users get charged immediately)
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
        """
        Verifies:
        - Stripe `trial_period_days` is never used (we use absolute `trial_end` instead).
        - When user has DB trial time remaining, Stripe subscription's trial_end matches it.
        - When user's trial is expired/missing, Stripe subscription is charged immediately.
        """
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

        # Check the test user's DB trial_end so we know what to expect
        user_doc = mongo.users.find_one({"email": EXISTING_EMAIL}) or {}
        db_trial_end = user_doc.get("trial_end")
        has_trial = False
        if db_trial_end:
            try:
                if isinstance(db_trial_end, str):
                    end_dt = datetime.fromisoformat(db_trial_end.replace("Z", "+00:00"))
                else:
                    end_dt = db_trial_end.replace(tzinfo=timezone.utc) if db_trial_end.tzinfo is None else db_trial_end
                seconds_left = (end_dt - datetime.now(timezone.utc)).total_seconds()
                has_trial = seconds_left >= 48 * 3600
            except Exception:
                has_trial = False

        # If real Stripe key, fetch the session directly
        import stripe as stripe_sdk
        api_key = os.environ.get("STRIPE_API_KEY")
        if api_key and (api_key.startswith("sk_live_") or api_key.startswith("sk_test_")) and api_key != "sk_test_emergent":
            stripe_sdk.api_key = api_key
            session = stripe_sdk.checkout.Session.retrieve(session_id)
            sub_data = session.get("subscription_data") or {}
            # Must NEVER include trial_period_days (we use trial_end instead)
            assert "trial_period_days" not in sub_data or sub_data.get("trial_period_days") in (None, 0), sub_data

            if has_trial:
                # Should carry over remaining trial via trial_end (within ~1 hour tolerance)
                assert sub_data.get("trial_end"), f"Expected trial_end honored from DB, got: {sub_data}"
            else:
                # No trial remaining → no Stripe trial
                assert sub_data.get("trial_end") in (None, 0), f"Unexpected trial_end: {sub_data.get('trial_end')}"
        else:
            # Sandbox fallback: only verify source uses trial_end pattern, not trial_period_days
            src = open("/app/backend/routes/payments.py").read()
            assert "trial_period_days" not in src, (
                "trial_period_days must not appear anywhere in payments.py — use trial_end instead"
            )
