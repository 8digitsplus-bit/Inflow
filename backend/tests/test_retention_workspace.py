"""
Test suite for Retention Workspace endpoints (per-deal Protect workspace).

Endpoints under test:
- GET  /api/retention/deal/{deal_id}
- POST /api/retention/send-email
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

TESTPRO_EMAIL = "testpro@test.com"
TESTPRO_PASSWORD = "password"


def _login(session: requests.Session, email: str, password: str) -> bool:
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return r.status_code == 200


def _register_and_login(session: requests.Session, email: str, password: str, name: str = "Other Org User"):
    session.post(f"{BASE_URL}/api/auth/register", json={"name": name, "email": email, "password": password})
    return _login(session, email, password)


@pytest.fixture(scope="module")
def pro_session():
    s = requests.Session()
    if not _login(s, TESTPRO_EMAIL, TESTPRO_PASSWORD):
        pytest.skip("Cannot login as testpro@test.com")
    return s


@pytest.fixture(scope="module")
def other_session():
    s = requests.Session()
    email = f"otherorg_ws_{uuid.uuid4().hex[:8]}@example.com"
    if not _register_and_login(s, email, "Pass1234!"):
        pytest.skip("Cannot register secondary org user")
    return s


@pytest.fixture(scope="module")
def at_risk_deal_id(pro_session):
    """Pull a real at-risk deal_id from /api/analytics/churn."""
    r = pro_session.get(f"{BASE_URL}/api/analytics/churn")
    assert r.status_code == 200, f"churn analytics failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    deals = data.get("at_risk_deals") or []
    if not deals:
        pytest.skip("No at-risk deals seeded for testpro org")
    # Prefer one with deal_id set
    for d in deals:
        did = d.get("deal_id") or d.get("id")
        if did:
            return did
    pytest.skip("At-risk deals have no deal_id field")


# ---------- GET /api/retention/deal/{deal_id} ----------
class TestGetRetentionDeal:
    def test_requires_auth(self, at_risk_deal_id):
        r = requests.get(f"{BASE_URL}/api/retention/deal/{at_risk_deal_id}")
        assert r.status_code == 401

    def test_returns_deal_context(self, pro_session, at_risk_deal_id):
        r = pro_session.get(f"{BASE_URL}/api/retention/deal/{at_risk_deal_id}")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        data = r.json()
        # top-level structure
        assert "deal" in data
        assert "plays" in data and isinstance(data["plays"], list)
        assert "protected" in data
        assert isinstance(data["protected"], (int, float))
        # deal fields
        deal = data["deal"]
        for k in ["id", "deal_id", "name", "company", "value", "stage",
                  "probability", "risk_level", "engagement_score", "days_inactive"]:
            assert k in deal, f"deal missing '{k}'"
        assert deal["deal_id"] == at_risk_deal_id
        assert deal["risk_level"] in ("critical", "high", "medium", "low")

    def test_unknown_deal_returns_404(self, pro_session):
        r = pro_session.get(f"{BASE_URL}/api/retention/deal/deal_nonexistent_xyz")
        assert r.status_code == 404

    def test_cross_org_returns_404(self, other_session, at_risk_deal_id):
        # Other org user should NOT be able to read testpro's deal
        r = other_session.get(f"{BASE_URL}/api/retention/deal/{at_risk_deal_id}")
        assert r.status_code == 404

    def test_plays_reflected_after_create(self, pro_session, at_risk_deal_id):
        # Create a play for this deal
        deal_payload = {"id": at_risk_deal_id, "deal_id": at_risk_deal_id,
                        "name": "WS Test Deal", "company": "WS Co", "value": 12345}
        cr = pro_session.post(f"{BASE_URL}/api/retention/plays",
                              json={"action_type": "support", "deal": deal_payload}, timeout=60)
        assert cr.status_code == 200
        play_id = cr.json()["play_id"]

        # Fetch deal context and verify play appears
        r = pro_session.get(f"{BASE_URL}/api/retention/deal/{at_risk_deal_id}")
        assert r.status_code == 200
        ids = [p["play_id"] for p in r.json()["plays"]]
        assert play_id in ids, "Newly created play should appear in deal's plays list"


# ---------- POST /api/retention/send-email ----------
class TestSendEmail:
    def test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/retention/send-email",
                          json={"to": "x@y.com", "subject": "s", "body": "b"})
        assert r.status_code == 401

    def test_missing_recipient(self, pro_session):
        r = pro_session.post(f"{BASE_URL}/api/retention/send-email",
                             json={"subject": "s", "body": "b"})
        assert r.status_code == 400

    def test_empty_recipient(self, pro_session):
        r = pro_session.post(f"{BASE_URL}/api/retention/send-email",
                             json={"to": "  ", "subject": "s", "body": "b"})
        assert r.status_code == 400

    def test_invalid_email_no_at_sign(self, pro_session):
        r = pro_session.post(f"{BASE_URL}/api/retention/send-email",
                             json={"to": "notanemail", "subject": "s", "body": "b"})
        assert r.status_code == 400

    def test_missing_subject(self, pro_session):
        r = pro_session.post(f"{BASE_URL}/api/retention/send-email",
                             json={"to": "someone@example.com", "body": "b"})
        assert r.status_code == 400

    def test_missing_body(self, pro_session):
        r = pro_session.post(f"{BASE_URL}/api/retention/send-email",
                             json={"to": "someone@example.com", "subject": "s"})
        assert r.status_code == 400

    def test_well_formed_reachable(self, pro_session):
        """A well-formed request should reach the endpoint. Delivery may fail
        in preview (502/503) — but 400 should NOT occur for valid input."""
        r = pro_session.post(
            f"{BASE_URL}/api/retention/send-email",
            json={
                "to": "someone@example.com",
                "subject": "Hi",
                "body": "test",
                "deal_name": "X",
            },
            timeout=30,
        )
        assert r.status_code in (200, 502, 503), (
            f"expected 200/502/503 for well-formed request, got {r.status_code}: {r.text[:300]}"
        )
        # And explicitly NOT 400/401
        assert r.status_code not in (400, 401)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
