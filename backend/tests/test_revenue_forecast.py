"""Backend tests for the probabilistic Revenue Forecast (Monte Carlo)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://revenue-exec.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "testpro@test.com", "password": "password"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def auth_headers(auth_session):
    # Return the session itself for callers using `.get`
    return auth_session


def test_forecasting_returns_monte_carlo(auth_headers):
    r = auth_headers.get(f"{BASE_URL}/api/analytics/forecasting", timeout=60)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data.get("method") == "monte_carlo", f"method={data.get('method')}"
    rng = data.get("range") or {}
    for k in ("p10", "p50", "p90"):
        assert k in rng, f"missing range.{k}"
        assert isinstance(rng[k], (int, float))
    # p10 <= p50 <= p90
    assert rng["p10"] <= rng["p50"] <= rng["p90"], f"non-monotonic range: {rng}"


def test_forecasting_monthly_and_quarterly(auth_headers):
    r = auth_headers.get(f"{BASE_URL}/api/analytics/forecasting", timeout=60)
    assert r.status_code == 200
    data = r.json()
    monthly = data.get("monthly_forecast") or []
    assert len(monthly) >= 1, "monthly_forecast empty"
    m0 = monthly[0]
    for k in ("p10", "p50", "p90", "pipeline", "recurring"):
        assert k in m0, f"monthly missing {k}: {m0}"
    quarterly = data.get("quarterly_forecast") or []
    assert len(quarterly) >= 1, "quarterly_forecast empty"


def test_forecasting_data_sources_top_deals_velocity(auth_headers):
    r = auth_headers.get(f"{BASE_URL}/api/analytics/forecasting", timeout=60)
    data = r.json()
    ds = data.get("data_sources")
    assert isinstance(ds, (list, dict)) and ds, "data_sources missing/empty"
    assert "top_deals" in data
    assert "velocity" in data


def test_forecasting_with_target_returns_goal(auth_headers):
    r = auth_headers.get(
        f"{BASE_URL}/api/analytics/forecasting?target=500000",
        timeout=60,
    )
    assert r.status_code == 200, r.text[:300]
    goal = r.json().get("goal") or {}
    assert goal.get("target") == 500000, f"goal={goal}"
    prob = goal.get("probability")
    assert prob is not None and 0 <= prob <= 100, f"probability={prob}"


def test_forecasting_tiny_target_high_probability(auth_headers):
    r = auth_headers.get(f"{BASE_URL}/api/analytics/forecasting?target=1000", timeout=60)
    goal = r.json().get("goal") or {}
    assert goal.get("probability", 0) >= 95, f"tiny target prob too low: {goal}"


def test_forecasting_huge_target_low_probability(auth_headers):
    r = auth_headers.get(f"{BASE_URL}/api/analytics/forecasting?target=99999999", timeout=60)
    goal = r.json().get("goal") or {}
    assert goal.get("probability", 100) <= 5, f"huge target prob too high: {goal}"


def test_forecast_narrative_endpoint(auth_headers):
    r = auth_headers.get(f"{BASE_URL}/api/analytics/forecast-narrative", timeout=90)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert "narrative" in data and isinstance(data["narrative"], str) and len(data["narrative"]) > 0
    assert "ai_used" in data
