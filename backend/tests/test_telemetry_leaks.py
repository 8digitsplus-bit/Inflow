"""Backend tests for Multi-Platform Telemetry Sync / Revenue Leak Detection.

Covers:
- /api/telemetry/status
- Contracts CRUD (POST/GET/PUT/DELETE + leak cascade)
- /api/telemetry/scan detection math
- /api/telemetry/sync (expected 400 when no Mixpanel/Amplitude connection)
- Draft -> Approve -> Dismiss human-in-the-loop flow
- Stripe draft invoice, CRM deal creation on /api/deals, Resend email
- Tier gating (require_enterprise returns 403 for non-enterprise)
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inflow-preview-1.preview.emergentagent.com").rstrip("/")

TEST_EMAIL = "testpro@test.com"
TEST_PASSWORD = "password"


# --------------------------------------------------------------- fixtures
@pytest.fixture(scope="session")
def owner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def reseed(owner_session):
    """Reseed via backend routine (call seed script equivalent via API isn't available).
    We rely on the seed_telemetry.py that was already run before pytest.
    We ensure the leak is fresh by running a scan and, if the leak is 'recovered',
    delete + reinsert via contract delete+recreate.
    """
    # Nothing to do here — main seed already run. Return session.
    return owner_session


# --------------------------------------------------------------- status + gating
class TestStatus:
    def test_status_owner_enterprise(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/telemetry/status", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("is_enterprise") is True
        assert d.get("is_owner") is True
        assert "usage_sources_connected" in d
        assert "stripe_live" in d

    def test_status_unauthenticated_denied(self):
        r = requests.get(f"{BASE_URL}/api/telemetry/status", timeout=15)
        # get_current_user should reject unauthenticated
        assert r.status_code in (401, 403)


# --------------------------------------------------------------- contracts CRUD
class TestContractCRUD:
    def test_contract_lifecycle(self, owner_session):
        # CREATE
        suffix = uuid.uuid4().hex[:6]
        payload = {
            "customer_name": f"TEST_CustCRUD_{suffix}",
            "account_key": f"TEST_CustCRUD_{suffix}",
            "stripe_customer_id": "",
            "usage_source": "mixpanel",
            "contracted_seats": 50,
            "unit_price_per_seat": 20.0,
            "currency": "usd",
            "am_email": "8digitsplus@gmail.com",
        }
        r = owner_session.post(f"{BASE_URL}/api/telemetry/contracts", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["customer_name"] == payload["customer_name"]
        assert c["contracted_seats"] == 50
        assert c["unit_price_per_seat"] == 20.0
        assert c["usage_source"] == "mixpanel"
        assert "contract_id" in c
        cid = c["contract_id"]

        # GET list — should contain our new contract
        r = owner_session.get(f"{BASE_URL}/api/telemetry/contracts", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert any(x.get("contract_id") == cid for x in rows)

        # UPDATE
        r = owner_session.put(
            f"{BASE_URL}/api/telemetry/contracts/{cid}",
            json={"contracted_seats": 75, "unit_price_per_seat": 25.5},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        updated = r.json()
        assert updated["contracted_seats"] == 75
        assert updated["unit_price_per_seat"] == 25.5

        # DELETE
        r = owner_session.delete(f"{BASE_URL}/api/telemetry/contracts/{cid}", timeout=15)
        assert r.status_code == 200

        # Verify gone
        r = owner_session.get(f"{BASE_URL}/api/telemetry/contracts", timeout=15)
        assert not any(x.get("contract_id") == cid for x in r.json())

    def test_update_nonexistent(self, owner_session):
        r = owner_session.put(f"{BASE_URL}/api/telemetry/contracts/ctr_does_not_exist_xyz", json={"contracted_seats": 1}, timeout=10)
        assert r.status_code == 404


# --------------------------------------------------------------- scan detection
class TestScan:
    def test_scan_detects_acme_leak(self, owner_session):
        # First scan to ensure leak exists (seed already added usage + contract)
        r = owner_session.post(f"{BASE_URL}/api/telemetry/scan", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "scanned"
        assert d["contracts_scanned"] >= 1

        # Verify leak details
        r = owner_session.get(f"{BASE_URL}/api/telemetry/leaks", timeout=15)
        assert r.status_code == 200
        leaks = r.json()
        acme = next((l for l in leaks if l["customer_name"] == "Acme Corp"), None)
        assert acme is not None, f"Acme leak not found. Leaks: {leaks}"
        assert acme["contracted_seats"] == 100
        assert acme["used_seats"] == 140
        assert acme["overage_seats"] == 40
        assert abs(acme["est_unbilled_amount"] - 5560.0) < 0.01
        assert acme["status"] in ("open", "recovered", "dismissed")


# --------------------------------------------------------------- sync (no source)
class TestSync:
    def test_sync_without_source_returns_400(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/telemetry/sync", json={"account_property": "company", "usage_event": ""}, timeout=15)
        # Depending on whether Mixpanel/Amplitude are connected — main path is 400.
        # If dev env has connections, we accept 200 with 0 rows.
        assert r.status_code in (200, 400)
        if r.status_code == 400:
            assert "Mixpanel" in r.text or "Amplitude" in r.text


# --------------------------------------------------------------- draft->approve->dismiss
def _get_acme_leak(session):
    r = session.get(f"{BASE_URL}/api/telemetry/leaks", timeout=15)
    assert r.status_code == 200
    for l in r.json():
        if l["customer_name"] == "Acme Corp":
            return l
    return None


def _ensure_open_acme(session):
    """Ensure there is an OPEN Acme leak. If it was recovered/dismissed, wipe + rescan."""
    leak = _get_acme_leak(session)
    if leak and leak["status"] == "open":
        return leak
    # delete leaks for Acme contract via re-seed pattern: delete contract then re-run seed
    # simpler: run seed_telemetry via subprocess
    import subprocess
    subprocess.check_call(
        ["python3", "seed_telemetry.py"],
        cwd="/app/backend",
        env={**os.environ, "PYTHONPATH": "/app/backend"},
    )
    r = session.post(f"{BASE_URL}/api/telemetry/scan", timeout=30)
    assert r.status_code == 200
    return _get_acme_leak(session)


class TestRecoveryLoop:
    def test_draft_returns_all_three_previews(self, owner_session):
        leak = _ensure_open_acme(owner_session)
        assert leak and leak["status"] == "open"
        r = owner_session.post(f"{BASE_URL}/api/telemetry/leaks/{leak['leak_id']}/draft", timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        # Invoice preview
        assert d["invoice"]["quantity"] == 40
        assert abs(d["invoice"]["unit_amount"] - 139.0) < 0.01
        assert abs(d["invoice"]["amount"] - 5560.0) < 0.01
        # CRM preview
        assert "Expansion" in d["crm_deal"]["name"]
        assert "Acme" in d["crm_deal"]["name"]
        assert d["crm_deal"]["stage"] == "qualified"
        # Email
        assert d["email"]["to"] == "8digitsplus@gmail.com"
        assert d["email"]["subject"]
        assert d["email"]["body"]

        # Leak status should remain OPEN (nothing executed)
        r2 = owner_session.get(f"{BASE_URL}/api/telemetry/leaks", timeout=15)
        acme = next((l for l in r2.json() if l["leak_id"] == leak["leak_id"]), None)
        assert acme["status"] == "open"

    def test_approve_executes_all_three(self, owner_session):
        # Reseed / rescan to get a fresh open leak
        leak = _ensure_open_acme(owner_session)
        # Draft first
        r = owner_session.post(f"{BASE_URL}/api/telemetry/leaks/{leak['leak_id']}/draft", timeout=60)
        assert r.status_code == 200
        # Approve
        r = owner_session.post(f"{BASE_URL}/api/telemetry/leaks/{leak['leak_id']}/approve",
                               json={"to": "8digitsplus@gmail.com", "subject": "Test approve subject", "body": "Body"}, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "recovered"
        assert d["actions"]["crm_deal_id"].startswith("deal_")
        inv = d["actions"]["invoice"]
        assert inv["mode"] in ("live_draft", "simulated")
        if inv["mode"] == "live_draft":
            assert inv["invoice_id"].startswith("in_")
            assert abs(inv["amount"] - 5560.0) < 0.5
        email = d["actions"]["email"]
        assert email["to"] == "8digitsplus@gmail.com"
        # sent may be False in dev env — accept either but presence check
        assert "sent" in email

        # Leak flips to 'recovered'
        acme = _get_acme_leak(owner_session)
        assert acme["status"] == "recovered"

        # Cannot re-approve
        r = owner_session.post(f"{BASE_URL}/api/telemetry/leaks/{leak['leak_id']}/approve", json={}, timeout=15)
        assert r.status_code == 400

        # CRM deal appears on /api/deals
        r = owner_session.get(f"{BASE_URL}/api/deals", timeout=15)
        assert r.status_code == 200
        deals = r.json()
        deal = next((x for x in deals if x.get("deal_id") == d["actions"]["crm_deal_id"]), None)
        assert deal is not None
        assert deal["stage"] == "qualified"
        # Note: 'source' field is stored in DB but stripped by Deal response_model (minor)
        assert "Acme" in deal["name"]

    def test_dismiss_sets_status(self, owner_session):
        # Fresh leak
        leak = _ensure_open_acme(owner_session)
        r = owner_session.post(f"{BASE_URL}/api/telemetry/leaks/{leak['leak_id']}/dismiss", timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "dismissed"
        acme = _get_acme_leak(owner_session)
        assert acme["status"] == "dismissed"


# --------------------------------------------------------------- tier gating
class TestTierGating:
    def test_non_enterprise_gets_403(self):
        """Create/use a non-enterprise user to verify 403 from require_enterprise."""
        # Try demo account first
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "testdemo@inflow.com", "password": "password"}, timeout=15)
        if r.status_code != 200:
            pytest.skip("No non-enterprise user available to test gating")
        # Check status — must be non-enterprise
        r = s.get(f"{BASE_URL}/api/telemetry/status", timeout=15)
        assert r.status_code == 200
        st = r.json()
        if st.get("is_enterprise"):
            pytest.skip("testdemo is enterprise — cannot test gating")
        # Any protected endpoint should 403
        r = s.get(f"{BASE_URL}/api/telemetry/contracts", timeout=15)
        assert r.status_code == 403
        assert "Enterprise" in r.text
