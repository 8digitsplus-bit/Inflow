"""
Microsoft Dynamics 365 Sales live integration (read-only import).
Uses Dataverse Web API v9.2 with an Entra app (client-credentials flow).
Credentials: tenant_id, client_id, client_secret, resource_url (environment URL).
"""
import httpx
import uuid
from datetime import datetime, timezone
from urllib.parse import quote


async def _dynamics_token(tenant_id: str, client_id: str, client_secret: str, resource_url: str) -> str:
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, data={
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": f"{resource_url.rstrip('/')}/.default",
            "grant_type": "client_credentials",
        })
    if resp.status_code != 200:
        raise ValueError(f"Token request failed (status {resp.status_code})")
    return resp.json()["access_token"]


async def validate_dynamics_credentials(tenant_id: str, client_id: str, client_secret: str, resource_url: str) -> dict:
    """Validate Dynamics 365 credentials by requesting a token + one read."""
    try:
        token = await _dynamics_token(tenant_id, client_id, client_secret, resource_url)
        base = f"{resource_url.rstrip('/')}/api/data/v9.2"
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json",
                   "OData-Version": "4.0", "OData-MaxVersion": "4.0"}
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(f"{base}/opportunities?$select=name&$top=1", headers=headers)
        if resp.status_code in (401, 403):
            return {"valid": False, "error": "Credentials rejected — check the app-user role has read access to Opportunities."}
        if resp.status_code >= 400:
            return {"valid": False, "error": f"Dynamics returned status {resp.status_code}"}
        host = resource_url.replace("https://", "").replace("http://", "").strip("/").split("/")[0]
        return {"valid": True, "account_name": f"Dynamics 365 ({host})"}
    except ValueError as e:
        return {"valid": False, "error": str(e)}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Connection to Dynamics timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_dynamics_data(tenant_id: str, client_id: str, client_secret: str, resource_url: str, user_id: str) -> dict:
    """Fetch Dynamics 365 opportunities and transform into InFlow deals."""
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"opportunities": 0, "revenue": 0, "won": 0}

    token = await _dynamics_token(tenant_id, client_id, client_secret, resource_url)
    base = f"{resource_url.rstrip('/')}/api/data/v9.2"
    select = ["opportunityid", "name", "estimatedvalue", "closeprobability",
              "salesstage", "statecode", "estimatedclosedate", "actualvalue"]
    url = f"{base}/opportunities?$select={quote(','.join(select), safe=',')}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json",
               "OData-Version": "4.0", "OData-MaxVersion": "4.0",
               "Prefer": "odata.maxpagesize=500"}

    rows = []
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Cap at a few pages for a responsive first import.
        for _ in range(5):
            resp = await client.get(url, headers=headers)
            if resp.status_code >= 400:
                break
            body = resp.json()
            rows.extend(body.get("value", []))
            url = body.get("@odata.nextLink")
            if not url:
                break

    stats["opportunities"] = len(rows)
    stage_by_salesstage = {0: "qualified", 1: "proposal", 2: "proposal", 3: "negotiation"}
    prob_map = {"lead": 15, "qualified": 35, "proposal": 55, "negotiation": 75, "closed_won": 100, "closed_lost": 0}

    for row in rows:
        statecode = row.get("statecode")
        if statecode == 1:
            stage = "closed_won"
        elif statecode == 2:
            stage = "closed_lost"
        else:
            stage = stage_by_salesstage.get(row.get("salesstage"), "qualified")

        try:
            value = float(row.get("actualvalue") if stage == "closed_won" and row.get("actualvalue") else (row.get("estimatedvalue") or 0) or 0)
        except (ValueError, TypeError):
            value = 0.0
        if stage == "closed_won":
            stats["won"] += 1
        stats["revenue"] += value

        prob = row.get("closeprobability")
        try:
            probability = int(prob) if prob is not None else prob_map.get(stage, 30)
        except (ValueError, TypeError):
            probability = prob_map.get(stage, 30)

        close_date = row.get("estimatedclosedate")

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": row.get("name") or f"Opportunity {row.get('opportunityid', '')[:8]}",
            "company": "Dynamics 365",
            "value": round(value, 2),
            "stage": stage,
            "probability": probability,
            "expected_close_date": close_date[:10] if close_date else None,
            "notes": f"Dynamics 365 opportunity {row.get('opportunityid', '')}",
            "source": "dynamics",
            "synced": True,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        })

    return {"deals": deals, "stats": stats, "total_records": len(deals)}
