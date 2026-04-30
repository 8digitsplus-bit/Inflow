"""Tests for the Stripe seat-count sync helper.

Validates the sandbox-mode early returns and the flow wiring.
We can't exercise live Stripe without a real key, so we verify the
decision tree via mocks / direct invocation.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest

sys.path.insert(0, "/app/backend")
from database import db  # noqa: E402
from routes.payments import sync_stripe_seat_count, is_real_stripe_key  # noqa: E402


OWNER_ID = "user_393ea5f333cb"
OWNER_ORG = "org_15337f4cefc9"


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class TestStripeSeatSync:
    def test_sandbox_key_detected(self):
        assert not is_real_stripe_key("sk_test_emergent")
        assert is_real_stripe_key("sk_live_abc123")
        assert is_real_stripe_key("sk_test_real_stripe_key")
        assert not is_real_stripe_key("")
        assert not is_real_stripe_key(None)

    def test_unknown_org(self):
        result = _run(sync_stripe_seat_count("org_does_not_exist"))
        assert result["synced"] is False
        assert result["reason"] == "org_not_found"

    def test_no_subscription(self):
        # The testpro org has no stripe_subscription_id in sandbox mode
        result = _run(sync_stripe_seat_count(OWNER_ORG))
        assert result["synced"] is False
        # Accept either reason (sandbox / not_per_user / no_subscription)
        assert result["reason"] in ("no_subscription", "sandbox_mode", "not_per_user")

    def test_non_enterprise_skipped(self):
        # Temporarily flip org to pro_monthly
        async def setup():
            await db.organizations.update_one(
                {"org_id": OWNER_ORG},
                {"$set": {"subscription_tier": "pro_monthly", "stripe_subscription_id": "sub_fake_123"}},
            )

        async def restore():
            await db.organizations.update_one(
                {"org_id": OWNER_ORG},
                {"$set": {"subscription_tier": "enterprise_monthly"}, "$unset": {"stripe_subscription_id": ""}},
            )

        _run(setup())
        try:
            result = _run(sync_stripe_seat_count(OWNER_ORG))
            assert result["synced"] is False
            assert result["reason"] == "not_per_user"
        finally:
            _run(restore())

    def test_sandbox_mode_skipped(self):
        # With a fake sub_id + enterprise tier, sandbox key → "sandbox_mode"
        async def setup():
            await db.organizations.update_one(
                {"org_id": OWNER_ORG},
                {"$set": {"subscription_tier": "enterprise_monthly", "stripe_subscription_id": "sub_fake_sandbox"}},
            )

        async def restore():
            await db.organizations.update_one(
                {"org_id": OWNER_ORG},
                {"$unset": {"stripe_subscription_id": ""}},
            )

        original_key = os.environ.get("STRIPE_API_KEY")
        os.environ["STRIPE_API_KEY"] = "sk_test_emergent"
        _run(setup())
        try:
            result = _run(sync_stripe_seat_count(OWNER_ORG))
            assert result["synced"] is False
            assert result["reason"] == "sandbox_mode"
        finally:
            if original_key is not None:
                os.environ["STRIPE_API_KEY"] = original_key
            _run(restore())

    def test_member_removal_invokes_sync(self):
        """Integration: removing a member calls sync_stripe_seat_count and its
        result is surfaced in the API response."""
        import requests

        BASE_URL = os.environ.get(
            "BASE_URL",
            "https://ai-analytics-20.preview.emergentagent.com",
        )

        session = requests.Session()
        r = session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "testpro@test.com", "password": "password"},
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # Ensure org is enterprise with seats
        async def seed():
            await db.organizations.update_one(
                {"org_id": OWNER_ORG},
                {"$set": {"subscription_tier": "enterprise_monthly", "seat_count": 3}},
            )
            # Clean stale
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
            r = session.delete(
                f"{BASE_URL}/api/org/members/{member_id}", timeout=15
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["status"] == "removed"
            assert "stripe_sync" in body
            assert isinstance(body["stripe_sync"], dict)
            # In sandbox mode the sync will not fire — verify that's reflected
            assert body["stripe_sync"]["synced"] is False
            assert body["stripe_sync"]["reason"] in (
                "no_subscription", "sandbox_mode", "not_per_user"
            )
            assert "note" in body
        finally:
            _run(db.users.delete_many({"email": "seatsync-test@test.com"}))
