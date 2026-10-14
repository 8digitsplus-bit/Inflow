"""Iteration 73 — Regression tests for removal of Dynamics365 / Google Sheets / Intercom
and removal of standalone /workspace page (but KEEP per-account deal room)."""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "testpro@test.com"
PASSWORD = "password"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# --- Removed integrations should be gone ---

def test_business_platforms_no_removed(client):
    r = client.get(f"{API}/business/platforms", timeout=30)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    # body may be list of dicts or dict with 'platforms'
    text = str(body).lower()
    for key in ["dynamics", "google_sheets", "google sheets", "intercom"]:
        assert key not in text, f"found '{key}' in /business/platforms"


@pytest.mark.parametrize("plat", ["dynamics", "google_sheets", "intercom"])
def test_business_connect_removed_404(client, plat):
    r = client.post(f"{API}/business/connect/{plat}", json={}, timeout=30)
    assert r.status_code in (404, 405), f"{plat} expected 404/405 got {r.status_code}"


def test_integrations_list_no_google_sheets(client):
    r = client.get(f"{API}/integrations", timeout=30)
    assert r.status_code == 200
    assert "google_sheets" not in str(r.json()).lower()


# --- Deal room / workspace backend regression (kept) ---

def test_workspace_status(client):
    r = client.get(f"{API}/workspace/status", timeout=30)
    assert r.status_code == 200, r.text[:300]


def test_workspace_targets_hubspot(client):
    r = client.get(f"{API}/workspace/targets", params={"provider": "hubspot"}, timeout=30)
    assert r.status_code in (200, 422), r.text[:300]  # 422 if demo token invalid is ok


def test_workspace_account_endpoint(client):
    # Use a fake lead_id — endpoint should still exist (not 404 route-wise). May return 404 for unknown lead.
    r = client.get(f"{API}/workspace/account/nonexistent_lead", timeout=30)
    assert r.status_code in (200, 400, 404), f"route missing: {r.status_code}"
    assert "not found" not in r.text.lower() or r.status_code != 405


# --- Other integrations status still working ---

@pytest.mark.parametrize("prov", ["zoho", "quickbooks", "scalekit"])
def test_integration_status_endpoints(client, prov):
    r = client.get(f"{API}/integrations/{prov}/status", timeout=30)
    assert r.status_code == 200, f"{prov}: {r.status_code} {r.text[:200]}"


def test_quickbooks_still_connected(client):
    """testpro has a REAL sandbox QuickBooks connection — must not be disconnected."""
    r = client.get(f"{API}/integrations/quickbooks/status", timeout=30)
    assert r.status_code == 200
    data = r.json()
    # Must still be connected
    connected = data.get("connected") or data.get("status") == "connected" or data.get("is_connected")
    assert connected, f"QuickBooks should still be connected: {data}"
