"""
Iteration 72 — InFlow's own direct QuickBooks OAuth (Intuit).
Replaces iter70's Scalekit QuickBooks tests. Covers status/start/callback/sync/disconnect,
Scalekit no-longer-offers-QBO, business platforms absence, and FAKE connection flow.
"""
import os
import time
from urllib.parse import urlparse, parse_qs

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"
EMAIL = "testpro@test.com"
PW = "password"
TESTPRO_ORG = "org_15337f4cefc9"
TESTPRO_USER = "user_393ea5f333cb"
EXPECTED_CLIENT_ID = "ABn5cv1uDBvE3j6EJsZHrbJkn2k3QdcuKoOu0DHXdGWiJXXjNE"


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
def no_qbo_conn():
    db = _db()
    pre = list(db.business_connections.find({"org_id": TESTPRO_ORG, "platform": "quickbooks"}))
    if pre:
        db.business_connections.delete_many({"org_id": TESTPRO_ORG, "platform": "quickbooks"})
    yield
    db.business_connections.delete_many({"org_id": TESTPRO_ORG, "platform": "quickbooks"})
    for doc in pre:
        doc.pop("_id", None)
        db.business_connections.insert_one(doc)


# ========== AUTH ==========
def test_status_unauthenticated():
    r = requests.get(f"{API}/integrations/quickbooks/status", timeout=15)
    assert r.status_code in (401, 403)


def test_start_unauthenticated():
    r = requests.get(f"{API}/integrations/quickbooks/start", timeout=15)
    assert r.status_code in (401, 403)


