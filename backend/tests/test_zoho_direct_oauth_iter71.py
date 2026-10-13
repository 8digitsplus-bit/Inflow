"""
Iteration 71 — InFlow's own direct Zoho OAuth (Multi-DC).
Replaces iter69 (direct paste-creds) and iter70 (Scalekit Zoho) tests.

Covers:
 - GET /api/integrations/zoho/status (owner) → configured:true, connected:None
 - GET /api/integrations/zoho/start → url + scopes + state row stored
 - unauthenticated start/status → 401/403
 - GET /api/integrations/zoho/callback error flows (bogus/missing/reused state,
   bad accounts-server, access_denied)
 - POST sync/disconnect → 404 when not connected
 - Scalekit no longer offers Zoho
 - /api/business/platforms no 'zoho'; POST /api/business/connect/zoho → 404
 - Workspace/Outreach/High-Intent with provider zoho and no connection → graceful 4xx (no 500)
 - FAKE zoho connection seed: /status, /sync, workspace targets/execute,
   /disconnect; then cleanup.
"""
import os
import uuid
from urllib.parse import urlparse, parse_qs

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"
EMAIL = "testpro@test.com"
PW = "password"

TESTPRO_ORG = "org_15337f4cefc9"
TESTPRO_USER = "user_393ea5f333cb"

EXPECTED_CLIENT_ID = "1000.2CVW4BT2Q3OJ13JLQOQT4K5YXCJ7VL"
EXPECTED_SCOPES = {
    "ZohoCRM.modules.deals.ALL", "ZohoCRM.modules.contacts.ALL", "ZohoCRM.modules.notes.ALL",
    "ZohoCRM.modules.tasks.ALL", "ZohoCRM.modules.calls.ALL", "ZohoCRM.modules.accounts.ALL",
    "ZohoCRM.settings.fields.ALL", "ZohoCRM.users.READ",
}


def _db():
    from pymongo import MongoClient
    env = {}
    with open("/app/backend/.env") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


def _encrypt(plain: str) -> str:
    import sys
    sys.path.insert(0, "/app/backend")
    from utils.crypto import encrypt
    return encrypt(plain)


@pytest.fixture(scope="session")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PW}, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture
def no_zoho_conn():
    """Ensure testpro has no zoho connection for the test, restore nothing (there was none)."""
    db = _db()
    pre = db.business_connections.find_one({"org_id": TESTPRO_ORG, "platform": "zoho"})
    if pre:
        db.business_connections.delete_many({"org_id": TESTPRO_ORG, "platform": "zoho"})
    yield
    # restore if we removed something
    if pre:
        pre.pop("_id", None)
        db.business_connections.insert_one(pre)


# ============= AUTH GATING =============
def test_status_unauthenticated_401():
    r = requests.get(f"{API}/integrations/zoho/status", timeout=15)
    assert r.status_code in (401, 403), (r.status_code, r.text)


def test_start_unauthenticated_401():
    r = requests.get(f"{API}/integrations/zoho/start", timeout=15)
    assert r.status_code in (401, 403), (r.status_code, r.text)


