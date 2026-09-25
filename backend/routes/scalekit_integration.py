"""
Scalekit AgentKit connectors (QuickBooks, Salesforce, Intercom) via REST — no SDK.
Managed OAuth + auto-refresh live in Scalekit; we store only the org->connected_account
mapping and map imported records into our deal model. Dormant until env vars are set.
"""
import os
import time
import secrets
import uuid
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from database import db
from dependencies import require_owner
from models import User

router = APIRouter()

SK_ENV = os.environ.get("SCALEKIT_ENVIRONMENT_URL")
SK_ID = os.environ.get("SCALEKIT_CLIENT_ID")
SK_SECRET = os.environ.get("SCALEKIT_CLIENT_SECRET")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")

CONNECTORS = {"quickbooks", "salesforce", "intercom"}
_token_cache = {"tok": None, "exp": 0.0}


def _configured() -> bool:
    return bool(SK_ENV and SK_ID and SK_SECRET and APP_BASE_URL)


def _require_config():
    if not _configured():
        raise HTTPException(status_code=503, detail="Scalekit is not configured yet. Add SCALEKIT_* env vars.")


async def _sk_token() -> str:
    now = time.time()
    if _token_cache["tok"] and _token_cache["exp"] > now + 30:
        return _token_cache["tok"]
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(f"{SK_ENV}/oauth/token", data={
            "client_id": SK_ID, "client_secret": SK_SECRET, "grant_type": "client_credentials"})
    r.raise_for_status()
    j = r.json()
    _token_cache["tok"] = j["access_token"]
    _token_cache["exp"] = now + int(j.get("expires_in", 3600))
    return _token_cache["tok"]


async def _sk_post(path: str, body: dict) -> httpx.Response:
    tok = await _sk_token()
    async with httpx.AsyncClient(timeout=40.0) as c:
        return await c.post(f"{SK_ENV}{path}", json=body,
                            headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})


async def _sk_get(path: str, params: dict) -> httpx.Response:
    tok = await _sk_token()
    async with httpx.AsyncClient(timeout=40.0) as c:
        return await c.get(f"{SK_ENV}{path}", params=params, headers={"Authorization": f"Bearer {tok}"})


async def _execute(account_id: str, tool_name: str, params: dict) -> dict:
    r = await _sk_post("/api/v1/execute_tool",
                       {"connected_account_id": account_id, "tool_name": tool_name, "params": params})
    r.raise_for_status()
    return r.json().get("data", r.json())


