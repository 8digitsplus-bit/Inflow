"""
Backend tests for authenticated Customer Centre agent at /api/customer/agent/*

Covers: start, chat (factual+invite+cancel+escalate+navigate intents),
approve execution (incl. real DB mutation for cancel_subscription with
restore), cancel (clears pending), auth required (401), non-owner forbidden
(403) for cancel, and DB persistence in db.customer_agent_sessions /
db.customer_agent_messages.
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

OWNER_EMAIL = "testpro@test.com"
OWNER_PASS = "password"


# ---------- Shared fixtures ----------
@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def owner_session():
    """Authenticated requests.Session for testpro owner."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": OWNER_EMAIL, "password": OWNER_PASS})
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    body = r.json()
    assert not body.get("requires_2fa"), "2FA unexpectedly required on testpro"
    return s


@pytest.fixture(scope="module")
def owner_user_id(mongo):
    u = mongo.users.find_one({"email": OWNER_EMAIL}, {"_id": 0, "user_id": 1, "org_id": 1})
    return u["user_id"], u["org_id"]


@pytest.fixture
def owner_session_id(owner_session):
    """Fresh customer agent session per test."""
    r = owner_session.post(f"{BASE_URL}/api/customer/agent/start", json={})
    assert r.status_code == 200, r.text
    return r.json()["session_id"]


