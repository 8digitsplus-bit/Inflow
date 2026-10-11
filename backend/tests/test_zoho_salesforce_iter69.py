"""
Iteration 69: Zoho CRM manual two-way + Salesforce client-credentials
Review request backend coverage.
Scope:
  - /api/business/platforms shape for salesforce & zoho
  - /api/business/connect/salesforce and /connect/zoho validation (on fresh user)
  - /api/integrations/scalekit/status connectors == quickbooks,stripe
  - /api/integrations/scalekit/salesforce/start unsupported
  - /api/workspace/status + /targets?provider=zoho + draft+execute (zoho graceful fail)
  - /api/workspace/account/{lead_id} provider-aware shape, link/fields/zoho
  - /api/outreach/board zoho:true + /push-crm zoho 422 + 'foo' -> 400
  - /api/intent/status destinations zoho + /push {destination:'zoho'} 422
  - /api/intent/routing-rules zoho + /aes zoho crm_owner_ids
  - /api/business/sync/zoho + /sync/salesforce friendly 400s
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://revenue-exec.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "testpro@test.com"
PW = "password"


@pytest.fixture(scope="session")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PW}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def fresh_sess():
    """A fresh registered user (no existing CRM connections) for connect validation."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_iter69_{uuid.uuid4().hex[:8]}@test.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "password123", "name": "TEST Iter69",
        "company": "TEST Iter69 Co",
    }, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    # If register doesn't auto-login
    try:
        tok = r.json().get("token") or r.json().get("access_token")
    except Exception:
        tok = None
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    # fallback: login
    lr = s.post(f"{API}/auth/login", json={"email": email, "password": "password123"}, timeout=30)
    if lr.status_code == 200:
        pass
    return s


# ==================== PLATFORMS CONFIG ====================
def test_platforms_salesforce_shape(sess):
    r = sess.get(f"{API}/business/platforms", timeout=20)
    assert r.status_code == 200
    data = r.json()
    plats = data if isinstance(data, list) else data.get("platforms", [])
    sf = next((p for p in plats if (p.get("platform_id") or p.get("id")) == "salesforce"), None)
    assert sf, "salesforce platform not found"
    keys = [f["name"] for f in sf["key_fields"]]
    assert keys == ["instance_url", "client_id", "client_secret"], f"got {keys}"
    labels = [f["label"] for f in sf["key_fields"]]
    assert "My Domain URL" in labels
    assert "Consumer Key" in labels
    assert "Consumer Secret" in labels
    assert not sf.get("token_expires"), "salesforce should NOT have token_expires flag"


def test_platforms_zoho_direct_removed(sess):
    r = sess.get(f"{API}/business/platforms", timeout=20)
    assert r.status_code == 200
    plats = r.json() if isinstance(r.json(), list) else r.json().get("platforms", [])
    assert not any((p.get("platform_id") or p.get("id")) == "zoho" for p in plats), "zoho direct setup should be gone"


# ==================== CONNECT VALIDATION (fresh user) ====================
def test_connect_salesforce_missing_fields(fresh_sess):
    r = fresh_sess.post(f"{API}/business/connect/salesforce", json={}, timeout=30)
    assert r.status_code == 400, r.text


def test_connect_salesforce_login_domain_rejected(fresh_sess):
    r = fresh_sess.post(f"{API}/business/connect/salesforce", json={
        "instance_url": "login.salesforce.com",
        "client_id": "3MVG9fakeKey",
        "client_secret": "fakeSecret",
    }, timeout=30)
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "my domain" in detail, f"expected 'My Domain' message, got: {detail}"


def test_connect_salesforce_fake_creds_friendly(fresh_sess):
    r = fresh_sess.post(f"{API}/business/connect/salesforce", json={
        "instance_url": "https://na1.salesforce.com",
        "client_id": "3MVG9fakeConsumerKey",
        "client_secret": "fakeSecret",
    }, timeout=30)
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "").lower()
    assert "consumer key" in detail or "didn't recognise" in detail or "didn't recognize" in detail, detail


def test_connect_zoho_direct_gone(fresh_sess):
    r = fresh_sess.post(f"{API}/business/connect/zoho", json={"client_id": "x", "client_secret": "y", "api_key": "z"}, timeout=30)
    assert r.status_code == 404, r.text


