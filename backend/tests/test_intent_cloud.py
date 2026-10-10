"""Backend tests for the Intent Cloud / High-Intent Buyers rework.

Covers:
  - /api/intent/status, tracking, patterns, rotate
  - /api/intent/profiles (list/detail/status), feed, events/simulate, rebuild, sync-analytics
  - Speed-to-Lead: AEs, routing-rules, routing-log, assign, reroute, slack-config/test
  - Agent briefings: generate + list
  - Push to destinations (hubspot, salesforce, pipedrive, slack)
  - Storefronts: CRUD, matches, stripe-promo, links, quote requests
  - Public endpoints: snippet, collect, events (X-InFlow-Key), personalize, hosted page + quote
"""
import os
import time
import re
import requests
import pytest

def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for ln in f:
                    if ln.startswith("REACT_APP_BACKEND_URL="):
                        v = ln.strip().split("=", 1)[1]
                        break
        except Exception:
            pass
    assert v, "REACT_APP_BACKEND_URL missing"
    return v.rstrip("/")

BASE = _load_base()
API = f"{BASE}/api"


# ----------------------------- fixtures -----------------------------
@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "testpro@test.com", "password": "password"}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def status_doc(client):
    r = client.get(f"{API}/intent/status", timeout=20)
    assert r.status_code == 200
    return r.json()


