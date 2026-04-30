"""
Backend tests for the agentic contact assistant on /api/contact/agent/*

Covers: start, chat (sales+escalate intents), proposed_action shape, approve
(with edits + Resend fallback to escalation), cancel, multi-turn memory,
rate-limit logic, DB persistence in db.contact_chat_sessions / messages.
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _start(api):
    r = api.post(f"{BASE_URL}/api/contact/agent/start", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "session_id" in body and isinstance(body["session_id"], str)
    assert "greeting" in body and len(body["greeting"]) > 10
    return body["session_id"]


# ----------------- start -----------------
class TestStart:
    def test_start_creates_session_and_persists(self, api, mongo):
        sid = _start(api)
        sess = mongo.contact_chat_sessions.find_one({"session_id": sid})
        assert sess is not None
        assert sess["pending_action"] is None
        assert sess["completed_actions"] == []
        msgs = list(mongo.contact_chat_messages.find({"session_id": sid}))
        assert len(msgs) == 1 and msgs[0]["role"] == "assistant"
        # cleanup
        mongo.contact_chat_sessions.delete_one({"session_id": sid})
        mongo.contact_chat_messages.delete_many({"session_id": sid})


# ----------------- sales chat → send_reply proposal -----------------
class TestSalesFlow:
    def test_sales_then_email_yields_send_reply_proposal(self, api, mongo):
        sid = _start(api)
        # Turn 1 — ask sales question, no email yet
        r1 = api.post(f"{BASE_URL}/api/contact/agent/chat", json={
            "session_id": sid,
            "message": "Hi, I'm evaluating InFlow for my team of 5. Does Pro include Salesforce and revenue forecasting?",
        })
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["category"] in ("sales", None)  # category may be set
        # Should NOT propose send_reply yet because email missing
        assert d1.get("proposed_action") is None or d1["proposed_action"]["type"] != "send_reply" or "@" in d1["proposed_action"].get("to", "")

        # Turn 2 — provide email
        email = "TEST_buyer@example.com"
        r2 = api.post(f"{BASE_URL}/api/contact/agent/chat", json={
            "session_id": sid,
            "message": f"My email is {email}. Please send the answer there.",
        })
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        pa = d2.get("proposed_action")
        # Agent should propose either send_reply (preferred) or at minimum an action with the email
        assert pa is not None, f"Expected proposed_action after email; got {d2}"
        assert pa["type"] in ("send_reply", "escalate")
        assert "@" in pa.get("to", "")
        assert pa.get("subject"), "subject required"
        assert pa.get("body"), "body required"
        assert pa.get("id"), "action id required"

        # DB: session has pending_action and category
        sess = mongo.contact_chat_sessions.find_one({"session_id": sid})
        assert sess["pending_action"] is not None
        assert sess["pending_action"]["id"] == pa["id"]

        # Save for downstream tests
        pytest.shared_sales_session = sid
        pytest.shared_sales_action = pa
        pytest.shared_sales_email = email


# ----------------- approve (with edits) -----------------
class TestApprove:
    def test_approve_with_edits_persists_and_falls_back_gracefully(self, api, mongo):
        sid = getattr(pytest, "shared_sales_session", None)
        pa = getattr(pytest, "shared_sales_action", None)
        if not sid or not pa:
            pytest.skip("No sales session prepared")

        edited_body = "EDITED-BODY: " + (pa["body"][:200])
        r = api.post(f"{BASE_URL}/api/contact/agent/approve", json={
            "session_id": sid,
            "action_id": pa["id"],
            "edits": {"body": edited_body},
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "executed" in d
        # Resend free-tier likely blocks → sent=false but ok=true (graceful fallback)
        assert d["executed"]["type"] in ("send_reply", "escalate")

        sess = mongo.contact_chat_sessions.find_one({"session_id": sid})
        assert sess["pending_action"] is None
        assert len(sess["completed_actions"]) == 1
        completed = sess["completed_actions"][0]
        assert completed["body"].startswith("EDITED-BODY:"), "Edited body must be persisted (not Claude original)"
        assert "send_result" in completed
        # cleanup
        mongo.contact_chat_sessions.delete_one({"session_id": sid})
        mongo.contact_chat_messages.delete_many({"session_id": sid})


# ----------------- refund/billing → escalate -----------------
class TestEscalateFlow:
    def test_refund_intent_proposes_escalate_and_cancel_clears(self, api, mongo):
        sid = _start(api)
        r1 = api.post(f"{BASE_URL}/api/contact/agent/chat", json={
            "session_id": sid,
            "message": "Hi, I was charged twice last month and need a refund. My email is TEST_refund@example.com.",
        })
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        pa = d1.get("proposed_action")
        # Refund must NOT be auto-handled by send_reply
        if pa is None:
            # Some models may ask one clarifier first — try a second turn
            r1b = api.post(f"{BASE_URL}/api/contact/agent/chat", json={
                "session_id": sid,
                "message": "Please just forward to your billing team. Email is TEST_refund@example.com",
            })
            d1 = r1b.json()
            pa = d1.get("proposed_action")
        assert pa is not None, f"Expected escalate action; got {d1}"
        assert pa["type"] == "escalate", f"Refund intent must escalate, got {pa['type']}"
        assert d1.get("category") in ("refund", "billing", "other", None)

        # Cancel the action
        r2 = api.post(f"{BASE_URL}/api/contact/agent/cancel", json={
            "session_id": sid, "action_id": pa["id"],
        })
        assert r2.status_code == 200
        sess = mongo.contact_chat_sessions.find_one({"session_id": sid})
        assert sess["pending_action"] is None

        # cancel is idempotent
        r3 = api.post(f"{BASE_URL}/api/contact/agent/cancel", json={
            "session_id": sid, "action_id": pa["id"],
        })
        assert r3.status_code == 200

        mongo.contact_chat_sessions.delete_one({"session_id": sid})
        mongo.contact_chat_messages.delete_many({"session_id": sid})


# ----------------- multi-turn memory -----------------
class TestMemory:
    def test_agent_remembers_prior_turn_context(self, api, mongo):
        sid = _start(api)
        api.post(f"{BASE_URL}/api/contact/agent/chat", json={
            "session_id": sid, "message": "We're a 5-seat team looking at InFlow.",
        })
        api.post(f"{BASE_URL}/api/contact/agent/chat", json={
            "session_id": sid, "message": "We mainly use Stripe and HubSpot today.",
        })
        r = api.post(f"{BASE_URL}/api/contact/agent/chat", json={
            "session_id": sid, "message": "Given our setup, which plan would you recommend?",
        })
        assert r.status_code == 200
        text = r.json()["message"].lower()
        # The agent should reference earlier context (5 seats / stripe / hubspot / team size)
        keywords = ["5", "five", "stripe", "hubspot", "team", "seats"]
        assert any(k in text for k in keywords), f"No memory recall in: {text}"

        # DB has all turns persisted
        msgs = list(mongo.contact_chat_messages.find({"session_id": sid}).sort("created_at", 1))
        # 1 greeting + 3 user + 3 assistant = 7
        assert len(msgs) >= 6
        roles = [m["role"] for m in msgs]
        assert roles.count("user") >= 3 and roles.count("assistant") >= 3

        mongo.contact_chat_sessions.delete_one({"session_id": sid})
        mongo.contact_chat_messages.delete_many({"session_id": sid})


# ----------------- 404 on unknown session -----------------
class TestErrors:
    def test_chat_unknown_session_404(self, api):
        r = api.post(f"{BASE_URL}/api/contact/agent/chat", json={
            "session_id": "nonexistent" + uuid.uuid4().hex, "message": "hi",
        })
        assert r.status_code == 404

    def test_approve_unknown_action_400(self, api):
        sid = _start(api)
        r = api.post(f"{BASE_URL}/api/contact/agent/approve", json={
            "session_id": sid, "action_id": "deadbeef",
        })
        assert r.status_code == 400


# ----------------- rate-limit logic (DB-only check, no real flood) -----------------
class TestRateLimit:
    def test_rate_limit_triggers_when_db_has_30_recent(self, api, mongo):
        sid = _start(api)
        ip = "203.0.113.99"  # test IP we'll inject
        # update session ip and inject 30 user messages within last hour for that ip
        mongo.contact_chat_sessions.update_one({"session_id": sid}, {"$set": {"ip": ip}})
        now = datetime.now(timezone.utc).isoformat()
        bulk = [{
            "session_id": sid, "ip": ip, "role": "user",
            "content": f"flood-{i}", "created_at": now,
        } for i in range(30)]
        mongo.contact_chat_messages.insert_many(bulk)

        # Send next chat with X-Forwarded-For matching ip → expect 429
        r = api.post(
            f"{BASE_URL}/api/contact/agent/chat",
            json={"session_id": sid, "message": "one more"},
            headers={"X-Forwarded-For": ip},
        )
        assert r.status_code == 429, f"Expected 429 got {r.status_code} {r.text}"

        mongo.contact_chat_sessions.delete_one({"session_id": sid})
        mongo.contact_chat_messages.delete_many({"session_id": sid})
