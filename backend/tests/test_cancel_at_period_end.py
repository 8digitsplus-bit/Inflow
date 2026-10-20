"""Iteration 81: cancel-at-period-end (Stripe mocked) + 12-month inactivity purge job.
Calls endpoint coroutines directly against the real Mongo DB with throwaway TEST_ users/orgs (cleaned up)."""
import asyncio
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(LOOP)
load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

from fastapi import HTTPException  # noqa: E402
from database import db  # noqa: E402
from models import User  # noqa: E402
import routes.payments as payments  # noqa: E402
import routes.account as account  # noqa: E402
from utils.account_lifecycle import on_sign_in  # noqa: E402
from dependencies import require_owner  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CREATED_USERS, CREATED_ORGS = [], []


def run(coro):
    return LOOP.run_until_complete(coro)


def make_user(tier="pro_monthly", sub_id=None, last_seen_days=None, role="owner", with_org=True, extra=None):
    uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
    oid = f"org_TEST_{uuid.uuid4().hex[:10]}" if with_org else None
    now = datetime.now(timezone.utc)
    doc = {"user_id": uid, "email": f"{uid.lower()}@test.local", "name": "TEST cancel", "role": role,
           "org_id": oid, "subscription_tier": tier, "subscription_status": "active",
           "created_at": now.isoformat(),
           "last_seen_at": (now - timedelta(days=last_seen_days or 0)).isoformat()}
    if sub_id:
        doc["stripe_subscription_id"] = sub_id
        doc["stripe_livemode"] = False
    if extra:
        doc.update(extra)
    run(db.users.insert_one(dict(doc)))
    CREATED_USERS.append(uid)
    if oid:
        run(db.organizations.insert_one({"org_id": oid, "owner_user_id": uid, "name": "TEST org",
                                         "subscription_tier": tier, "subscription_status": "active"}))
        CREATED_ORGS.append(oid)
    return User(**doc)


def u(uid):
    return run(db.users.find_one({"user_id": uid}, {"_id": 0}))


def o(oid):
    return run(db.organizations.find_one({"org_id": oid}, {"_id": 0}))


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    run(db.users.delete_many({"user_id": {"$in": CREATED_USERS}}))
    run(db.organizations.delete_many({"org_id": {"$in": CREATED_ORGS}}))
    run(db.user_sessions.delete_many({"user_id": {"$in": CREATED_USERS}}))
    import hashlib
    refs = [hashlib.sha256(x.encode()).hexdigest()[:16] for x in CREATED_USERS]
    run(db.account_deletions.delete_many({"user_ref": {"$in": refs}}))


@pytest.fixture
def stripe_real(monkeypatch):
    monkeypatch.setattr(payments, "is_real_stripe_key", lambda k: True)
    calls = {"modify": [], "cancel": []}
    monkeypatch.setattr(payments.stripe_sdk.Subscription, "cancel",
                        lambda *a, **k: calls["cancel"].append((a, k)) or {"status": "canceled"})
    return calls


# --- BACKEND 1: Stripe subscription -> scheduled, tier unchanged ---
def test_scheduled_cancel_with_stripe(stripe_real, monkeypatch):
    future = int(time.time()) + 20 * 86400
    def fake_modify(sid, **kw):
        stripe_real["modify"].append((sid, kw))
        return {"status": "active", "cancel_at_period_end": True, "items": {"data": [{"current_period_end": future}]}}
    monkeypatch.setattr(payments.stripe_sdk.Subscription, "modify", fake_modify)
    user = make_user(sub_id="sub_TEST_1")
    res = run(payments.cancel_subscription(current_user=user))
    assert res["status"] == "scheduled"
    assert res["cancel_at"] == datetime.fromtimestamp(future, tz=timezone.utc).isoformat()
    assert res["message"]
    assert stripe_real["modify"] == [("sub_TEST_1", {"cancel_at_period_end": True})]
    assert stripe_real["cancel"] == []
    assert u(user.user_id)["subscription_tier"] == "pro_monthly"
    assert "previous_tier" not in u(user.user_id)
    assert o(user.org_id)["subscription_tier"] == "pro_monthly"


# --- BACKEND 2: Stripe error -> 502, no local cancel ---
def test_stripe_error_502(stripe_real, monkeypatch):
    def boom(*a, **k):
        raise Exception("stripe down")
    monkeypatch.setattr(payments.stripe_sdk.Subscription, "modify", boom)
    user = make_user(sub_id="sub_TEST_2")
    with pytest.raises(HTTPException) as e:
        run(payments.cancel_subscription(current_user=user))
    assert e.value.status_code == 502
    assert u(user.user_id)["subscription_tier"] == "pro_monthly"
    assert o(user.org_id)["subscription_tier"] == "pro_monthly"


