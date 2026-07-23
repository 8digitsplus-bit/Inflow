"""Backend tests for Upsell Engine (Revenue Execution).

Covers:
- Access gating: GET /api/upsell/status (enterprise + owner true for testpro)
- Plans CRUD: POST/GET/DELETE /api/upsell/plans
- Candidate scan: POST /api/upsell/scan analyzes deals+telemetry_usage
- Candidate list: GET /api/upsell/candidates
- Candidate PATCH: dismiss transitions
- Actions: /email, /offer AI-drafts (fallback safe)
- /send-email and /notify-sales EXPECTED to return 502/503 in preview (Resend unconfigured)
- Campaigns: POST/GET/PATCH (draft->launched->completed)/DELETE
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

TEST_EMAIL = "testpro@test.com"
TEST_PASSWORD = "password"


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="session")
def owner_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def seeded_candidate_id(owner_session):
    """Ensure at least one candidate exists (from previous smoke test) via a scan."""
    owner_session.post(f"{BASE_URL}/api/upsell/scan", timeout=60)
    r = owner_session.get(f"{BASE_URL}/api/upsell/candidates", timeout=15)
    rows = r.json()
    open_rows = [c for c in rows if c.get("status") != "dismissed"]
    assert open_rows, "no open candidates present after scan — seed missing"
    return open_rows[0]["candidate_id"]


# ------------------------------------------------------------------ status + gating
class TestStatus:
    def test_status_ok(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/upsell/status", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_enterprise"] is True
        assert d["is_owner"] is True
        assert d["owner_email"] == TEST_EMAIL
        assert isinstance(d["plans_count"], int)
        assert isinstance(d["open_candidates"], int)

    def test_status_unauthenticated_denied(self):
        r = requests.get(f"{BASE_URL}/api/upsell/status", timeout=15)
        assert r.status_code in (401, 403)


# ------------------------------------------------------------------ plans CRUD
class TestPlansCRUD:
    def test_plan_lifecycle(self, owner_session):
        payload = {
            "name": f"TEST_Plan_{uuid.uuid4().hex[:6]}",
            "price": 199,
            "period": "monthly",
            "upgrade_url": "https://example.com/upgrade?p=test",
            "description": "TEST plan",
        }
        # CREATE
        r = owner_session.post(f"{BASE_URL}/api/upsell/plans", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        plan = r.json()
        assert plan["name"] == payload["name"]
        assert plan["price"] == 199.0
        assert plan["period"] == "monthly"
        assert plan["upgrade_url"] == payload["upgrade_url"]
        plan_id = plan["plan_id"]
        assert plan_id.startswith("plan_")

        # LIST — should include this plan
        r = owner_session.get(f"{BASE_URL}/api/upsell/plans", timeout=15)
        assert r.status_code == 200
        names = [p["plan_id"] for p in r.json()]
        assert plan_id in names

        # DELETE
        r = owner_session.delete(f"{BASE_URL}/api/upsell/plans/{plan_id}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "deleted"

        # Confirm removed
        r = owner_session.get(f"{BASE_URL}/api/upsell/plans", timeout=15)
        ids = [p["plan_id"] for p in r.json()]
        assert plan_id not in ids

    def test_delete_missing_plan_404(self, owner_session):
        r = owner_session.delete(f"{BASE_URL}/api/upsell/plans/plan_doesnotexist", timeout=10)
        assert r.status_code == 404

    def test_plan_name_required(self, owner_session):
        r = owner_session.post(
            f"{BASE_URL}/api/upsell/plans",
            json={"name": "  ", "price": 10, "period": "monthly"},
            timeout=10,
        )
        assert r.status_code == 400


# ------------------------------------------------------------------ candidate scan + list
class TestScan:
    def test_scan_returns_summary(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/upsell/scan", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "scanned"
        assert d["accounts_analyzed"] >= 1
        assert d["candidates_found"] >= 0
        assert d["total_potential"] >= 0

    def test_candidates_list(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/upsell/candidates", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            c = rows[0]
            for k in ("candidate_id", "account", "signals", "expansion_score",
                     "est_expansion_value", "current_value", "status"):
                assert k in c, f"missing {k} in candidate"


# ------------------------------------------------------------------ AI drafts
class TestActionDrafts:
    def test_upgrade_email_draft(self, owner_session, seeded_candidate_id):
        r = owner_session.post(
            f"{BASE_URL}/api/upsell/candidates/{seeded_candidate_id}/email",
            json={}, timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["candidate_id"] == seeded_candidate_id
        assert isinstance(d["draft"], str)
        assert len(d["draft"]) > 40
        # Draft should mention the account name OR contain a Subject: line
        assert "Subject:" in d["draft"] or d["draft"].lower().startswith("subject")

    def test_discount_offer_draft(self, owner_session, seeded_candidate_id):
        r = owner_session.post(
            f"{BASE_URL}/api/upsell/candidates/{seeded_candidate_id}/offer",
            json={"discount_percent": 20},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["discount_percent"] == 20
        assert isinstance(d["draft"], str) and len(d["draft"]) > 40


# ------------------------------------------------------------------ send-email + notify-sales (expected 502/503 in preview)
class TestEmailSendGracefulFailure:
    """Resend is not configured in preview. These MUST fail gracefully with 502/503."""

    def test_send_email_graceful(self, owner_session, seeded_candidate_id):
        r = owner_session.post(
            f"{BASE_URL}/api/upsell/send-email",
            json={
                "candidate_id": seeded_candidate_id,
                "to": "sink@example.com",
                "subject": "TEST_upgrade",
                "body": "TEST_body",
                "mark_status": "emailed",
            }, timeout=30,
        )
        # PASS if either successful send OR graceful 502/503 status code.
        # NOTE: Cloudflare ingress replaces 502 response bodies with its own HTML
        # error page — so we cannot assert JSON here. The backend log confirms
        # FastAPI returned 502 via HTTPException (not a crash).
        assert r.status_code in (200, 502, 503), r.text

    def test_notify_sales_graceful(self, owner_session, seeded_candidate_id):
        r = owner_session.post(
            f"{BASE_URL}/api/upsell/candidates/{seeded_candidate_id}/notify-sales",
            json={"to": TEST_EMAIL}, timeout=30,
        )
        assert r.status_code in (200, 502, 503), r.text

    def test_send_email_bad_recipient_400(self, owner_session):
        r = owner_session.post(
            f"{BASE_URL}/api/upsell/send-email",
            json={"to": "invalid", "subject": "x", "body": "y"}, timeout=10,
        )
        assert r.status_code == 400


# ------------------------------------------------------------------ candidate PATCH transitions
class TestCandidatePatch:
    def test_dismiss_and_revive(self, owner_session):
        # Get a candidate to dismiss
        rows = owner_session.get(f"{BASE_URL}/api/upsell/candidates", timeout=15).json()
        # Pick one NOT already dismissed; try last one
        open_rows = [c for c in rows if c.get("status") != "dismissed"]
        assert open_rows, "no open candidates to dismiss"
        cid = open_rows[-1]["candidate_id"]

        # Dismiss
        r = owner_session.patch(
            f"{BASE_URL}/api/upsell/candidates/{cid}",
            json={"status": "dismissed"}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "dismissed"

        # Revive to open so subsequent tests still have data
        r = owner_session.patch(
            f"{BASE_URL}/api/upsell/candidates/{cid}",
            json={"status": "open"}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "open"

    def test_invalid_status_400(self, owner_session, seeded_candidate_id):
        r = owner_session.patch(
            f"{BASE_URL}/api/upsell/candidates/{seeded_candidate_id}",
            json={"status": "totally_invalid"}, timeout=10,
        )
        assert r.status_code == 400

    def test_patch_missing_candidate_404(self, owner_session):
        r = owner_session.patch(
            f"{BASE_URL}/api/upsell/candidates/cand_nope",
            json={"status": "open"}, timeout=10,
        )
        assert r.status_code == 404


# ------------------------------------------------------------------ campaigns
class TestCampaigns:
    def test_campaign_lifecycle(self, owner_session, seeded_candidate_id):
        # CREATE
        payload = {
            "name": f"TEST_Camp_{uuid.uuid4().hex[:6]}",
            "candidate_ids": [seeded_candidate_id],
        }
        r = owner_session.post(f"{BASE_URL}/api/upsell/campaigns", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        camp = r.json()
        cid = camp["campaign_id"]
        assert cid.startswith("camp_")
        assert camp["status"] == "draft"
        assert camp["candidate_count"] >= 1
        assert isinstance(camp["message"], str) and len(camp["message"]) > 20

        # LIST
        r = owner_session.get(f"{BASE_URL}/api/upsell/campaigns", timeout=15)
        ids = [c["campaign_id"] for c in r.json()]
        assert cid in ids

        # LAUNCH
        r = owner_session.patch(
            f"{BASE_URL}/api/upsell/campaigns/{cid}",
            json={"status": "launched"}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "launched"

        # COMPLETE
        r = owner_session.patch(
            f"{BASE_URL}/api/upsell/campaigns/{cid}",
            json={"status": "completed"}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

        # DELETE
        r = owner_session.delete(f"{BASE_URL}/api/upsell/campaigns/{cid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "deleted"

    def test_campaign_name_required(self, owner_session):
        r = owner_session.post(
            f"{BASE_URL}/api/upsell/campaigns",
            json={"name": "", "candidate_ids": []}, timeout=15,
        )
        assert r.status_code == 400

    def test_invalid_campaign_status_400(self, owner_session):
        # create a campaign then attempt invalid status
        r = owner_session.post(
            f"{BASE_URL}/api/upsell/campaigns",
            json={"name": f"TEST_C_{uuid.uuid4().hex[:4]}", "candidate_ids": []}, timeout=60,
        )
        cid = r.json()["campaign_id"]
        r = owner_session.patch(
            f"{BASE_URL}/api/upsell/campaigns/{cid}",
            json={"status": "bogus"}, timeout=10,
        )
        assert r.status_code == 400
        # cleanup
        owner_session.delete(f"{BASE_URL}/api/upsell/campaigns/{cid}")