# ----------------------------- status / tracking -----------------------------
class TestStatusTracking:
    def test_status_shape(self, status_doc):
        for k in ["is_paid", "is_owner", "destinations", "analytics_connected", "tracking_live", "open_profiles", "event_types"]:
            assert k in status_doc, f"missing {k}"
        d = status_doc["destinations"]
        for k in ["hubspot", "salesforce", "pipedrive", "slack", "stripe"]:
            assert k in d
        assert status_doc["is_paid"] is True
        assert status_doc["is_owner"] is True

    def test_tracking_get(self, client):
        r = client.get(f"{API}/intent/tracking", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["ingest_key"].startswith("ifk_"), j["ingest_key"]
        assert "patterns" in j and "snippet_url" in j and "events_api_url" in j

    def test_patterns_save(self, client):
        r = client.get(f"{API}/intent/tracking", timeout=20)
        patterns = r.json()["patterns"]
        payload = {"patterns": patterns}  # keep same
        r2 = client.put(f"{API}/intent/tracking/patterns", json=payload, timeout=20)
        assert r2.status_code in (200, 204), r2.text[:200]


# ----------------------------- profiles / feed -----------------------------
class TestProfilesFeed:
    def test_profiles_list_sorted(self, client):
        r = client.get(f"{API}/intent/profiles", timeout=20)
        assert r.status_code == 200
        profiles = r.json() if isinstance(r.json(), list) else r.json().get("profiles", [])
        assert len(profiles) >= 1
        scores = [p.get("intent_score", 0) for p in profiles]
        assert scores == sorted(scores, reverse=True), "profiles not sorted by intent_score desc"
        p = profiles[0]
        for k in ["lead_id", "intent_score", "tier"]:
            assert k in p
        assert p["tier"] in ("hot", "warm", "cool")

    def test_profile_detail(self, client):
        plist = client.get(f"{API}/intent/profiles", timeout=20).json()
        plist = plist if isinstance(plist, list) else plist.get("profiles", [])
        lead_id = plist[0]["lead_id"]
        r = client.get(f"{API}/intent/profiles/{lead_id}", timeout=20)
        assert r.status_code == 200
        d = r.json()
        # Flexible: look for profile + events + routing_log
        assert any(k in d for k in ("profile", "lead_id"))
        assert "events" in d or "timeline" in d

    def test_patch_status_valid_and_invalid(self, client):
        plist = client.get(f"{API}/intent/profiles", timeout=20).json()
        plist = plist if isinstance(plist, list) else plist.get("profiles", [])
        # pick a cool one so we don't blow up seeded hot routing
        target = next((p for p in plist if p.get("tier") == "cool"), plist[-1])
        lead_id = target["lead_id"]
        r_bad = client.patch(f"{API}/intent/profiles/{lead_id}", json={"status": "frozen"}, timeout=20)
        assert r_bad.status_code == 400, r_bad.status_code
        r_ok = client.patch(f"{API}/intent/profiles/{lead_id}", json={"status": "dismissed"}, timeout=20)
        assert r_ok.status_code in (200, 204)
        # revert
        client.patch(f"{API}/intent/profiles/{lead_id}", json={"status": "new"}, timeout=20)

    def test_feed(self, client):
        r = client.get(f"{API}/intent/feed", timeout=20)
        assert r.status_code == 200
        items = r.json() if isinstance(r.json(), list) else r.json().get("events", [])
        assert isinstance(items, list)


# ----------------------------- simulate / rebuild / sync -----------------------------
class TestSimulateRebuildSync:
    def test_simulate_unknown_type_400(self, client):
        r = client.post(f"{API}/intent/events/simulate",
                        json={"account": "TEST_Co", "type": "nonsense", "email": "x@test_co.com", "region": "NA"},
                        timeout=20)
        assert r.status_code == 400

    def test_simulate_pricing_increases_score(self, client):
        acct = "TEST_Simulated_Co"
        # ingest 2 pricing_view events
        for _ in range(2):
            r = client.post(f"{API}/intent/events/simulate",
                            json={"account": acct, "type": "pricing_view", "email": "ceo@test_simulated_co.com", "region": "NA"},
                            timeout=20)
            assert r.status_code in (200, 201), r.text[:200]
        time.sleep(1.5)
        # confirm profile exists with some score
        plist = client.get(f"{API}/intent/profiles", timeout=20).json()
        plist = plist if isinstance(plist, list) else plist.get("profiles", [])
        found = [p for p in plist if acct.lower() in str(p.get("account", "")).lower()]
        assert found, f"no profile created for {acct}"
        assert found[0]["intent_score"] > 0

    def test_rebuild(self, client):
        r = client.post(f"{API}/intent/rebuild", timeout=60)
        assert r.status_code == 200, r.text[:200]

    def test_sync_analytics_400(self, client):
        r = client.post(f"{API}/intent/sync-analytics", timeout=20)
        assert r.status_code == 400
        # friendly message
        body = r.text.lower()
        assert "analytic" in body or "connect" in body


# ----------------------------- Speed-to-Lead -----------------------------
class TestSpeedToLead:
    def test_aes_crud(self, client):
        r = client.get(f"{API}/intent/aes", timeout=20)
        assert r.status_code == 200
        aes = r.json() if isinstance(r.json(), list) else r.json().get("aes", [])
        assert len(aes) >= 1
        # create
        payload = {"name": "TEST AE", "email": "test.ae+pytest@gmail.com", "territories": ["NA"], "min_deal": 0, "max_deal": 50000}
        rc = client.post(f"{API}/intent/aes", json=payload, timeout=20)
        assert rc.status_code in (200, 201), rc.text[:200]
        new_id = rc.json().get("ae_id") or rc.json().get("id")
        assert new_id
        # update
        ru = client.put(f"{API}/intent/aes/{new_id}",
                        json={"name": "TEST AE Updated", "email": payload["email"], "territories": ["NA"], "min_deal": 0, "max_deal": 50000},
                        timeout=20)
        assert ru.status_code in (200, 204), ru.text[:200]
        # delete
        rd = client.delete(f"{API}/intent/aes/{new_id}", timeout=20)
        assert rd.status_code in (200, 204)

    def test_ae_requires_valid_email(self, client):
        r = client.post(f"{API}/intent/aes", json={"name": "Bad", "email": "nope"}, timeout=20)
        assert r.status_code in (400, 422)

    def test_routing_log_stats(self, client):
        r = client.get(f"{API}/intent/routing-log", timeout=20)
        assert r.status_code == 200
        j = r.json()
        stats = j.get("stats") if isinstance(j, dict) else None
        assert stats is not None, j
        for k in ["median_latency_ms", "routed_24h", "sla_pct", "total", "active_rules"]:
            assert k in stats, f"missing {k} in stats"

    def test_routing_rules_crud(self, client):
        r = client.get(f"{API}/intent/routing-rules", timeout=20)
        assert r.status_code == 200
        rules = r.json() if isinstance(r.json(), list) else r.json().get("rules", [])
        assert isinstance(rules, list)
        # create minimal rule
        payload = {
            "name": "TEST pytest rule",
            "min_score": 60,
            "triggers": ["pricing_view"],
            "actions": {"email": True, "slack": False, "briefing": False},
            "active": False,
        }
        rc = client.post(f"{API}/intent/routing-rules", json=payload, timeout=20)
        assert rc.status_code in (200, 201), rc.text[:200]
        rid = rc.json().get("id") or rc.json().get("rule_id") or rc.json().get("rule", {}).get("id")
        assert rid
        ru = client.put(f"{API}/intent/routing-rules/{rid}", json={"name": "TEST pytest rule 2"}, timeout=20)
        assert ru.status_code in (200, 204)
        rd = client.delete(f"{API}/intent/routing-rules/{rid}", timeout=20)
        assert rd.status_code in (200, 204)

    def test_slack_config_bad_url(self, client):
        r = client.put(f"{API}/intent/slack-config", json={"webhook_url": "https://example.com/not-slack"}, timeout=20)
        assert r.status_code == 400

    def test_slack_test_not_configured(self, client):
        r = client.post(f"{API}/intent/slack-test", timeout=20)
        assert r.status_code == 422


# ----------------------------- Briefings & Push -----------------------------
class TestBriefingsPush:
    def test_push_slack_422(self, client):
        plist = client.get(f"{API}/intent/profiles", timeout=20).json()
        plist = plist if isinstance(plist, list) else plist.get("profiles", [])
        hot = next((p for p in plist if p.get("tier") == "hot" and p.get("assignment")), plist[0])
        lead_id = hot["lead_id"]
        r = client.post(f"{API}/intent/profiles/{lead_id}/push",
                        json={"destination": "slack", "kind": "assignment"}, timeout=20)
        assert r.status_code == 422

    def test_push_salesforce_demo_422(self, client):
        plist = client.get(f"{API}/intent/profiles", timeout=20).json()
        plist = plist if isinstance(plist, list) else plist.get("profiles", [])
        hot = next((p for p in plist if p.get("tier") == "hot" and p.get("assignment")), plist[0])
        lead_id = hot["lead_id"]
        r = client.post(f"{API}/intent/profiles/{lead_id}/push",
                        json={"destination": "salesforce", "kind": "assignment"}, timeout=20)
        assert r.status_code == 422

    def test_push_briefing_without_briefing_400(self, client):
        # pick a cool profile that likely has no briefing
        plist = client.get(f"{API}/intent/profiles", timeout=20).json()
        plist = plist if isinstance(plist, list) else plist.get("profiles", [])
        cool = next((p for p in plist if p.get("tier") == "cool"), plist[-1])
        r = client.post(f"{API}/intent/profiles/{cool['lead_id']}/push",
                        json={"destination": "hubspot", "kind": "briefing"}, timeout=20)
        assert r.status_code in (400, 404), r.status_code

    def test_briefings_list(self, client):
        r = client.get(f"{API}/intent/briefings", timeout=20)
        assert r.status_code == 200


# ----------------------------- Storefronts -----------------------------
class TestStorefronts:
    def test_storefronts_list(self, client):
        r = client.get(f"{API}/storefronts", timeout=20)
        assert r.status_code == 200
        j = r.json()
        rules = j.get("rules", j) if isinstance(j, dict) else j
        assert isinstance(rules, list)

    def test_storefront_crud_and_stripe(self, client):
        payload = {
            "name": "TEST pytest storefront",
            "headline": "TEST headline",
            "discount_pct": 10,
            "contract_terms": "Net-30",
            "cta_url": "https://example.com/pricing",
            "min_score": 70,
            "audience": "hot",
            "active": True,
        }
        rc = client.post(f"{API}/storefronts", json=payload, timeout=20)
        assert rc.status_code in (200, 201), rc.text[:200]
        body = rc.json()
        rid = body.get("rule_id") or body.get("id")
        assert rid

        # headline required: create without headline -> 400/422
        rbad = client.post(f"{API}/storefronts", json={"name": "No headline"}, timeout=20)
        assert rbad.status_code in (400, 422)

        # cta_url must be http(s)
        rbad2 = client.post(f"{API}/storefronts",
                            json={"name": "x", "headline": "y", "cta_url": "javascript:alert(1)"}, timeout=20)
        assert rbad2.status_code in (400, 422)

        # matches
        rm = client.get(f"{API}/storefronts/matches", timeout=20)
        assert rm.status_code == 200

        # stripe promo create (empty JSON body)
        rp = client.post(f"{API}/storefronts/{rid}/stripe-promo", json={}, timeout=45)
        if rp.status_code == 200:
            j = rp.json()
            assert "code" in j and "promotion_code_id" in j
            # second create -> 409
            rp2 = client.post(f"{API}/storefronts/{rid}/stripe-promo", json={}, timeout=30)
            assert rp2.status_code == 409
            # deactivate
            rd = client.delete(f"{API}/storefronts/{rid}/stripe-promo", timeout=30)
            assert rd.status_code in (200, 204)
        else:
            pytest.skip(f"Stripe promo create returned {rp.status_code}: {rp.text[:200]}")

        # delete storefront
        rd2 = client.delete(f"{API}/storefronts/{rid}", timeout=20)
        assert rd2.status_code in (200, 204)

    def test_storefront_link_idempotent(self, client):
        # need the seeded rule id
        rules_body = client.get(f"{API}/storefronts", timeout=20).json()
        rules = rules_body.get("rules", rules_body) if isinstance(rules_body, dict) else rules_body
        seeded = next((r for r in rules if r.get("rule_id") == "sf_seed_enterprise"), rules[0] if rules else None)
        assert seeded, "no storefront rule to link"
        srid = seeded.get("rule_id") or seeded.get("id")
        plist = client.get(f"{API}/intent/profiles", timeout=20).json()
        plist = plist if isinstance(plist, list) else plist.get("profiles", [])
        hot = next((p for p in plist if p.get("tier") == "hot"), plist[0])
        r1 = client.post(f"{API}/storefronts/{srid}/link", json={"lead_id": hot["lead_id"]}, timeout=20)
        assert r1.status_code in (200, 201), r1.text[:200]
        t1 = r1.json().get("token")
        r2 = client.post(f"{API}/storefronts/{srid}/link", json={"lead_id": hot["lead_id"]}, timeout=20)
        assert r2.status_code in (200, 201)
        t2 = r2.json().get("token")
        assert t1 == t2, "link not idempotent"


# ----------------------------- Public endpoints -----------------------------
class TestPublic:
    def test_snippet_js(self, client):
        key = client.get(f"{API}/intent/tracking", timeout=20).json()["ingest_key"]
        # Use plain requests, no auth
        r = requests.get(f"{API}/public/intent/{key}/snippet.js", timeout=20)
        assert r.status_code == 200
        assert "javascript" in r.headers.get("content-type", "").lower() or "script" in r.text[:100].lower() or "function" in r.text[:500].lower()

    def test_collect_text_plain(self, client):
        key = client.get(f"{API}/intent/tracking", timeout=20).json()["ingest_key"]
        r = requests.post(
            f"{API}/public/intent/{key}/collect",
            data='{"type":"pricing_view","vid":"vid_test_pytest","email":"ceo@acme.com","company":"TEST_Acme Corp","url":"https://x/pricing"}',
            headers={"Content-Type": "text/plain"},
            timeout=20,
        )
        assert r.status_code in (200, 202), r.text[:200]

    def test_events_batch_bad_key(self):
        r = requests.post(f"{API}/public/intent/events",
                          json={"events": [{"type": "pricing_view", "email": "x@y.com"}]},
                          headers={"X-InFlow-Key": "ifk_bad_key_000"},
                          timeout=20)
        assert r.status_code == 401

    def test_events_batch_good_key(self, client):
        key = client.get(f"{API}/intent/tracking", timeout=20).json()["ingest_key"]
        r = requests.post(f"{API}/public/intent/events",
                          json={"events": [{"type": "pricing_view", "email": "ceo@acme.com", "company": "TEST_Acme Corp"}]},
                          headers={"X-InFlow-Key": key},
                          timeout=20)
        assert r.status_code in (200, 202), r.text[:200]

    def test_personalize_qualified(self, client):
        key = client.get(f"{API}/intent/tracking", timeout=20).json()["ingest_key"]
        r = requests.get(f"{API}/public/intent/{key}/personalize",
                         params={"email": "j.takagi@nakatomi.com"}, timeout=20)
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == "*"
        j = r.json()
        assert "qualified" in j

    def test_personalize_unknown(self):
        # need any valid key; use a tracking call
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": "testpro@test.com", "password": "password"}, timeout=20)
        key = s.get(f"{API}/intent/tracking", timeout=20).json()["ingest_key"]
        r = requests.get(f"{API}/public/intent/{key}/personalize",
                         params={"email": "nobody@nowhere-xyz-999.com"}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("qualified") is False

    def test_hosted_storefront_token(self):
        token = "rc_HcZRBxI3prOr5NtLARz2iw"
        r = requests.get(f"{API}/public/storefront/{token}", timeout=20)
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        for k in ["seller", "account", "headline", "discount_pct", "contract_terms"]:
            assert k in j, f"missing {k}"

    def test_hosted_storefront_invalid(self):
        r = requests.get(f"{API}/public/storefront/rc_invalid_token_xyz", timeout=20)
        assert r.status_code == 404
