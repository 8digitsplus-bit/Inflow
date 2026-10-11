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
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from database import db
from dependencies import require_owner
from models import User
from utils.deal_sync import apply_sync
from utils.revenue import _DEFAULT_ROLE

router = APIRouter()
logger = logging.getLogger(__name__)

SK_ENV = os.environ.get("SCALEKIT_ENVIRONMENT_URL")
SK_ID = os.environ.get("SCALEKIT_CLIENT_ID")
SK_SECRET = os.environ.get("SCALEKIT_CLIENT_SECRET")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")

CONNECTORS = {"quickbooks", "salesforce", "stripe"}
# Dashboard connection names can differ from the bare provider key (e.g. "quickbooks-connect").
# Override per-connector via env if your Scalekit dashboard names them differently.
_CONN_NAMES = {
    "quickbooks": os.environ.get("SCALEKIT_CONNECTION_QUICKBOOKS", "quickbooks"),
    "salesforce": os.environ.get("SCALEKIT_CONNECTION_SALESFORCE", "salesforce"),
    "stripe": os.environ.get("SCALEKIT_CONNECTION_STRIPE", "stripe"),
}
_token_cache = {"tok": None, "exp": 0.0}


def _conn_name(connector: str) -> str:
    return _CONN_NAMES.get(connector, connector)


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


async def _get_or_create_account(conn_name: str, identifier: str) -> httpx.Response:
    """Create (or fetch existing) connected account. Scalekit requires this before a magic link.
    Body must wrap details in `connected_account` (empty for OAuth — the user authorizes via the link)."""
    return await _sk_post("/api/v1/connected_accounts",
                          {"connected_account": {}, "connector": conn_name, "identifier": identifier})


def _account_from(resp: httpx.Response) -> dict:
    if resp.status_code >= 400:
        return {}
    j = resp.json() if resp.content else {}
    if not isinstance(j, dict):
        return {}
    acc = j.get("connected_account", j)
    return acc if isinstance(acc, dict) else {}


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


def _deal(user_id, name, company, value, stage, probability, source, close=None, notes="", external_id=None):
    now = datetime.now(timezone.utc).isoformat()
    return {
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}", "user_id": user_id,
        "name": name or "Untitled", "company": company or source.title(),
        "value": round(_num(value), 2), "stage": stage, "probability": probability,
        "expected_close_date": str(close)[:10] if close else None,
        "notes": notes, "source": source, "synced": True,
        "external_id": str(external_id) if external_id else None,
        "created_at": now, "updated_at": now,
    }


def _map_records(connector: str, data, user_id: str):
    """Best-effort map of Scalekit tool output into deals. Tolerant of shape drift."""
    deals = []
    items = data if isinstance(data, list) else (data.get("data") or data.get("records") or data.get("QueryResponse") or [])
    if isinstance(items, dict):
        # QuickBooks {"Invoice":[...]} / Xero {"Invoices":[...]} / Intercom {"data":[...]}
        items = items.get("Invoice") or items.get("Invoices") or items.get("records") or items.get("data") or []
    if not isinstance(items, list):
        items = []
    for it in items:
        if not isinstance(it, dict):
            continue
        if connector == "quickbooks":
            deals.append(_deal(user_id, it.get("DocNumber") or f"Invoice {it.get('Id','')}",
                               (it.get("CustomerRef") or {}).get("name", "QuickBooks"),
                               it.get("TotalAmt"), "closed_won", 100, "quickbooks",
                               it.get("TxnDate"), "QuickBooks invoice", external_id=it.get("Id")))
        elif connector == "salesforce":
            stage_raw = str(it.get("StageName", "")).lower()
            stage = ("closed_won" if "won" in stage_raw else "closed_lost" if "lost" in stage_raw
                     else "negotiation" if "negot" in stage_raw else "proposal" if "propos" in stage_raw
                     else "qualified")
            deals.append(_deal(user_id, it.get("Name"), "Salesforce", it.get("Amount"),
                               stage, 100 if stage == "closed_won" else 40, "salesforce",
                               it.get("CloseDate"), "Salesforce opportunity", external_id=it.get("Id")))
        elif connector == "stripe":
            status = str(it.get("status", "")).lower()
            if status and status != "succeeded":
                continue  # only successful charges count as collected revenue
            amount = _num(it.get("amount")) / 100.0  # Stripe amounts are in cents
            created = it.get("created")
            try:
                close = datetime.fromtimestamp(int(created), tz=timezone.utc).date().isoformat() if created else None
            except (ValueError, TypeError, OSError):
                close = None
            bill = it.get("billing_details") or {}
            deals.append(_deal(user_id, it.get("description") or bill.get("name") or f"Charge {it.get('id','')}",
                               bill.get("name") or it.get("receipt_email") or "Stripe",
                               amount, "closed_won", 100, "stripe", close, "Stripe payment", external_id=it.get("id")))
    return deals