def _num(v) -> float:
    try:
        return float(str(v).replace(",", "").replace("$", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _deal(user_id, name, company, value, stage, probability, source, close=None, notes=""):
    now = datetime.now(timezone.utc).isoformat()
    return {
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}", "user_id": user_id,
        "name": name or "Untitled", "company": company or source.title(),
        "value": round(_num(value), 2), "stage": stage, "probability": probability,
        "expected_close_date": str(close)[:10] if close else None,
        "notes": notes, "source": source, "synced": True,
        "created_at": now, "updated_at": now,
    }


def _map_records(connector: str, data, user_id: str):
    """Best-effort map of Scalekit tool output into deals. Tolerant of shape drift."""
    deals = []
    items = data if isinstance(data, list) else (data.get("data") or data.get("records") or data.get("QueryResponse") or [])
    if isinstance(items, dict):
        # QuickBooks-style {"Invoice": [...]} or Intercom {"data":[...]}
        items = items.get("Invoice") or items.get("records") or items.get("data") or []
    if not isinstance(items, list):
        items = []
    for it in items:
        if not isinstance(it, dict):
            continue
        if connector == "quickbooks":
            deals.append(_deal(user_id, it.get("DocNumber") or f"Invoice {it.get('Id','')}",
                               (it.get("CustomerRef") or {}).get("name", "QuickBooks"),
                               it.get("TotalAmt"), "closed_won", 100, "quickbooks",
                               it.get("TxnDate"), "QuickBooks invoice"))
        elif connector == "salesforce":
            stage_raw = str(it.get("StageName", "")).lower()
            stage = ("closed_won" if "won" in stage_raw else "closed_lost" if "lost" in stage_raw
                     else "negotiation" if "negot" in stage_raw else "proposal" if "propos" in stage_raw
                     else "qualified")
            deals.append(_deal(user_id, it.get("Name"), "Salesforce", it.get("Amount"),
                               stage, 100 if stage == "closed_won" else 40, "salesforce",
                               it.get("CloseDate"), "Salesforce opportunity"))
        elif connector == "intercom":
            spend = _num(it.get("monthly_spend"))
            deals.append(_deal(user_id, it.get("name") or f"Company {it.get('id','')}",
                               it.get("name"), spend * 12, "closed_won", 100, "intercom",
                               None, f"Intercom customer • ${spend:.0f}/mo"))
    return deals


async def _import_and_store(connector: str, account_id: str, user: User) -> int:
    tool, params = {
        "quickbooks": ("quickbooks_invoices_list", {"max_results": 100}),
        "salesforce": ("salesforce_query", {"soql": "SELECT Id, Name, Amount, StageName, CloseDate FROM Opportunity LIMIT 100"}),
        "intercom": ("intercom_list_companies", {"per_page": 100}),
    }[connector]
    data = await _execute(account_id, tool, params)
    deals = _map_records(connector, data, user.user_id)
    # Replace previously synced deals from this source for this org.
    await db.deals.delete_many({"org_id": user.org_id, "source": connector, "synced": True})
    if deals:
        for d in deals:
            d["org_id"] = user.org_id
        await db.deals.insert_many(deals)
    await db.business_connections.update_one(
        {"org_id": user.org_id, "platform": connector, "provider": "scalekit"},
        {"$set": {"records_synced": len(deals), "last_synced": datetime.now(timezone.utc).isoformat()}})
    return len(deals)


@router.get("/integrations/scalekit/status")
async def scalekit_status(user: User = Depends(require_owner)):
    return {"configured": _configured(), "connectors": sorted(CONNECTORS)}


@router.get("/integrations/scalekit/{connector}/start")
async def scalekit_start(connector: str, user: User = Depends(require_owner)):
    _require_config()
    if connector not in CONNECTORS:
        raise HTTPException(status_code=404, detail="Unsupported connector")
    state = secrets.token_urlsafe(24)
    await db.scalekit_oauth_states.insert_one({
        "state": state, "org_id": user.org_id, "connector": connector,
        "created_at": datetime.now(timezone.utc).isoformat()})
    resp = await _sk_post("/api/v1/connected_accounts/magic_link", {
        "connector": connector,
        "identifier": user.org_id,
        "organization_id": user.org_id,
        "state": state,
        "user_verify_url": f"{APP_BASE_URL}/api/integrations/scalekit/verify",
    })
    if resp.status_code >= 400:
        raise HTTPException(status_code=400, detail=f"Scalekit start failed: {resp.text[:200]}")
    return {"url": resp.json().get("link")}


@router.get("/integrations/scalekit/verify")
async def scalekit_verify(auth_request_id: str = Query(...), state: str = Query(...)):
    row = await db.scalekit_oauth_states.find_one_and_delete({"state": state})
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    org_id, connector = row["org_id"], row["connector"]

    vr = await _sk_post("/api/v1/connected_accounts/user/verify",
                        {"auth_request_id": auth_request_id, "identifier": org_id})
    if vr.status_code >= 400:
        return RedirectResponse(f"{APP_BASE_URL}/connect-business?scalekit_error={connector}")

    dr = await _sk_get("/api/v1/connected_accounts/details", {"connector": connector, "identifier": org_id})
    account = (dr.json() or {}).get("connected_account", {}) if dr.status_code < 400 else {}
    account_id = account.get("id")

    owner = await db.users.find_one({"org_id": org_id, "role": "owner"}, {"_id": 0})
    await db.business_connections.update_one(
        {"org_id": org_id, "platform": connector, "provider": "scalekit"},
        {"$set": {
            "org_id": org_id, "user_id": (owner or {}).get("user_id"),
            "platform": connector, "provider": "scalekit",
            "scalekit_account_id": account_id, "status": account.get("status", "ACTIVE"),
            "account_name": f"{connector.title()} (via Scalekit)",
            "connected_at": datetime.now(timezone.utc).isoformat(), "is_live": True,
        }}, upsert=True)

    if account_id and owner:
        try:
            await _import_and_store(connector, account_id, User(**owner))
        except Exception:
            pass
    return RedirectResponse(f"{APP_BASE_URL}/connect-business?scalekit={connector}")


@router.post("/integrations/scalekit/{connector}/sync")
async def scalekit_sync(connector: str, user: User = Depends(require_owner)):
    _require_config()
    conn = await db.business_connections.find_one(
        {"org_id": user.org_id, "platform": connector, "provider": "scalekit"}, {"_id": 0})
    if not conn or not conn.get("scalekit_account_id"):
        raise HTTPException(status_code=404, detail="Connector not connected via Scalekit")
    try:
        n = await _import_and_store(connector, conn["scalekit_account_id"], user)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {str(e)[:200]}")
    return {"ok": True, "records_synced": n, "message": f"✅ Synced {n} records from {connector.title()} (via Scalekit)."}
