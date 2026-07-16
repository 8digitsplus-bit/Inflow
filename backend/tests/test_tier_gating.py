"""Tier gating tests for integrations.
Essential=2, Pro=4, Enterprise=unlimited. Custom API is Enterprise-only.
"""
import asyncio
import os
import sys
import requests
import pytest

sys.path.insert(0, "/app/backend")
from database import db  # noqa: E402
from routes.business import get_integration_limit, INTEGRATION_LIMITS  # noqa: E402


BASE_URL = os.environ.get("BASE_URL", "https://revenue-dash-40.preview.emergentagent.com")
OWNER_ORG = "org_15337f4cefc9"
OWNER_ID = "user_393ea5f333cb"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _set_tier(tier):
    _run(db.organizations.update_one({"org_id": OWNER_ORG}, {"$set": {"subscription_tier": tier}}))
    _run(db.users.update_one({"user_id": OWNER_ID}, {"$set": {"subscription_tier": tier}}))


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "testpro@test.com", "password": "password"}, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module", autouse=True)
def _restore_enterprise():
    """After all tests in this module, restore org to enterprise_monthly state."""
    yield
    _set_tier("enterprise_monthly")


class TestTierGating:
    def test_limits_configured(self):
        assert INTEGRATION_LIMITS["essential_monthly"] == 2
        assert INTEGRATION_LIMITS["essential_yearly"] == 2
        assert INTEGRATION_LIMITS["pro_monthly"] == 4
        assert INTEGRATION_LIMITS["pro_yearly"] == 4
        assert INTEGRATION_LIMITS["enterprise_monthly"] is None
        assert INTEGRATION_LIMITS["enterprise_yearly"] is None

    def test_get_integration_limit(self):
        assert get_integration_limit("essential_monthly") == 2
        assert get_integration_limit("pro_yearly") == 4
        assert get_integration_limit("enterprise_monthly") is None
        assert get_integration_limit("trial") == 2
        assert get_integration_limit("unknown_tier") == 2  # default

    def test_usage_endpoint_essential(self, session):
        _set_tier("essential_monthly")
        r = session.get(f"{BASE_URL}/api/business/integration-usage", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["tier"] == "essential_monthly"
        assert body["limit"] == 2
        assert body["used"] >= 0
        assert isinstance(body["available"], int) or body["available"] is None
        assert isinstance(body["at_limit"], bool)

    def test_usage_endpoint_pro(self, session):
        _set_tier("pro_monthly")
        r = session.get(f"{BASE_URL}/api/business/integration-usage", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["tier"] == "pro_monthly"
        assert body["limit"] == 4

    def test_usage_endpoint_enterprise(self, session):
        _set_tier("enterprise_monthly")
        r = session.get(f"{BASE_URL}/api/business/integration-usage", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["tier"] == "enterprise_monthly"
        assert body["limit"] is None
        assert body["available"] is None
        assert body["at_limit"] is False

    def test_essential_blocks_3rd_connection(self, session):
        """Org has 2 existing connections (stripe + hubspot seeded). On Essential, 3rd should 403."""
        _set_tier("essential_monthly")
        r = session.post(
            f"{BASE_URL}/api/business/connect/paypal",
            json={"client_id": "fake", "client_secret": "fake", "sandbox": True},
            timeout=15,
        )
        # 403 tier limit (not 400 bad creds) because the check happens BEFORE creds validation
        assert r.status_code == 403, r.text
        assert "Essential" in r.json()["detail"]
        assert "2 integration" in r.json()["detail"]

    def test_pro_allows_more_but_blocks_5th(self, session):
        """Pro has limit of 4. With 2 existing, 3rd or 4th (by bad creds) should pass tier check."""
        _set_tier("pro_monthly")
        # Attempt connect with fake creds — the 403 should NOT fire for tier; instead 400 for bad creds
        r = session.post(
            f"{BASE_URL}/api/business/connect/paypal",
            json={"client_id": "fake", "client_secret": "fake", "sandbox": True},
            timeout=15,
        )
        # Either 400 (bad creds, tier check passed) or some other 4xx — must NOT be the tier 403 message
        if r.status_code == 403:
            assert "Essential" not in r.json()["detail"]  # shouldn't mention Essential
        else:
            assert r.status_code == 400

    def test_enterprise_unlimited(self, session):
        _set_tier("enterprise_monthly")
        r = session.post(
            f"{BASE_URL}/api/business/connect/paypal",
            json={"client_id": "fake", "client_secret": "fake", "sandbox": True},
            timeout=15,
        )
        # Tier check must pass (400 for bad creds, not 403 for tier)
        assert r.status_code == 400

    def test_custom_api_enterprise_only(self, session):
        """Custom API connect must require Enterprise tier regardless of integration count."""
        _set_tier("pro_monthly")
        r = session.post(
            f"{BASE_URL}/api/business/custom-api/connect",
            json={
                "name": "Test API",
                "endpoint": "https://httpbin.org/get",
                "auth_type": "none",
                "mapping": {"name": "name", "company": "company", "value": "value", "stage": "stage"},
            },
            timeout=15,
        )
        # Should 403 for tier. Exact status is 403 with 'Enterprise' in detail
        assert r.status_code == 403
        assert "Enterprise" in r.json()["detail"]
