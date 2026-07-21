"""
Test suite for Retention Plays (Churn -> System of Action)

Endpoints:
- POST   /api/retention/plays
- GET    /api/retention/plays
- PATCH  /api/retention/plays/{play_id}
- DELETE /api/retention/plays/{play_id}
"""
import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

TESTPRO_EMAIL = "testpro@test.com"
TESTPRO_PASSWORD = "password"


def _login(session: requests.Session, email: str, password: str) -> bool:
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return r.status_code == 200


def _register_and_login(session: requests.Session, email: str, password: str, name: str = "Second Org User"):
    session.post(f"{BASE_URL}/api/auth/register", json={"name": name, "email": email, "password": password})
    return _login(session, email, password)


@pytest.fixture(scope="module")
def pro_session():
    s = requests.Session()
    if not _login(s, TESTPRO_EMAIL, TESTPRO_PASSWORD):
        pytest.skip("Cannot login as testpro@test.com")
    return s


@pytest.fixture(scope="module")
def other_session():
    """A different org's user for org-scoping check."""
    s = requests.Session()
    email = f"otherorg_{uuid.uuid4().hex[:8]}@example.com"
    if not _register_and_login(s, email, "Pass1234!", name="Other Org User"):
        pytest.skip("Cannot create/login secondary org user")
    return s


DEAL = {
    "id": "deal_test_" + uuid.uuid4().hex[:8],
    "name": "Acme Enterprise Renewal",
    "company": "Acme Corp",
    "value": 24000,
    "risk_level": "high",
    "stage": "renewal",
    "probability": 35,
    "engagement_score": 22,
    "days_inactive": 18,
}


# ---------- Auth ----------
class TestAuthRequired:
    def test_get_plays_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/retention/plays")
        assert r.status_code == 401

    def test_post_plays_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/retention/plays", json={"action_type": "support", "deal": DEAL})
        assert r.status_code == 401


# ---------- Validation ----------
class TestValidation:
    def test_invalid_action_type(self, pro_session):
        r = pro_session.post(f"{BASE_URL}/api/retention/plays", json={"action_type": "foo", "deal": DEAL})
        assert r.status_code == 400
        assert "action" in (r.json().get("detail", "").lower())

    def test_missing_deal(self, pro_session):
        r = pro_session.post(f"{BASE_URL}/api/retention/plays", json={"action_type": "support"})
        assert r.status_code == 400

    def test_empty_deal(self, pro_session):
        r = pro_session.post(f"{BASE_URL}/api/retention/plays", json={"action_type": "support", "deal": {}})
        assert r.status_code == 400


# ---------- Create all 4 action types ----------
class TestCreatePlaysAllActions:
    @pytest.mark.parametrize("action_type", ["outreach", "offer", "support", "workflow"])
    def test_create_play(self, pro_session, action_type):
        d = {**DEAL, "id": f"deal_{action_type}_{uuid.uuid4().hex[:6]}"}
        r = pro_session.post(
            f"{BASE_URL}/api/retention/plays",
            json={"action_type": action_type, "deal": d},
            timeout=60,
        )
        assert r.status_code == 200, f"[{action_type}] {r.status_code}: {r.text[:400]}"
        p = r.json()
        assert p["play_id"].startswith("play_")
        assert p["action_type"] == action_type
        assert p["action_label"]
        assert p["status"] == "open"
        assert isinstance(p.get("content"), str) and len(p["content"]) > 0, f"empty content for {action_type}"
        assert p["value"] == float(d["value"])
        assert p["deal_name"] == d["name"]
        # ai_generated may be True (paid tier) or False (fallback if LLM slow)
        assert "ai_generated" in p
        print(f"[{action_type}] content len={len(p['content'])} ai_generated={p.get('ai_generated')}")


# ---------- List + Summary ----------
class TestListAndSummary:
    def test_list_shape(self, pro_session):
        r = pro_session.get(f"{BASE_URL}/api/retention/plays")
        assert r.status_code == 200
        data = r.json()
        assert "plays" in data and isinstance(data["plays"], list)
        assert "summary" in data
        summary = data["summary"]
        for k in ["total", "active", "saved_count", "lost_count", "revenue_in_play", "revenue_protected"]:
            assert k in summary, f"missing {k}"
        assert summary["total"] == len(data["plays"])


