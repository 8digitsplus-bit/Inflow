"""Zoho CRM live integration (API v8) — refresh-token OAuth.

Users create a Self-Client in the Zoho API Console and paste Client ID, Client
Secret, the data center and EITHER a one-time grant code (exchanged here for a
long-lived refresh token) OR an existing refresh token. Zoho returns the
account's api_domain with every access token, so API calls always hit the
right data center.
"""
import uuid
from datetime import datetime, timezone

import httpx

DC_MAP = {
    "com": "https://accounts.zoho.com",
    "eu": "https://accounts.zoho.eu",
    "in": "https://accounts.zoho.in",
    "com.au": "https://accounts.zoho.com.au",
    "jp": "https://accounts.zoho.jp",
    "ca": "https://accounts.zohocloud.ca",
    "sa": "https://accounts.zoho.sa",
}
SCOPES = "ZohoCRM.modules.ALL,ZohoCRM.settings.fields.READ,ZohoCRM.users.READ"
API_VERSION = "v8"

STAGE_MAP = {
    "qualification": "qualified",
    "needs analysis": "qualified",
    "value proposition": "proposal",
    "identify decision makers": "qualified",
    "id. decision makers": "qualified",
    "perception analysis": "proposal",
    "proposal/price quote": "proposal",
    "negotiation/review": "negotiation",
    "closed won": "closed_won",
    "closed lost": "closed_lost",
    "closed-lost to competition": "closed_lost",
}
DEAL_FIELDS = "Deal_Name,Amount,Stage,Probability,Closing_Date,Account_Name,Description"


def normalize_dc(dc: str) -> str:
    d = (dc or "com").strip().lower().lstrip(".")
    return d if d in DC_MAP else "com"


def _friendly(err: str) -> str:
    if err == "invalid_client":
        return ("Zoho didn't recognise the Client ID / Secret in this data center. Check both values and that the "
                "Data Center matches your Zoho account (com, eu, in, com.au, jp, ca, sa).")
    if err in ("invalid_code", "invalid_grant"):
        return ("That grant code or refresh token is invalid or expired. Grant codes only last a few minutes — "
                "generate a new one in your Self-Client and paste it straight away.")
    return f"Zoho auth failed: {err or 'unknown error'}"


async def exchange_token(secret: str, client_id: str, client_secret: str, dc: str) -> dict:
    """Accepts a refresh token or a one-time grant code. Returns access_token, api_domain, expires_in, refresh_token."""
    url = f"{DC_MAP[normalize_dc(dc)]}/oauth/v2/token"
    base = {"client_id": (client_id or "").strip(), "client_secret": (client_secret or "").strip()}
    secret = (secret or "").strip()
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(url, data={**base, "refresh_token": secret, "grant_type": "refresh_token"})
        j = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if j.get("access_token"):
            return {**j, "refresh_token": secret}
        if j.get("error") == "invalid_client":
            raise ValueError(_friendly("invalid_client"))
        r2 = await client.post(url, data={**base, "code": secret, "grant_type": "authorization_code"})
        j2 = r2.json() if r2.headers.get("content-type", "").startswith("application/json") else {}
    if j2.get("access_token") and j2.get("refresh_token"):
        return j2
    raise ValueError(_friendly(j2.get("error") or j.get("error") or f"status {r2.status_code}"))


async def validate_zoho_credentials(access_token: str, api_domain: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{api_domain}/crm/{API_VERSION}/users", params={"type": "CurrentUser"},
                                 headers={"Authorization": f"Zoho-oauthtoken {access_token}"})
        if r.status_code != 200:
            return {"valid": False, "error": f"Zoho CRM API {r.status_code}: {r.text[:150]}"}
        users = r.json().get("users", [])
        return {"valid": True, "account_name": users[0].get("full_name", "Zoho CRM") if users else "Zoho CRM"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_zoho_data(access_token: str, api_domain: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    records = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for page in range(1, 11):
            r = await client.get(f"{api_domain}/crm/{API_VERSION}/Deals",
                                 headers={"Authorization": f"Zoho-oauthtoken {access_token}"},
                                 params={"fields": DEAL_FIELDS, "per_page": 200, "page": page,
                                         "sort_order": "desc", "sort_by": "Modified_Time"})
            if r.status_code == 204:
                break
            if r.status_code != 200:
                raise ValueError(f"Zoho CRM returned {r.status_code}: {r.text[:150]}")
            body = r.json()
            records.extend(body.get("data") or [])
            if not (body.get("info") or {}).get("more_records"):
                break

    deals, stats = [], {"deals": 0, "pipeline_value": 0.0, "won_value": 0.0}
    for d in records:
        try:
            amount = float(d.get("Amount") or 0)
        except (ValueError, TypeError):
            amount = 0.0
        stage = STAGE_MAP.get((d.get("Stage") or "Qualification").lower(), "qualified")
        account = d.get("Account_Name") or {}
        company = account.get("name") if isinstance(account, dict) else str(account or "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (d.get("Deal_Name") or "Zoho Deal")[:200],
            "company": (company or "Unknown")[:200],
            "value": round(amount, 2),
            "stage": stage,
            "probability": int(d.get("Probability") or (100 if stage == "closed_won" else 50)),
            "expected_close_date": d.get("Closing_Date") or None,
            "notes": (d.get("Description") or "")[:500] or f"Zoho deal {d.get('id', '')}",
            "zoho_deal_id": str(d.get("id") or ""),
            "source": "zoho",
            "synced": True,
            "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        stats["deals"] += 1
        if stage == "closed_won":
            stats["won_value"] += amount
        elif stage != "closed_lost":
            stats["pipeline_value"] += amount
    stats["pipeline_value"] = round(stats["pipeline_value"], 2)
    stats["won_value"] = round(stats["won_value"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