# --- BACKEND 3: Stripe already canceled -> local immediate cancel on user+org ---
def test_stripe_already_canceled(stripe_real, monkeypatch):
    monkeypatch.setattr(payments.stripe_sdk.Subscription, "modify",
                        lambda *a, **k: {"status": "canceled", "items": {"data": []}})
    user = make_user(sub_id="sub_TEST_3")
    res = run(payments.cancel_subscription(current_user=user))
    assert res["status"] == "cancelled"
    for d in (u(user.user_id), o(user.org_id)):
        assert d["subscription_tier"] == "cancelled" and d["previous_tier"] == "pro_monthly"


# --- BACKEND 4: no Stripe sub -> immediate cancel on user AND org ---
@pytest.mark.parametrize("tier,sub", [("trial", None), ("pro_monthly", None)])
def test_no_stripe_immediate(tier, sub):
    user = make_user(tier=tier, sub_id=sub)
    res = run(payments.cancel_subscription(current_user=user))
    assert res["status"] == "cancelled" and res["previous_tier"] == tier
    for d in (u(user.user_id), o(user.org_id)):
        assert d["subscription_tier"] == "cancelled" and d["previous_tier"] == tier
        assert d["subscription_status"] == "cancelled" and d.get("cancelled_at")


def test_sentinel_key_with_sub_id_cancels_immediately():
    # In preview (sentinel key) a stored sub id is ignored -> immediate local cancel.
    user = make_user(sub_id="sub_TEST_sentinel")
    if payments.is_real_stripe_key(os.environ.get("STRIPE_API_KEY")):
        pytest.skip("real key in env")
    assert run(payments.cancel_subscription(current_user=user))["status"] == "cancelled"


@pytest.mark.parametrize("tier", ["expired", "cancelled"])
def test_inactive_tier_400(tier):
    user = make_user(tier=tier)
    with pytest.raises(HTTPException) as e:
        run(payments.cancel_subscription(current_user=user))
    assert e.value.status_code == 400


def test_non_owner_403_direct():
    with pytest.raises(HTTPException) as e:
        run(require_owner(User(user_id="x", email="x@x", name="x", role="member")))
    assert e.value.status_code == 403


def test_non_owner_403_http():
    user = make_user(role="member")
    tok = f"session_TEST_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    run(db.user_sessions.insert_one({"user_id": user.user_id, "session_token": tok,
                                     "expires_at": (now + timedelta(days=1)).isoformat(), "created_at": now.isoformat()}))
    r = requests.post(f"{BASE_URL}/api/subscription/cancel", cookies={"session_token": tok})
    assert r.status_code == 403, r.text
    assert u(user.user_id)["subscription_tier"] == "pro_monthly"


# --- BACKEND 6: inactivity lifecycle ---
def test_account_task_registered():
    import server
    run(server.startup_migrations())
    try:
        assert hasattr(server.app.state, "account_task")
        run(asyncio.sleep(1))
        assert not server.app.state.account_task.done()
    finally:
        for name in ("account_task", "outbound_task", "sync_task"):
            t = getattr(server.app.state, name, None)
            if t:
                t.cancel()
    assert run(db.users.count_documents({"last_seen_at": {"$exists": False}})) == 0


def test_inactive_warn_then_purge():
    user = make_user(tier="expired", last_seen_days=340)
    run(account.process_account_lifecycle_once())
    d = u(user.user_id)
    assert d.get("inactive_warning_sent_at")
    purge = datetime.fromisoformat(d["inactive_purge_at"])
    delta = (purge - datetime.now(timezone.utc)).total_seconds() / 86400
    assert 29.9 < delta <= 30.01
    run(db.users.update_one({"user_id": user.user_id},
                            {"$set": {"inactive_purge_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}}))
    run(account.process_account_lifecycle_once())
    assert u(user.user_id) is None
    import hashlib
    rec = run(db.account_deletions.find_one({"user_ref": hashlib.sha256(user.user_id.encode()).hexdigest()[:16]}, {"_id": 0}))
    assert rec and rec["reason"] == "inactive"


def test_active_paid_not_warned():
    user = make_user(tier="pro_monthly", last_seen_days=400)
    run(account.process_account_lifecycle_once())
    assert "inactive_warning_sent_at" not in u(user.user_id)


def test_owner_with_members_not_warned():
    user = make_user(tier="expired", last_seen_days=400)
    member = make_user(tier="expired", role="member", with_org=False, extra={})
    run(db.users.update_one({"user_id": member.user_id}, {"$set": {"org_id": user.org_id}}))
    run(account.process_account_lifecycle_once())
    assert "inactive_warning_sent_at" not in u(user.user_id)


def test_sign_in_clears_warning():
    old = (datetime.now(timezone.utc) - timedelta(days=345)).isoformat()
    user = make_user(tier="expired", last_seen_days=345,
                     extra={"inactive_warning_sent_at": old, "inactive_purge_at": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()})
    run(on_sign_in(u(user.user_id)))
    d = u(user.user_id)
    assert "inactive_warning_sent_at" not in d and "inactive_purge_at" not in d
    assert (datetime.now(timezone.utc) - datetime.fromisoformat(d["last_seen_at"])).total_seconds() < 60
