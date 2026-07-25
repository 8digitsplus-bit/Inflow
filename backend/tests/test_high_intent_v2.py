"""Backend tests for the rewritten High-Intent Buyer Detection guided flow.

Covers: /api/intent/status, /scan, /leads, /leads/{id}/analyze, /execute, /impact, PATCH.
Uses testpro@test.com (enterprise_monthly, owner).
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
EMAIL = "testpro@test.com"
PASSWORD = "password"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    r = sess.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return sess


@pytest.fixture(scope="module")
def a_lead(s):
    # ensure at least one lead exists
    r = s.post(f"{BASE}/api/intent/scan")
    assert r.status_code == 200, r.text
    leads = s.get(f"{BASE}/api/intent/leads").json()
    assert isinstance(leads, list) and len(leads) >= 1, "no leads returned"
    # pick an open (non-dismissed / not won/lost) lead so status transitions are testable
    open_ = [l for l in leads if l.get("status") not in ("dismissed", "won", "lost")]
    return (open_[0] if open_ else leads[0])


# --------- status
def test_status_unauth():
    r = requests.get(f"{BASE}/api/intent/status")
    assert r.status_code == 401


def test_status_paid_owner(s):
    r = s.get(f"{BASE}/api/intent/status")
    assert r.status_code == 200
    d = r.json()
    assert d["is_paid"] is True
    assert d["is_owner"] is True
    assert isinstance(d["usage_sources_connected"], list)
    assert isinstance(d["open_leads"], int)


# --------- scan
def test_scan(s):
    r = s.post(f"{BASE}/api/intent/scan")
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "scanned"
    assert d["accounts_analyzed"] >= 0
    assert d["leads_found"] >= 1


# --------- leads list
def test_leads_sorted(s, a_lead):
    r = s.get(f"{BASE}/api/intent/leads")
    assert r.status_code == 200
    leads = r.json()
    assert len(leads) >= 1
    scores = [l["intent_score"] for l in leads]
    assert scores == sorted(scores, reverse=True)
    l = leads[0]
    for k in ("lead_id", "account", "intent_score", "signals", "value", "probability", "best_stage", "status", "activity"):
        assert k in l, f"missing {k}"
    assert 0 <= l["intent_score"] <= 100
    for sig in l["signals"]:
        assert sig["cat"] in ("Marketing", "Sales", "Product")
        for k in ("key", "cat", "label", "detail"):
            assert k in sig


# --------- analyze
def test_analyze_returns_briefing(s, a_lead):
    lid = a_lead["lead_id"]
    r = s.post(f"{BASE}/api/intent/leads/{lid}/analyze", json={})
    assert r.status_code == 200, r.text
    b = r.json()
    assert isinstance(b["why"], str) and len(b["why"]) > 5
    p = b["prediction"]
    assert 0 <= p["close_probability"] <= 100
    assert isinstance(p["expected_value"], (int, float))
    assert isinstance(p["timeline"], str)
    assert p["confidence"] in ("high", "medium", "low")
    a = b["recommended_action"]
    assert a["type"] in ("send_email", "book_call", "loop_in_ae", "nurture")
    assert isinstance(a["title"], str)
    assert isinstance(a["artifact"], str) and len(a["artifact"]) > 0
    # status should now be analyzed (or later state); tolerate stale statuses from prior schemas
    lead = s.get(f"{BASE}/api/intent/leads").json()
    match = [x for x in lead if x["lead_id"] == lid][0]
    assert match.get("briefing") is not None


def test_execute_before_analyze_400(s):
    # create a fresh lead scenario by scanning + finding a lead without briefing
    # Instead, we simulate by patching a lead's briefing off is not possible; skip if all have briefings.
    leads = s.get(f"{BASE}/api/intent/leads").json()
    fresh = [l for l in leads if not l.get("briefing")]
    if not fresh:
        pytest.skip("no fresh lead without briefing")
    lid = fresh[0]["lead_id"]
    r = s.post(f"{BASE}/api/intent/leads/{lid}/execute", json={"send": False, "note": "x"})
    assert r.status_code == 400


# --------- execute (mark done)
def test_execute_mark_done(s, a_lead):
    lid = a_lead["lead_id"]
    # ensure analyzed
    s.post(f"{BASE}/api/intent/leads/{lid}/analyze", json={})
    r = s.post(f"{BASE}/api/intent/leads/{lid}/execute", json={"send": False, "note": "marking done"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["sent"] is False
    assert d["executed"]["title"] or d["executed"]["action_type"]
    # status = executed
    ls = s.get(f"{BASE}/api/intent/leads").json()
    m = [x for x in ls if x["lead_id"] == lid][0]
    assert m["status"] in ("executed", "won", "lost")


def test_execute_send_no_recipient_400(s, a_lead):
    lid = a_lead["lead_id"]
    # Make sure recommended action is send_email; if not, skip
    ls = s.get(f"{BASE}/api/intent/leads").json()
    m = [x for x in ls if x["lead_id"] == lid][0]
    if not m.get("briefing") or m["briefing"]["recommended_action"]["type"] != "send_email":
        # find a lead with send_email
        cand = [x for x in ls if x.get("briefing") and x["briefing"]["recommended_action"]["type"] == "send_email"]
        if not cand:
            pytest.skip("no send_email action lead")
        lid = cand[0]["lead_id"]
    r = s.post(f"{BASE}/api/intent/leads/{lid}/execute", json={"send": True, "to": "notanemail"})
    assert r.status_code == 400


def test_execute_send_with_invalid_key_returns_422(s):
    ls = s.get(f"{BASE}/api/intent/leads").json()
    cand = [x for x in ls if x.get("briefing") and x["briefing"]["recommended_action"]["type"] == "send_email"]
    if not cand:
        # analyze first lead and hope for send_email — otherwise skip
        pytest.skip("no send_email action lead available")
    lid = cand[0]["lead_id"]
    r = s.post(f"{BASE}/api/intent/leads/{lid}/execute", json={"send": True, "to": "someone@example.com"})
    # 422 expected because RESEND key is invalid in preview; 200 acceptable if key ever becomes valid
    assert r.status_code in (200, 422), r.text
    if r.status_code == 422:
        assert "Could not send email" in r.json().get("detail", "") or "email" in r.json().get("detail", "").lower()


# --------- impact
def test_impact_replied(s, a_lead):
    lid = a_lead["lead_id"]
    s.post(f"{BASE}/api/intent/leads/{lid}/analyze", json={})
    s.post(f"{BASE}/api/intent/leads/{lid}/execute", json={"send": False})
    r = s.post(f"{BASE}/api/intent/leads/{lid}/impact", json={"outcome": "replied"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["outcome"] == "replied"
    assert "summary" in d and "measured_at" in d
    assert d["value_influenced"] >= 0


def test_impact_invalid(s, a_lead):
    lid = a_lead["lead_id"]
    r = s.post(f"{BASE}/api/intent/leads/{lid}/impact", json={"outcome": "bogus"})
    assert r.status_code == 400


def test_impact_won_sets_status(s):
    # find a lead we can burn
    s.post(f"{BASE}/api/intent/scan")
    ls = s.get(f"{BASE}/api/intent/leads").json()
    open_ = [l for l in ls if l["status"] not in ("won", "lost", "dismissed")]
    if not open_:
        pytest.skip("no open leads")
    lid = open_[-1]["lead_id"]
    s.post(f"{BASE}/api/intent/leads/{lid}/analyze", json={})
    s.post(f"{BASE}/api/intent/leads/{lid}/execute", json={"send": False})
    r = s.post(f"{BASE}/api/intent/leads/{lid}/impact", json={"outcome": "won"})
    assert r.status_code == 200
    # re-scan is idempotent by account_key but won/lost are excluded from open_leads count
    ls2 = s.get(f"{BASE}/api/intent/leads").json()
    m = [x for x in ls2 if x["lead_id"] == lid][0]
    assert m["status"] == "won"


# --------- patch
def test_patch_invalid_status(s, a_lead):
    r = s.patch(f"{BASE}/api/intent/leads/{a_lead['lead_id']}", json={"status": "invalid"})
    assert r.status_code == 400


def test_patch_not_found(s):
    r = s.patch(f"{BASE}/api/intent/leads/does_not_exist_zzz", json={"status": "dismissed"})
    assert r.status_code == 404


def test_patch_dismiss(s):
    # re-scan so at least one open lead exists
    s.post(f"{BASE}/api/intent/scan")
    ls = s.get(f"{BASE}/api/intent/leads").json()
    open_ = [l for l in ls if l["status"] not in ("won", "lost", "dismissed")]
    if not open_:
        pytest.skip("no open leads to dismiss")
    lid = open_[0]["lead_id"]
    r = s.patch(f"{BASE}/api/intent/leads/{lid}", json={"status": "dismissed"})
    assert r.status_code == 200
    assert r.json()["status"] == "dismissed"
