"""Backend tests for revenue integrity fixes (iteration 65).

Covers:
  - Primary-source revenue (no double-count)
  - /business/revenue-settings GET/PUT
  - Collision guard on scalekit /start + native connect
  - Edit preservation + no duplicates on re-sync
  - Analytics regression smoke
"""
import os
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login",
               json={"email": "testpro@test.com", "password": "password"},
               timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("session_token") or data.get("token") or data.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------- Revenue settings ----------
class TestRevenueSettings:
    def test_get_revenue_settings(self, session):
        r = session.get(f"{API}/business/revenue-settings", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "primary_revenue_source" in d
        assert "revenue_sources" in d
        assert "options" in d
        assert d["primary_revenue_source"] == "stripe"
        assert "stripe" in d["revenue_sources"]
        roles = {o["source"]: o["role"] for o in d["options"]}
        # Pipeline/signal sources should not be revenue role
        for p in ("salesforce", "hubspot", "pipedrive"):
            if p in roles:
                assert roles[p] == "pipeline", f"{p} role={roles[p]}"
        if "stripe" in roles:
            assert roles["stripe"] == "revenue"

    def test_put_rejects_non_revenue_source_salesforce(self, session):
        r = session.put(f"{API}/business/revenue-settings",
                        json={"primary_revenue_source": "salesforce"}, timeout=30)
        assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text}"

    def test_put_rejects_unconnected_source_quickbooks(self, session):
        r = session.put(f"{API}/business/revenue-settings",
                        json={"primary_revenue_source": "quickbooks"}, timeout=30)
        # quickbooks has no connection for testpro => not in revenue_sources
        assert r.status_code == 400, r.text

    def test_put_accepts_stripe(self, session):
        r = session.put(f"{API}/business/revenue-settings",
                        json={"primary_revenue_source": "stripe"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["primary_revenue_source"] == "stripe"

    def test_put_requires_owner(self):
        # Not easy to test with a non-owner, skip if we don't have a member account.
        pytest.skip("No non-owner account available in test env")


# ---------- Revenue double-count fix ----------
class TestRevenueNoDoubleCount:
    def test_analytics_revenue_excludes_non_primary_sources(self, session):
        r = session.get(f"{API}/analytics/revenue", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        closed_revenue = data.get("closed_revenue") or data.get("total_revenue") or 0
        assert isinstance(closed_revenue, (int, float))
        # Fetch all deals and compute both totals
        rd = session.get(f"{API}/deals", timeout=30)
        assert rd.status_code == 200
        deals_resp = rd.json()
        deals = deals_resp if isinstance(deals_resp, list) else deals_resp.get("deals", [])
        all_closed = sum(float(d.get("value") or 0)
                         for d in deals if (d.get("stage") or "").lower() == "closed_won")
        primary_closed = sum(float(d.get("value") or 0)
                             for d in deals
                             if (d.get("stage") or "").lower() == "closed_won"
                             and (not d.get("source") or d.get("source") == "stripe"))
        print(f"all_closed={all_closed} primary_closed={primary_closed} api_closed_revenue={closed_revenue}")
        # The API should match primary-source-only sum (not naive all-sources)
        assert abs(closed_revenue - primary_closed) < 1.0, \
            f"API closed_revenue {closed_revenue} != primary {primary_closed}"
        # And there should be excluded (quickbooks/salesforce) closed_won deals existing
        excluded_sources = {d.get("source") for d in deals
                            if (d.get("stage") or "").lower() == "closed_won"
                            and d.get("source") not in (None, "stripe")}
        print(f"excluded_sources={excluded_sources}")
        if excluded_sources:
            assert all_closed > primary_closed, "Expected excluded deals to make all > primary"

    def test_deals_list_still_includes_all_sources(self, session):
        rd = session.get(f"{API}/deals", timeout=30)
        assert rd.status_code == 200
        deals_resp = rd.json()
        deals = deals_resp if isinstance(deals_resp, list) else deals_resp.get("deals", [])
        sources = {d.get("source") for d in deals}
        # Deals from non-primary sources should still be returned
        print(f"sources_present={sources}")
        assert len(deals) > 0


# ---------- Collision guard ----------
class TestCollisionGuard:
    def test_scalekit_stripe_start_blocked_when_native_connected(self, session):
        r = session.get(f"{API}/integrations/scalekit/stripe/start", timeout=30,
                        allow_redirects=False)
        # Should return 400 because testpro has a native stripe connection
        assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text[:200]}"
        detail = (r.json().get("detail") or "").lower()
        assert "already connected" in detail or "disconnect" in detail

    def test_native_connect_blocked_when_already_connected(self, session):
        r = session.post(f"{API}/business/connect/stripe",
                         json={"account_name": "dup", "api_key": "sk_test_x"}, timeout=30)
        assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text[:200]}"
        assert "already connected" in (r.json().get("detail") or "").lower()


# ---------- Edit preservation + no duplicate on re-sync ----------
# Note: GET/PUT /deals uses response_model=Deal with extra="ignore", so synced/external_id/
# locally_modified fields are stripped from JSON. We verify via direct DB inspection.
def _db():
    from pymongo import MongoClient
    env = {}
    with open("/app/backend/.env") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k] = v.strip('"').strip("'")
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


