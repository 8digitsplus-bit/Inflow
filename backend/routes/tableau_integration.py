"""Tableau Server/Cloud Live Integration — BI usage (signal source).

Auth: Personal Access Token sign-in -> X-Tableau-Auth token.
Reads workbook + view counts and total view usage. Value is always 0 (signal only).
"""
import httpx
import uuid
from datetime import datetime, timezone

API_VERSION = "3.24"


def _base(server_url: str) -> str:
    u = (server_url or "").strip().rstrip("/")
    if not u.startswith("http"):
        u = "https://" + u
    return u


async def _signin(base: str, pat_name: str, pat_secret: str, site_content_url: str):
    body = {
        "credentials": {
            "personalAccessTokenName": pat_name,
            "personalAccessTokenSecret": pat_secret,
            "site": {"contentUrl": site_content_url or ""},
        }
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            f"{base}/api/{API_VERSION}/auth/signin",
            json=body,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
    if r.status_code != 200:
        raise ValueError(f"Tableau sign-in failed (HTTP {r.status_code}): {r.text[:120]}")
    cred = (r.json() or {}).get("credentials", {}) or {}
    return cred.get("token"), (cred.get("site") or {}).get("id")


async def validate_tableau_credentials(server_url: str, pat_name: str, pat_secret: str, site_content_url: str = "") -> dict:
    base = _base(server_url)
    try:
        token, _ = await _signin(base, pat_name, pat_secret, site_content_url)
        if token:
            return {"valid": True, "account_name": f"Tableau ({base.replace('https://', '')})"}
        return {"valid": False, "error": "Tableau sign-in returned no token"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Could not reach the Tableau server"}


async def fetch_tableau_data(server_url: str, pat_name: str, pat_secret: str, site_content_url: str, user_id: str) -> dict:
    base = _base(server_url)
    now = datetime.now(timezone.utc)
    stats = {"workbooks": 0, "views": 0, "total_view_usage": 0}

    try:
        token, site_id = await _signin(base, pat_name, pat_secret, site_content_url)
        headers = {"X-Tableau-Auth": token, "Accept": "application/json"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            wv = await client.get(f"{base}/api/{API_VERSION}/sites/{site_id}/workbooks", headers=headers, params={"pageSize": 100})
            if wv.status_code == 200:
                wbs = ((wv.json() or {}).get("workbooks") or {}).get("workbook") or []
                stats["workbooks"] = len(wbs)
            vv = await client.get(
                f"{base}/api/{API_VERSION}/sites/{site_id}/views",
                headers=headers,
                params={"pageSize": 100, "includeUsageStatistics": "true"},
            )
            if vv.status_code == 200:
                views = ((vv.json() or {}).get("views") or {}).get("view") or []
                stats["views"] = len(views)
                for v in views:
                    usage = (v.get("usage") or {}).get("totalViewCount")
                    try:
                        stats["total_view_usage"] += int(usage or 0)
                    except (ValueError, TypeError):
                        pass
    except Exception:
        pass

    deals = [{
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "name": f"Tableau: {stats['workbooks']} workbooks, {stats['views']} views"[:200],
        "company": "Tableau BI",
        "value": 0.0, "stage": "closed_won", "probability": 100,
        "source": "tableau",
        "notes": f"{stats['workbooks']} workbooks, {stats['views']} views, {stats['total_view_usage']:,} total view loads (signal only).",
        "expected_close_date": None,
        "synced": True,
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }]
    return {"deals": deals, "total_records": len(deals), "stats": stats}
