"""LogRocket Live Integration — session replay / product analytics (signal source).

LogRocket has no general metrics REST API (session data streams to a warehouse), so this
connector validates credentials via the Highlights API and records a connected signal.
Auth: Authorization: token <api_key>. Base: https://api.logrocket.com/v1/orgs/{org}/apps/{app}.
"""
import httpx
import uuid
from datetime import datetime, timezone

BASE = "https://api.logrocket.com/v1"


async def validate_logrocket_key(api_key: str, org_id: str, app_id: str) -> dict:
    if not org_id or not app_id:
        return {"valid": False, "error": "LogRocket Org ID and App ID are required"}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                f"{BASE}/orgs/{org_id}/apps/{app_id}/highlights/",
                headers={"Authorization": f"token {api_key}", "Content-Type": "application/json"},
                json={"userId": "inflow-connection-check"},
            )
        if r.status_code in (401, 403):
            return {"valid": False, "error": "Invalid LogRocket API key or Org/App ID"}
        if r.status_code == 404:
            return {"valid": False, "error": "LogRocket Org ID or App ID not found"}
        return {"valid": True, "account_name": f"LogRocket ({org_id}/{app_id})"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Could not reach LogRocket"}


async def fetch_logrocket_data(api_key: str, org_id: str, app_id: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    stats = {"status": "connected", "org_id": org_id, "app_id": app_id}
    deals = [{
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "name": "LogRocket session replay connected"[:200],
        "company": "LogRocket",
        "value": 0.0, "stage": "closed_won", "probability": 100,
        "source": "logrocket",
        "notes": "LogRocket connected (session replay + error monitoring). Aggregate metrics stream via Streaming Data Export; no summary metrics REST API is available.",
        "expected_close_date": None,
        "synced": True,
        "created_at": now.isoformat(), "updated_at": now.isoformat(),
    }]
    return {"deals": deals, "total_records": len(deals), "stats": stats}
