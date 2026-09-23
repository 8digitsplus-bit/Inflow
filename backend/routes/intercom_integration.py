"""
Intercom live integration (read-only import).
Maps Intercom companies -> existing-customer (closed_won) deals so their
revenue feeds churn/retention. Credential: Intercom Access Token.
"""
import httpx
import uuid
from datetime import datetime, timezone

INTERCOM_BASE = "https://api.intercom.io"
INTERCOM_VERSION = "2.16"


def _headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Intercom-Version": INTERCOM_VERSION,
    }


async def validate_intercom_key(access_token: str) -> dict:
    """Validate the Intercom access token via /me."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(f"{INTERCOM_BASE}/me", headers=_headers(access_token))
        if resp.status_code in (401, 403):
            return {"valid": False, "error": "Invalid Intercom access token"}
        if resp.status_code >= 400:
            return {"valid": False, "error": f"Intercom returned status {resp.status_code}"}
        data = resp.json()
        app_name = (data.get("app") or {}).get("name") or "Intercom Workspace"
        return {"valid": True, "account_name": f"Intercom · {app_name}"}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Connection to Intercom timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_intercom_data(access_token: str, user_id: str) -> dict:
    """Fetch Intercom companies (customers) and transform into closed_won deals."""
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"companies": 0, "contacts": 0, "revenue": 0}
    headers = _headers(access_token)

    companies = []
    async with httpx.AsyncClient(base_url=INTERCOM_BASE, timeout=30.0) as client:
        cursor = None
        for _ in range(5):  # cap pages for a responsive first import
            params = {"per_page": 150}
            if cursor:
                params["starting_after"] = cursor
            resp = await client.get("/companies", params=params, headers=headers)
            if resp.status_code >= 400:
                break
            body = resp.json()
            companies.extend(body.get("data", []) or [])
            cursor = ((body.get("pages") or {}).get("next") or {}).get("starting_after")
            if not cursor:
                break

        # Contacts total (cheap single-page read for the stat).
        try:
            cresp = await client.get("/contacts", params={"per_page": 1}, headers=headers)
            if cresp.status_code == 200:
                stats["contacts"] = cresp.json().get("total_count", 0)
        except Exception:
            pass

    stats["companies"] = len(companies)

    for c in companies:
        monthly_spend = 0.0
        try:
            monthly_spend = float(c.get("monthly_spend") or 0)
        except (ValueError, TypeError):
            monthly_spend = 0.0
        arr = round(monthly_spend * 12, 2)
        stats["revenue"] += arr
        user_count = c.get("user_count") or 0
        name = c.get("name") or f"Company {c.get('company_id') or c.get('id', '')}"

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": name,
            "company": name,
            "value": arr,
            "stage": "closed_won",  # existing customer
            "probability": 100,
            "expected_close_date": None,
            "notes": f"Intercom customer • {user_count} users • ${monthly_spend:.0f}/mo",
            "source": "intercom",
            "synced": True,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        })

    return {"deals": deals, "stats": stats, "total_records": len(deals)}
