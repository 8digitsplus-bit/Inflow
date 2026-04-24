"""PayPal Live Integration — Client Credentials OAuth2 flow (server-side only, no user redirect).

Fetches recent transactions and converts them into deals/revenue records.
Auth: client_id + client_secret (Basic auth) → access_token → /v1/reporting/transactions
"""
import base64
import httpx
import uuid
from datetime import datetime, timezone, timedelta

LIVE_BASE = "https://api-m.paypal.com"
SANDBOX_BASE = "https://api-m.sandbox.paypal.com"


def _base_url(sandbox: bool) -> str:
    return SANDBOX_BASE if sandbox else LIVE_BASE


async def _get_access_token(client_id: str, client_secret: str, sandbox: bool) -> str:
    """Exchange client credentials for an access token."""
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    url = f"{_base_url(sandbox)}/v1/oauth2/token"
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            url,
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"},
            data="grant_type=client_credentials",
        )
        if r.status_code != 200:
            raise ValueError(f"PayPal auth failed: {r.text[:200]}")
        return r.json()["access_token"]


async def validate_paypal_credentials(client_id: str, client_secret: str, sandbox: bool = False) -> dict:
    try:
        token = await _get_access_token(client_id, client_secret, sandbox)
        return {
            "valid": True,
            "account_name": f"PayPal{'Sandbox' if sandbox else ''}",
            "access_token": token,
        }
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_paypal_data(client_id: str, client_secret: str, sandbox: bool, user_id: str) -> dict:
    token = await _get_access_token(client_id, client_secret, sandbox)
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=31)).strftime("%Y-%m-%dT%H:%M:%S-0000")
    end = now.strftime("%Y-%m-%dT%H:%M:%S-0000")

    deals = []
    stats = {"transactions": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{_base_url(sandbox)}/v1/reporting/transactions",
            headers={"Authorization": f"Bearer {token}"},
            params={"start_date": start, "end_date": end, "fields": "all", "page_size": 100},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        txns = r.json().get("transaction_details", [])

    for t in txns:
        info = t.get("transaction_info", {})
        payer = t.get("payer_info", {})
        amount_str = info.get("transaction_amount", {}).get("value", "0")
        try:
            amount = float(amount_str)
        except (ValueError, TypeError):
            amount = 0.0
        if amount <= 0:
            continue
        stats["transactions"] += 1
        stats["revenue"] += amount
        stats["currency"] = info.get("transaction_amount", {}).get("currency_code", "USD")

        txn_id = info.get("transaction_id") or uuid.uuid4().hex[:12]
        name = info.get("transaction_subject") or f"PayPal {txn_id[:8]}"
        company = (payer.get("payer_name", {}).get("alternate_full_name")
                   or payer.get("email_address", "").split("@")[0]
                   or "PayPal Customer")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": name[:200], "company": company[:200],
            "value": round(amount, 2), "stage": "closed_won",
            "probability": 100, "source": "paypal",
            "notes": f"PayPal transaction {txn_id}",
            "expected_close_date": info.get("transaction_initiation_date", "")[:10] or None,
            "synced": True,
            "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
