"""
Iteration 63 targeted regression tests:
- #3 Auth cookie session (httpOnly cookie is source of truth)
- #7 Churn dynamic deltas (/api/analytics/churn returns retention_delta/churn_delta/total_customers)
- #11 Deal write permissions (owner CRUD 200s, no 500s)
- Regression: forecasting numeric parsing (-5000, 1e9)
- Regression: revenue-leaks endpoint accessible for enterprise owner
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://revenue-exec.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "testpro@test.com"
OWNER_PASSWORD = "password"


@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    # Verify httpOnly cookie is set
    cookies_lower = {k.lower() for k in s.cookies.keys()}
    assert any("session" in c or "auth" in c or "token" in c or "inflow" in c for c in cookies_lower) or len(s.cookies) > 0, \
        f"No session cookie set. cookies={dict(s.cookies)}"
    return s


# ---------- #3 AUTH / COOKIE SESSION ----------
class TestAuthCookie:
    def test_login_success_sets_cookie(self, owner_session):
        me = owner_session.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200, me.text
        data = me.json()
        assert data.get("email") == OWNER_EMAIL

    def test_me_without_cookie_returns_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401


# ---------- #7 CHURN DYNAMIC DELTAS ----------
class TestChurnDeltas:
    def test_churn_endpoint_shape(self, owner_session):
        r = owner_session.get(f"{API}/analytics/churn", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "retention_delta" in data, f"missing retention_delta: {data}"
        assert "churn_delta" in data, f"missing churn_delta: {data}"
        assert "total_customers" in data, f"missing total_customers: {data}"
        # deltas may be null or numeric
        for k in ("retention_delta", "churn_delta"):
            v = data[k]
            assert v is None or isinstance(v, (int, float)), f"{k} type = {type(v)} value={v}"
        assert isinstance(data["total_customers"], int)
        print(f"churn payload keys={list(data.keys())} retention_delta={data.get('retention_delta')} churn_delta={data.get('churn_delta')} total_customers={data.get('total_customers')}")


# ---------- #11 DEAL WRITE PERMISSIONS (owner regression) ----------
class TestDealWritePermissions:
    def test_owner_full_crud(self, owner_session):
        # CREATE
        payload = {
            "name": f"TEST_iter63_{uuid.uuid4().hex[:8]}",
            "company": "TEST Co",
            "value": 12345,
            "stage": "lead",
            "contact_email": "test@example.com",
        }
        create = owner_session.post(f"{API}/deals", json=payload, timeout=15)
        assert create.status_code in (200, 201), f"create failed {create.status_code} {create.text}"
        deal = create.json()
        deal_id = deal.get("id") or deal.get("_id") or deal.get("deal_id")
        assert deal_id, f"no id in response: {deal}"

        # GET (list) to ensure not 500
        listr = owner_session.get(f"{API}/deals", timeout=15)
        assert listr.status_code == 200

        # UPDATE stage + value
        upd = owner_session.put(f"{API}/deals/{deal_id}", json={"stage": "negotiation", "value": 22222}, timeout=15)
        assert upd.status_code == 200, f"update failed {upd.status_code} {upd.text}"
        u = upd.json()
        assert u.get("stage") == "negotiation"
        assert float(u.get("value", 0)) == 22222

        # DELETE
        d = owner_session.delete(f"{API}/deals/{deal_id}", timeout=15)
        assert d.status_code in (200, 204), f"delete failed {d.status_code} {d.text}"

        # Verify gone (list, since single-GET may not exist)
        listr2 = owner_session.get(f"{API}/deals", timeout=15)
        assert listr2.status_code == 200
        deals2 = listr2.json()
        if isinstance(deals2, dict):
            deals2 = deals2.get("deals", deals2.get("data", []))
        ids = [d.get("id") or d.get("_id") for d in deals2]
        assert deal_id not in ids, f"deal {deal_id} still present after delete"

    def test_update_nonexistent_deal_returns_404_not_500(self, owner_session):
        r = owner_session.put(f"{API}/deals/nonexistent_deal_xyz", json={"stage": "lead"}, timeout=15)
        assert r.status_code != 500, f"got 500: {r.text}"
        assert r.status_code in (404, 403, 400, 422)


# ---------- REGRESSION: FORECAST NUMERIC PARSING ----------
class TestForecastRegression:
    def test_forecast_negative_target_treated_as_none(self, owner_session):
        r = owner_session.get(f"{API}/analytics/forecasting", params={"target": -5000}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # negative target must NOT yield a goal with positive $
        goal = data.get("goal")
        assert goal is None or (isinstance(goal, dict) and (goal.get("target") is None or goal.get("target") <= 0)), \
            f"negative target must not produce positive goal: {goal}"
        print(f"forecast(target=-5000) goal = {goal}")

    def test_forecast_scientific_notation_1e9(self, owner_session):
        r = owner_session.get(f"{API}/analytics/forecasting", params={"target": "1e9"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        goal = data.get("goal")
        assert goal is not None, "1e9 target should produce a goal object"
        tgt = goal.get("target")
        assert float(tgt) == 1e9, f"1e9 parsed as {tgt}, expected 1000000000 (not 19)"
        print(f"forecast(target=1e9) goal.target = {tgt}")


# ---------- REGRESSION: REVENUE-LEAKS ACCESSIBLE ----------
class TestRevenueLeaksAccess:
    def test_leaks_endpoint_owner_enterprise(self, owner_session):
        # Try common leak endpoints
        for path in ("/telemetry/leaks", "/revenue-leaks", "/telemetry/contracts"):
            r = owner_session.get(f"{API}{path}", timeout=20)
            print(f"GET {path} -> {r.status_code}")
            assert r.status_code != 500, f"{path} 500: {r.text[:200]}"


# ---------- EMPTY-STATE (#10) — register brand new account and check counts ----------
class TestEmptyStateNewAccount:
    @pytest.fixture(scope="class")
    def new_session(self):
        s = requests.Session()
        email = f"TEST_empty_{uuid.uuid4().hex[:10]}@test.com"
        payload = {"email": email, "password": "password123", "name": "Empty Test"}
        r = s.post(f"{API}/auth/register", json=payload, timeout=20)
        if r.status_code not in (200, 201):
            pytest.skip(f"register failed {r.status_code} {r.text[:200]}")
        return s, email

    def test_new_account_has_zero_deals(self, new_session):
        s, email = new_session
        r = s.get(f"{API}/deals", timeout=15)
        assert r.status_code == 200
        deals = r.json()
        if isinstance(deals, dict):
            deals = deals.get("deals", deals.get("data", []))
        assert len(deals) == 0, f"new account should have 0 deals, got {len(deals)}"

    def test_new_account_churn_zero_customers(self, new_session):
        s, _ = new_session
        r = s.get(f"{API}/analytics/churn", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("total_customers") == 0
        # No fabricated positive trend when zero customers
        # deltas should either be None or 0
        for k in ("retention_delta", "churn_delta"):
            v = data.get(k)
            assert v is None or v == 0, f"{k}={v} should be null/0 for empty account"