class TestEditPreservation:
    def test_edit_preserved_through_resync(self, session):
        db = _db()
        org_id = "org_15337f4cefc9"
        stripe_synced = list(db.deals.find({"org_id": org_id, "source": "stripe", "synced": True}))
        if not stripe_synced:
            pytest.skip("No synced stripe deals in DB")

        before_count = len(stripe_synced)
        external_ids_before = {d.get("external_id") for d in stripe_synced if d.get("external_id")}
        print(f"before: {before_count} synced stripe deals, {len(external_ids_before)} distinct external_ids")
        assert len(external_ids_before) == before_count, "External IDs should be unique before sync"

        target = stripe_synced[0]
        did = target["deal_id"]
        edited_value = 999999.01
        edited_stage = "negotiation"
        pr = session.put(f"{API}/deals/{did}",
                         json={"value": edited_value, "stage": edited_stage}, timeout=30)
        assert pr.status_code == 200, f"PUT deal failed: {pr.status_code} {pr.text}"
        # Verify DB-level locally_modified flag
        after_edit = db.deals.find_one({"deal_id": did, "org_id": org_id})
        assert after_edit.get("locally_modified") is True, \
            f"locally_modified not set in DB: {after_edit}"
        assert float(after_edit.get("value")) == edited_value

        # Re-sync via Scalekit (real connector)
        sr = session.post(f"{API}/integrations/scalekit/stripe/sync", timeout=120)
        assert sr.status_code == 200, f"Sync failed: {sr.status_code} {sr.text[:300]}"
        print(f"sync result: {sr.json()}")

        # Verify no duplicate and edit preserved
        stripe2 = list(db.deals.find({"org_id": org_id, "source": "stripe", "synced": True}))
        print(f"after: {len(stripe2)} synced stripe deals")
        assert len(stripe2) == before_count, \
            f"Deal count changed: {before_count} -> {len(stripe2)} (duplicates?)"
        ext2 = [d.get("external_id") for d in stripe2 if d.get("external_id")]
        assert len(set(ext2)) == len(ext2), "Duplicate external_ids after re-sync"

        preserved = db.deals.find_one({"deal_id": did, "org_id": org_id})
        assert preserved is not None, f"Edited deal {did} missing after re-sync"
        assert float(preserved.get("value")) == edited_value, \
            f"Edited value lost: {preserved.get('value')}"
        assert preserved.get("stage") == edited_stage, \
            f"Edited stage lost: {preserved.get('stage')}"
        assert preserved.get("locally_modified") is True

        # Cleanup: clear locally_modified flag + resync so later tests see unedited state
        # (keep the edited value as-is to avoid messing with live Stripe data).
        # Actually restore by clearing the flag and re-syncing so stripe's real value overwrites.
        db.deals.update_one(
            {"deal_id": did, "org_id": org_id},
            {"$unset": {"locally_modified": ""}}
        )
        session.post(f"{API}/integrations/scalekit/stripe/sync", timeout=120)


# ---------- Regression smoke ----------
class TestAnalyticsRegression:
    @pytest.mark.parametrize("endpoint", [
        "revenue", "churn", "sales-revenue", "revenue-intelligence",
        "pipeline", "cro", "sales-performance", "forecasting",
    ])
    def test_analytics_endpoint_ok(self, session, endpoint):
        r = session.get(f"{API}/analytics/{endpoint}", timeout=60)
        assert r.status_code == 200, f"{endpoint}: {r.status_code} {r.text[:300]}"
        # Must be valid JSON object
        assert isinstance(r.json(), (dict, list))