# ============= STATUS =============
def test_status_configured_not_connected(sess, no_zoho_conn):
    r = sess.get(f"{API}/integrations/zoho/status", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("configured") is True
    assert d.get("connected") is None


# ============= START =============
def test_start_returns_valid_zoho_url(sess, no_zoho_conn):
    r = sess.get(f"{API}/integrations/zoho/start", timeout=20)
    assert r.status_code == 200, r.text
    url = r.json().get("url", "")
    assert url.startswith("https://accounts.zoho.com/oauth/v2/auth"), url
    q = parse_qs(urlparse(url).query)
    assert q.get("response_type") == ["code"]
    assert q.get("client_id") == [EXPECTED_CLIENT_ID]
    assert q.get("access_type") == ["offline"]
    assert q.get("prompt") == ["consent"]
    assert q.get("redirect_uri", [""])[0].endswith("/api/integrations/zoho/callback")
    scopes = set((q.get("scope", [""])[0]).split(","))
    assert scopes == EXPECTED_SCOPES, scopes
    state = q.get("state", [""])[0]
    assert state and len(state) >= 20
    # state persisted
    db = _db()
    row = db.zoho_oauth_states.find_one({"state": state})
    assert row and row.get("org_id") == TESTPRO_ORG
    db.zoho_oauth_states.delete_one({"state": state})


# ============= CALLBACK ERROR FLOWS =============
def _callback(sess, **params):
    return sess.get(f"{API}/integrations/zoho/callback", params=params,
                    timeout=20, allow_redirects=False)


def test_callback_missing_state_redirects_with_error(sess):
    r = _callback(sess)
    assert r.status_code == 307
    assert "zoho_error=" in r.headers.get("location", "")
    assert "expired" in r.headers["location"].lower()


def test_callback_bogus_state(sess):
    r = _callback(sess, state="not-a-real-state", code="x",
                  **{"accounts-server": "https://accounts.zoho.com"})
    assert r.status_code == 307
    loc = r.headers.get("location", "")
    assert "zoho_error=" in loc and "expired" in loc.lower()


def test_callback_reused_state(sess):
    # Generate real state
    r = sess.get(f"{API}/integrations/zoho/start", timeout=20)
    url = r.json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    # First use: bad accounts-server -> consumes state, redirect with error
    r1 = _callback(sess, state=state, code="x",
                   **{"accounts-server": "https://evil.example.com"})
    assert r1.status_code == 307
    loc1 = r1.headers.get("location", "")
    assert "zoho_error=" in loc1
    # Reuse: state already consumed
    r2 = _callback(sess, state=state, code="x",
                   **{"accounts-server": "https://accounts.zoho.com"})
    assert r2.status_code == 307
    assert "expired" in r2.headers.get("location", "").lower()
    # No connection stored
    db = _db()
    assert db.business_connections.find_one(
        {"org_id": TESTPRO_ORG, "platform": "zoho", "provider": "zoho_oauth"}) is None


def test_callback_access_denied(sess):
    r = sess.get(f"{API}/integrations/zoho/start", timeout=20)
    state = parse_qs(urlparse(r.json()["url"]).query)["state"][0]
    rc = _callback(sess, state=state, error="access_denied")
    assert rc.status_code == 307
    loc = rc.headers.get("location", "")
    assert "zoho_error=" in loc
    assert "cancel" in loc.lower()


# ============= SYNC / DISCONNECT 404s =============
def test_sync_404_when_not_connected(sess, no_zoho_conn):
    r = sess.post(f"{API}/integrations/zoho/sync", timeout=20)
    assert r.status_code == 404, r.text
    assert "zoho" in r.json().get("detail", "").lower()


def test_disconnect_404_when_not_connected(sess, no_zoho_conn):
    r = sess.post(f"{API}/integrations/zoho/disconnect", timeout=20)
    assert r.status_code == 404, r.text


# ============= SCALEKIT NO LONGER OFFERS ZOHO =============
def test_scalekit_status_no_zoho(sess):
    r = sess.get(f"{API}/integrations/scalekit/status", timeout=20)
    assert r.status_code == 200
    conns = sorted(r.json().get("connectors") or [])
    assert conns == ["quickbooks", "stripe"], conns


def test_scalekit_zoho_start_404(sess):
    r = sess.get(f"{API}/integrations/scalekit/zoho/start", timeout=20,
                 allow_redirects=False)
    assert r.status_code == 404, (r.status_code, r.text)


# ============= BUSINESS PLATFORMS =============
def test_business_platforms_no_zoho(sess):
    r = sess.get(f"{API}/business/platforms", timeout=20)
    assert r.status_code == 200
    data = r.json()
    plats = data if isinstance(data, list) else data.get("platforms", [])
    ids = {(p.get("platform_id") or p.get("id")) for p in plats}
    assert "zoho" not in ids, f"zoho present: {ids}"


def test_business_connect_zoho_404(sess):
    r = sess.post(f"{API}/business/connect/zoho", json={"x": "y"}, timeout=20)
    assert r.status_code == 404, r.text


# ============= NO CONNECTION — WORKSPACE/OUTREACH/INTENT GRACEFUL =============
def test_workspace_targets_zoho_no_connection_graceful(sess, no_zoho_conn):
    r = sess.get(f"{API}/workspace/targets?provider=zoho", timeout=30)
    assert r.status_code != 500, r.text
    # Spec: graceful 4xx is fine (readable error). 200 with error key also acceptable.
    assert r.status_code in (200, 400, 404, 422), r.text
    if r.status_code == 200:
        d = r.json()
        assert ("error" in d) or (isinstance(d.get("deals"), list) and isinstance(d.get("contacts"), list))
    else:
        assert "zoho" in r.json().get("detail", "").lower()


def test_workspace_status_zoho_absent_or_false(sess, no_zoho_conn):
    r = sess.get(f"{API}/workspace/status", timeout=20)
    assert r.status_code == 200
    providers = r.json().get("providers") or []
    z = next((p for p in providers if p.get("platform") == "zoho"), None)
    # zoho entry can be absent or marked not-connected
    if z is not None:
        assert z.get("connected") in (False, None)


def test_intent_status_destinations_zoho_false(sess, no_zoho_conn):
    r = sess.get(f"{API}/intent/status", timeout=20)
    assert r.status_code == 200
    dests = r.json().get("destinations") or {}
    assert dests.get("zoho") in (False, None), dests


# ============= FAKE ZOHO CONNECTION — END-TO-END READABLE ERRORS =============
@pytest.fixture
def fake_zoho_conn():
    """Insert a fake Zoho OAuth connection; cleanup after."""
    db = _db()
    doc = {
        "connection_id": "conn_fake_zoho_iter71",
        "org_id": TESTPRO_ORG, "user_id": TESTPRO_USER,
        "platform": "zoho", "provider": "zoho_oauth",
        "status": "ACTIVE", "is_live": True, "revenue_role": "pipeline",
        "account_name": "Zoho CRM — fake",
        "refresh_token_encrypted": _encrypt("bogus"),
        "accounts_server": "https://accounts.zoho.uk",
        "instance_url": "https://www.zohoapis.uk",
        "location": "uk",
        "connected_at": "2026-01-01T00:00:00+00:00",
        "records_synced": 0,
    }
    db.business_connections.update_one(
        {"org_id": TESTPRO_ORG, "platform": "zoho", "provider": "zoho_oauth"},
        {"$set": doc}, upsert=True)
    yield doc
    db.business_connections.delete_many({"org_id": TESTPRO_ORG, "platform": "zoho"})


def test_fake_status_shows_connected(sess, fake_zoho_conn):
    r = sess.get(f"{API}/integrations/zoho/status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d.get("configured") is True
    assert d.get("connected") is not None
    assert d["connected"].get("status") == "ACTIVE"
    assert d["connected"].get("location") == "uk"


def test_fake_sync_graceful_400(sess, fake_zoho_conn):
    r = sess.post(f"{API}/integrations/zoho/sync", timeout=45)
    assert r.status_code == 400, (r.status_code, r.text)
    detail = r.json().get("detail", "").lower()
    assert "sync failed" in detail
    # friendly text about re-sign-in or zoho failure
    assert any(k in detail for k in ("zoho", "expired", "sign-in", "invalid"))


def test_fake_workspace_targets_readable_error(sess, fake_zoho_conn):
    r = sess.get(f"{API}/workspace/targets?provider=zoho", timeout=45)
    assert r.status_code != 500, r.text
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("error"), d


def test_fake_workspace_execute_zoho_not_500(sess, fake_zoho_conn):
    body = {"provider": "zoho", "kind": "note",
            "target": {"type": "deal", "id": "5725767000000123001"},
            "payload": {"body": "TEST_iter71 note"}}
    r = sess.post(f"{API}/workspace/actions", json=body, timeout=20)
    assert r.status_code == 200, r.text
    aid = r.json()["action_id"]
    try:
        rx = sess.post(f"{API}/workspace/actions/{aid}/execute", timeout=45)
        assert rx.status_code != 500, (rx.status_code, rx.text)
        assert 400 <= rx.status_code < 500, rx.text
        rl = sess.get(f"{API}/workspace/actions", timeout=20)
        found = next(a for a in rl.json() if a["action_id"] == aid)
        assert found["status"] == "failed"
    finally:
        sess.delete(f"{API}/workspace/actions/{aid}", timeout=20)


def test_fake_disconnect_removes_row(sess, fake_zoho_conn):
    r = sess.post(f"{API}/integrations/zoho/disconnect", timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    db = _db()
    assert db.business_connections.find_one(
        {"org_id": TESTPRO_ORG, "platform": "zoho", "provider": "zoho_oauth"}) is None
    # second call -> 404
    r2 = sess.post(f"{API}/integrations/zoho/disconnect", timeout=20)
    assert r2.status_code == 404
