"""Iteration 74 — Featurebase support integration: signed JWT token, Priority support removal, Smart Assist chat."""
import os
import time
import jwt
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
SECRET = os.environ.get("FEATUREBASE_JWT_SECRET")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": "testpro@test.com", "password": "password"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    tok = d.get("access_token") or d.get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# Featurebase token
def test_featurebase_token_unauth():
    r = requests.get(f"{API}/support/featurebase-token", timeout=30)
    assert r.status_code == 401


def test_featurebase_token_payload(client):
    r = client.get(f"{API}/support/featurebase-token", timeout=30)
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    p = jwt.decode(token, SECRET, algorithms=["HS256"])
    me = client.get(f"{API}/auth/me", timeout=30).json()
    me = me.get("user", me)
    assert p["userId"] == "user_393ea5f333cb"
    assert p["email"] == "testpro@test.com"
    assert p["name"]
    assert p["plan"] == me.get("subscription_tier")
    # Featurebase rejects `companyId` (401 Invalid featurebaseJwt) — company key must be `id`
    assert p["companies"][0]["id"] == "org_15337f4cefc9"
    assert "companyId" not in p["companies"][0]
    assert p["companies"][0]["name"]
    assert 23.9 * 3600 <= p["exp"] - p["iat"] <= 24.1 * 3600
    assert abs(p["iat"] - time.time()) < 120


def test_featurebase_token_wrong_secret_rejected(client):
    token = client.get(f"{API}/support/featurebase-token", timeout=30).json()["token"]
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, "wrong", algorithms=["HS256"])


# Live check: Featurebase accepts the server-issued JWT
def test_featurebase_accepts_server_jwt(client):
    token = client.get(f"{API}/support/featurebase-token", timeout=30).json()["token"]
    r = requests.post("https://inflow.featurebase.app/api/v1/feedback/widget/config",
                      json={"locale": "en", "jwtToken": token},
                      headers={"Origin": BASE_URL}, timeout=30)
    assert r.status_code == 200, r.text[:200]


# Plans: no Priority support
def test_plans_no_priority_support():
    r = requests.get(f"{API}/subscription/plans", timeout=30)
    assert r.status_code == 200
    assert "priority support" not in r.text.lower()


# Smart Assist chat still works
def test_smart_assist_chat(client):
    r = client.post(f"{API}/support/chat", json={"message": "What features are in my plan?"}, timeout=90)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert d["conversation_id"].startswith("conv_")
    assert isinstance(d["response"], str) and len(d["response"]) > 20
    assert "priority support" not in d["response"].lower()
