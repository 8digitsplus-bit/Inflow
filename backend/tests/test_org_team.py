"""Phase 1 Team/Org management backend tests.

Covers:
- Startup migration (testpro@test.com has org_id + role=owner)
- /api/org/me, /api/org/members, /api/org/seats, /api/org/invites
- Enterprise gating on invite
- Invite lifecycle: create -> public lookup -> signup-and-accept (or accept) -> revoke -> expire
- Seat exhaustion
- Member permission gating on deals / business / integrations
- Remove member (owner-only, re-solo-org with expired tier)
"""
import os
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://inflow-preview-1.preview.emergentagent.com").rstrip("/")
OWNER_EMAIL = "testpro@test.com"
OWNER_PASSWORD = "password"

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


# ---------- DB helpers (direct mongo, for test setup/teardown only) ----------
def _db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _set_org_tier(org_id, tier, seats):
    db = _db()
    await db.organizations.update_one(
        {"org_id": org_id},
        {"$set": {"subscription_tier": tier, "seat_count": seats, "subscription_status": "active"}}
    )


async def _reset_org_tier(org_id, tier):
    db = _db()
    await db.organizations.update_one(
        {"org_id": org_id}, {"$set": {"subscription_tier": tier, "seat_count": 1}}
    )


async def _cleanup_invites(org_id):
    db = _db()
    await db.org_invites.delete_many({"org_id": org_id})


async def _cleanup_user(email):
    db = _db()
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if u:
        await db.users.delete_one({"user_id": u["user_id"]})
        await db.user_sessions.delete_many({"user_id": u["user_id"]})
    return u


async def _expire_invite(invite_id):
    db = _db()
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    await db.org_invites.update_one({"invite_id": invite_id}, {"$set": {"expires_at": past}})


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.text}"
    assert s.cookies.get("session_token")
    return s


