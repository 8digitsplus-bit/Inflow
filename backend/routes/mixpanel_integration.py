"""Mixpanel Live Integration — Project API Secret (Basic auth).

Mixpanel is product analytics (events), not a direct revenue source.
We fetch aggregate stats (30-day active users + recent event counts) and
create high-value "conversion event" deals if revenue-bearing events are found.
"""
import base64
import httpx
import uuid
from datetime import datetime, timezone, timedelta

# Mixpanel's EU endpoint uses eu.mixpanel.com; most users are on the default.
BASE_URL = "https://mixpanel.com"
EU_BASE_URL = "https://eu.mixpanel.com"


def _base_url(region: str) -> str:
    return EU_BASE_URL if (region or "").lower() == "eu" else BASE_URL


async def validate_mixpanel_creds(project_id: str, api_secret: str, region: str = "us") -> dict:
    """Validate by calling the Events API (returns 0 or more events)."""
    if not project_id or not api_secret:
        return {"valid": False, "error": "Project ID and API Secret are required"}
    try:
        auth = base64.b64encode(f"{api_secret}:".encode()).decode()
        # Use segmentation endpoint as a light validation — returns counts, not data
        today = datetime.now(timezone.utc).date()
        from_date = (today - timedelta(days=7)).isoformat()
        to_date = today.isoformat()
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{_base_url(region)}/api/2.0/events",
                headers={"Authorization": f"Basic {auth}"},
                params={
                    "project_id": project_id,
                    "event": '["$any_event"]',
                    "type": "general",
                    "unit": "day",
                    "from_date": from_date,
                    "to_date": to_date,
                },
            )
            if r.status_code == 401:
                return {"valid": False, "error": "Invalid Mixpanel API secret"}
            if r.status_code != 200:
                return {"valid": False, "error": f"Mixpanel API returned {r.status_code}"}
            return {"valid": True, "account_name": f"Mixpanel Project {project_id}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_mixpanel_data(project_id: str, api_secret: str, region: str, user_id: str) -> dict:
    """Fetch recent event counts and high-value events (purchases, conversions) as deals."""
    now = datetime.now(timezone.utc)
    auth = base64.b64encode(f"{api_secret}:".encode()).decode()
    headers = {"Authorization": f"Basic {auth}"}

    today = now.date()
    from_date = (today - timedelta(days=30)).isoformat()
    to_date = today.isoformat()

    stats = {"events_30d": 0, "revenue_events": 0, "revenue_usd": 0.0}
    deals = []

    try:
        # Aggregate event count
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                f"{_base_url(region)}/api/2.0/events",
                headers=headers,
                params={
                    "project_id": project_id,
                    "event": '["$any_event"]',
                    "type": "general",
                    "unit": "day",
                    "from_date": from_date,
                    "to_date": to_date,
                },
            )
            if r.status_code == 200:
                data = r.json().get("data", {}).get("values", {})
                # sum values across all series
                total = 0
                for series in data.values():
                    for v in series.values():
                        total += v
                stats["events_30d"] = int(total)

            # Look up "Purchase" event profiles (common Mixpanel naming)
            for candidate in ("Purchase", "Order Completed", "Subscription Started"):
                rj = await client.get(
                    f"{_base_url(region)}/api/2.0/events",
                    headers=headers,
                    params={
                        "project_id": project_id,
                        "event": f'["{candidate}"]',
                        "type": "general",
                        "unit": "day",
                        "from_date": from_date,
                        "to_date": to_date,
                    },
                )
                if rj.status_code == 200:
                    vals = rj.json().get("data", {}).get("values", {}).get(candidate, {})
                    count = sum(vals.values()) if vals else 0
                    if count > 0:
                        stats["revenue_events"] += int(count)
                        # Create a synthetic summary "deal" for this conversion event
                        deals.append({
                            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
                            "user_id": user_id,
                            "name": f"{candidate} events (30d)",
                            "company": "Mixpanel Product Analytics",
                            "value": 0.0, "stage": "closed_won",
                            "probability": 100, "source": "mixpanel",
                            "notes": f"{int(count)} {candidate} events in last 30 days",
                            "expected_close_date": None,
                            "synced": True,
                            "created_at": now.isoformat(), "updated_at": now.isoformat(),
                        })
    except Exception:
        pass

    stats["revenue_usd"] = round(stats["revenue_usd"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
