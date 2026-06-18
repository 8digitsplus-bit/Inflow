"""
Backend tests for the in-app legal update notification system.

Verifies:
1. GET /api/legal/updates requires auth (401 when signed-out).
2. First call silently brings the user up to current versions (no spurious banner).
3. When a doc version is ahead of the user's acknowledged version, it surfaces in /updates.
4. POST /api/legal/ack records acknowledgement so the doc no longer surfaces.
5. GET /api/legal/policy/{id} returns sanitised HTML for a known policy.
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

if not BASE_URL or not MONGO_URL or not DB_NAME:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    load_dotenv("/app/frontend/.env")
    BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
    MONGO_URL = os.environ.get("MONGO_URL")
    DB_NAME = os.environ.get("DB_NAME")

EXISTING_EMAIL = "testpro@test.com"
EXISTING_PASSWORD = "password"
TERMS_POLICY_ID = "d418110f-9ff8-4583-9d40-2cde4be2cfe0"


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture
def auth_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EXISTING_EMAIL, "password": EXISTING_PASSWORD},
    )
    assert r.status_code == 200, r.text
    assert not r.json().get("requires_2fa"), "test account must not have 2FA enabled"
    return s


def _get_user_id(mongo):
    u = mongo.users.find_one({"email": EXISTING_EMAIL}, {"user_id": 1})
    assert u, "test user must exist"
    return u["user_id"]


def test_updates_requires_auth():
    r = requests.get(f"{BASE_URL}/api/legal/updates")
    assert r.status_code == 401, r.text


def test_first_call_silently_acks_then_no_updates(auth_session, mongo):
    user_id = _get_user_id(mongo)
    # Wipe ack so this simulates a "first-time" user.
    mongo.users.update_one({"user_id": user_id}, {"$unset": {"legal_ack": ""}})

    r = auth_session.get(f"{BASE_URL}/api/legal/updates")
    assert r.status_code == 200, r.text
    assert r.json()["updates"] == []  # no banner on day one

    # Ack record was created and matches current versions.
    docs = {d["doc_type"]: d["version"] for d in mongo.legal_documents.find({})}
    ack = mongo.users.find_one({"user_id": user_id}, {"legal_ack": 1})["legal_ack"]
    for t, v in docs.items():
        assert ack.get(t) == v


def test_pending_update_surfaces_and_ack_clears_it(auth_session, mongo):
    user_id = _get_user_id(mongo)
    # Ensure baseline ack exists, then make 'terms' one version behind.
    auth_session.get(f"{BASE_URL}/api/legal/updates")
    mongo.users.update_one({"user_id": user_id}, {"$set": {"legal_ack.terms": 0}})

    r = auth_session.get(f"{BASE_URL}/api/legal/updates")
    assert r.status_code == 200, r.text
    pending = {u["doc_type"]: u for u in r.json()["updates"]}
    assert "terms" in pending
    assert pending["terms"]["name"] == "Terms of Service"
    assert pending["terms"]["path"] == "/terms"
    assert pending["terms"]["version"] >= 1

    # Acknowledge terms.
    r = auth_session.post(f"{BASE_URL}/api/legal/ack", json={"doc_types": ["terms"]})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True

    # No longer surfaces.
    r = auth_session.get(f"{BASE_URL}/api/legal/updates")
    assert r.status_code == 200, r.text
    assert all(u["doc_type"] != "terms" for u in r.json()["updates"])


def test_ack_all_docs_when_no_doc_types_given(auth_session, mongo):
    user_id = _get_user_id(mongo)
    mongo.users.update_one(
        {"user_id": user_id},
        {"$set": {"legal_ack.terms": 0, "legal_ack.privacy": 0, "legal_ack.cookies": 0}},
    )
    # Default ack (no body filter) acknowledges everything.
    r = auth_session.post(f"{BASE_URL}/api/legal/ack", json={})
    assert r.status_code == 200, r.text

    r = auth_session.get(f"{BASE_URL}/api/legal/updates")
    assert r.status_code == 200, r.text
    assert r.json()["updates"] == []


def test_get_policy_returns_sanitised_html(auth_session):
    r = requests.get(f"{BASE_URL}/api/legal/policy/{TERMS_POLICY_ID}")
    assert r.status_code == 200, r.text
    html = r.json()["html"]
    assert isinstance(html, str) and len(html) > 100
    assert "<script" not in html.lower()


def test_get_policy_rejects_unknown_id():
    r = requests.get(f"{BASE_URL}/api/legal/policy/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404, r.text
