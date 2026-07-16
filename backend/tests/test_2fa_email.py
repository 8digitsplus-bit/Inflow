"""Tests for real Email 2FA via Resend. Uses db.otp_codes to retrieve codes."""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://revenue-dash-40.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

EMAIL = "testpro@test.com"
PASSWORD = "password"
USER_ID = "user_393ea5f333cb"

# Forbidden keys that must not leak in responses
FORBIDDEN_KEYS = ["otp_code_debug", "code", "otp", "otp_code"]


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="module")
def authed_session():
    """Log in testpro (2FA off) and return an authenticated session."""
    s = requests.Session()
    # Make sure 2FA is OFF before login (idempotent cleanup)
    client = MongoClient(MONGO_URL)
    client[DB_NAME].users.update_one(
        {"email": EMAIL},
        {"$set": {"two_fa_enabled": False, "two_fa_method": None}},
    )
    client[DB_NAME].otp_codes.delete_many({"user_id": USER_ID})
    client.close()

    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    assert not body.get("requires_2fa"), "2FA should be disabled before tests begin"
    yield s
    # Teardown: force-disable 2FA to restore state
    client = MongoClient(MONGO_URL)
    client[DB_NAME].users.update_one(
        {"email": EMAIL},
        {"$set": {"two_fa_enabled": False, "two_fa_method": None}},
    )
    client[DB_NAME].otp_codes.delete_many({"user_id": USER_ID})
    client.close()


def _latest_code(mongo, user_id):
    doc = mongo.otp_codes.find_one({"user_id": user_id})
    return doc["code"] if doc else None


def _assert_no_code_leak(payload):
    if not isinstance(payload, dict):
        return
    lowered = {k.lower(): v for k, v in payload.items()}
    for bad in FORBIDDEN_KEYS:
        assert bad not in lowered, f"Response leaked key '{bad}': {payload}"
    # Also verify no 6-digit value in any string field masquerading as the code
    # (accept email_hint containing masked email)


class Test2FAStatus:
    def test_status_endpoint(self, authed_session):
        r = authed_session.get(f"{BASE_URL}/api/auth/2fa/status")
        assert r.status_code == 200
        data = r.json()
        assert "enabled" in data and "method" in data
        assert data["enabled"] is False


