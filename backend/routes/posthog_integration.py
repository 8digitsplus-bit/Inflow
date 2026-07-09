"""PostHog Live Integration — product analytics (signal source).

Auth: Bearer personal API key (phx_...). Base: us/eu PostHog cloud or self-hosted.
Fetches a 30-day event count via the HogQL query API. Value is always 0 (signal only).
"""
import httpx
import uuid
from datetime import datetime, timezone


def _host(region: str) -> str:
    r = (region or "").strip().lower().rstrip("/")
    if r.startswith("http"):
        return r
    if r in ("eu", "eu.posthog.com"):
        return "https://eu.posthog.com"
    if r and "posthog" in r:
        return f"https://{r}"
    return "https://us.posthog.com"


async def validate_posthog_key(api_key: str, project_id: str, region: str = "") -> dict:
    if not project_id:
        return {"valid": False, "error": "PostHog Project ID is required"}
    host = _host(region)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{host}/api/projects/{project_id}/", headers={"Authorization": f"Bearer {api_key}"})
        if r.status_code == 200:
            name = (r.json() or {}).get("name") or f"PostHog Project {project_id}"
            return {"valid": True, "account_name": name}
        if r.status_code in (401, 403):
            return {"valid": False, "error": "Invalid PostHog personal API key or no access to this project"}
        return {"valid": False, "error": f"PostHog error (HTTP {r.status_code}): {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Could not reach PostHog"}


async def fetch_posthog_data(api_key: str, project_id: str, region: str, user_id: str) -> dict:
    host = _host(region)
    now = datetime.now(timezone.utc)
    stats = {"events_30d": 0, "project_id": project_id}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            q = {"query": {"kind": "HogQLQuery", "query": "SELECT count() AS c FROM events WHERE timestamp >= now() - INTERVAL 30 DAY"}}
            r = await client.post(
                f"{host}/api/projects/{project_id}/query/",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=q,
            )
            if r.status_code == 200:
                results = (r.json() or {}).get("results") or []
                if results and isinstance(results[0], list) and results[0]:
                    stats["events_30d"] = int(results[0][0] or 0)
    except Exception:
        pass

    deals = [{
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "name": f"PostHog events (30d): {stats['events_30d']:,}"[:200],
        "company": "PostHog Product Analytics",
        "value": 0.0, "stage": "closed_won", "probability": 100,
        "source": "posthog",
        "notes": f"{stats['events_30d']:,} events captured in the last 30 days (signal only).",
        "expected_close_date": None,
        "synced": True,
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }]
    return {"deals": deals, "total_records": len(deals), "stats": stats}
