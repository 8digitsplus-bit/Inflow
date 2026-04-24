"""Zoho CRM Live Integration — OAuth2 Refresh-Token flow.

User supplies a pre-generated refresh_token + client_id + client_secret + data_center.
We exchange refresh_token → access_token → call /crm/v6/Deals API.
"""
import httpx
import uuid
from datetime import datetime, timezone

# Zoho has regional data centers — accounts server and API server differ per region
DC_MAP = {
    "com": {"accounts": "https://accounts.zoho.com", "api": "https://www.zohoapis.com"},
    "eu": {"accounts": "https://accounts.zoho.eu", "api": "https://www.zohoapis.eu"},
    "in": {"accounts": "https://accounts.zoho.in", "api": "https://www.zohoapis.in"},
    "com.au": {"accounts": "https://accounts.zoho.com.au", "api": "https://www.zohoapis.com.au"},
    "jp": {"accounts": "https://accounts.zoho.jp", "api": "https://www.zohoapis.jp"},
}

STAGE_MAP = {
    "qualification": "qualified",
    "needs analysis": "qualified",
    "value proposition": "proposal",
    "identify decision makers": "qualified",
    "proposal/price quote": "proposal",
    "negotiation/review": "negotiation",
    "closed won": "closed_won",
    "closed lost": "closed_lost",
}


def _endpoints(dc: str) -> dict:
    return DC_MAP.get((dc or "com").lower(), DC_MAP["com"])


async def _get_access_token(refresh_token: str, client_id: str, client_secret: str, dc: str) -> str:
    ep = _endpoints(dc)
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{ep['accounts']}/oauth/v2/token",
            data={
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
            },
        )
        if r.status_code != 200 or "access_token" not in r.json():
            raise ValueError(f"Zoho auth failed: {r.text[:200]}")
        return r.json()["access_token"]


async def validate_zoho_credentials(refresh_token: str, client_id: str, client_secret: str, dc: str = "com") -> dict:
    try:
        token = await _get_access_token(refresh_token, client_id, client_secret, dc)
        ep = _endpoints(dc)
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{ep['api']}/crm/v6/users?type=CurrentUser",
                headers={"Authorization": f"Zoho-oauthtoken {token}"},
            )
            if r.status_code != 200:
                return {"valid": False, "error": f"Zoho CRM API {r.status_code}: {r.text[:150]}"}
            users = r.json().get("users", [])
            name = users[0].get("full_name", "Zoho CRM") if users else "Zoho CRM"
            return {"valid": True, "account_name": name}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_zoho_data(refresh_token: str, client_id: str, client_secret: str, dc: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    token = await _get_access_token(refresh_token, client_id, client_secret, dc)
    ep = _endpoints(dc)

    deals = []
    stats = {"deals": 0, "pipeline_value": 0.0, "won_value": 0.0}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{ep['api']}/crm/v6/Deals",
            headers={"Authorization": f"Zoho-oauthtoken {token}"},
            params={"per_page": 100, "sort_order": "desc", "sort_by": "Modified_Time"},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        records = r.json().get("data", []) or []

    for d in records:
        amount = d.get("Amount") or 0
        try:
            amount = float(amount)
        except (ValueError, TypeError):
            amount = 0.0
        raw_stage = (d.get("Stage") or "Qualification").lower()
        stage = STAGE_MAP.get(raw_stage, "qualified")
        if stage not in ("lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"):
            stage = "qualified"
        account = d.get("Account_Name") or {}
        company = account.get("name") if isinstance(account, dict) else str(account or "Unknown")

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (d.get("Deal_Name") or "Zoho Deal")[:200],
            "company": (company or "Unknown")[:200],
            "value": round(amount, 2),
            "stage": stage,
            "probability": int(d.get("Probability") or (100 if stage == "closed_won" else 50)),
            "expected_close_date": d.get("Closing_Date") or None,
            "notes": (d.get("Description") or "")[:500] or f"Zoho deal {d.get('id','')}",
            "source": "zoho",
            "synced": True,
            "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        stats["deals"] += 1
        if stage == "closed_won":
            stats["won_value"] += amount
        elif stage not in ("closed_lost",):
            stats["pipeline_value"] += amount

    stats["pipeline_value"] = round(stats["pipeline_value"], 2)
    stats["won_value"] = round(stats["won_value"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