# ---------- start ----------
class TestStart:
    def test_start_returns_greeting_first_name_and_is_owner_true(self, owner_session, mongo):
        r = owner_session.post(f"{BASE_URL}/api/customer/agent/start", json={})
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("session_id"), str) and len(body["session_id"]) > 0
        assert "greeting" in body and isinstance(body["greeting"], str)
        # greeting must reference the user's first name (Test)
        assert "Test" in body["greeting"], f"greeting missing first name: {body['greeting']}"
        ctx = body.get("context") or {}
        assert ctx.get("first_name") == "Test"
        assert ctx.get("is_owner") is True, f"is_owner should be True for owner, got {ctx}"
        assert ctx.get("tier") == "enterprise_monthly"

        # DB persistence
        sess = mongo.customer_agent_sessions.find_one({"session_id": body["session_id"]})
        assert sess is not None
        assert sess["pending_action"] is None
        assert sess["completed_actions"] == []

        msgs = list(mongo.customer_agent_messages.find({"session_id": body["session_id"]}))
        assert len(msgs) == 1 and msgs[0]["role"] == "assistant"

        # cleanup
        mongo.customer_agent_sessions.delete_one({"session_id": body["session_id"]})
        mongo.customer_agent_messages.delete_many({"session_id": body["session_id"]})

    def test_start_requires_auth(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/customer/agent/start", json={})
        assert r.status_code == 401, f"Expected 401 got {r.status_code}"


# ---------- auth required on all endpoints ----------
class TestAuth:
    def test_chat_unauthenticated_401(self):
        r = requests.post(f"{BASE_URL}/api/customer/agent/chat",
                          json={"session_id": "x", "message": "hi"})
        assert r.status_code == 401

    def test_approve_unauthenticated_401(self):
        r = requests.post(f"{BASE_URL}/api/customer/agent/approve",
                          json={"session_id": "x", "action_id": "y"})
        assert r.status_code == 401

    def test_cancel_unauthenticated_401(self):
        r = requests.post(f"{BASE_URL}/api/customer/agent/cancel",
                          json={"session_id": "x", "action_id": "y"})
        assert r.status_code == 401


# ---------- factual chat (plan info) ----------
class TestFactualChat:
    def test_what_plan_am_i_on_returns_factual_no_action(self, owner_session, owner_session_id, mongo):
        r = owner_session.post(f"{BASE_URL}/api/customer/agent/chat", json={
            "session_id": owner_session_id,
            "message": "what plan am I on and how many seats are we using?",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        text = (data.get("message") or "").lower()
        assert "enterprise" in text, f"Expected Enterprise mention, got: {text}"
        # Factual question should NOT propose an action
        assert data.get("proposed_action") is None, f"Unexpected action on factual query: {data.get('proposed_action')}"

        # Messages persisted
        msgs = list(mongo.customer_agent_messages.find({"session_id": owner_session_id}))
        roles = [m["role"] for m in msgs]
        assert roles.count("user") >= 1 and roles.count("assistant") >= 2

        # cleanup
        mongo.customer_agent_sessions.delete_one({"session_id": owner_session_id})
        mongo.customer_agent_messages.delete_many({"session_id": owner_session_id})


# ---------- invite_member proposal + approve ----------
class TestInviteMember:
    def test_invite_proposes_action_and_approve_creates_invite(self, owner_session, owner_session_id, mongo, owner_user_id):
        uid, org_id = owner_user_id
        test_email = f"TEST_alex_{uuid.uuid4().hex[:6]}@acme.com"

        r = owner_session.post(f"{BASE_URL}/api/customer/agent/chat", json={
            "session_id": owner_session_id,
            "message": f"please invite {test_email} to the team",
        })
        assert r.status_code == 200, r.text
        pa = r.json().get("proposed_action")
        assert pa is not None, f"Expected proposed_action, got: {r.json()}"
        assert pa["type"] == "invite_member", f"Wrong action type: {pa}"
        assert "@" in (pa.get("params") or {}).get("email", "")
        assert (pa.get("params") or {}).get("role") == "member"
        action_id = pa["id"]

        # Session has pending_action
        sess = mongo.customer_agent_sessions.find_one({"session_id": owner_session_id})
        assert sess["pending_action"]["id"] == action_id

        # Approve with edits to guarantee our TEST_ email
        r2 = owner_session.post(f"{BASE_URL}/api/customer/agent/approve", json={
            "session_id": owner_session_id,
            "action_id": action_id,
            "edits": {"email": test_email, "role": "member"},
        })
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["ok"] is True
        assert d2["executed"]["type"] == "invite_member"
        assert d2["executed"].get("invite_id")

        # DB: pending cleared, completed_actions has it
        sess2 = mongo.customer_agent_sessions.find_one({"session_id": owner_session_id})
        assert sess2["pending_action"] is None
        assert len(sess2["completed_actions"]) == 1

        # org_invites row created (email is normalized to lowercase by backend)
        inv = mongo.org_invites.find_one({"email": test_email.lower(), "org_id": org_id})
        assert inv is not None, "Invite not persisted in db.org_invites"

        # cleanup
        mongo.org_invites.delete_many({"email": test_email.lower()})
        mongo.customer_agent_sessions.delete_one({"session_id": owner_session_id})
        mongo.customer_agent_messages.delete_many({"session_id": owner_session_id})


# ---------- cancel_subscription real mutation + restore ----------
class TestCancelSubscription:
    def test_cancel_proposes_then_executes_and_flips_tier(self, owner_session, owner_session_id, mongo, owner_user_id):
        uid, org_id = owner_user_id
        # Snapshot original state so we can restore
        before = mongo.users.find_one({"user_id": uid}, {"_id": 0})
        before_org = mongo.organizations.find_one({"org_id": org_id}, {"_id": 0})
        assert before.get("subscription_tier") == "enterprise_monthly"

        try:
            r = owner_session.post(f"{BASE_URL}/api/customer/agent/chat", json={
                "session_id": owner_session_id,
                "message": "I want to cancel my subscription now.",
            })
            assert r.status_code == 200, r.text
            pa = r.json().get("proposed_action")
            assert pa is not None, f"Expected proposed_action, got: {r.json()}"
            assert pa["type"] == "cancel_subscription", f"Wrong action type: {pa}"
            action_id = pa["id"]

            r2 = owner_session.post(f"{BASE_URL}/api/customer/agent/approve", json={
                "session_id": owner_session_id,
                "action_id": action_id,
            })
            assert r2.status_code == 200, r2.text
            assert r2.json()["executed"]["type"] == "cancel_subscription"

            # Verify user subscription_tier flipped to cancelled
            after = mongo.users.find_one({"user_id": uid}, {"_id": 0})
            assert after.get("subscription_tier") == "cancelled", f"tier not flipped: {after.get('subscription_tier')}"
            assert after.get("cancelled_at")
            assert after.get("previous_tier") == "enterprise_monthly"
        finally:
            # RESTORE — always
            mongo.users.update_one(
                {"user_id": uid},
                {"$set": {
                    "subscription_tier": before.get("subscription_tier", "enterprise_monthly"),
                    "subscription_status": before.get("subscription_status", "active"),
                }, "$unset": {"cancelled_at": "", "previous_tier": ""}},
            )
            mongo.organizations.update_one(
                {"org_id": org_id},
                {"$set": {
                    "subscription_tier": before_org.get("subscription_tier", "enterprise_monthly"),
                    "subscription_status": before_org.get("subscription_status", "active"),
                }, "$unset": {"cancelled_at": "", "previous_tier": ""}},
            )
            mongo.customer_agent_sessions.delete_one({"session_id": owner_session_id})
            mongo.customer_agent_messages.delete_many({"session_id": owner_session_id})

            # sanity: restored
            restored = mongo.users.find_one({"user_id": uid}, {"_id": 0, "subscription_tier": 1})
            assert restored["subscription_tier"] == "enterprise_monthly"


# ---------- escalate ----------
class TestEscalate:
    def test_escalate_proposes_and_approve_sends(self, owner_session, owner_session_id, mongo):
        r = owner_session.post(f"{BASE_URL}/api/customer/agent/chat", json={
            "session_id": owner_session_id,
            "message": "I have a custom request, please pass this to your team — we need a full data export of our account.",
        })
        assert r.status_code == 200, r.text
        pa = r.json().get("proposed_action")
        assert pa is not None, f"Expected proposed_action, got: {r.json()}"
        assert pa["type"] == "escalate", f"Wrong type: {pa}"
        params = pa.get("params") or {}
        assert params.get("subject"), "subject required"
        assert params.get("body"), "body required"

        r2 = owner_session.post(f"{BASE_URL}/api/customer/agent/approve", json={
            "session_id": owner_session_id, "action_id": pa["id"],
        })
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["ok"] is True
        assert d2["executed"]["type"] == "escalate"
        # email_sent may be False on Resend free-tier — that's acceptable (doesn't crash)
        assert "email_sent" in d2["executed"]

        # Completed action persisted
        sess = mongo.customer_agent_sessions.find_one({"session_id": owner_session_id})
        assert len(sess["completed_actions"]) == 1
        assert sess["completed_actions"][0]["type"] == "escalate"

        mongo.customer_agent_sessions.delete_one({"session_id": owner_session_id})
        mongo.customer_agent_messages.delete_many({"session_id": owner_session_id})


# ---------- navigate ----------
class TestNavigate:
    def test_navigate_proposal_and_approve_returns_path(self, owner_session, owner_session_id, mongo):
        r = owner_session.post(f"{BASE_URL}/api/customer/agent/chat", json={
            "session_id": owner_session_id,
            "message": "how do I connect HubSpot?",
        })
        assert r.status_code == 200, r.text
        pa = r.json().get("proposed_action")
        if pa is None:
            pytest.skip("Agent answered without proposing navigate (acceptable — model may describe path instead).")
        # Accept either navigate OR escalate; but we specifically want navigate per spec
        if pa["type"] != "navigate":
            pytest.skip(f"Agent chose {pa['type']} instead of navigate — acceptable variance")

        path = (pa.get("params") or {}).get("path", "")
        assert path.startswith("/"), f"bad path: {path}"

        r2 = owner_session.post(f"{BASE_URL}/api/customer/agent/approve", json={
            "session_id": owner_session_id, "action_id": pa["id"],
        })
        assert r2.status_code == 200, r2.text
        ex = r2.json()["executed"]
        assert ex["type"] == "navigate"
        assert ex.get("path", "").startswith("/")

        mongo.customer_agent_sessions.delete_one({"session_id": owner_session_id})
        mongo.customer_agent_messages.delete_many({"session_id": owner_session_id})


# ---------- cancel (clears pending without executing) ----------
class TestCancelPending:
    def test_cancel_clears_pending_action(self, owner_session, owner_session_id, mongo):
        # Propose something cancelable
        r = owner_session.post(f"{BASE_URL}/api/customer/agent/chat", json={
            "session_id": owner_session_id, "message": "please invite alex@acme.com",
        })
        pa = r.json().get("proposed_action")
        if pa is None:
            pytest.skip("No proposed action generated")

        r2 = owner_session.post(f"{BASE_URL}/api/customer/agent/cancel", json={
            "session_id": owner_session_id, "action_id": pa["id"],
        })
        assert r2.status_code == 200
        sess = mongo.customer_agent_sessions.find_one({"session_id": owner_session_id})
        assert sess["pending_action"] is None
        assert sess.get("completed_actions", []) == []  # NOT executed

        mongo.customer_agent_sessions.delete_one({"session_id": owner_session_id})
        mongo.customer_agent_messages.delete_many({"session_id": owner_session_id})


# ---------- non-owner forbidden on cancel_subscription ----------
class TestNonOwnerForbidden:
    def test_member_cannot_cancel_subscription(self, mongo, owner_user_id):
        uid, org_id = owner_user_id

        # Create a temporary member user in the same org
        import bcrypt as bc
        member_email = f"TEST_member_{uuid.uuid4().hex[:6]}@acme.com"
        pw_hash = bc.hashpw(b"password", bc.gensalt()).decode()
        mem_id = f"user_{uuid.uuid4().hex[:12]}"
        mongo.users.insert_one({
            "user_id": mem_id,
            "email": member_email,
            "name": "Test Member",
            "password_hash": pw_hash,
            "role": "member",
            "org_id": org_id,
            "subscription_tier": "enterprise_monthly",
            "subscription_status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        try:
            s = requests.Session()
            s.headers.update({"Content-Type": "application/json"})
            lr = s.post(f"{BASE_URL}/api/auth/login",
                        json={"email": member_email, "password": "password"})
            assert lr.status_code == 200, f"Member login failed: {lr.text}"

            sr = s.post(f"{BASE_URL}/api/customer/agent/start", json={})
            assert sr.status_code == 200
            assert sr.json()["context"]["is_owner"] is False, "Member should not be owner"
            sid = sr.json()["session_id"]

            # Force a pending cancel_subscription action in DB (bypass LLM non-determinism)
            fake_action = {
                "id": uuid.uuid4().hex[:12],
                "type": "cancel_subscription",
                "label": "Cancel",
                "reason": "test",
                "params": {},
            }
            mongo.customer_agent_sessions.update_one(
                {"session_id": sid},
                {"$set": {"pending_action": fake_action}},
            )

            ar = s.post(f"{BASE_URL}/api/customer/agent/approve", json={
                "session_id": sid, "action_id": fake_action["id"],
            })
            assert ar.status_code == 403, f"Expected 403 got {ar.status_code} {ar.text}"
        finally:
            mongo.users.delete_one({"user_id": mem_id})
            mongo.user_sessions.delete_many({"user_id": mem_id})
            mongo.customer_agent_sessions.delete_many({"user_id": mem_id})
            mongo.customer_agent_messages.delete_many({"user_id": mem_id})


# ---------- user_id scoping ----------
class TestScoping:
    def test_unknown_session_returns_404(self, owner_session):
        r = owner_session.post(f"{BASE_URL}/api/customer/agent/chat", json={
            "session_id": "nope-" + uuid.uuid4().hex, "message": "hi",
        })
        assert r.status_code == 404