async def _quickbooks_invoices(account_id: str) -> dict:
    """QuickBooks' query API requires explicit paging (start_position/max_results)."""
    page, invoices = 1000, []
    for i in range(10):
        data = await _execute(account_id, "quickbooks_invoices_list", {"start_position": 1 + i * page, "max_results": page})
        batch = ((data or {}).get("QueryResponse") or {}).get("Invoice") or []
        invoices.extend(batch)
        if len(batch) < page:
            break
    return {"QueryResponse": {"Invoice": invoices}}


async def _import_and_store(connector: str, account_id: str, user: User) -> int:
    if connector == "quickbooks":
        data = await _quickbooks_invoices(account_id)
    else:
        tool = {"salesforce": "salesforce_opportunities_list", "stripe": "stripe_list_charges_dahlia"}[connector]
        data = await _execute(account_id, tool, {})
    deals = _map_records(connector, data, user.user_id)
    try:
        _sample = str(data)[:900]
        _first = deals[0] if deals else None
        logger.info(f"[scalekit-sync] connector={connector} tool={tool} "
                    f"raw_type={type(data).__name__} mapped_deals={len(deals)} "
                    f"raw_sample={_sample}")
        if _first:
            logger.info(f"[scalekit-sync] first_mapped_deal name={_first.get('name')!r} "
                        f"company={_first.get('company')!r} value={_first.get('value')} "
                        f"stage={_first.get('stage')} close={_first.get('expected_close_date')}")
    except Exception:
        pass
    # Reconcile (provider-scoped delete + preserve locally-edited deals).
    res = await apply_sync(user.org_id, connector, deals, "scalekit")
    await db.business_connections.update_one(
        {"org_id": user.org_id, "platform": connector, "provider": "scalekit"},
        {"$set": {"records_synced": res["synced"], "last_synced": datetime.now(timezone.utc).isoformat()}})
    return res["synced"]


async def _active_account(connector: str, org_id: str, owner: dict) -> dict:
    """Locate the connected account. Individual-mode connections are sometimes keyed by the
    user's email rather than org_id, so check org_id first, then the owner's email, and prefer
    the first ACTIVE account. Returns the best account dict (ACTIVE if any, else last seen)."""
    identifiers = [org_id]
    if owner and owner.get("email"):
        identifiers.append(owner["email"])
    best = {}
    for ident in identifiers:
        dr = await _sk_get("/api/v1/connected_accounts/details",
                           {"connector": _conn_name(connector), "identifier": ident})
        acc = _account_from(dr)
        if acc.get("id") and str(acc.get("status", "")).upper() == "ACTIVE":
            return acc
        if acc and not best:
            best = acc
    return best


async def _store_and_import(connector: str, org_id: str) -> dict:
    """Fetch the connected account; if authorized, store the mapping + import records.
    Mode-independent: works whether or not the connection uses Custom user-verification."""
    owner = await db.users.find_one({"org_id": org_id, "role": "owner"}, {"_id": 0})
    account = await _active_account(connector, org_id, owner or {})
    account_id = account.get("id")
    status = str(account.get("status", "")).upper()
    if not account_id or status != "ACTIVE":
        return {"connected": False, "status": status or "UNKNOWN", "records": 0}
    await db.business_connections.update_one(
        {"org_id": org_id, "platform": connector, "provider": "scalekit"},
        {"$set": {
            "org_id": org_id, "user_id": (owner or {}).get("user_id"),
            "platform": connector, "provider": "scalekit",
            "scalekit_account_id": account_id, "status": status or "ACTIVE",
            "account_name": f"{connector.title()} (via Scalekit)",
            "revenue_role": _DEFAULT_ROLE.get(connector, "revenue"),
            "connected_at": datetime.now(timezone.utc).isoformat(), "is_live": True,
        }}, upsert=True)
    records = 0
    if owner:
        try:
            records = await _import_and_store(connector, account_id, User(**owner))
        except Exception as e:
            logger.warning(f"Scalekit import failed for {connector}: {e}")
    return {"connected": True, "status": status or "ACTIVE", "records": records}


