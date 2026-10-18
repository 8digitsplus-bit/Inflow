"""Iteration 75 — Featurebase retest: JWT companies[].id, no 'priority support' in AI replies, agent escalation wording."""
import os
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


# Fix 1: JWT companies[0].id and Featurebase acceptance
def test_token_companies_id(client):
    r = client.get(f"{API}/support/featurebase-token", timeout=30)
    assert r.status_code == 200
    p = jwt.decode(r.json()["token"], SECRET, algorithms=["HS256"])
    assert p["companies"][0]["id"] == "org_15337f4cefc9"
    assert "companyId" not in p["companies"][0]


def test_featurebase_accepts_jwt(client):
    token = client.get(f"{API}/support/featurebase-token", timeout=30).json()["token"]
    r = requests.post("https://inflow.featurebase.app/api/v1/feedback/widget/config",
                      json={"locale": "en", "jwtToken": token}, headers={"Origin": BASE_URL}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    assert "invalid featurebasejwt" not in r.text.lower()


# Fix 3: no 'priority support' in Smart Assist chat replies
@pytest.mark.parametrize("q", ["What support do I get on my plan?", "What features are in the Pro plan?"])
def test_chat_no_priority_support(client, q):
    r = client.post(f"{API}/support/chat", json={"message": q}, timeout=120)
    assert r.status_code == 200, r.text[:300]
    reply = r.json()["response"]
    print(f"\nQ: {q}\nA: {reply[:800]}")
    assert reply
    assert "priority support" not in reply.lower()


# Fix 3: agent mode
def test_agent_no_priority_support(client):
    r = client.post(f"{API}/support/agent", json={"message": "what support do I get"}, timeout=180)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    reply = d.get("response") or d.get("reply") or ""
    print(f"\nAGENT: {reply[:800]}")
    assert reply
    assert "priority support" not in reply.lower()
