"""QuickBooks Online — InFlow's own one-click OAuth 2.0 (Intuit) + invoice import.

Owner clicks Connect -> Intuit consent -> callback (code + realmId) -> tokens exchanged with
Basic auth. Intuit ROTATES refresh tokens, so every refresh persists the new pair. Access
tokens (1h) are kept encrypted on the connection row and refreshed under a per-connection lock.
QBO_SANDBOX=true uses the sandbox API host (development keys only reach sandbox companies).
"""
import asyncio
import os
import secrets
import time
import uuid
import logging
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from database import db
from dependencies import require_owner
from models import User
from utils.crypto import encrypt, decrypt
from utils.deal_sync import apply_sync

router = APIRouter()
logger = logging.getLogger(__name__)

CLIENT_ID = os.environ.get("QBO_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("QBO_CLIENT_SECRET", "")
SANDBOX = os.environ.get("QBO_SANDBOX", "true").lower() == "true"
APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")
REDIRECT_URI = f"{APP_BASE_URL}/api/integrations/quickbooks/callback"
PROVIDER = "qbo_oauth"
AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke"
API_BASE = "https://sandbox-quickbooks.api.intuit.com" if SANDBOX else "https://quickbooks.api.intuit.com"
MINOR = "75"
RECONNECT = "QuickBooks access expired. Click Connect QuickBooks to reconnect."

_locks: dict = {}


def _configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET and APP_BASE_URL)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _token(data: dict) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(TOKEN_URL, data=data, auth=(CLIENT_ID, CLIENT_SECRET),
                              headers={"Accept": "application/json"})
    try:
        j = r.json()
    except Exception:
        j = {}
    if not j.get("access_token"):
        err = j.get("error") or f"status {r.status_code}"
        if err == "invalid_grant":
            raise PermissionError(RECONNECT)
        if err == "invalid_client":
            raise ValueError("Intuit didn't recognise InFlow's QuickBooks app. Please contact support.")
        raise ValueError(f"QuickBooks sign-in failed: {err}")
    return j


def _token_fields(tok: dict) -> dict:
    return {"access_token_encrypted": encrypt(tok["access_token"]),
            "refresh_token_encrypted": encrypt(tok["refresh_token"]),
            "access_expires_at": time.time() + int(tok.get("expires_in") or 3600)}


async def _conn(org_id: str) -> dict:
    return await db.business_connections.find_one(
        {"org_id": org_id, "platform": "quickbooks", "provider": PROVIDER}, {"_id": 0})


async def access_token(conn: dict) -> str:
    """Valid access token for a connection; refreshes + persists the rotated pair when near expiry."""
    if conn.get("access_expires_at", 0) > time.time() + 120:
        return decrypt(conn["access_token_encrypted"])
    lock = _locks.setdefault(conn["connection_id"], asyncio.Lock())
    async with lock:
        fresh = await _conn(conn["org_id"]) or conn
        if fresh.get("access_expires_at", 0) > time.time() + 120:
            return decrypt(fresh["access_token_encrypted"])
        try:
            tok = await _token({"grant_type": "refresh_token", "refresh_token": decrypt(fresh["refresh_token_encrypted"])})
        except PermissionError:
            await db.business_connections.update_one({"org_id": conn["org_id"], "platform": "quickbooks", "provider": PROVIDER},
                                                     {"$set": {"status": "REAUTH_REQUIRED"}})
            raise
        await db.business_connections.update_one({"org_id": conn["org_id"], "platform": "quickbooks", "provider": PROVIDER},
                                                 {"$set": {**_token_fields(tok), "status": "ACTIVE"}})
        return tok["access_token"]


