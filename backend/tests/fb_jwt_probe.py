"""Probe: does Featurebase accept JWTs signed with FEATUREBASE_JWT_SECRET? (diagnostic, not a pytest)"""
import os, time, jwt, requests
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
S = os.environ["FEATUREBASE_JWT_SECRET"]
APP = "6ad4a0dae0eb00fa0360fc54"
now = int(time.time())
variants = {
    "minimal": {"userId": "user_393ea5f333cb", "email": "testpro@test.com", "name": "Test Pro User"},
    "minimal_iat_exp": {"userId": "user_393ea5f333cb", "email": "testpro@test.com", "name": "Test Pro User", "iat": now, "exp": now + 3600},
    "email_only": {"email": "testpro@test.com"},
    "full_app": {"userId": "user_393ea5f333cb", "email": "testpro@test.com", "name": "Test Pro User", "plan": "enterprise_monthly",
                 "companies": [{"companyId": "org_15337f4cefc9", "name": "Test Pro User's Team"}], "iat": now, "exp": now + 86400},
}
for k, p in variants.items():
    t = jwt.encode(p, S, algorithm="HS256")
    r = requests.post("https://do.featurebase.app/v1/messenger/widget/config", json={"appId": APP, "featurebaseJwt": t}, timeout=20)
    print(k, r.status_code, r.text[:150])

H = {"Origin": "https://revenue-exec.preview.emergentagent.com", "Referer": "https://revenue-exec.preview.emergentagent.com/dashboard"}
for k, p in list(variants.items()) + [("junk_secret", None)]:
    t = jwt.encode(variants["minimal"], "x" * 39, algorithm="HS256") if p is None else jwt.encode(p, S, algorithm="HS256")
    for body in ({"appId": APP, "featurebaseJwt": t}, {"appId": APP, "featurebaseJwt": t, "organization": "inflow", "locale": "en"}):
        r = requests.post("https://do.featurebase.app/v1/messenger/widget/config", json=body, headers=H, timeout=20)
        print("H", k, len(body), r.status_code, r.text[:120])
    r = requests.post("https://inflow.featurebase.app/api/v1/feedback/widget/config", json={"locale": "en", "jwtToken": t}, headers=H, timeout=20)
    print("  feedback", k, r.status_code, r.text[:120])
