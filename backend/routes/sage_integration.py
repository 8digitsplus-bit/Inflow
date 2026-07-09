"""Sage Business Cloud Accounting — reads sales invoices (revenue source).

Auth: OAuth2 Bearer access token (short-lived ~5-min TTL — paste a fresh token).
Base: https://api.accounting.sage.com/v3.1.
"""
import httpx
import uuid
from datetime import datetime, timezone

BASE = "https://api.accounting.sage.com/v3.1"


async def validate_sage_key(access_token: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{BASE}/sales_invoices", headers={"Authorization": f"Bearer {access_token}"}, params={"items_per_page": 1})
        if r.status_code == 200:
            return {"valid": True, "account_name": "Sage Accounting"}
        if r.status_code in (401, 403):
            return {"valid": False, "error": "Invalid or expired Sage access token (Sage tokens expire ~5 minutes after issue)."}
        return {"valid": False, "error": f"Sage error (HTTP {r.status_code}): {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e) or "Could not reach Sage Accounting"}


def _stage(status: str):
    s = (status or "").lower()
    if "paid" in s:
        return "closed_won", 100
    if "void" in s or "credit" in s:
        return "closed_lost", 0
    return "negotiation", 60


async def fetch_sage_data(access_token: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"invoices": 0, "revenue": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{BASE}/sales_invoices", headers={"Authorization": f"Bearer {access_token}"}, params={"items_per_page": 100})
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        rows = (r.json() or {}).get("$items", []) or []

    for inv in rows:
        try:
            amount = float(inv.get("total_amount", 0) or inv.get("net_amount", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        cur = inv.get("currency") or {}
        currency = cur.get("id") if isinstance(cur, dict) else (cur or "USD")
        status_raw = inv.get("status")
        status = status_raw.get("displayed_as") if isinstance(status_raw, dict) else status_raw
        stage, prob = _stage(status)
        if amount > 0 and stage == "closed_won":
            stats["invoices"] += 1
            stats["revenue"] += amount
            stats["currency"] = currency or "USD"

        iid = inv.get("id") or uuid.uuid4().hex[:12]
        created = str(inv.get("date") or "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Invoice {inv.get('displayed_as') or str(iid)[:12]}"[:200],
            "company": (inv.get("contact_name") or "Sage Customer")[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "sage", "notes": f"Sage sales invoice {iid}",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
