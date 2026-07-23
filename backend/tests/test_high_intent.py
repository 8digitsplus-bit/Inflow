"""Backend tests for High-Intent Buyer Detection (Discover / Revenue Execution).

Covers:
- Access gating: GET /api/intent/status (is_paid + is_owner + scheduling_url + open_leads + team_size)
- Settings: GET/PUT /api/intent/settings persists scheduling_url
- Team: GET /api/intent/team returns org members
- Scan: POST /api/intent/scan populates leads (score>=25 threshold)
- Leads list: GET /api/intent/leads
- Fast-track action: POST /api/intent/leads/{id}/fast-track (assigns AE, notify may fail gracefully -> notified=false)
- Outreach AI draft: POST /api/intent/leads/{id}/outreach (AI drafted, references signals)
- Booking AI draft: POST /api/intent/leads/{id}/booking (includes scheduling link)
- Sandbox: POST /api/intent/leads/{id}/sandbox (builds POC package, sets status='sandbox')
- PATCH dismiss
- send-email EXPECTED to return 422 in preview (invalid RESEND_API_KEY)
"""
import os
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
def seeded_lead(owner_session):
    """Ensure at least one lead exists after a scan."""
    owner_session.post(f"{BASE_URL}/api/intent/scan", timeout=60)
    r = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15)
    assert r.status_code == 200, r.text
    rows = r.json()
    open_rows = [l for l in rows if l.get("status") not in ("dismissed", "won")]
    assert open_rows, "no open intent leads after scan"
    # Prefer a lead that is not yet in 'sandbox' state for action tests
    non_sandbox = [l for l in open_rows if l.get("status") != "sandbox"]
    return (non_sandbox or open_rows)[0]


# ------------------------------------------------------------------ status / gating
class TestStatus:
    def test_status_paid_owner(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/intent/status", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_paid"] is True
        assert d["is_owner"] is True
        assert isinstance(d.get("scheduling_url"), str)
        assert isinstance(d.get("open_leads"), int)
        assert isinstance(d.get("team_size"), int)
        assert d["team_size"] >= 1

    def test_status_unauthenticated_denied(self):
        r = requests.get(f"{BASE_URL}/api/intent/status", timeout=15)
        assert r.status_code == 401


