"""Adobe Analytics 2.0 Live Integration — web analytics (signal source).

Auth: OAuth Server-to-Server (client_credentials) -> access token from Adobe IMS.
Fetches 30-day visits for a report suite. Value is always 0 (signal only). Best-effort:
Adobe's API is org/permission sensitive, so a report may return 0 if scopes are limited.
"""
import httpx
import uuid
from datetime import datetime, timezone, timedelta

IMS_TOKEN = "https://ims-na1.adobelogin.com/ims/token/v3"
API_BASE = "https://analytics.adobe.io"
DEFAULT_SCOPES = "openid,AdobeID,read_organizations,additional_info.projectedProductContext,additional_info.job_function,session"


async def _get_token(client_id: str, client_secret: str) -> str:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            IMS_TOKEN,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"client_id": client_id, "client_secret": client_secret, "grant_type": "client_credentials", "scope": DEFAULT_SCOPES},
        )
    if r.status_code != 200:
        raise ValueError(f"Adobe token request failed (HTTP {r.status_code}): {r.text[:120]}")
    return r.json()["access_token"]


async def _discover_company(client_id: str, token: str):
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(f"{API_BASE}/discovery/me", headers={"x-api-key": client_id, "Authorization": f"Bearer {token}"})
    if r.status_code != 200:
        raise ValueError(f"Adobe discovery failed (HTTP {r.status_code})")
    for org in (r.json() or {}).get("imsOrgs", []) or []:
        comps = org.get("companies", []) or []
        if comps:
            return comps[0].get("globalCompanyId"), org.get("imsOrgId")
    raise ValueError("No Adobe Analytics company found for these credentials")


async def validate_adobe_credentials(client_id: str, client_secret: str, rsid: str) -> dict:
    if not rsid:
        return {"valid": False, "error": "Adobe Analytics Report Suite ID (rsid) is required"}
    try:
        token = await _get_token(client_id, client_secret)
        gcid, _ = await _discover_company(client_id, token)
        return {"valid": True, "account_name": f"Adobe Analytics ({gcid})"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Adobe Analytics authentication failed"}


async def fetch_adobe_data(client_id: str, client_secret: str, rsid: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    stats = {"visits_30d": 0, "rsid": rsid}

    try:
        token = await _get_token(client_id, client_secret)
        gcid, imsorg = await _discover_company(client_id, token)
        start = (now - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00.000")
        end = now.strftime("%Y-%m-%dT23:59:59.999")
        body = {
            "rsid": rsid,
            "globalFilters": [{"type": "dateRange", "dateRange": f"{start}/{end}"}],
            "metricContainer": {"metrics": [{"columnId": "0", "id": "metrics/visits"}]},
            "dimension": "variables/daterangeday",
            "settings": {"limit": 400, "page": 0},
        }
        async with httpx.AsyncClient(timeout=40.0) as client:
            r = await client.post(
                f"{API_BASE}/api/{gcid}/reports",
                headers={
                    "x-api-key": client_id,
                    "Authorization": f"Bearer {token}",
                    "x-proxy-global-company-id": gcid,
                    "Content-Type": "application/json",
                },
                json=body,
            )
            if r.status_code == 200:
                total = 0.0
                for row in (r.json() or {}).get("rows", []) or []:
                    vals = row.get("data", []) or []
                    if vals:
                        try:
                            total += float(vals[0] or 0)
                        except (ValueError, TypeError):
                            pass
                stats["visits_30d"] = int(total)
    except Exception:
        pass

    deals = [{
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "name": f"Adobe Analytics: {stats['visits_30d']:,} visits (30d)"[:200],
        "company": "Adobe Analytics",
        "value": 0.0, "stage": "closed_won", "probability": 100,
        "source": "adobe_analytics",
        "notes": f"{stats['visits_30d']:,} visits in the last 30 days for report suite {rsid} (signal only).",
        "expected_close_date": None,
        "synced": True,
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }]
    return {"deals": deals, "total_records": len(deals), "stats": stats}