@pytest.fixture(scope="module")
def owner_org(owner_session):
    r = owner_session.get(f"{BASE_URL}/api/org/me", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def enterprise_mode(owner_org):
    """Temporarily upgrade owner's org to enterprise_monthly / 3 seats."""
    original_tier = owner_org.get("subscription_tier", "pro_monthly")
    original_seats = owner_org.get("seat_count", 1)
    run(_set_org_tier(owner_org["org_id"], "enterprise_monthly", 3))
    yield owner_org["org_id"]
    run(_set_org_tier(owner_org["org_id"], original_tier, original_seats))
    run(_cleanup_invites(owner_org["org_id"]))


# ========== Migration + Read endpoints ==========

class TestOrgReads:
    def test_org_me(self, owner_session, owner_org):
        assert owner_org["org_id"].startswith("org_")
        assert owner_org["role"] == "owner"
        assert owner_org["owner_user_id"]
        assert "subscription_tier" in owner_org

    def test_org_members(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/org/members", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "members" in body
        emails = [m["email"] for m in body["members"]]
        assert OWNER_EMAIL in emails
        owner_entry = next(m for m in body["members"] if m["email"] == OWNER_EMAIL)
        assert owner_entry["role"] == "owner"

    def test_org_seats(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/org/seats", timeout=15)
        assert r.status_code == 200
        body = r.json()
        for key in ["org_id", "subscription_tier", "seats", "members", "pending_invites", "available", "is_enterprise"]:
            assert key in body

    def test_org_invites_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/org/invites", timeout=15)
        assert r.status_code == 401


# ========== Enterprise gating ==========

class TestInviteGating:
    def test_invite_blocked_for_non_enterprise(self, owner_session, owner_org):
        # Ensure we are on non-enterprise
        run(_reset_org_tier(owner_org["org_id"], "pro_monthly"))
        r = owner_session.post(f"{BASE_URL}/api/org/invite",
                               json={"email": f"TEST_{uuid.uuid4().hex[:6]}@example.com"}, timeout=15)
        assert r.status_code == 403
        assert "enterprise" in r.json().get("detail", "").lower()


# ========== Full invite/signup-and-accept flow ==========

class TestInviteFlow:
    def test_invite_and_public_lookup_and_signup(self, owner_session, enterprise_mode):
        test_email = f"TEST_invitee_{uuid.uuid4().hex[:8]}@example.com".lower()
        new_user_id = None
        try:
            # CREATE invite
            r = owner_session.post(f"{BASE_URL}/api/org/invite",
                                   json={"email": test_email}, timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["email"].lower() == test_email.lower()
            # email_sent may be True (Resend configured + verified sender) or False (no key / unverified recipient).
            # Either is acceptable — we only assert the invite record and accept_url.
            assert "email_sent" in body
            assert "accept_url" in body and "/accept-invite/" in body["accept_url"]
            token = body["accept_url"].split("/accept-invite/")[-1]

            # PUBLIC lookup (no auth)
            r = requests.get(f"{BASE_URL}/api/org/invite/{token}", timeout=15)
            assert r.status_code == 200, r.text
            lookup = r.json()
            assert lookup["email"].lower() == test_email.lower()
            assert lookup["org_name"]
            assert lookup["inviter_name"]
            assert "expires_at" in lookup

            # SIGNUP-AND-ACCEPT — server sets session_token cookie
            member_session = requests.Session()
            r = member_session.post(f"{BASE_URL}/api/org/signup-and-accept/{token}",
                                    json={"name": "TEST Invitee", "password": "testpass123"}, timeout=20)
            assert r.status_code == 200, r.text
            joined = r.json()
            assert joined["status"] == "joined"
            assert joined["email"].lower() == test_email.lower()
            assert joined["role"] == "member"
            new_user_id = joined["user_id"]
            assert member_session.cookies.get("session_token"), "No session cookie set"

            # Member sees owner's deals (same org)
            r3 = member_session.get(f"{BASE_URL}/api/deals", timeout=15)
            assert r3.status_code == 200, r3.text
            owner_deals = owner_session.get(f"{BASE_URL}/api/deals", timeout=15).json()
            assert len(r3.json()) == len(owner_deals)

            # Member blocked from deal CREATE + business mutations
            r_create = member_session.post(f"{BASE_URL}/api/deals",
                                           json={"name": "x", "company": "y", "value": 1}, timeout=15)
            assert r_create.status_code == 403
            assert "owner" in r_create.json().get("detail", "").lower()

            r_conn = member_session.post(f"{BASE_URL}/api/business/connect/stripe",
                                         json={"api_key": "sk_test_xxx"}, timeout=15)
            assert r_conn.status_code == 403

            r_disc = member_session.post(f"{BASE_URL}/api/business/disconnect/stripe", timeout=15)
            assert r_disc.status_code == 403

            r_sync = member_session.post(f"{BASE_URL}/api/business/sync/stripe", timeout=15)
            assert r_sync.status_code == 403

            # OWNER removes member
            r_rm = owner_session.delete(f"{BASE_URL}/api/org/members/{new_user_id}", timeout=15)
            assert r_rm.status_code == 200
            assert r_rm.json()["status"] == "removed"

            # Removed member no longer sees org deals (now solo expired org)
            r_after = member_session.get(f"{BASE_URL}/api/deals", timeout=15)
            assert r_after.status_code == 200
            assert r_after.json() == []
        finally:
            run(_cleanup_user(test_email))

    def test_signup_with_existing_email_returns_400(self, owner_session, enterprise_mode):
        # Invite the owner's own email (exists) -> first it errors on "already member"
        # So instead, create a throwaway user first then invite with that email
        db = _db()
        stale_email = f"TEST_stale_{uuid.uuid4().hex[:6]}@example.com".lower()
        stale_id = f"user_{uuid.uuid4().hex[:12]}"
        run(db.users.insert_one({
            "user_id": stale_id, "email": stale_email, "name": "Stale",
            "password_hash": "x", "auth_provider": "email",
            "subscription_tier": "trial", "subscription_status": "active",
            "org_id": f"org_{uuid.uuid4().hex[:12]}", "role": "owner",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }))
        try:
            r = owner_session.post(f"{BASE_URL}/api/org/invite",
                                   json={"email": stale_email}, timeout=15)
            assert r.status_code == 200, r.text
            token = r.json()["accept_url"].split("/accept-invite/")[-1]
            r2 = requests.post(f"{BASE_URL}/api/org/signup-and-accept/{token}",
                               json={"name": "X", "password": "abc12345"}, timeout=15)
            assert r2.status_code == 400
            assert "already exists" in r2.json().get("detail", "").lower()
        finally:
            run(_cleanup_user(stale_email))

    def test_revoke_invite(self, owner_session, enterprise_mode):
        email = f"TEST_rev_{uuid.uuid4().hex[:8]}@example.com"
        r = owner_session.post(f"{BASE_URL}/api/org/invite", json={"email": email}, timeout=15)
        assert r.status_code == 200, r.text
        invite_id = r.json()["invite_id"]
        token = r.json()["accept_url"].split("/accept-invite/")[-1]

        r2 = owner_session.post(f"{BASE_URL}/api/org/invites/{invite_id}/revoke", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "revoked"

        # Public lookup now returns 410
        r3 = requests.get(f"{BASE_URL}/api/org/invite/{token}", timeout=15)
        assert r3.status_code == 410

    def test_expired_invite_returns_410(self, owner_session, enterprise_mode):
        email = f"TEST_exp_{uuid.uuid4().hex[:8]}@example.com"
        r = owner_session.post(f"{BASE_URL}/api/org/invite", json={"email": email}, timeout=15)
        assert r.status_code == 200
        invite_id = r.json()["invite_id"]
        token = r.json()["accept_url"].split("/accept-invite/")[-1]
        run(_expire_invite(invite_id))

        r2 = requests.get(f"{BASE_URL}/api/org/invite/{token}", timeout=15)
        assert r2.status_code == 410

        r3 = requests.post(f"{BASE_URL}/api/org/signup-and-accept/{token}",
                           json={"name": "X", "password": "abc12345"}, timeout=15)
        assert r3.status_code == 410

    def test_duplicate_invite_returns_400(self, owner_session, enterprise_mode):
        email = f"TEST_dup_{uuid.uuid4().hex[:8]}@example.com"
        r = owner_session.post(f"{BASE_URL}/api/org/invite", json={"email": email}, timeout=15)
        assert r.status_code == 200
        r2 = owner_session.post(f"{BASE_URL}/api/org/invite", json={"email": email}, timeout=15)
        assert r2.status_code == 400
        assert "already been sent" in r2.json().get("detail", "").lower()

    def test_seat_exhaustion(self, owner_session, owner_org):
        # Purge any lingering TEST_ members in the org (from prior failed runs)
        async def _purge():
            db = _db()
            await db.users.delete_many({
                "org_id": owner_org["org_id"],
                "email": {"$regex": "^test_", "$options": "i"},
            })
        run(_purge())
        # Set seats=3 (1 owner + 2 invites max)
        run(_set_org_tier(owner_org["org_id"], "enterprise_monthly", 3))
        run(_cleanup_invites(owner_org["org_id"]))
        try:
            e1 = f"TEST_seat1_{uuid.uuid4().hex[:6]}@example.com"
            e2 = f"TEST_seat2_{uuid.uuid4().hex[:6]}@example.com"
            e3 = f"TEST_seat3_{uuid.uuid4().hex[:6]}@example.com"
            r1 = owner_session.post(f"{BASE_URL}/api/org/invite", json={"email": e1}, timeout=15)
            r2 = owner_session.post(f"{BASE_URL}/api/org/invite", json={"email": e2}, timeout=15)
            assert r1.status_code == 200 and r2.status_code == 200
            r3 = owner_session.post(f"{BASE_URL}/api/org/invite", json={"email": e3}, timeout=15)
            assert r3.status_code == 400
            assert "no seats" in r3.json().get("detail", "").lower()

            # Revoking one frees a seat
            inv2 = r2.json()["invite_id"]
            owner_session.post(f"{BASE_URL}/api/org/invites/{inv2}/revoke", timeout=15)
            r4 = owner_session.post(f"{BASE_URL}/api/org/invite", json={"email": e3}, timeout=15)
            assert r4.status_code == 200, r4.text
        finally:
            run(_set_org_tier(owner_org["org_id"], "pro_monthly", 1))
            run(_cleanup_invites(owner_org["org_id"]))


# ========== Public invite 404 ==========

def test_public_invite_not_found():
    r = requests.get(f"{BASE_URL}/api/org/invite/nonexistenttoken", timeout=10)
    assert r.status_code == 404
