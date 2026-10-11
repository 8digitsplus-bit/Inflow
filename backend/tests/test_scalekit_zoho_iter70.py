"""
Iteration 70: Scalekit Zoho CRM connection (replaces direct Zoho setup).
Covers:
 - /api/integrations/scalekit/status => connectors == {quickbooks, stripe, zoho}, configured True
 - /api/integrations/scalekit/zoho/start => 400 'zohocrm' connection not created yet
 - /api/business/platforms no longer has zoho; /api/business/connect/zoho -> 404
 - /api/integrations/scalekit/zoho/sync => 400 Scalekit 404 (fake account id)
 - /api/workspace/status includes zoho; /targets?provider=zoho => 200 with graceful error
 - workspace draft+execute zoho for task/note/call/deal/offer => graceful failure (not 500)
 - /workspace/account/{lead_id}?provider=zoho => crm.error readable
 - /intent/status destinations.zoho True; /intent/profiles/{lead}/push zoho -> 4xx readable
 - /outreach/push-crm provider=zoho -> graceful 4xx
 - NEW: /integrations/scalekit/{connector}/disconnect:
      * removes zoho business_connection + synced-provider=scalekit deals
      * 404 when not connected
      * 404 for unsupported connector
      * re-seeds the demo zoho row afterwards.
 - Legacy migration: inserted legacy direct zoho row for fresh user; start deletes it.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"
EMAIL = "testpro@test.com"
PW = "password"

TESTPRO_ORG = "org_15337f4cefc9"
TESTPRO_USER = "user_393ea5f333cb"
FAKE_SK_ACCOUNT = "ca_100000000000000001"

DEMO_ZOHO_DOC = {
    "org_id": TESTPRO_ORG,
    "user_id": TESTPRO_USER,
    "platform": "zoho",
    "provider": "scalekit",
    "scalekit_account_id": FAKE_SK_ACCOUNT,
    "status": "ACTIVE",
    "account_name": "Zoho CRM (via Scalekit)",
    "revenue_role": "pipeline",
    "is_live": True,
}


def _db():
    """Return a sync pymongo db handle for direct inserts/cleanup."""
    from pymongo import MongoClient
    # Load backend/.env to get MONGO_URL/DB_NAME
    env = {}
    with open("/app/backend/.env") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


@pytest.fixture(scope="session")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PW}, timeout=30)
    assert r.status_code == 200, r.text
    return s


# -------- Scalekit status / start --------
def test_scalekit_status(sess):
    r = sess.get(f"{API}/integrations/scalekit/status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d.get("configured") is True
    conns = d.get("connectors") or []
    names = [c if isinstance(c, str) else c.get("id") or c.get("name") for c in conns]
    assert sorted(names) == ["quickbooks", "stripe", "zoho"], names


def test_scalekit_zoho_start_readable_400(sess):
    r = sess.get(f"{API}/integrations/scalekit/zoho/start", timeout=30, allow_redirects=False)
    assert r.status_code == 400, (r.status_code, r.text)
    detail = r.json().get("detail", "").lower()
    assert "zohocrm" in detail or "connection" in detail, detail


# -------- business platforms / connect --------
def test_business_platforms_no_zoho(sess):
    r = sess.get(f"{API}/business/platforms", timeout=20)
    assert r.status_code == 200
    plats = r.json() if isinstance(r.json(), list) else r.json().get("platforms", [])
    ids = {p.get("platform_id") or p.get("id") for p in plats}
    assert "zoho" not in ids, f"zoho still in platforms: {ids}"


def test_business_connect_zoho_404(sess):
    r = sess.post(f"{API}/business/connect/zoho", json={"client_id": "x", "client_secret": "y"}, timeout=20)
    assert r.status_code == 404, r.text


# -------- scalekit zoho sync (fake account) --------
def test_scalekit_zoho_sync_graceful_400(sess):
    # Ensure demo row exists first
    db = _db()
    db.business_connections.update_one(
        {"org_id": TESTPRO_ORG, "platform": "zoho", "provider": "scalekit"},
        {"$set": DEMO_ZOHO_DOC}, upsert=True)
    r = sess.post(f"{API}/integrations/scalekit/zoho/sync", timeout=45)
    assert r.status_code == 400, (r.status_code, r.text)
    detail = r.json().get("detail", "").lower()
    assert "sync failed" in detail, detail
    assert "scalekit" in detail or "404" in detail or "not found" in detail, detail


# -------- workspace --------
def test_workspace_status_includes_zoho(sess):
    r = sess.get(f"{API}/workspace/status", timeout=20)
    assert r.status_code == 200
    plats = {p["platform"] for p in r.json()["providers"]}
    assert "zoho" in plats, plats


def test_workspace_targets_zoho_graceful(sess):
    r = sess.get(f"{API}/workspace/targets?provider=zoho", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("error"), d
    assert "scalekit" in d["error"].lower() or "connection" in d["error"].lower() or "zoho" in d["error"].lower()


@pytest.mark.parametrize("kind,payload", [
    ("task", {"title": "TEST_iter70 task"}),
    ("note", {"body": "TEST_iter70 note"}),
    ("call", {"title": "TEST_iter70 call", "notes": "hi"}),
    ("deal", {"dealname": "TEST_iter70 deal", "amount": 1000}),
    ("offer", {"title": "TEST_iter70 offer", "amount": 500}),
])
def test_workspace_zoho_draft_execute_graceful(sess, kind, payload):
    body = {"provider": "zoho", "kind": kind,
            "target": {"type": "deal", "id": "5725767000000123001"}, "payload": payload}
    r = sess.post(f"{API}/workspace/actions", json=body, timeout=20)
    assert r.status_code == 200, r.text
    aid = r.json()["action_id"]
    try:
        rx = sess.post(f"{API}/workspace/actions/{aid}/execute", timeout=45)
        # Must NOT 500
        assert rx.status_code != 500, (rx.status_code, rx.text)
        assert 400 <= rx.status_code < 500, rx.text
        rl = sess.get(f"{API}/workspace/actions", timeout=20)
        found = next(a for a in rl.json() if a["action_id"] == aid)
        assert found["status"] == "failed"
    finally:
        sess.delete(f"{API}/workspace/actions/{aid}", timeout=20)


# -------- account/{lead_id} + intent + outreach --------
@pytest.fixture(scope="session")
def a_lead_id(sess):
    r = sess.get(f"{API}/intent/profiles", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    leads = d.get("profiles") or d.get("leads") if isinstance(d, dict) else d
    assert leads
    return leads[0]["lead_id"]


def test_account_room_zoho_error(sess, a_lead_id):
    r = sess.get(f"{API}/workspace/account/{a_lead_id}?provider=zoho", timeout=45)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["provider"] == "zoho"
    assert d["crm"].get("error"), d["crm"]


def test_intent_status_destinations_zoho(sess):
    r = sess.get(f"{API}/intent/status", timeout=20)
    assert r.status_code == 200
    assert r.json().get("destinations", {}).get("zoho") is True


def test_intent_push_zoho_graceful(sess, a_lead_id):
    r = sess.post(f"{API}/intent/profiles/{a_lead_id}/push",
                  json={"destination": "zoho", "kind": "briefing"}, timeout=45)
    assert r.status_code != 500
    assert 400 <= r.status_code < 500, r.text


def test_outreach_push_crm_zoho_graceful(sess):
    r = sess.get(f"{API}/outreach/board", timeout=30)
    assert r.status_code == 200
    d = r.json()
    cands = []
    for col in d.get("columns") or []:
        cands += col.get("candidates") or []
    cid = (cands or [{}])[0].get("candidate_id") or (cands or [{}])[0].get("id") or "x"
    rz = sess.post(f"{API}/outreach/push-crm",
                   json={"candidate_id": cid, "provider": "zoho", "kind": "task"}, timeout=45)
    assert rz.status_code != 500
    assert 400 <= rz.status_code < 500, rz.text


# -------- Disconnect endpoint --------
def test_disconnect_unsupported_connector_404(sess):
    r = sess.post(f"{API}/integrations/scalekit/bogus/disconnect", timeout=20)
    assert r.status_code == 404, r.text


def test_disconnect_zoho_then_404_then_reseed(sess):
    db = _db()
    # Ensure a demo synced deal exists tagged provider=scalekit so disconnect removes it
    deal_id = f"deal_TEST_iter70_{uuid.uuid4().hex[:8]}"
    db.deals.insert_one({
        "deal_id": deal_id, "org_id": TESTPRO_ORG, "user_id": TESTPRO_USER,
        "name": "TEST_iter70 Zoho Deal", "company": "Zoho", "value": 100.0,
        "stage": "qualified", "probability": 40, "source": "zoho",
        "synced": True, "provider": "scalekit",
    })
    # Also ensure zoho scalekit row exists
    db.business_connections.update_one(
        {"org_id": TESTPRO_ORG, "platform": "zoho", "provider": "scalekit"},
        {"$set": DEMO_ZOHO_DOC}, upsert=True)
    try:
        r = sess.post(f"{API}/integrations/scalekit/zoho/disconnect", timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        # removed count should be >=1 (we just inserted one)
        assert j.get("records_removed", 0) >= 1, j
        # row gone
        row = db.business_connections.find_one({"org_id": TESTPRO_ORG, "platform": "zoho", "provider": "scalekit"})
        assert row is None, row
        # tagged deal gone
        assert db.deals.find_one({"deal_id": deal_id}) is None
        # second call -> 404
        r2 = sess.post(f"{API}/integrations/scalekit/zoho/disconnect", timeout=20)
        assert r2.status_code == 404, r2.text
    finally:
        # Re-seed the demo row per instruction
        db.business_connections.update_one(
            {"org_id": TESTPRO_ORG, "platform": "zoho", "provider": "scalekit"},
            {"$set": DEMO_ZOHO_DOC}, upsert=True)
        db.deals.delete_one({"deal_id": deal_id})
    # Verify re-seed worked
    row = db.business_connections.find_one({"org_id": TESTPRO_ORG, "platform": "zoho", "provider": "scalekit"})
    assert row and row.get("scalekit_account_id") == FAKE_SK_ACCOUNT


# -------- Legacy migration --------
def test_legacy_direct_zoho_migrated_on_start():
    """Create a brand-new user, insert a legacy (non-scalekit) zoho connection + synced deals,
    call /scalekit/zoho/start, expect 400 (because no 'zohocrm' connection in dashboard) BUT the
    legacy row and its deals must be gone."""
    db = _db()
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_iter70_{uuid.uuid4().hex[:8]}@test.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "password123", "name": "TEST iter70",
        "company": "TEST iter70 Co",
    }, timeout=30)
    assert r.status_code in (200, 201), r.text
    # login (cookie auth)
    s.post(f"{API}/auth/login", json={"email": email, "password": "password123"}, timeout=30)
    me = s.get(f"{API}/auth/me", timeout=20)
    assert me.status_code == 200, me.text
    org_id = me.json().get("org_id") or me.json().get("user", {}).get("org_id")
    user_id = me.json().get("user_id") or me.json().get("user", {}).get("user_id")
    assert org_id
    # Insert legacy direct zoho row + synced native deal
    legacy_deal_id = f"deal_TEST_iter70_legacy_{uuid.uuid4().hex[:6]}"
    db.business_connections.insert_one({
        "org_id": org_id, "user_id": user_id, "platform": "zoho", "provider": None,
        "client_id": "legacy", "client_secret": "legacy", "status": "connected",
        "account_name": "Legacy Zoho",
    })
    db.deals.insert_one({
        "deal_id": legacy_deal_id, "org_id": org_id, "user_id": user_id,
        "name": "Legacy Zoho Deal", "value": 10.0, "stage": "qualified",
        "probability": 20, "source": "zoho", "synced": True,
    })
    try:
        r = s.get(f"{API}/integrations/scalekit/zoho/start", timeout=30, allow_redirects=False)
        # Expect 400 because zohocrm connection doesn't exist in dashboard
        assert r.status_code == 400, (r.status_code, r.text)
        # Legacy row must be gone
        row = db.business_connections.find_one({"org_id": org_id, "platform": "zoho", "provider": {"$ne": "scalekit"}})
        assert row is None, f"legacy row not deleted: {row}"
        # Legacy synced deal must be gone
        deal = db.deals.find_one({"deal_id": legacy_deal_id})
        assert deal is None, f"legacy deal not deleted: {deal}"
    finally:
        db.business_connections.delete_many({"org_id": org_id})
        db.deals.delete_many({"org_id": org_id})
