"""
HubSpot Live Integration - Fetches real data from a user's HubSpot account.
Requires: Private App Access Token (pat-...).
"""
import httpx
from datetime import datetime, timezone
import uuid

HUBSPOT_BASE = "https://api.hubapi.com"


async def validate_hubspot_key(access_token: str) -> dict:
    """Validate HubSpot access token by fetching account info."""
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{HUBSPOT_BASE}/account-info/v3/details", headers=headers)
        if resp.status_code == 401:
            return {"valid": False, "error": "Invalid access token"}
        if resp.status_code >= 400:
            return {"valid": False, "error": f"HubSpot returned status {resp.status_code}"}

        data = resp.json()
        return {
            "valid": True,
            "account_name": data.get("portalId") and f"HubSpot #{data['portalId']}" or "HubSpot Account",
        }
    except httpx.ConnectError:
        return {"valid": False, "error": "Could not connect to HubSpot"}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Connection timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_hubspot_data(access_token: str, user_id: str) -> dict:
    """Fetch deals and contacts from HubSpot CRM, transform into deals."""
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"deals": 0, "contacts": 0, "revenue": 0, "pipelines": 0}

    STAGE_MAP = {
        "appointmentscheduled": "lead",
        "qualifiedtobuy": "qualified",
        "presentationscheduled": "proposal",
        "decisionmakerboughtin": "negotiation",
        "contractsent": "negotiation",
        "closedwon": "closed_won",
        "closedlost": "closed_lost",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch deals
        try:
            resp = await client.get(
                f"{HUBSPOT_BASE}/crm/v3/objects/deals",
                headers=headers,
                params={
                    "limit": 100,
                    "properties": "dealname,amount,dealstage,closedate,pipeline,hubspot_owner_id",
                }
            )
            hs_deals = resp.json().get("results", []) if resp.status_code == 200 else []
            stats["deals"] = len(hs_deals)
        except Exception:
            hs_deals = []

        # Fetch contacts count
        try:
            resp = await client.get(
                f"{HUBSPOT_BASE}/crm/v3/objects/contacts",
                headers=headers,
                params={"limit": 1}
            )
            if resp.status_code == 200:
                data = resp.json()
                stats["contacts"] = data.get("total", len(data.get("results", [])))
        except Exception:
            pass

    # Transform HubSpot deals into InFlow deals
    for hd in hs_deals:
        props = hd.get("properties", {})
        amount = 0
        try:
            amount = float(props.get("amount", 0) or 0)
        except (ValueError, TypeError):
            pass
        stats["revenue"] += amount

        hs_stage = (props.get("dealstage") or "").lower().replace(" ", "")
        stage = STAGE_MAP.get(hs_stage, "lead")

        prob_map = {"lead": 15, "qualified": 35, "proposal": 55, "negotiation": 75, "closed_won": 100, "closed_lost": 0}
        probability = prob_map.get(stage, 30)

        close_date = props.get("closedate")
        created = hd.get("createdAt") or now.isoformat()

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": props.get("dealname") or f"HubSpot Deal #{hd.get('id', '')}",
            "company": props.get("pipeline") or "HubSpot Pipeline",
            "value": round(amount, 2),
            "stage": stage,
            "probability": probability,
            "expected_close_date": close_date[:10] if close_date else None,
            "notes": f"HubSpot deal {hd.get('id', '')} - stage: {props.get('dealstage', 'unknown')}",
            "source": "hubspot",
            "synced": True,
            "created_at": created,
            "updated_at": now.isoformat(),
        })

    return {
        "deals": deals,
        "stats": stats,
        "total_records": len(deals),
    }