# ---------- Patch status + summary movement ----------
class TestPatchStatus:
    def _create(self, session, deal_value=15000):
        d = {**DEAL, "id": f"deal_patch_{uuid.uuid4().hex[:6]}", "value": deal_value}
        r = session.post(f"{BASE_URL}/api/retention/plays", json={"action_type": "support", "deal": d}, timeout=60)
        assert r.status_code == 200
        return r.json()

    def test_saved_moves_revenue_to_protected(self, pro_session):
        play = self._create(pro_session, 15000)
        before = pro_session.get(f"{BASE_URL}/api/retention/plays").json()["summary"]

        r = pro_session.patch(
            f"{BASE_URL}/api/retention/plays/{play['play_id']}",
            json={"status": "saved"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "saved"

        after = pro_session.get(f"{BASE_URL}/api/retention/plays").json()["summary"]
        assert after["revenue_protected"] >= before["revenue_protected"] + 15000 - 0.5
        assert after["saved_count"] == before["saved_count"] + 1
        # active count either same-1 or same (if play wasn't open before, but it was)
        assert after["revenue_in_play"] <= before["revenue_in_play"] + 0.5

    def test_lost_updates_status(self, pro_session):
        play = self._create(pro_session, 5000)
        r = pro_session.patch(
            f"{BASE_URL}/api/retention/plays/{play['play_id']}",
            json={"status": "lost"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "lost"

    def test_invalid_status(self, pro_session):
        play = self._create(pro_session, 100)
        r = pro_session.patch(
            f"{BASE_URL}/api/retention/plays/{play['play_id']}",
            json={"status": "banana"},
        )
        assert r.status_code == 400

    def test_unknown_play_id_returns_404(self, pro_session):
        r = pro_session.patch(
            f"{BASE_URL}/api/retention/plays/play_doesnotexist_xyz",
            json={"status": "saved"},
        )
        assert r.status_code == 404


# ---------- Delete ----------
class TestDelete:
    def test_delete_removes_play(self, pro_session):
        d = {**DEAL, "id": f"deal_del_{uuid.uuid4().hex[:6]}"}
        r = pro_session.post(f"{BASE_URL}/api/retention/plays", json={"action_type": "support", "deal": d}, timeout=60)
        assert r.status_code == 200
        play_id = r.json()["play_id"]

        d1 = pro_session.delete(f"{BASE_URL}/api/retention/plays/{play_id}")
        assert d1.status_code == 200
        assert d1.json().get("ok") is True

        # subsequent GET should not include it
        listing = pro_session.get(f"{BASE_URL}/api/retention/plays").json()
        assert not any(p["play_id"] == play_id for p in listing["plays"])

    def test_delete_unknown_returns_404(self, pro_session):
        r = pro_session.delete(f"{BASE_URL}/api/retention/plays/play_notreal_xyz")
        assert r.status_code == 404


# ---------- Org scoping ----------
class TestOrgScoping:
    def test_plays_not_leaked_across_orgs(self, pro_session, other_session):
        # Create a play as testpro
        d = {**DEAL, "id": f"deal_scope_{uuid.uuid4().hex[:6]}", "name": "SCOPING_TEST_DEAL"}
        r = pro_session.post(f"{BASE_URL}/api/retention/plays", json={"action_type": "support", "deal": d}, timeout=60)
        assert r.status_code == 200
        play_id = r.json()["play_id"]

        # Other org should not see this play
        other_listing = other_session.get(f"{BASE_URL}/api/retention/plays").json()
        ids = [p["play_id"] for p in other_listing["plays"]]
        assert play_id not in ids

        # Other org cannot patch or delete it
        p_resp = other_session.patch(f"{BASE_URL}/api/retention/plays/{play_id}", json={"status": "saved"})
        assert p_resp.status_code == 404
        del_resp = other_session.delete(f"{BASE_URL}/api/retention/plays/{play_id}")
        assert del_resp.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