@router.get("/integrations/scalekit/status")
async def scalekit_status(user: User = Depends(require_owner)):
    conns = await db.business_connections.find(
        {"org_id": user.org_id, "provider": "scalekit"}, {"_id": 0}).to_list(50)
    connected = {c["platform"]: {
        "status": c.get("status"),
        "records_synced": c.get("records_synced", 0),
        "last_synced": c.get("last_synced"),
        "account_name": c.get("account_name"),
    } for c in conns if c.get("scalekit_account_id") and str(c.get("status", "")).upper() == "ACTIVE"}
    return {"configured": _configured(), "connectors": sorted(CONNECTORS), "connected": connected}


@router.get("/integrations/scalekit/{connector}/start")
async def scalekit_start(connector: str, user: User = Depends(require_owner)):
    _require_config()
    if connector not in CONNECTORS:
        raise HTTPException(status_code=404, detail="Unsupported connector")
    # Collision guard: block if this platform is already connected directly (native) — else
    # the two systems share the same `source` and their syncs would clobber each other.
    clash = await db.business_connections.find_one(
        {"org_id": user.org_id, "platform": connector, "provider": {"$ne": "scalekit"}})
    if clash:
        raise HTTPException(status_code=400, detail=(
            f"{connector.title()} is already connected directly. Disconnect it first to connect it via Scalekit."))
    conn_name = _conn_name(connector)
    state = secrets.token_urlsafe(24)
    await db.scalekit_oauth_states.insert_one({
        "state": state, "org_id": user.org_id, "connector": connector,
        "created_at": datetime.now(timezone.utc).isoformat()})
    # Scalekit requires the connected account to exist before a magic link can be issued.
    cr = await _get_or_create_account(conn_name, user.org_id)
    # 409 = account already exists (fine). "connection not found" = the connector isn't set up in the dashboard.
    if cr.status_code >= 400 and cr.status_code != 409 and "connection not found" in cr.text.lower():
        raise HTTPException(status_code=400, detail=(
            f"No '{conn_name}' connection exists in your Scalekit environment yet. "
            f"In the Scalekit dashboard, open AgentKit → Connections → Create Connection, "
            f"add {connector.title()}, then try again."))
    resp = await _sk_post("/api/v1/connected_accounts/magic_link", {
        "connector": conn_name,
        "identifier": user.org_id,
        "state": state,
        "user_verify_url": f"{APP_BASE_URL}/api/integrations/scalekit/verify",
    })
    if resp.status_code >= 400:
        detail = resp.text[:250]
        if cr.status_code >= 400 and cr.status_code != 409:
            detail = f"{detail} | create_account: {cr.text[:150]}"
        raise HTTPException(status_code=400, detail=f"Scalekit start failed: {detail}")
    return {"url": resp.json().get("link")}


@router.get("/integrations/scalekit/verify")
async def scalekit_verify(auth_request_id: str = Query(...), state: str = Query(...)):
    row = await db.scalekit_oauth_states.find_one_and_delete({"state": state})
    if not row:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    org_id, connector = row["org_id"], row["connector"]
    # Best-effort user verification (only meaningful when the connection uses Custom user-verification).
    await _sk_post("/api/v1/connected_accounts/user/verify",
                   {"auth_request_id": auth_request_id, "identifier": org_id})
    result = await _store_and_import(connector, org_id)
    param = "scalekit" if result["connected"] else "scalekit_error"
    return RedirectResponse(f"{APP_BASE_URL}/connect-business?{param}={connector}")


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


@router.post("/integrations/scalekit/{connector}/finalize")
async def scalekit_finalize(connector: str, user: User = Depends(require_owner)):
    """Fallback for connections without Custom user-verification (no redirect callback):
    reconcile the account status directly and import if it's authorized."""
    _require_config()
    if connector not in CONNECTORS:
        raise HTTPException(status_code=404, detail="Unsupported connector")
    result = await _store_and_import(connector, user.org_id)
    if not result["connected"]:
        raise HTTPException(status_code=400, detail=(
            f"{connector.title()} isn't authorized yet (status: {result['status']}). "
            f"Finish the sign-in in the Scalekit window, then try again."))
    return {"ok": True, "records_synced": result["records"],
            "message": f"✅ Connected {connector.title()} — synced {result['records']} records (via Scalekit)."}
