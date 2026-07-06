"""Tests for flat per-workspace pricing in /api/payments/create-checkout.

Plans moved from per-user to a single flat rate with unlimited seats, so the
`users` field is ignored and every plan bills a fixed amount.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inflow-preview-1.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "testpro@test.com"
LOGIN_PASSWORD = "password"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    assert r.json().get("email") == LOGIN_EMAIL
    assert s.cookies.get("session_token") is not None
    return s


def _checkout_amount(session, plan, users=1):
    r = session.post(
        f"{BASE_URL}/api/payments/create-checkout",
        json={"plan": plan, "origin_url": "https://example.com", "users": users},
        timeout=30,
    )
    assert r.status_code == 200, f"Failed for {plan}/{users}: {r.text}"
    body = r.json()
    assert body.get("session_id"), f"no session_id: {body}"
    # Embedded (subscription) checkout returns client_secret; hosted returns url.
    assert body.get("client_secret") or body.get("url"), f"no checkout handle: {body}"
    status_r = session.get(f"{BASE_URL}/api/payments/status/{body['session_id']}", timeout=20)
    assert status_r.status_code == 200, status_r.text
    return float(status_r.json()["amount"])


# ----- Auth regression -----
def test_login_works_and_sets_cookie(session):
    r = session.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json().get("email") == LOGIN_EMAIL


# ----- Plans catalog: flat pricing -----
def test_subscription_plans_are_flat():
    r = requests.get(f"{BASE_URL}/api/subscription/plans", timeout=15)
    assert r.status_code == 200
    plans = r.json()
    expected = {
        "essential_monthly": 99.0, "essential_yearly": 830.0,
        "pro_monthly": 149.0, "pro_yearly": 1250.0,
        "enterprise_monthly": 400.0, "enterprise_yearly": 3360.0,
    }
    for key, price in expected.items():
        assert key in plans, f"missing {key}"
        assert plans[key]["price"] == price, f"{key} price {plans[key]['price']} != {price}"
        assert plans[key].get("per_user") is False, f"{key} should be flat (per_user False)"


# ----- Enterprise is flat regardless of the users field -----
@pytest.mark.parametrize("users", [1, 5, 10])
def test_enterprise_monthly_is_flat_regardless_of_users(session, users):
    assert _checkout_amount(session, "enterprise_monthly", users) == 400.0


def test_enterprise_yearly_is_flat(session):
    assert _checkout_amount(session, "enterprise_yearly", 5) == 3360.0


# ----- All other plans are flat too -----
@pytest.mark.parametrize("plan,expected", [
    ("essential_monthly", 99.0), ("essential_yearly", 830.0),
    ("pro_monthly", 149.0), ("pro_yearly", 1250.0),
])
def test_other_plans_flat(session, plan, expected):
    assert _checkout_amount(session, plan, 10) == expected


# ----- Error paths -----
def test_invalid_plan_returns_400(session):
    r = session.post(
        f"{BASE_URL}/api/payments/create-checkout",
        json={"plan": "bogus_plan", "origin_url": "https://example.com"},
        timeout=15,
    )
    assert r.status_code == 400


def test_missing_origin_url_returns_400(session):
    r = session.post(
        f"{BASE_URL}/api/payments/create-checkout",
        json={"plan": "enterprise_monthly"},
        timeout=15,
    )
    assert r.status_code == 400