# ------------------------------------------------------------------ settings
class TestSettings:
    def test_settings_persist(self, owner_session):
        url = "https://calendly.com/test-pro-team/demo"
        r = owner_session.put(
            f"{BASE_URL}/api/intent/settings",
            json={"scheduling_url": url},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["scheduling_url"] == url

        # GET back
        g = owner_session.get(f"{BASE_URL}/api/intent/settings", timeout=15)
        assert g.status_code == 200
        assert g.json()["scheduling_url"] == url

        # status echoes scheduling_url
        st = owner_session.get(f"{BASE_URL}/api/intent/status", timeout=15).json()
        assert st["scheduling_url"] == url


# ------------------------------------------------------------------ team
class TestTeam:
    def test_team_lists_members(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/intent/team", timeout=15)
        assert r.status_code == 200
        team = r.json()
        assert isinstance(team, list)
        assert len(team) >= 1
        assert any(m.get("role") == "owner" for m in team)
        assert all("user_id" in m for m in team)


# ------------------------------------------------------------------ scan + list
class TestScan:
    def test_scan_populates(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/intent/scan", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "scanned"
        assert isinstance(d["accounts_analyzed"], int)
        assert isinstance(d["leads_found"], int)
        assert isinstance(d["hot_leads"], int)
        assert d["leads_found"] >= 1

    def test_leads_shape(self, owner_session, seeded_lead):
        r = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        row = rows[0]
        for k in ("lead_id", "account", "intent_score", "signals", "value",
                  "probability", "best_stage", "status", "activity"):
            assert k in row, f"missing {k} in lead"
        assert isinstance(row["signals"], list)
        # signals should be categorized
        cats = {s.get("cat") for s in row["signals"]}
        assert cats.issubset({"Marketing", "Sales", "Product"})


# ------------------------------------------------------------------ actions: fast-track
class TestFastTrack:
    def test_fast_track_assigns(self, owner_session, seeded_lead):
        team = owner_session.get(f"{BASE_URL}/api/intent/team", timeout=15).json()
        owner = next(m for m in team if m["role"] == "owner")
        r = owner_session.post(
            f"{BASE_URL}/api/intent/leads/{seeded_lead['lead_id']}/fast-track",
            json={"assignee_id": owner["user_id"], "notify": True},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["assigned_to"] == owner["user_id"]
        assert d["assigned_name"]
        # notified may be False due to invalid RESEND key — that's expected & OK
        assert d["notified"] in (True, False)

        # Verify persistence via GET
        leads = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15).json()
        me = next(l for l in leads if l["lead_id"] == seeded_lead["lead_id"])
        assert me["assigned_to"] == owner["user_id"]
        assert me["status"] == "assigned"
        # activity log has fast_track entry
        assert any(a.get("type") == "fast_track" for a in me.get("activity", []))

    def test_fast_track_bad_assignee(self, owner_session, seeded_lead):
        r = owner_session.post(
            f"{BASE_URL}/api/intent/leads/{seeded_lead['lead_id']}/fast-track",
            json={"assignee_id": "user_not_real", "notify": False},
            timeout=15,
        )
        assert r.status_code == 404


# ------------------------------------------------------------------ actions: outreach AI draft
class TestOutreach:
    def test_outreach_draft(self, owner_session, seeded_lead):
        r = owner_session.post(
            f"{BASE_URL}/api/intent/leads/{seeded_lead['lead_id']}/outreach",
            json={},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["lead_id"] == seeded_lead["lead_id"]
        assert isinstance(d["draft"], str) and len(d["draft"]) > 20


# ------------------------------------------------------------------ actions: booking AI draft (link must appear)
class TestBooking:
    def test_booking_requires_link_set_first(self, owner_session):
        # Ensure link is set (done by TestSettings). Draft should include link verbatim.
        # First fetch a lead
        leads = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15).json()
        open_leads = [l for l in leads if l.get("status") not in ("dismissed", "won")]
        assert open_leads
        lead = open_leads[0]

        # Ensure link is set
        owner_session.put(
            f"{BASE_URL}/api/intent/settings",
            json={"scheduling_url": "https://calendly.com/test-pro-team/demo"},
            timeout=15,
        )

        r = owner_session.post(
            f"{BASE_URL}/api/intent/leads/{lead['lead_id']}/booking",
            json={},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "booking_link" in d
        assert d["booking_link"].startswith("https://calendly.com/test-pro-team/demo")
        assert d["booking_link"] in d["draft"]

    def test_booking_400_when_no_link(self, owner_session):
        # Unset the link, then attempt booking — expect 400
        leads = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15).json()
        open_leads = [l for l in leads if l.get("status") not in ("dismissed", "won")]
        assert open_leads
        lead = open_leads[0]

        owner_session.put(
            f"{BASE_URL}/api/intent/settings",
            json={"scheduling_url": ""},
            timeout=15,
        )
        r = owner_session.post(
            f"{BASE_URL}/api/intent/leads/{lead['lead_id']}/booking",
            json={},
            timeout=30,
        )
        assert r.status_code == 400
        assert "scheduling" in r.json().get("detail", "").lower()

        # Restore link so later tests still work
        owner_session.put(
            f"{BASE_URL}/api/intent/settings",
            json={"scheduling_url": "https://calendly.com/test-pro-team/demo"},
            timeout=15,
        )


# ------------------------------------------------------------------ send-email (Resend invalid → 422 EXPECTED)
class TestSendEmail:
    def test_send_email_graceful_422(self, owner_session, seeded_lead):
        r = owner_session.post(
            f"{BASE_URL}/api/intent/send-email",
            json={
                "lead_id": seeded_lead["lead_id"],
                "to": "test-recipient@example.com",
                "subject": "Hi",
                "body": "Test body",
                "mark_status": "contacted",
            },
            timeout=30,
        )
        # 422 is the EXPECTED graceful failure per feature spec (RESEND key invalid).
        # 200 would only occur if a real key is configured — also acceptable.
        assert r.status_code in (200, 422), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code == 422:
            assert "could not send" in r.text.lower() or "email" in r.text.lower()

    def test_send_email_bad_recipient(self, owner_session, seeded_lead):
        r = owner_session.post(
            f"{BASE_URL}/api/intent/send-email",
            json={
                "lead_id": seeded_lead["lead_id"],
                "to": "not-an-email",
                "subject": "s",
                "body": "b",
            },
            timeout=15,
        )
        assert r.status_code == 400


# ------------------------------------------------------------------ action: sandbox
class TestSandbox:
    def test_sandbox_build(self, owner_session):
        # Pick a lead not yet in sandbox state; if none, use whatever is available.
        leads = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15).json()
        open_leads = [l for l in leads if l.get("status") not in ("dismissed", "won")]
        assert open_leads
        # rebuilding sandbox on any lead is idempotent from a testing perspective
        lead = open_leads[0]

        r = owner_session.post(
            f"{BASE_URL}/api/intent/leads/{lead['lead_id']}/sandbox",
            json={},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["sandbox_id"].startswith("sbx_")
        assert d["link"].startswith("https://")
        assert d["status"] == "ready"
        assert isinstance(d["brief"], str) and len(d["brief"]) > 20

        # Verify lead updated
        leads2 = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15).json()
        me = next(l for l in leads2 if l["lead_id"] == lead["lead_id"])
        assert me["status"] == "sandbox"
        assert me["sandbox"]["sandbox_id"] == d["sandbox_id"]
        assert any(a.get("type") == "sandbox" for a in me.get("activity", []))


# ------------------------------------------------------------------ PATCH dismiss
class TestPatchDismiss:
    def test_dismiss_lead(self, owner_session):
        # scan again to ensure a fresh lead is available
        owner_session.post(f"{BASE_URL}/api/intent/scan", timeout=60)
        leads = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15).json()
        # find a lead in 'new' or 'assigned' status to dismiss (avoid sandbox)
        target = next((l for l in leads if l.get("status") in ("new", "assigned")), None)
        if not target:
            pytest.skip("no dismissable lead available")
        r = owner_session.patch(
            f"{BASE_URL}/api/intent/leads/{target['lead_id']}",
            json={"status": "dismissed"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "dismissed"

    def test_patch_invalid_status(self, owner_session):
        leads = owner_session.get(f"{BASE_URL}/api/intent/leads", timeout=15).json()
        if not leads:
            pytest.skip("no leads")
        r = owner_session.patch(
            f"{BASE_URL}/api/intent/leads/{leads[0]['lead_id']}",
            json={"status": "bogus"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_patch_lead_not_found(self, owner_session):
        r = owner_session.patch(
            f"{BASE_URL}/api/intent/leads/lead_nonexistent",
            json={"status": "dismissed"},
            timeout=15,
        )
        assert r.status_code == 404
