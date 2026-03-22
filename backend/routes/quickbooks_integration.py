"""
QuickBooks Live Integration - Fetches real data from a user's QuickBooks company.
Requires: Company ID (Realm ID) + Access Token.
Note: Access tokens expire after ~1 hour. Users may need to reconnect.
Supports both Production and Sandbox environments.
"""
import httpx
from datetime import datetime, timezone
import uuid

PRODUCTION_BASE = "https://quickbooks.api.intuit.com/v3/company"
SANDBOX_BASE = "https://sandbox-quickbooks.api.intuit.com/v3/company"


async def validate_quickbooks_key(access_token: str, company_id: str, sandbox: bool = False) -> dict:
    """Validate QuickBooks credentials by fetching company info."""
    base = SANDBOX_BASE if sandbox else PRODUCTION_BASE
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{base}/{company_id}/companyinfo/{company_id}", headers=headers)

        if resp.status_code == 401:
            return {"valid": False, "error": "Invalid or expired access token"}
        if resp.status_code == 403:
            return {"valid": False, "error": "Access forbidden. Check your Company ID and permissions."}
        if resp.status_code >= 400:
            return {"valid": False, "error": f"QuickBooks returned status {resp.status_code}"}

        data = resp.json()
        company_info = data.get("CompanyInfo", {})
        return {
            "valid": True,
            "account_name": company_info.get("CompanyName") or f"QuickBooks Co #{company_id}",
            "company_id": company_id,
        }
    except httpx.ConnectError:
        return {"valid": False, "error": "Could not connect to QuickBooks"}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Connection timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_quickbooks_data(access_token: str, company_id: str, user_id: str, sandbox: bool = False) -> dict:
    """Fetch invoices and customers from QuickBooks, transform into deals."""
    base = SANDBOX_BASE if sandbox else PRODUCTION_BASE
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"invoices": 0, "customers": 0, "revenue": 0, "overdue": 0}

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch Invoices
        try:
            resp = await client.get(
                f"{base}/{company_id}/query",
                headers=headers,
                params={"query": "SELECT * FROM Invoice MAXRESULTS 200"}
            )
            qb_data = resp.json() if resp.status_code == 200 else {}
            invoices = qb_data.get("QueryResponse", {}).get("Invoice", [])
            stats["invoices"] = len(invoices)
        except Exception:
            invoices = []

        # Fetch Customer count
        try:
            resp = await client.get(
                f"{base}/{company_id}/query",
                headers=headers,
                params={"query": "SELECT COUNT(*) FROM Customer"}
            )
            if resp.status_code == 200:
                qb_data = resp.json()
                stats["customers"] = qb_data.get("QueryResponse", {}).get("totalCount", 0)
        except Exception:
            pass

    # Transform invoices into deals
    for inv in invoices:
        total = float(inv.get("TotalAmt", 0) or 0)
        balance = float(inv.get("Balance", 0) or 0)
        stats["revenue"] += total

        # Map QuickBooks invoice status to deal stages
        if balance == 0 and total > 0:
            stage = "closed_won"
            probability = 100
        elif inv.get("DueDate"):
            try:
                due = datetime.strptime(inv["DueDate"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if due < now and balance > 0:
                    stage = "negotiation"  # Overdue
                    probability = 40
                    stats["overdue"] += 1
                else:
                    stage = "proposal"  # Due but not overdue
                    probability = 70
            except (ValueError, TypeError):
                stage = "qualified"
                probability = 50
        else:
            stage = "lead"
            probability = 20

        customer_name = "Unknown Customer"
        if inv.get("CustomerRef"):
            customer_name = inv["CustomerRef"].get("name", "Unknown Customer")

        created = inv.get("MetaData", {}).get("CreateTime") or now.isoformat()
        doc_number = inv.get("DocNumber", inv.get("Id", ""))

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Invoice #{doc_number}" if doc_number else f"QB Invoice {inv.get('Id', '')}",
            "company": customer_name,
            "value": round(total, 2),
            "stage": stage,
            "probability": probability,
            "expected_close_date": inv.get("DueDate"),
            "notes": f"QuickBooks invoice {inv.get('Id', '')} - Balance: ${balance:.2f}",
            "source": "quickbooks",
            "synced": True,
            "created_at": created,
            "updated_at": now.isoformat(),
        })

    return {
        "deals": deals,
        "stats": stats,
        "total_records": len(deals),
    }
