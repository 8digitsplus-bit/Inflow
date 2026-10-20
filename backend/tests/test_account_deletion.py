"""Account deletion API tests (iteration 80). Requires seed: python3 tests/seed_e2edel.py seed"""
import os
import random
import subprocess
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
mdb = MongoClient(os.environ["MONGO_URL"].strip('"'))[os.environ["DB_NAME"].strip('"')]
SEED = "/app/backend/tests/seed_e2edel.py"


def _xff():
    return {"X-Forwarded-For": f"10.{random.randint(1,250)}.{random.randint(1,250)}.{random.randint(1,250)}"}


@pytest.fixture(scope="module")
def pw_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "e2edel01@test.local", "password": "Passw0rd!x"}, headers=_xff())
    if r.status_code != 200:
        pytest.skip(f"e2edel01 login failed {r.status_code} {r.text}")
    assert "password_hash" not in r.json()
    return s


@pytest.fixture(scope="module")
def google_client():
    s = requests.Session()
    s.cookies.set("session_token", "session_e2edel02_test")
    return s


# --- deletion info ---
class TestDeletionInfo:
    def test_unauth(self):
        assert requests.get(f"{BASE_URL}/api/account/deletion").status_code == 401

    def test_password_user_info(self, pw_client):
        d = pw_client.get(f"{BASE_URL}/api/account/deletion").json()
        assert d["has_password"] is True and d["blocked_by_members"] is False
        assert d["grace_days"] == 30 and d["email_hint"] == "e2e***@test.local"

    def test_google_user_info(self, google_client):
        r = google_client.get(f"{BASE_URL}/api/account/deletion")
        assert r.status_code == 200, r.text
        assert r.json()["has_password"] is False


# --- validation / reauth ---
class TestDeleteValidation:
    def test_confirm_required(self, pw_client):
        r = pw_client.post(f"{BASE_URL}/api/account/delete", json={"confirm": "nope", "password": "Passw0rd!x"}, headers=_xff())
        assert r.status_code == 400 and "DELETE" in r.json()["detail"]

    def test_wrong_password(self, pw_client):
        r = pw_client.post(f"{BASE_URL}/api/account/delete", json={"confirm": "DELETE", "password": "bad"}, headers=_xff())
        assert r.status_code == 401 and r.json()["detail"] == "Incorrect password"
        assert mdb.users.find_one({"user_id": "user_e2edel01"}).get("deletion_status") is None

    def test_google_wrong_code(self, google_client):
        r = google_client.post(f"{BASE_URL}/api/account/delete", json={"confirm": "DELETE", "code": "000000"}, headers=_xff())
        assert r.status_code == 401 and r.json()["detail"] == "Invalid or expired code"

    def test_google_missing_code(self, google_client):
        r = google_client.post(f"{BASE_URL}/api/account/delete", json={"confirm": "DELETE"}, headers=_xff())
        assert r.status_code == 401


# --- owner with members blocked ---
class TestBlockedByMembers:
    def test_blocked(self, pw_client):
        subprocess.run(["python3", SEED, "member"], check=True)
        try:
            d = pw_client.get(f"{BASE_URL}/api/account/deletion").json()
            assert d["blocked_by_members"] is True
            r = pw_client.post(f"{BASE_URL}/api/account/delete", json={"confirm": "DELETE", "password": "Passw0rd!x"}, headers=_xff())
            assert r.status_code == 409, r.text
            assert "Transfer ownership" in r.json()["detail"]
            u = mdb.users.find_one({"user_id": "user_e2edel01"})
            assert u.get("deletion_status") is None and u["subscription_tier"] == "pro_monthly"
        finally:
            subprocess.run(["python3", SEED, "unmember"], check=True)
        assert pw_client.get(f"{BASE_URL}/api/account/deletion").json()["blocked_by_members"] is False


# --- send code (google-only) ---
class TestSendCode:
    def test_send_code_creates_otp(self, google_client):
        r = google_client.post(f"{BASE_URL}/api/account/delete/code", headers=_xff())
        assert r.status_code == 200, r.text
        assert r.json()["email_hint"] == "e2e***@test.local"
        doc = mdb.account_delete_codes.find_one({"user_id": "user_e2edel02"})
        assert doc is not None and "code" not in doc and len(doc["code_hash"]) == 64

    def test_login_2fa_code_not_accepted_for_deletion(self, google_client):
        mdb.otp_codes.insert_one({"user_id": "user_e2edel02", "code": "123456", "expires_at": "2999-01-01T00:00:00+00:00"})
        try:
            r = google_client.post(f"{BASE_URL}/api/account/delete", json={"confirm": "DELETE", "code": "123456"}, headers=_xff())
            assert r.status_code == 401
        finally:
            mdb.otp_codes.delete_many({"user_id": "user_e2edel02"})

    def test_code_brute_force_blocked(self, google_client):
        # Either the code is burned after 5 wrong tries or the per-account throttle returns 429 — both stop guessing.
        google_client.post(f"{BASE_URL}/api/account/delete/code", headers=_xff())
        statuses = [google_client.post(f"{BASE_URL}/api/account/delete", json={"confirm": "DELETE", "code": "000000"}, headers=_xff()).status_code
                    for _ in range(6)]
        assert 429 in statuses or mdb.account_delete_codes.find_one({"user_id": "user_e2edel02"}) is None


# --- regression: testpro login + auth/session ---
class TestRegression:
    def test_testpro_login_and_me(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "testpro@test.com", "password": "password"}, headers=_xff())
        assert r.status_code == 200, r.text
        assert "password_hash" not in r.json()
        me = s.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200 and me.json()["email"] == "testpro@test.com" and "password_hash" not in me.json()
        d = s.get(f"{BASE_URL}/api/account/deletion").json()
        assert d["has_password"] is True

    def test_auth_session_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/session", json={"session_id": "bogus_xyz"}, headers=_xff())
        assert r.status_code == 401
        r = requests.post(f"{BASE_URL}/api/auth/session", json={}, headers=_xff())
        assert r.status_code == 400


# --- full password delete -> purge -> login 401 (runs last; destroys e2edel01) ---
class TestZPurge:
    def test_delete_then_purge(self, pw_client):
        r = pw_client.post(f"{BASE_URL}/api/account/delete", json={"confirm": "delete", "password": "Passw0rd!x"}, headers=_xff())
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "scheduled"
        assert pw_client.get(f"{BASE_URL}/api/auth/me").status_code == 401
        subprocess.run(["python3", SEED, "pastpurge", "user_e2edel01"], check=True)
        subprocess.run(["python3", "-c", "import asyncio; from routes.account import process_account_lifecycle_once as p; asyncio.run(p())"],
                       cwd="/app/backend", check=True)
        assert mdb.users.find_one({"user_id": "user_e2edel01"}) is None
        assert mdb.organizations.find_one({"org_id": "org_e2edel01"}) is None
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "e2edel01@test.local", "password": "Passw0rd!x"}, headers=_xff())
        assert r.status_code == 401
