"""Competitor Intelligence backend API tests (Enterprise-tier, owner-only).

Covers:
- /api/competitors/status
- GET/POST/PUT/DELETE /api/competitors
- POST /api/competitors/{id}/rescan (network + LLM)
- GET/PUT /api/competitors/my-pricing
- GET /api/competitors/benchmark
- Tier gating (basic user should be blocked with 403)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Fall back to what /app/frontend/.env has if the env isn't exported here
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = ln.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass

ENT_EMAIL = "testpro@test.com"
ENT_PASSWORD = "password"
BASIC_EMAIL = "testdemo@inflow.com"
BASIC_PASSWORD = "password"


def _login(session: requests.Session, email: str, password: str) -> bool:
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    return r.status_code == 200


# ------------- Fixtures -------------
@pytest.fixture(scope="module")
def ent_session():
    s = requests.Session()
    if not _login(s, ENT_EMAIL, ENT_PASSWORD):
        pytest.skip("Enterprise login failed")
    return s


@pytest.fixture(scope="module")
def basic_session():
    s = requests.Session()
    if not _login(s, BASIC_EMAIL, BASIC_PASSWORD):
        pytest.skip("Basic login failed")
    return s


# ------------- Status -------------
class TestStatus:
    def test_enterprise_owner_status(self, ent_session):
        r = ent_session.get(f"{BASE_URL}/api/competitors/status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("is_enterprise") is True
        assert d.get("is_owner") is True

    def test_basic_user_status(self, basic_session):
        r = basic_session.get(f"{BASE_URL}/api/competitors/status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("is_enterprise") is False


# ------------- Tier gating -------------
class TestTierGate:
    def test_basic_cannot_list(self, basic_session):
        r = basic_session.get(f"{BASE_URL}/api/competitors", timeout=15)
        assert r.status_code == 403

    def test_basic_cannot_create(self, basic_session):
        r = basic_session.post(
            f"{BASE_URL}/api/competitors",
            json={"name": "TEST_Blocked", "url": "https://example.com/pricing"},
            timeout=15,
        )
        assert r.status_code == 403

    def test_basic_cannot_benchmark(self, basic_session):
        r = basic_session.get(f"{BASE_URL}/api/competitors/benchmark", timeout=15)
        assert r.status_code == 403


# ------------- Enterprise CRUD + extraction -------------
class TestCompetitorLifecycle:
    _competitor_id = None

    def test_list_initially(self, ent_session):
        r = ent_session.get(f"{BASE_URL}/api/competitors", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_benchmark_returns_shape(self, ent_session):
        r = ent_session.get(f"{BASE_URL}/api/competitors/benchmark", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("my_plans", "my_avg", "market_avg", "position", "competitors"):
            assert k in d

    def test_create_competitor_with_manual_url(self, ent_session):
        """Uses example.com so we don't hammer real sites; extraction may fail
        and status becomes 'error' or 'empty' — either is acceptable for the
        API contract test (frontend surfaces the error appropriately)."""
        payload = {"name": "TEST_Manual", "url": "https://example.com"}
        r = ent_session.post(
            f"{BASE_URL}/api/competitors",
            json=payload,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Manual"
        assert d["url"].startswith("http")
        assert "competitor_id" in d
        assert d["status"] in ("extracted", "empty", "error", "manual")
        assert "_id" not in d
        TestCompetitorLifecycle._competitor_id = d["competitor_id"]

    def test_created_persists(self, ent_session):
        cid = TestCompetitorLifecycle._competitor_id
        assert cid, "prior create failed"
        r = ent_session.get(f"{BASE_URL}/api/competitors", timeout=15)
        assert r.status_code == 200
        ids = [c["competitor_id"] for c in r.json()]
        assert cid in ids

    def test_update_plans_status_becomes_manual(self, ent_session):
        cid = TestCompetitorLifecycle._competitor_id
        payload = {
            "name": "TEST_Manual_Updated",
            "plans": [
                {"name": "Starter", "price": 10.0, "period": "monthly", "currency": "USD", "features": ["1 seat"]},
                {"name": "Pro", "price": 30.0, "period": "monthly", "currency": "USD", "features": ["unlimited"]},
            ],
        }
        r = ent_session.put(
            f"{BASE_URL}/api/competitors/{cid}",
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Manual_Updated"
        assert d["status"] == "manual"
        assert len(d["plans"]) == 2
        assert d["plans"][0]["price"] == 10.0

    def test_benchmark_reflects_competitor(self, ent_session):
        r = ent_session.get(f"{BASE_URL}/api/competitors/benchmark", timeout=15)
        assert r.status_code == 200
        d = r.json()
        cid = TestCompetitorLifecycle._competitor_id
        matching = [c for c in d["competitors"] if c["competitor_id"] == cid]
        assert matching, "competitor missing from benchmark"
        assert matching[0]["avg_price"] == 20.0  # (10+30)/2
        assert matching[0]["plan_count"] == 2

    def test_my_pricing_get_and_put(self, ent_session):
        r = ent_session.get(f"{BASE_URL}/api/competitors/my-pricing", timeout=15)
        assert r.status_code == 200
        assert "plans" in r.json()

        payload = {"plans": [
            {"name": "TEST_Basic", "price": 15.0, "period": "monthly", "currency": "USD", "features": ["a"]},
            {"name": "TEST_Pro", "price": 25.0, "period": "monthly", "currency": "USD", "features": ["b"]},
        ]}
        r2 = ent_session.put(
            f"{BASE_URL}/api/competitors/my-pricing",
            json=payload,
            timeout=15,
        )
        assert r2.status_code == 200
        assert len(r2.json()["plans"]) == 2

        # verify GET reflects it
        r3 = ent_session.get(f"{BASE_URL}/api/competitors/my-pricing", timeout=15)
        assert r3.status_code == 200
        assert len(r3.json()["plans"]) == 2

    def test_benchmark_position_computed(self, ent_session):
        r = ent_session.get(f"{BASE_URL}/api/competitors/benchmark", timeout=15)
        d = r.json()
        # my avg = 20, competitor avg = 20 → inline
        assert d["my_avg"] == 20.0
        assert d["position"] in ("inline", "below", "above")

    def test_delete_competitor(self, ent_session):
        cid = TestCompetitorLifecycle._competitor_id
        r = ent_session.delete(f"{BASE_URL}/api/competitors/{cid}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "deleted"

        # verify absent
        r2 = ent_session.get(f"{BASE_URL}/api/competitors", timeout=15)
        ids = [c["competitor_id"] for c in r2.json()]
        assert cid not in ids

    def test_delete_missing_404(self, ent_session):
        r = ent_session.delete(f"{BASE_URL}/api/competitors/does_not_exist_xyz", timeout=15)
        assert r.status_code == 404

    def test_cleanup_my_pricing(self, ent_session):
        """Reset my-pricing so we don't pollute other tests."""
        r = ent_session.put(
            f"{BASE_URL}/api/competitors/my-pricing",
            json={"plans": []},
            timeout=15,
        )
        assert r.status_code == 200