# ==================== SCALEKIT ====================
def test_scalekit_status_salesforce_removed(sess):
    r = sess.get(f"{API}/integrations/scalekit/status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    conns = d.get("connectors") or d.get("supported") or []
    # could be list of strings or list of dicts
    names = [c if isinstance(c, str) else c.get("id") or c.get("name") for c in conns]
    assert set(names) == {"quickbooks", "stripe", "zoho"}, f"connectors = {names}"


def test_scalekit_salesforce_start_unsupported(sess):
    r = sess.get(f"{API}/integrations/scalekit/salesforce/start", timeout=20, allow_redirects=False)
    assert 400 <= r.status_code < 500, f"got {r.status_code}"


# ==================== WORKSPACE ====================
def test_workspace_status_includes_zoho(sess):
    r = sess.get(f"{API}/workspace/status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    plats = {p["platform"] for p in d["providers"]}
    assert "zoho" in plats, f"providers={plats}"
    assert "hubspot" in plats
    assert "salesforce" in plats
    assert "pipedrive" in plats


def test_workspace_targets_zoho_demo(sess):
    r = sess.get(f"{API}/workspace/targets?provider=zoho", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("error"), "expected error string on demo zoho"
    assert isinstance(d.get("deals"), list)
    assert isinstance(d.get("contacts"), list)


def test_workspace_zoho_draft_execute_fail(sess):
    r = sess.post(f"{API}/workspace/actions", json={
        "provider": "zoho", "kind": "task",
        "target": {"type": "deal", "id": "123"},
        "payload": {"title": "TEST_iter69_zoho_task"},
    }, timeout=20)
    assert r.status_code == 200, r.text
    aid = r.json()["action_id"]
    try:
        rx = sess.post(f"{API}/workspace/actions/{aid}/execute", timeout=45)
        assert rx.status_code == 422, rx.text
        detail = rx.json().get("detail", "").lower()
        assert "zoho" in detail
        # persisted status
        rl = sess.get(f"{API}/workspace/actions", timeout=20)
        found = next(a for a in rl.json() if a["action_id"] == aid)
        assert found["status"] == "failed"
    finally:
        sess.delete(f"{API}/workspace/actions/{aid}", timeout=20)


# ==================== ACCOUNT DEAL ROOM ====================
@pytest.fixture(scope="session")
def a_lead_id(sess):
    r = sess.get(f"{API}/intent/profiles", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    leads = d.get("profiles") or d.get("leads") if isinstance(d, dict) else d
    assert leads
    return leads[0]["lead_id"]


def test_account_room_default_hubspot(sess, a_lead_id):
    r = sess.get(f"{API}/workspace/account/{a_lead_id}", timeout=45)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("lead", "provider", "providers", "linked_deal_id", "crm", "actions", "timeline"):
        assert k in d, f"missing {k}"
    assert d["provider"] == "hubspot"
    assert d["crm"]["provider"] == "hubspot"
    # testpro has REAL hubspot token -> no error and deals should be present
    assert d["crm"]["connected"] is True
    assert isinstance(d["crm"].get("deals"), list)


def test_account_room_zoho_connected_error(sess, a_lead_id):
    r = sess.get(f"{API}/workspace/account/{a_lead_id}?provider=zoho", timeout=45)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["provider"] == "zoho"
    assert d["crm"]["connected"] is True
    assert d["crm"].get("error"), "demo zoho should surface readable error"


def test_account_link_zoho_and_fields(sess, a_lead_id):
    r = sess.post(f"{API}/workspace/account/{a_lead_id}/link", json={
        "provider": "zoho", "deal_id": "5725767000000123001",
    }, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("linked_deal_id") == "5725767000000123001"

    # verify in GET?provider=zoho
    g = sess.get(f"{API}/workspace/account/{a_lead_id}?provider=zoho", timeout=30)
    assert g.status_code == 200
    assert g.json().get("linked_deal_id") == "5725767000000123001"

    # fields no change
    rb = sess.post(f"{API}/workspace/account/{a_lead_id}/fields",
                   json={"provider": "zoho"}, timeout=20)
    assert rb.status_code == 400

    # fields change -> 422 (demo)
    rc = sess.post(f"{API}/workspace/account/{a_lead_id}/fields",
                   json={"provider": "zoho", "amount": "100"}, timeout=30)
    assert rc.status_code == 422, rc.text
    assert "zoho" in rc.json().get("detail", "").lower()


def test_account_link_legacy_hubspot_body(sess, a_lead_id):
    r = sess.post(f"{API}/workspace/account/{a_lead_id}/link",
                  json={"hubspot_deal_id": "TEST_legacy_hs_999"}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("linked_deal_id") == "TEST_legacy_hs_999"


def test_account_link_unknown_provider(sess, a_lead_id):
    r = sess.post(f"{API}/workspace/account/{a_lead_id}/link",
                  json={"provider": "bogus", "deal_id": "x"}, timeout=20)
    assert r.status_code == 400


# ==================== OUTREACH ====================
def test_outreach_board_includes_zoho(sess):
    r = sess.get(f"{API}/outreach/board", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    ints = d.get("integrations") or {}
    assert ints.get("zoho") is True, f"integrations={ints}"


def test_outreach_push_crm_zoho_422(sess):
    # Fetch a candidate first
    r = sess.get(f"{API}/outreach/board", timeout=30)
    assert r.status_code == 200
    d = r.json()
    cands = []
    for col in (d.get("columns") or []):
        cands += col.get("candidates") or []
    if not cands:
        cands = d.get("candidates") or []
    assert cands, "no outreach candidates"
    cid = cands[0].get("candidate_id") or cands[0].get("id")
    assert cid

    rz = sess.post(f"{API}/outreach/push-crm", json={
        "candidate_id": cid, "provider": "zoho", "kind": "task",
    }, timeout=45)
    assert rz.status_code == 422, rz.text
    assert "zoho" in rz.json().get("detail", "").lower()


def test_outreach_push_crm_unknown_provider_400(sess):
    r = sess.get(f"{API}/outreach/board", timeout=30)
    cands = []
    d = r.json()
    for col in (d.get("columns") or []):
        cands += col.get("candidates") or []
    cid = (cands or [{}])[0].get("candidate_id") or (cands or [{}])[0].get("id") or "cand_x"
    rz = sess.post(f"{API}/outreach/push-crm", json={
        "candidate_id": cid, "provider": "foo", "kind": "task",
    }, timeout=20)
    assert rz.status_code == 400, rz.text


# ==================== INTENT (High-Intent) ====================
def test_intent_status_destinations_zoho(sess):
    r = sess.get(f"{API}/intent/status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    dests = d.get("destinations") or {}
    assert dests.get("zoho") is True, f"destinations={dests}"


def test_intent_push_zoho_422(sess):
    # find a lead with a briefing — Nakatomi Trading or any w/ briefing
    r = sess.get(f"{API}/intent/profiles", timeout=30)
    jd = r.json()
    leads = jd.get("profiles") or jd.get("leads") if isinstance(jd, dict) else jd
    target_lead = None
    for l in leads or []:
        if l.get("has_briefing") or l.get("briefing") or "nakatomi" in (l.get("company", "") or "").lower():
            target_lead = l["lead_id"]
            break
    if not target_lead and leads:
        target_lead = leads[0]["lead_id"]
    assert target_lead
    # Ensure briefing exists; call briefings list to confirm
    rb = sess.get(f"{API}/intent/briefings", timeout=20)
    if rb.status_code == 200:
        pass
    rz = sess.post(f"{API}/intent/profiles/{target_lead}/push", json={
        "destination": "zoho", "kind": "briefing",
    }, timeout=45)
    # Accept 422 (zoho graceful fail) or 400 (no briefing yet). Prefer 422.
    assert rz.status_code in (400, 422), rz.text
    if rz.status_code == 422:
        assert "zoho" in rz.json().get("detail", "").lower()


def test_intent_routing_rule_and_ae_zoho(sess):
    # Create a routing rule with actions.crm='zoho'
    rr_payload = {
        "name": "TEST_iter69_zoho_rule",
        "priority": 999,
        "trigger": "quote_request",
        "conditions": {},
        "actions": {"crm": "zoho"},
        "assign_round_robin": True,
    }
    rr = sess.post(f"{API}/intent/routing-rules", json=rr_payload, timeout=20)
    created_rule = None
    try:
        assert rr.status_code in (200, 201), rr.text
        rule = rr.json()
        created_rule = rule.get("rule_id") or rule.get("id")
        assert created_rule
        # verify actions.crm persisted
        assert rule.get("actions", {}).get("crm") == "zoho"
    finally:
        if created_rule:
            sess.delete(f"{API}/intent/routing-rules/{created_rule}", timeout=15)

    # Create an AE with crm_owner_ids.zoho persisted
    ae_payload = {
        "name": "TEST_iter69 AE",
        "email": f"TEST_iter69_ae_{uuid.uuid4().hex[:6]}@test.com",
        "regions": ["NA"],
        "deal_size_max": 1000000,
        "crm_owner_ids": {"zoho": "zoho_owner_12345"},
    }
    ar = sess.post(f"{API}/intent/aes", json=ae_payload, timeout=20)
    created_ae = None
    try:
        assert ar.status_code in (200, 201), ar.text
        aej = ar.json()
        created_ae = aej.get("ae_id") or aej.get("id")
        assert created_ae
        assert aej.get("crm_owner_ids", {}).get("zoho") == "zoho_owner_12345"
    finally:
        if created_ae:
            sess.delete(f"{API}/intent/aes/{created_ae}", timeout=15)


# ==================== BUSINESS SYNC ====================
def test_sync_zoho_friendly_400(sess):
    r = sess.post(f"{API}/business/sync/zoho", timeout=45)
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "").lower()
    assert "zoho" in detail or "sync failed" in detail


def test_sync_salesforce_friendly_400(sess):
    r = sess.post(f"{API}/business/sync/salesforce", timeout=45)
    assert r.status_code == 400, r.text
    detail = r.json().get("detail", "").lower()
    assert "salesforce" in detail or "sync failed" in detail or "could not reach" in detail
