"""Backend tests for Action Workspace endpoints (/api/workspace/*)."""
import os
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


def _cleanup(sess, ids):
    for aid in ids:
        try:
            sess.delete(f"{API}/workspace/actions/{aid}", timeout=15)
        except Exception:
            pass


# --------- gating ---------
def test_unauth_status_401():
    r = requests.get(f"{API}/workspace/status", timeout=20)
    assert r.status_code in (401, 403)


# --------- status ---------
def test_status_shape(sess):
    r = sess.get(f"{API}/workspace/status", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["is_owner"] is True
    assert isinstance(d["providers"], list)
    assert isinstance(d.get("drafts"), int)
    assert isinstance(d.get("executed"), int)
    hs = next((p for p in d["providers"] if p["platform"] == "hubspot"), None)
    assert hs is not None, "hubspot demo connection expected"
    assert hs["connected"] is True
    assert hs["has_token"] is True


# --------- targets (expected empty + error with demo token) ---------
def test_targets_demo_token(sess):
    r = sess.get(f"{API}/workspace/targets?provider=hubspot", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "deals" in d and "contacts" in d and "pipelines" in d
    assert isinstance(d["deals"], list)
    # demo token -> error string expected
    assert d.get("error"), "expected auth error string from demo token"


def test_targets_unknown_provider(sess):
    r = sess.get(f"{API}/workspace/targets?provider=salesforce", timeout=20)
    assert r.status_code == 400


# --------- ai-draft ---------
@pytest.mark.parametrize("kind", ["note", "task", "call", "email"])
def test_ai_draft(sess, kind):
    r = sess.post(f"{API}/workspace/ai-draft",
                  json={"kind": kind, "target_label": "Acme Corp", "context": "renewal talk"}, timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("content"), str) and len(d["content"]) > 0


def test_ai_draft_invalid_kind(sess):
    r = sess.post(f"{API}/workspace/ai-draft", json={"kind": "invalid"}, timeout=20)
    assert r.status_code == 400


def test_ai_draft_deal_rejected(sess):
    r = sess.post(f"{API}/workspace/ai-draft", json={"kind": "deal"}, timeout=20)
    assert r.status_code == 400


# --------- validation ---------
def test_create_note_missing_target(sess):
    r = sess.post(f"{API}/workspace/actions",
                  json={"provider": "hubspot", "kind": "note", "payload": {"body": "hi"}}, timeout=20)
    assert r.status_code == 400
    assert "hubspot" in r.json().get("detail", "").lower()


def test_create_note_missing_body(sess):
    r = sess.post(f"{API}/workspace/actions",
                  json={"provider": "hubspot", "kind": "note",
                        "target": {"type": "deal", "id": "123"}, "payload": {}}, timeout=20)
    assert r.status_code == 400


def test_create_task_missing_title(sess):
    r = sess.post(f"{API}/workspace/actions",
                  json={"provider": "hubspot", "kind": "task",
                        "target": {"type": "deal", "id": "1"}, "payload": {}}, timeout=20)
    assert r.status_code == 400


def test_create_call_missing_title(sess):
    r = sess.post(f"{API}/workspace/actions",
                  json={"provider": "hubspot", "kind": "call",
                        "target": {"type": "contact", "id": "1"}, "payload": {}}, timeout=20)
    assert r.status_code == 400


def test_create_email_missing_subject(sess):
    r = sess.post(f"{API}/workspace/actions",
                  json={"provider": "hubspot", "kind": "email",
                        "target": {"type": "contact", "id": "1"}, "payload": {}}, timeout=20)
    assert r.status_code == 400


def test_create_deal_missing_name(sess):
    r = sess.post(f"{API}/workspace/actions",
                  json={"provider": "hubspot", "kind": "deal", "payload": {}}, timeout=20)
    assert r.status_code == 400


def test_invalid_kind(sess):
    r = sess.post(f"{API}/workspace/actions",
                  json={"provider": "hubspot", "kind": "bogus", "payload": {}}, timeout=20)
    assert r.status_code == 400


def test_invalid_provider(sess):
    r = sess.post(f"{API}/workspace/actions",
                  json={"provider": "salesforce", "kind": "deal",
                        "payload": {"dealname": "x"}}, timeout=20)
    assert r.status_code == 400


# --------- full deal draft -> execute (expected 422) -> delete ---------
def test_deal_draft_execute_graceful_fail_delete(sess):
    created_ids = []
    try:
        r = sess.post(f"{API}/workspace/actions",
                      json={"provider": "hubspot", "kind": "deal",
                            "payload": {"dealname": "TEST_WS_deal", "amount": 1000}}, timeout=20)
        assert r.status_code == 200, r.text
        act = r.json()
        aid = act["action_id"]
        created_ids.append(aid)
        assert act["status"] == "draft"
        assert act["kind"] == "deal"
        assert "_id" not in act

        # list contains it
        r2 = sess.get(f"{API}/workspace/actions", timeout=20)
        assert r2.status_code == 200
        actions = r2.json()
        assert any(a["action_id"] == aid for a in actions)
        # newest first
        assert actions[0]["action_id"] == aid

        # execute -> expect 422 graceful
        r3 = sess.post(f"{API}/workspace/actions/{aid}/execute", timeout=45)
        assert r3.status_code == 422, r3.text
        detail = r3.json().get("detail", "")
        assert "hubspot" in detail.lower()

        # persisted status=failed
        r4 = sess.get(f"{API}/workspace/actions", timeout=20)
        found = next(a for a in r4.json() if a["action_id"] == aid)
        assert found["status"] == "failed"
        assert found.get("result", {}).get("error")

        # delete
        r5 = sess.delete(f"{API}/workspace/actions/{aid}", timeout=20)
        assert r5.status_code == 200
        created_ids.remove(aid)

        # 404 after delete
        r6 = sess.delete(f"{API}/workspace/actions/{aid}", timeout=20)
        assert r6.status_code == 404
    finally:
        _cleanup(sess, created_ids)


def test_execute_nonexistent(sess):
    r = sess.post(f"{API}/workspace/actions/wsa_doesnotexist/execute", timeout=20)
    assert r.status_code == 404


def test_note_draft_create_with_target(sess):
    created_ids = []
    try:
        r = sess.post(f"{API}/workspace/actions",
                      json={"provider": "hubspot", "kind": "note",
                            "target": {"type": "deal", "id": "1", "label": "TEST_target"},
                            "payload": {"body": "TEST_ws_note"}}, timeout=20)
        assert r.status_code == 200
        act = r.json()
        assert act["status"] == "draft"
        assert act["target"]["id"] == "1"
        created_ids.append(act["action_id"])
    finally:
        _cleanup(sess, created_ids)
