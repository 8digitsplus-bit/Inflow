"""Smoke tests for the 5 new integrations.
Validates they are registered in PLATFORMS and the connect endpoint rejects bogus creds.
"""
import sys
sys.path.insert(0, "/app/backend")

import os
import requests
import pytest

BASE_URL = os.environ.get("BASE_URL", "https://inflow-pricing.preview.emergentagent.com")
NEW_PLATFORMS = ["paypal", "amplitude", "mixpanel", "zoho", "xero"]


@pytest.fixture(scope="module")
def owner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "testpro@test.com", "password": "password"}, timeout=15)
    assert r.status_code == 200, r.text
    return s


class TestNewIntegrations:
    def test_all_platforms_registered(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/business/platforms", timeout=15)
        assert r.status_code == 200
        ids = {p["platform_id"] for p in r.json()}
        for p in NEW_PLATFORMS:
            assert p in ids, f"{p} missing from /api/business/platforms"

    def test_paypal_rejects_bad_creds(self, owner_session):
        r = owner_session.post(
            f"{BASE_URL}/api/business/connect/paypal",
            json={"client_id": "fake_id", "client_secret": "fake_secret", "sandbox": True},
            timeout=15,
        )
        assert r.status_code == 400
        assert "paypal" in r.json()["detail"].lower() or "client" in r.json()["detail"].lower()

    def test_amplitude_rejects_bad_creds(self, owner_session):
        r = owner_session.post(
            f"{BASE_URL}/api/business/connect/amplitude",
            json={"client_id": "fake_api_key", "api_key": "fake_secret_key", "instance_url": "us"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "amplitude" in r.json()["detail"].lower() or "api" in r.json()["detail"].lower()

    def test_mixpanel_missing_fields(self, owner_session):
        r = owner_session.post(
            f"{BASE_URL}/api/business/connect/mixpanel",
            json={},  # missing project_id + api_secret
            timeout=15,
        )
        assert r.status_code == 400

    def test_zoho_missing_fields(self, owner_session):
        r = owner_session.post(
            f"{BASE_URL}/api/business/connect/zoho",
            json={},
            timeout=15,
        )
        assert r.status_code == 400

    def test_xero_missing_fields(self, owner_session):
        r = owner_session.post(
            f"{BASE_URL}/api/business/connect/xero",
            json={},
            timeout=15,
        )
        assert r.status_code == 400

    def test_member_blocked_from_connecting(self):
        """Members (non-owners) cannot connect any integration."""
        import bcrypt
        import uuid
        import asyncio
        from datetime import datetime, timezone
        from database import db

        async def seed():
            await db.users.delete_many({"email": "conn-test@test.com"})
            uid = f"user_{uuid.uuid4().hex[:12]}"
            await db.users.insert_one({
                "user_id": uid, "email": "conn-test@test.com", "name": "Conn Test",
                "password_hash": bcrypt.hashpw(b"x", bcrypt.gensalt()).decode(),
                "auth_provider": "email",
                "subscription_tier": "trial", "subscription_status": "active",
                "org_id": "org_15337f4cefc9", "role": "member",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        async def cleanup():
            await db.users.delete_many({"email": "conn-test@test.com"})

        asyncio.get_event_loop().run_until_complete(seed())
        try:
            s = requests.Session()
            r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "conn-test@test.com", "password": "x"}, timeout=15)
            assert r.status_code == 200
            for p in NEW_PLATFORMS:
                r = s.post(f"{BASE_URL}/api/business/connect/{p}", json={}, timeout=15)
                assert r.status_code == 403, f"{p} should 403 for members, got {r.status_code}"
        finally:
            asyncio.get_event_loop().run_until_complete(cleanup())
