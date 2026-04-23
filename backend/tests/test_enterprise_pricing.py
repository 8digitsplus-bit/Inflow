"""Tests for Enterprise per-user pricing flow in /api/payments/create-checkout."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inflow-pricing.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "testpro@test.com"
LOGIN_PASSWORD = "password"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    # login returns user fields directly
    assert data.get("email") == LOGIN_EMAIL
    # verify cookie is set
    assert s.cookies.get("session_token") is not None
    return s


# ----- Auth regression -----
def test_login_works_and_sets_cookie(session):
    r = session.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json().get("email") == LOGIN_EMAIL


# ----- Plans catalog regression -----
def test_subscription_plans_enterprise_per_user():
    r = requests.get(f"{BASE_URL}/api/subscription/plans", timeout=15)
    assert r.status_code == 200
    plans = r.json()
    assert "enterprise_monthly" in plans and "enterprise_yearly" in plans
    assert plans["enterprise_monthly"]["price"] == 260.0
    assert plans["enterprise_monthly"].get("per_user") is True
    assert plans["enterprise_yearly"]["price"] == 2184.0
    assert plans["enterprise_yearly"].get("per_user") is True
    # sanity: non-enterprise still flat
    assert plans["pro_monthly"]["price"] == 699.0
    assert plans["essential_monthly"]["price"] == 299.0


# ----- Enterprise monthly: various users -----
@pytest.mark.parametrize("users,expected_amount", [(1, 260.0), (5, 1300.0), (7, 1820.0), (10, 2600.0)])
def test_enterprise_monthly_amount_matches_users(session, users, expected_amount):
    r = session.post(
        f"{BASE_URL}/api/payments/create-checkout",
        json={"plan": "enterprise_monthly", "origin_url": "https://example.com", "users": users},
        timeout=30,
    )
    assert r.status_code == 200, f"Failed for users={users}: {r.text}"
    body = r.json()
    assert "url" in body and body["url"].startswith("http")
    assert "session_id" in body and body["session_id"]

    # Verify DB transaction via status endpoint (checks amount persisted)
    sid = body["session_id"]
    status_r = session.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=20)
    assert status_r.status_code == 200, status_r.text
    status_body = status_r.json()
    assert float(status_body["amount"]) == expected_amount, f"Expected {expected_amount}, got {status_body['amount']} for users={users}"


# ----- Enterprise yearly -----
def test_enterprise_yearly_users_5(session):
    r = session.post(
        f"{BASE_URL}/api/payments/create-checkout",
        json={"plan": "enterprise_yearly", "origin_url": "https://example.com", "users": 5},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    status_r = session.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=20)
    assert status_r.status_code == 200
    assert float(status_r.json()["amount"]) == 10920.0  # 2184 * 5


# ----- Non-enterprise plans ignore users -----
@pytest.mark.parametrize("plan,expected", [("pro_monthly", 699.0), ("essential_monthly", 299.0)])
def test_non_enterprise_plans_ignore_users(session, plan, expected):
    r = session.post(
        f"{BASE_URL}/api/payments/create-checkout",
        json={"plan": plan, "origin_url": "https://example.com", "users": 10},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    status_r = session.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=20)
    assert status_r.status_code == 200
    assert float(status_r.json()["amount"]) == expected, f"{plan} amount should be {expected}"


# ----- Error paths -----
def test_invalid_plan_returns_400(session):
    r = session.post(
        f"{BASE_URL}/api/payments/create-checkout",
        json={"plan": "bogus_plan", "origin_url": "https://example.com", "users": 1},
        timeout=15,
    )
    assert r.status_code == 400


def test_missing_origin_url_returns_400(session):
    r = session.post(
        f"{BASE_URL}/api/payments/create-checkout",
        json={"plan": "enterprise_monthly", "users": 5},
        timeout=15,
    )
    assert r.status_code == 400