# ========== STATUS ==========
def test_status_configured_not_connected(sess, no_qbo_conn):
    r = sess.get(f"{API}/integrations/quickbooks/status", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("configured") is True
    assert d.get("sandbox") is True
    assert d.get("connected") is None


# ========== START ==========
def test_start_returns_intuit_url(sess, no_qbo_conn):
    r = sess.get(f"{API}/integrations/quickbooks/start", timeout=20)
    assert r.status_code == 200, r.text
    url = r.json().get("url", "")
    assert url.startswith("https://appcenter.intuit.com/connect/oauth2"), url
    q = parse_qs(urlparse(url).query)
    assert q.get("client_id") == [EXPECTED_CLIENT_ID]
    assert q.get("response_type") == ["code"]
    assert q.get("scope") == ["com.intuit.quickbooks.accounting"]
    assert q.get("redirect_uri", [""])[0].endswith("/api/integrations/quickbooks/callback")
    state = q.get("state", [""])[0]
    assert state and len(state) >= 20
    db = _db()
    row = db.qbo_oauth_states.find_one({"state": state})
    assert row and row.get("org_id") == TESTPRO_ORG
    db.qbo_oauth_states.delete_one({"state": state})


# ========== CALLBACK ERROR FLOWS ==========
def _cb(sess, **params):
    return sess.get(f"{API}/integrations/quickbooks/callback", params=params,
                    timeout=20, allow_redirects=False)


def test_callback_missing_state(sess):
    r = _cb(sess)
    assert r.status_code == 307
    loc = r.headers.get("location", "")
    assert "quickbooks_error=" in loc and "expired" in loc.lower()


def test_callback_bogus_state(sess):
    r = _cb(sess, state="not-real", code="x", realmId="123")
    assert r.status_code == 307
    assert "expired" in r.headers.get("location", "").lower()


def test_callback_reused_state(sess):
    r = sess.get(f"{API}/integrations/quickbooks/start", timeout=20)
    state = parse_qs(urlparse(r.json()["url"]).query)["state"][0]
    # First use: valid state but no code/realmId
    r1 = _cb(sess, state=state)
    assert r1.status_code == 307
    assert "quickbooks_error=" in r1.headers.get("location", "")
    # Reuse should be expired
    r2 = _cb(sess, state=state, code="x", realmId="123")
    assert "expired" in r2.headers.get("location", "").lower()


def test_callback_access_denied(sess):
    r = sess.get(f"{API}/integrations/quickbooks/start", timeout=20)
    state = parse_qs(urlparse(r.json()["url"]).query)["state"][0]
    rc = _cb(sess, state=state, error="access_denied")
    assert rc.status_code == 307
    loc = rc.headers.get("location", "")
    assert "quickbooks_error=" in loc and "cancel" in loc.lower()


def test_callback_missing_code_or_realm(sess):
    r = sess.get(f"{API}/integrations/quickbooks/start", timeout=20)
    state = parse_qs(urlparse(r.json()["url"]).query)["state"][0]
    rc = _cb(sess, state=state, code="x")  # missing realmId
    assert rc.status_code == 307
    assert "quickbooks_error=" in rc.headers.get("location", "")


def test_callback_bogus_code_no_connection_stored(sess, no_qbo_conn):
    r = sess.get(f"{API}/integrations/quickbooks/start", timeout=20)
    state = parse_qs(urlparse(r.json()["url"]).query)["state"][0]
    rc = _cb(sess, state=state, code="bogus_auth_code", realmId="123456789")
    assert rc.status_code == 307
    loc = rc.headers.get("location", "")
    assert "quickbooks_error=" in loc
    db = _db()
    assert db.business_connections.find_one(
        {"org_id": TESTPRO_ORG, "platform": "quickbooks", "provider": "qbo_oauth"}) is None


# ========== SYNC / DISCONNECT 404 ==========
def test_sync_404_when_not_connected(sess, no_qbo_conn):
    r = sess.post(f"{API}/integrations/quickbooks/sync", timeout=20)
    assert r.status_code == 404, r.text


def test_disconnect_404_when_not_connected(sess, no_qbo_conn):
    r = sess.post(f"{API}/integrations/quickbooks/disconnect", timeout=20)
    assert r.status_code == 404, r.text


# ========== SCALEKIT NO LONGER OFFERS QBO ==========
def test_scalekit_status_only_stripe(sess):
    r = sess.get(f"{API}/integrations/scalekit/status", timeout=20)
    assert r.status_code == 200
    conns = sorted(r.json().get("connectors") or [])
    assert conns == ["stripe"], conns


def test_scalekit_qbo_start_404(sess):
    r = sess.get(f"{API}/integrations/scalekit/quickbooks/start", timeout=20,
                 allow_redirects=False)
    assert r.status_code == 404, (r.status_code, r.text)


def test_scalekit_stripe_still_connected(sess):
    r = sess.get(f"{API}/integrations/scalekit/status", timeout=20)
    assert r.status_code == 200
    connected = r.json().get("connected") or {}
    stripe = connected.get("stripe")
    assert stripe is not None, f"Stripe not connected: {connected}"
    assert str(stripe.get("status", "")).upper() == "ACTIVE"


# ========== BUSINESS PLATFORMS ==========
def test_business_platforms_no_quickbooks(sess):
    r = sess.get(f"{API}/business/platforms", timeout=20)
    assert r.status_code == 200
    data = r.json()
    plats = data if isinstance(data, list) else data.get("platforms", [])
    ids = {(p.get("platform_id") or p.get("id")) for p in plats}
    assert "quickbooks" not in ids, f"quickbooks still present: {ids}"
    # Stripe paste-key platform NOT expected either since stripe is scalekit; but if present allow it
    # (spec says Stripe paste-key still exists)
    assert "stripe" in ids, f"stripe missing: {ids}"


def test_business_connect_quickbooks_404(sess):
    r = sess.post(f"{API}/business/connect/quickbooks", json={"x": "y"}, timeout=20)
    assert r.status_code == 404, r.text


# ========== ZOHO REGRESSION ==========
def test_zoho_status_configured(sess):
    r = sess.get(f"{API}/integrations/zoho/status", timeout=20)
    assert r.status_code == 200
    assert r.json().get("configured") is True


def test_zoho_start_returns_accounts_zoho(sess):
    r = sess.get(f"{API}/integrations/zoho/start", timeout=20)
    assert r.status_code == 200
    assert r.json().get("url", "").startswith("https://accounts.zoho.com/oauth/v2/auth")


# ========== FAKE QBO CONNECTION — END-TO-END READABLE ERRORS ==========
@pytest.fixture
def fake_qbo_conn():
    db = _db()
    pre = list(db.business_connections.find({"org_id": TESTPRO_ORG, "platform": "quickbooks"}))
    db.business_connections.delete_many({"org_id": TESTPRO_ORG, "platform": "quickbooks"})
    doc = {
        "connection_id": "conn_fake_qbo",
        "org_id": TESTPRO_ORG, "user_id": TESTPRO_USER,
        "platform": "quickbooks", "provider": "qbo_oauth",
        "status": "ACTIVE", "is_live": True, "revenue_role": "revenue",
        "account_name": "Fake QBO",
        "realm_id": "123", "company_id": "123", "sandbox": True,
        "access_token_encrypted": _encrypt("bogus"),
        "refresh_token_encrypted": _encrypt("bogus"),
        "access_expires_at": 0,
        "connected_at": "2026-01-01T00:00:00+00:00", "records_synced": 0,
    }
    db.business_connections.insert_one(doc)
    yield doc
    db.business_connections.delete_many({"org_id": TESTPRO_ORG, "platform": "quickbooks"})
    for p in pre:
        p.pop("_id", None)
        db.business_connections.insert_one(p)


def test_fake_status_connected(sess, fake_qbo_conn):
    r = sess.get(f"{API}/integrations/quickbooks/status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d.get("connected") is not None
    assert d["connected"].get("status") == "ACTIVE"
    assert d["connected"].get("sandbox") is True
    assert d["connected"].get("account_name") == "Fake QBO"


def test_fake_sync_400_reauth_required(sess, fake_qbo_conn):
    r = sess.post(f"{API}/integrations/quickbooks/sync", timeout=45)
    assert r.status_code == 400, (r.status_code, r.text)
    detail = r.json().get("detail", "").lower()
    assert "sync failed" in detail
    assert any(k in detail for k in ("quickbooks", "expired", "reconnect"))
    # Verify REAUTH_REQUIRED persisted
    db = _db()
    row = db.business_connections.find_one(
        {"org_id": TESTPRO_ORG, "platform": "quickbooks", "provider": "qbo_oauth"})
    assert row and row.get("status") == "REAUTH_REQUIRED"


def test_fake_disconnect_then_404(sess, fake_qbo_conn):
    r = sess.post(f"{API}/integrations/quickbooks/disconnect", timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    db = _db()
    assert db.business_connections.find_one(
        {"org_id": TESTPRO_ORG, "platform": "quickbooks", "provider": "qbo_oauth"}) is None
    r2 = sess.post(f"{API}/integrations/quickbooks/disconnect", timeout=20)
    assert r2.status_code == 404


# ========== REFRESH TOKEN ROTATION (in-process) ==========
@pytest.mark.asyncio
async def test_token_rotation_concurrent_refresh():
    """Monkeypatch _token to count calls; two concurrent access_token() -> exactly 1 refresh."""
    import sys, asyncio
    sys.path.insert(0, "/app/backend")
    from routes import quickbooks_integration as qi
    from database import db as mongo
    from utils.crypto import decrypt

    # Seed a fake connection with expired access token
    doc = {
        "connection_id": "conn_fake_rotation",
        "org_id": TESTPRO_ORG, "user_id": TESTPRO_USER,
        "platform": "quickbooks", "provider": "qbo_oauth",
        "status": "ACTIVE", "is_live": True, "revenue_role": "revenue",
        "account_name": "Rotation Test",
        "realm_id": "999", "company_id": "999", "sandbox": True,
        "access_token_encrypted": qi.encrypt("old_access"),
        "refresh_token_encrypted": qi.encrypt("old_refresh"),
        "access_expires_at": 0,  # expired
        "connected_at": "2026-01-01T00:00:00+00:00", "records_synced": 0,
    }
    await mongo.business_connections.delete_many(
        {"org_id": TESTPRO_ORG, "connection_id": "conn_fake_rotation"})
    await mongo.business_connections.insert_one(dict(doc))

    try:
        calls = {"n": 0}
        orig_token = qi._token

        async def fake_token(data):
            calls["n"] += 1
            await asyncio.sleep(0.3)  # simulate slow refresh
            return {"access_token": "new_access", "refresh_token": "new_refresh",
                    "expires_in": 3600}

        qi._token = fake_token
        qi._locks.pop("conn_fake_rotation", None)
        try:
            fresh = await qi._conn(TESTPRO_ORG)
            # Launch 2 concurrent access_token() calls
            r1, r2 = await asyncio.gather(qi.access_token(fresh), qi.access_token(fresh))
            assert r1 == "new_access"
            assert r2 == "new_access"
            assert calls["n"] == 1, f"Expected 1 refresh, got {calls['n']}"
            # Verify rotated refresh persisted
            persisted = await mongo.business_connections.find_one(
                {"connection_id": "conn_fake_rotation"}, {"_id": 0})
            assert decrypt(persisted["refresh_token_encrypted"]) == "new_refresh"
            assert decrypt(persisted["access_token_encrypted"]) == "new_access"
            assert persisted["access_expires_at"] > time.time() + 3000
        finally:
            qi._token = orig_token
    finally:
        await mongo.business_connections.delete_many({"connection_id": "conn_fake_rotation"})
