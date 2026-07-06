"""Tests for the seat-sync stub under flat per-workspace pricing.

Plans are now flat-rate with unlimited seats, so ``sync_stripe_seat_count`` is a
no-op that always reports ``reason='flat_pricing'``. These tests lock that in and
verify the member-removal flow still surfaces the ``stripe_sync`` result.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")
from database import db  # noqa: E402
from routes.payments import sync_stripe_seat_count, is_real_stripe_key  # noqa: E402

OWNER_ORG = "org_15337f4cefc9"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class TestSeatSyncFlatPricing:
    def test_real_key_detection_helper(self):
        assert not is_real_stripe_key("sk_test_emergent")
        assert is_real_stripe_key("sk_live_abc123")
        assert is_real_stripe_key("sk_test_real_stripe_key")
        assert not is_real_stripe_key("")
        assert not is_real_stripe_key(None)

    def test_sync_is_flat_noop(self):
        result = _run(sync_stripe_seat_count(OWNER_ORG))
        assert result["synced"] is False
        assert result["reason"] == "flat_pricing"
        assert result["new_quantity"] is None

    def test_sync_noop_for_unknown_org(self):
        result = _run(sync_stripe_seat_count("org_does_not_exist"))
        assert result["synced"] is False
        assert result["reason"] == "flat_pricing"

    def test_member_removal_surfaces_sync(self):
        import requests

        BASE_URL = os.environ.get("BASE_URL", "https://inflow-preview-1.preview.emergentagent.com")
        session = requests.Session()
        r = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "testpro@test.com", "password": "password"},
            timeout=15,
        )
        assert r.status_code == 200, r.text

        async def seed():
            await db.organizations.update_one(
                {"org_id": OWNER_ORG},
                {"$set": {"subscription_tier": "enterprise_monthly"}},
            )
            await db.users.delete_many({"email": "seatsync-test@test.com"})
            uid = f"user_{uuid.uuid4().hex[:12]}"
            await db.users.insert_one({
                "user_id": uid,
                "email": "seatsync-test@test.com",
                "name": "Seat Sync",
                "password_hash": "x",
                "auth_provider": "email",
                "subscription_tier": "trial",
                "subscription_status": "active",
                "org_id": OWNER_ORG,
                "role": "member",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            return uid

        member_id = _run(seed())
        try:
            r = session.delete(f"{BASE_URL}/api/org/members/{member_id}", timeout=15)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["status"] == "removed"
            assert isinstance(body.get("stripe_sync"), dict)
            assert body["stripe_sync"]["synced"] is False
            assert body["stripe_sync"]["reason"] == "flat_pricing"
        finally:
            _run(db.users.delete_many({"email": "seatsync-test@test.com"}))