class Test2FAEnableFlow:
    def test_enable_request_returns_hint_and_no_code(self, authed_session, mongo):
        r = authed_session.post(f"{BASE_URL}/api/auth/2fa/enable/request")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "email_hint" in body
        assert "email_sent" in body
        assert isinstance(body["email_sent"], bool)
        _assert_no_code_leak(body)
        # OTP exists in db
        code = _latest_code(mongo, USER_ID)
        assert code is not None
        assert len(code) == 6 and code.isdigit()

    def test_enable_confirm_wrong_code_401(self, authed_session):
        r = authed_session.post(
            f"{BASE_URL}/api/auth/2fa/enable/confirm", json={"code": "000000"}
        )
        # 000000 is extremely unlikely to match a freshly generated OTP
        assert r.status_code == 401
        assert "Invalid" in r.json().get("detail", "")

    def test_enable_confirm_expired_code_401(self, authed_session, mongo):
        # Force an expired code
        from datetime import datetime, timezone, timedelta
        mongo.otp_codes.delete_many({"user_id": USER_ID})
        mongo.otp_codes.insert_one({
            "user_id": USER_ID,
            "code": "111111",
            "created_at": (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat(),
            "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat(),
        })
        r = authed_session.post(
            f"{BASE_URL}/api/auth/2fa/enable/confirm", json={"code": "111111"}
        )
        assert r.status_code == 401
        assert "expired" in r.json().get("detail", "").lower()

    def test_enable_confirm_correct_code(self, authed_session, mongo):
        # Fresh request → get code from db → confirm
        r = authed_session.post(f"{BASE_URL}/api/auth/2fa/enable/request")
        assert r.status_code == 200
        code = _latest_code(mongo, USER_ID)
        assert code

        r2 = authed_session.post(
            f"{BASE_URL}/api/auth/2fa/enable/confirm", json={"code": code}
        )
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["status"] == "enabled"
        assert data["method"] == "email"

        # Verify user flag flipped + otp cleared
        u = mongo.users.find_one({"user_id": USER_ID})
        assert u["two_fa_enabled"] is True
        assert mongo.otp_codes.count_documents({"user_id": USER_ID}) == 0

        # Status endpoint reflects
        s = authed_session.get(f"{BASE_URL}/api/auth/2fa/status").json()
        assert s["enabled"] is True and s["method"] == "email"


class Test2FALoginFlow:
    """After enable flow has run, testpro has 2FA on."""

    def test_login_returns_requires_2fa_and_no_leak(self, mongo):
        # Ensure 2FA is on (may depend on previous test)
        mongo.users.update_one({"email": EMAIL}, {"$set": {"two_fa_enabled": True, "two_fa_method": "email"}})
        mongo.otp_codes.delete_many({"user_id": USER_ID})

        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("requires_2fa") is True
        assert body.get("user_id") == USER_ID
        assert "email_hint" in body
        assert "email_sent" in body
        _assert_no_code_leak(body)
        # Verify OTP was created in db
        assert mongo.otp_codes.count_documents({"user_id": USER_ID}) == 1

    def test_verify_invalid_code_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/2fa/verify",
            json={"user_id": USER_ID, "code": "000000"},
        )
        assert r.status_code == 401
        assert "Invalid" in r.json().get("detail", "")

    def test_verify_missing_fields_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/2fa/verify", json={"user_id": USER_ID})
        assert r.status_code == 400

    def test_verify_expired_code_401(self, mongo):
        from datetime import datetime, timezone, timedelta
        mongo.otp_codes.delete_many({"user_id": USER_ID})
        mongo.otp_codes.insert_one({
            "user_id": USER_ID,
            "code": "222222",
            "created_at": (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat(),
            "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat(),
        })
        r = requests.post(
            f"{BASE_URL}/api/auth/2fa/verify",
            json={"user_id": USER_ID, "code": "222222"},
        )
        assert r.status_code == 401
        assert "expired" in r.json().get("detail", "").lower()

    def test_resend_public_endpoint(self, mongo):
        # User with 2FA enabled → 200, generates new code
        mongo.otp_codes.delete_many({"user_id": USER_ID})
        r = requests.post(f"{BASE_URL}/api/auth/2fa/resend", json={"user_id": USER_ID})
        assert r.status_code == 200
        body = r.json()
        _assert_no_code_leak(body)
        assert "email_sent" in body
        assert mongo.otp_codes.count_documents({"user_id": USER_ID}) == 1

    def test_resend_missing_user_id_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/2fa/resend", json={})
        assert r.status_code == 400

    def test_resend_user_without_2fa_404(self, mongo):
        # Temporarily disable then re-test, then re-enable
        mongo.users.update_one({"email": EMAIL}, {"$set": {"two_fa_enabled": False}})
        r = requests.post(f"{BASE_URL}/api/auth/2fa/resend", json={"user_id": USER_ID})
        assert r.status_code == 404
        mongo.users.update_one({"email": EMAIL}, {"$set": {"two_fa_enabled": True}})

    def test_verify_correct_code_sets_cookie(self, mongo):
        # Generate a fresh code via login
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        code = _latest_code(mongo, USER_ID)
        assert code
        r = s.post(
            f"{BASE_URL}/api/auth/2fa/verify",
            json={"user_id": USER_ID, "code": code},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == EMAIL
        # cookie set
        assert "session_token" in s.cookies
        # OTP cleared
        assert mongo.otp_codes.count_documents({"user_id": USER_ID}) == 0


class Test2FADisable:
    def test_disable_flips_flag(self, mongo):
        # Create a fresh authed session (2FA is currently on; we need to complete login+verify)
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        code = _latest_code(mongo, USER_ID)
        s.post(f"{BASE_URL}/api/auth/2fa/verify", json={"user_id": USER_ID, "code": code})

        r = s.post(f"{BASE_URL}/api/auth/2fa/disable")
        assert r.status_code == 200
        assert r.json()["status"] == "disabled"
        u = mongo.users.find_one({"user_id": USER_ID})
        assert u["two_fa_enabled"] is False
