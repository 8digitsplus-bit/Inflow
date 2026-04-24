"""Xero Live Integration — OAuth2 Refresh-Token flow.

User supplies a pre-generated refresh_token + client_id + client_secret + tenant_id.
We exchange refresh_token → access_token → call /api.xro/2.0/Invoices.
"""
import base64
import httpx
import uuid
from datetime import datetime, timezone

TOKEN_URL = "https://identity.xero.com/connect/token"
API_BASE = "https://api.xero.com/api.xro/2.0"


async def _get_access_token(refresh_token: str, client_id: str, client_secret: str) -> str:
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            TOKEN_URL,
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "refresh_token", "refresh_token": refresh_token},
        )
        if r.status_code != 200 or "access_token" not in r.json():
            raise ValueError(f"Xero auth failed: {r.text[:200]}")
        return r.json()["access_token"]


async def validate_xero_credentials(refresh_token: str, client_id: str, client_secret: str, tenant_id: str) -> dict:
    if not tenant_id:
        return {"valid": False, "error": "Tenant ID is required"}
    try:
        token = await _get_access_token(refresh_token, client_id, client_secret)
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{API_BASE}/Organisation",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Xero-Tenant-Id": tenant_id,
                    "Accept": "application/json",
                },
            )
            if r.status_code != 200:
                return {"valid": False, "error": f"Xero API {r.status_code}: {r.text[:150]}"}
            orgs = r.json().get("Organisations", [])
            name = orgs[0].get("Name") if orgs else "Xero Organisation"
            return {"valid": True, "account_name": name}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_xero_data(refresh_token: str, client_id: str, client_secret: str, tenant_id: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    token = await _get_access_token(refresh_token, client_id, client_secret)

    deals = []
    stats = {"invoices": 0, "revenue": 0.0, "outstanding": 0.0}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{API_BASE}/Invoices",
            headers={
                "Authorization": f"Bearer {token}",
                "Xero-Tenant-Id": tenant_id,
                "Accept": "application/json",
            },
            params={"order": "UpdatedDateUTC DESC", "page": 1},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        invoices = r.json().get("Invoices", [])

    for inv in invoices[:200]:
        if inv.get("Type") != "ACCREC":  # only accounts receivable (sales)
            continue
        total = float(inv.get("Total") or 0)
        amount_due = float(inv.get("AmountDue") or 0)
        status = inv.get("Status", "")
        contact = inv.get("Contact") or {}
        company = contact.get("Name", "Unknown")

        if status == "PAID":
            stage = "closed_won"
        elif status in ("VOIDED", "DELETED"):
            stage = "closed_lost"
        elif status in ("AUTHORISED", "SUBMITTED"):
            stage = "negotiation"
        else:
            stage = "proposal"

        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Invoice {inv.get('InvoiceNumber') or inv.get('InvoiceID','')}"[:200],
            "company": company[:200],
            "value": round(total, 2),
            "stage": stage,
            "probability": 100 if stage == "closed_won" else 70,
            "expected_close_date": (inv.get("DueDate") or "")[:10] or None,
            "notes": f"Xero invoice {inv.get('InvoiceID','')} · status {status}",
            "source": "xero",
            "synced": True,
            "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        stats["invoices"] += 1
        if stage == "closed_won":
            stats["revenue"] += total
        if amount_due > 0:
            stats["outstanding"] += amount_due

    stats["revenue"] = round(stats["revenue"], 2)
    stats["outstanding"] = round(stats["outstanding"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
