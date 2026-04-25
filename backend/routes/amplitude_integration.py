"""Amplitude Live Integration — API Key + Secret Key (HTTP Basic auth).

Amplitude is product analytics (events). We fetch aggregate stats (30-day active
users + recent event counts) and create high-value "conversion event" deals if
revenue-bearing events are found. Mirrors the Mixpanel integration pattern.
"""
import base64
import httpx
import uuid
from datetime import datetime, timezone, timedelta

US_BASE = "https://amplitude.com"
EU_BASE = "https://analytics.eu.amplitude.com"


def _base_url(region: str) -> str:
    return EU_BASE if (region or "").lower() == "eu" else US_BASE


def _fmt(dt: datetime) -> str:
    # Amplitude expects YYYYMMDDTHH (UTC, no minutes).
    return dt.strftime("%Y%m%dT%H")


async def validate_amplitude_creds(api_key: str, secret_key: str, region: str = "us") -> dict:
    if not api_key or not secret_key:
        return {"valid": False, "error": "API Key and Secret Key are required"}
    try:
        auth = base64.b64encode(f"{api_key}:{secret_key}".encode()).decode()
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=7)
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{_base_url(region)}/api/2/users",
                headers={"Authorization": f"Basic {auth}"},
                params={"start": _fmt(start), "end": _fmt(now), "m": "active", "i": 1},
            )
            if r.status_code in (401, 403):
                return {"valid": False, "error": "Invalid Amplitude API key or Secret key"}
            if r.status_code != 200:
                return {"valid": False, "error": f"Amplitude API returned {r.status_code}: {r.text[:150]}"}
            return {"valid": True, "account_name": f"Amplitude Project {api_key[:8]}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_amplitude_data(api_key: str, secret_key: str, region: str, user_id: str) -> dict:
    """Fetch 30-day active-user + new-user counts and revenue-event counts."""
    now = datetime.now(timezone.utc)
    auth = base64.b64encode(f"{api_key}:{secret_key}".encode()).decode()
    headers = {"Authorization": f"Basic {auth}"}

    start = now - timedelta(days=30)
    params_window = {"start": _fmt(start), "end": _fmt(now), "i": 1}

    stats = {"active_users_30d": 0, "new_users_30d": 0, "revenue_events": 0, "revenue_usd": 0.0}
    deals = []

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Active + new user counts
            for metric, key in (("active", "active_users_30d"), ("new", "new_users_30d")):
                r = await client.get(
                    f"{_base_url(region)}/api/2/users",
                    headers=headers,
                    params={**params_window, "m": metric},
                )
                if r.status_code == 200:
                    data = r.json().get("data", {})
                    series = data.get("series") or []
                    if series and isinstance(series[0], list):
                        stats[key] = int(sum(series[0]))

            # Look up common conversion event totals via segmentation
            for candidate in ("Purchase", "Order Completed", "Subscription Started"):
                e = '{"event_type":"' + candidate + '"}'
                rj = await client.get(
                    f"{_base_url(region)}/api/2/events/segmentation",
                    headers=headers,
                    params={**params_window, "e": e, "m": "totals"},
                )
                if rj.status_code == 200:
                    data = rj.json().get("data", {})
                    series = data.get("series") or []
                    count = 0
                    if series and isinstance(series[0], list):
                        count = int(sum(series[0]))
                    if count > 0:
                        stats["revenue_events"] += count
                        deals.append({
                            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
                            "user_id": user_id,
                            "name": f"{candidate} events (30d)",
                            "company": "Amplitude Product Analytics",
                            "value": 0.0, "stage": "closed_won",
                            "probability": 100, "source": "amplitude",
                            "notes": f"{count} {candidate} events in last 30 days",
                            "expected_close_date": None,
                            "synced": True,
                            "created_at": now.isoformat(), "updated_at": now.isoformat(),
                        })
    except Exception:
        pass

    stats["revenue_usd"] = round(stats["revenue_usd"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
