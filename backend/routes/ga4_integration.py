"""Google Analytics 4 Live Integration — web analytics (signal source).

Auth: service account JSON key (analytics.readonly scope). Fetches 30-day activeUsers
and sessions via the GA4 Data API runReport. Value is always 0 (signal only).
"""
import asyncio
import json
import uuid
import httpx
from datetime import datetime, timezone
from google.oauth2 import service_account
import google.auth.transport.requests

SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]


def _token_from_sa(sa_json: str) -> str:
    info = json.loads(sa_json)
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token


def _sum_metric(report: dict, idx: int) -> float:
    total = 0.0
    for row in report.get("rows", []) or []:
        vals = row.get("metricValues", []) or []
        if len(vals) > idx:
            try:
                total += float(vals[idx].get("value", 0) or 0)
            except (ValueError, TypeError):
                pass
    return total


async def validate_ga4_credentials(sa_json: str, property_id: str) -> dict:
    if not property_id:
        return {"valid": False, "error": "GA4 Property ID is required"}
    try:
        token = await asyncio.to_thread(_token_from_sa, sa_json)
    except Exception as e:
        return {"valid": False, "error": f"Invalid service account JSON: {str(e)[:120]}"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}], "metrics": [{"name": "activeUsers"}]},
            )
        if r.status_code == 200:
            return {"valid": True, "account_name": f"GA4 Property {property_id}"}
        return {"valid": False, "error": f"GA4 error (HTTP {r.status_code}): {r.text[:150]}"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Could not reach the GA4 Data API"}


async def fetch_ga4_data(sa_json: str, property_id: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    stats = {"active_users_30d": 0, "sessions_30d": 0, "property_id": property_id}

    try:
        token = await asyncio.to_thread(_token_from_sa, sa_json)
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={
                    "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
                    "metrics": [{"name": "activeUsers"}, {"name": "sessions"}],
                },
            )
            if r.status_code == 200:
                rep = r.json()
                stats["active_users_30d"] = int(_sum_metric(rep, 0))
                stats["sessions_30d"] = int(_sum_metric(rep, 1))
    except Exception:
        pass

    deals = [{
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "name": f"GA4: {stats['active_users_30d']:,} active users (30d)"[:200],
        "company": "Google Analytics 4",
        "value": 0.0, "stage": "closed_won", "probability": 100,
        "source": "ga4",
        "notes": f"{stats['active_users_30d']:,} active users, {stats['sessions_30d']:,} sessions in the last 30 days (signal only).",
        "expected_close_date": None,
        "synced": True,
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }]
    return {"deals": deals, "total_records": len(deals), "stats": stats}
