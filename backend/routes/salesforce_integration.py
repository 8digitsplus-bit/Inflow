"""
Salesforce Live Integration - Fetches real data from a user's Salesforce org.
Requires: Instance URL + Access Token (from Connected App or Session).
Note: Access tokens typically expire after ~2 hours. Users may need to reconnect.
"""
import httpx
from datetime import datetime, timezone
import uuid


async def validate_salesforce_key(access_token: str, instance_url: str) -> dict:
    """Validate Salesforce credentials by querying available resources."""
    instance_url = instance_url.strip().rstrip("/")
    if not instance_url.startswith("http"):
        instance_url = f"https://{instance_url}"

    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{instance_url}/services/data/v59.0/", headers=headers)
        if resp.status_code == 401:
            return {"valid": False, "error": "Invalid or expired access token"}
        if resp.status_code >= 400:
            return {"valid": False, "error": f"Salesforce returned status {resp.status_code}"}

        # Try to get org info
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                org_resp = await client.get(
                    f"{instance_url}/services/data/v59.0/query",
                    headers=headers,
                    params={"q": "SELECT Name FROM Organization LIMIT 1"}
                )
            if org_resp.status_code == 200:
                records = org_resp.json().get("records", [])
                org_name = records[0].get("Name", "Salesforce Org") if records else "Salesforce Org"
            else:
                org_name = "Salesforce Org"
        except Exception:
            org_name = "Salesforce Org"

        return {
            "valid": True,
            "account_name": org_name,
            "instance_url": instance_url,
        }
    except httpx.ConnectError:
        return {"valid": False, "error": "Could not connect. Check your Instance URL."}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Connection timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_salesforce_data(access_token: str, instance_url: str, user_id: str) -> dict:
    """Fetch Opportunities from Salesforce, transform into deals."""
    instance_url = instance_url.strip().rstrip("/")
    if not instance_url.startswith("http"):
        instance_url = f"https://{instance_url}"

    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"opportunities": 0, "accounts": 0, "revenue": 0, "win_rate": 0}

    STAGE_MAP = {
        "prospecting": "lead",
        "qualification": "qualified",
        "needs analysis": "qualified",
        "value proposition": "proposal",
        "id. decision makers": "proposal",
        "perception analysis": "proposal",
        "proposal/price quote": "negotiation",
        "negotiation/review": "negotiation",
        "closed won": "closed_won",
        "closed lost": "closed_lost",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch Opportunities
        try:
            query = "SELECT Id, Name, Amount, StageName, CloseDate, Account.Name, CreatedDate, Probability FROM Opportunity ORDER BY CreatedDate DESC LIMIT 200"
            resp = await client.get(
                f"{instance_url}/services/data/v59.0/query",
                headers=headers,
                params={"q": query}
            )
            records = resp.json().get("records", []) if resp.status_code == 200 else []
            stats["opportunities"] = len(records)
        except Exception:
            records = []

        # Fetch Account count
        try:
            resp = await client.get(
                f"{instance_url}/services/data/v59.0/query",
                headers=headers,
                params={"q": "SELECT COUNT() FROM Account"}
            )
            if resp.status_code == 200:
                stats["accounts"] = resp.json().get("totalSize", 0)
        except Exception:
            pass

    won = 0
    closed = 0
    for rec in records:
        amount = float(rec.get("Amount") or 0)
        stats["revenue"] += amount

        sf_stage = (rec.get("StageName") or "").lower()
        stage = STAGE_MAP.get(sf_stage, "lead")
        # Fallback pattern matching
        if stage == "lead" and sf_stage:
            if "won" in sf_stage:
                stage = "closed_won"
            elif "lost" in sf_stage:
                stage = "closed_lost"
            elif "negoti" in sf_stage:
                stage = "negotiation"
            elif "propos" in sf_stage or "quote" in sf_stage:
                stage = "proposal"
            elif "qualif" in sf_stage:
                stage = "qualified"

        if stage in ("closed_won", "closed_lost"):
            closed += 1
            if stage == "closed_won":
                won += 1

        probability = int(rec.get("Probability") or 0)
        if not probability:
            prob_map = {"lead": 15, "qualified": 35, "proposal": 55, "negotiation": 75, "closed_won": 100, "closed_lost": 0}
            probability = prob_map.get(stage, 30)

        account_name = "Unknown Account"
        if rec.get("Account") and isinstance(rec["Account"], dict):
            account_name = rec["Account"].get("Name", "Unknown Account")

        close_date = rec.get("CloseDate")
        created = rec.get("CreatedDate") or now.isoformat()

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": rec.get("Name") or f"Opportunity {rec.get('Id', '')[:8]}",
            "company": account_name,
            "value": round(amount, 2),
            "stage": stage,
            "probability": probability,
            "expected_close_date": close_date,
            "notes": f"Salesforce Opportunity {rec.get('Id', '')}",
            "source": "salesforce",
            "synced": True,
            "created_at": created,
            "updated_at": now.isoformat(),
        })

    stats["win_rate"] = round((won / closed * 100) if closed > 0 else 0, 1)

    return {
        "deals": deals,
        "stats": stats,
        "total_records": len(deals),
    }