async def _get(token: str, realm: str, path: str, params: dict = None) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(f"{API_BASE}/v3/company/{realm}/{path}", params={**(params or {}), "minorversion": MINOR},
                             headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    if r.status_code == 401:
        raise PermissionError(RECONNECT)
    if r.status_code >= 400:
        raise ValueError(f"QuickBooks returned status {r.status_code}")
    return r.json()


def map_invoices(invoices: list, user_id: str) -> list:
    """Paid invoices = collected revenue; open ones sit in the pipeline by due date."""
    now = datetime.now(timezone.utc)
    deals = []
    for inv in invoices or []:
        total = float(inv.get("TotalAmt") or 0)
        balance = float(inv.get("Balance") or 0)
        stage, prob = "lead", 20
        if balance == 0 and total > 0:
            stage, prob = "closed_won", 100
        elif inv.get("DueDate"):
            try:
                due = datetime.strptime(inv["DueDate"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                stage, prob = ("negotiation", 40) if due < now else ("proposal", 70)
            except (ValueError, TypeError):
                stage, prob = "qualified", 50
        doc = inv.get("DocNumber") or inv.get("Id", "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Invoice #{doc}",
            "company": (inv.get("CustomerRef") or {}).get("name") or "QuickBooks customer",
            "value": round(total, 2),
            "stage": stage,
            "probability": prob,
            "expected_close_date": inv.get("DueDate") or inv.get("TxnDate"),
            "notes": f"QuickBooks invoice {inv.get('Id', '')} — balance ${balance:.2f}",
            "external_id": str(inv.get("Id") or "") or None,
            "source": "quickbooks",
            "synced": True,
            "created_at": (inv.get("MetaData") or {}).get("CreateTime") or now.isoformat(),
            "updated_at": now.isoformat(),
        })
    return deals


async def import_invoices(conn: dict) -> int:
    token = await access_token(conn)
    invoices, page = [], 1000
    for i in range(10):
        data = await _get(token, conn["realm_id"], "query",
                          {"query": f"SELECT * FROM Invoice STARTPOSITION {1 + i * page} MAXRESULTS {page}"})
        batch = (data.get("QueryResponse") or {}).get("Invoice") or []
        invoices.extend(batch)
        if len(batch) < page:
            break
    res = await apply_sync(conn["org_id"], "quickbooks", map_invoices(invoices, conn.get("user_id")), PROVIDER)
    await db.business_connections.update_one(
        {"org_id": conn["org_id"], "platform": "quickbooks", "provider": PROVIDER},
        {"$set": {"records_synced": res["synced"], "last_synced": _now()}})
    return res["synced"]


@router.get("/integrations/quickbooks/status")
async def qbo_status(user: User = Depends(require_owner)):
    c = await _conn(user.org_id)
    connected = {"status": c.get("status"), "records_synced": c.get("records_synced", 0),
                 "last_synced": c.get("last_synced"), "account_name": c.get("account_name"),
                 "sandbox": c.get("sandbox")} if c else None
    return {"configured": _configured(), "sandbox": SANDBOX, "connected": connected}


@router.get("/integrations/quickbooks/start")
async def qbo_start(user: User = Depends(require_owner)):
    if not _configured():
        raise HTTPException(status_code=503, detail="QuickBooks sign-in isn't configured on the server yet.")
    state = secrets.token_urlsafe(32)
    await db.qbo_oauth_states.insert_one({
        "state": state, "org_id": user.org_id, "user_id": user.user_id,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()})
    q = urlencode({"client_id": CLIENT_ID, "response_type": "code", "scope": "com.intuit.quickbooks.accounting",
                   "redirect_uri": REDIRECT_URI, "state": state})
    return {"url": f"{AUTH_URL}?{q}"}


@router.get("/integrations/quickbooks/callback")
async def qbo_callback(code: str = "", state: str = "", realmId: str = "", error: str = ""):
    def back(err: str = "", records: int = 0):
        q = {"quickbooks_error": err} if err else {"quickbooks": "connected", "records": records}
        return RedirectResponse(f"{APP_BASE_URL}/connect-business?{urlencode(q)}")

    row = await db.qbo_oauth_states.find_one_and_delete({"state": state}) if state else None
    if not row or row.get("expires_at", "") < _now():
        return back("This sign-in link expired. Please click Connect again.")
    if error:
        return back("QuickBooks sign-in was cancelled." if error == "access_denied" else f"QuickBooks sign-in failed: {error}")
    if not code or not realmId:
        return back("QuickBooks didn't return a company. Please try again.")
    try:
        tok = await _token({"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT_URI})
    except (ValueError, PermissionError) as e:
        return back(str(e))
    try:
        info = (await _get(tok["access_token"], realmId, f"companyinfo/{realmId}")).get("CompanyInfo") or {}
    except Exception:
        info = {}
    org_id = row["org_id"]

    # Replace any older QuickBooks connection (Scalekit / pasted token) and its synced records.
    await db.business_connections.delete_many({"org_id": org_id, "platform": "quickbooks", "provider": {"$ne": PROVIDER}})
    await db.deals.delete_many({"org_id": org_id, "source": "quickbooks", "synced": True, "provider": "scalekit"})
    old = await _conn(org_id)
    conn = {
        "connection_id": (old or {}).get("connection_id") or f"conn_{uuid.uuid4().hex[:12]}",
        "org_id": org_id, "user_id": row["user_id"], "platform": "quickbooks", "provider": PROVIDER,
        "status": "ACTIVE", "is_live": True, "revenue_role": "revenue",
        "account_name": info.get("CompanyName") or f"QuickBooks company {realmId}",
        "realm_id": realmId, "company_id": realmId, "sandbox": SANDBOX,
        **_token_fields(tok),
        "connected_at": _now(), "last_synced": _now(), "records_synced": 0,
    }
    await db.business_connections.update_one({"org_id": org_id, "platform": "quickbooks", "provider": PROVIDER},
                                             {"$set": conn}, upsert=True)
    try:
        records = await import_invoices(conn)
    except Exception as e:
        logger.warning(f"[quickbooks] initial import failed for {org_id}: {e}")
        records = 0
    return back(records=records)


@router.post("/integrations/quickbooks/sync")
async def qbo_sync(user: User = Depends(require_owner)):
    c = await _conn(user.org_id)
    if not c:
        raise HTTPException(status_code=404, detail="QuickBooks isn't connected")
    try:
        n = await import_invoices(c)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {e}")
    return {"ok": True, "records_synced": n, "message": f"✅ Synced {n} invoices from QuickBooks."}


@router.post("/integrations/quickbooks/disconnect")
async def qbo_disconnect(user: User = Depends(require_owner)):
    c = await _conn(user.org_id)
    if not c:
        raise HTTPException(status_code=404, detail="QuickBooks isn't connected")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(REVOKE_URL, json={"token": decrypt(c["refresh_token_encrypted"])},
                              auth=(CLIENT_ID, CLIENT_SECRET), headers={"Accept": "application/json"})
    except Exception as e:
        logger.warning(f"[quickbooks] revoke failed for {user.org_id}: {e}")
    _locks.pop(c["connection_id"], None)
    await db.business_connections.delete_one({"org_id": user.org_id, "platform": "quickbooks", "provider": PROVIDER})
    removed = await db.deals.delete_many({"org_id": user.org_id, "source": "quickbooks", "synced": True,
                                          "provider": {"$ne": "scalekit"}})
    return {"ok": True, "records_removed": removed.deleted_count,
            "message": f"QuickBooks disconnected — removed {removed.deleted_count} synced invoices."}
