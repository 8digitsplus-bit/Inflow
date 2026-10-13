"""Zoho CRM — InFlow's own one-click OAuth (Multi-DC) + deal import (API v8).

Owner clicks Connect -> Zoho consent (accounts.zoho.com routes each user to their own
data center) -> the callback carries `accounts-server`; we exchange the code THERE, keep
the refresh token encrypted, and call the returned api_domain. Access tokens are minted
on demand in utils.crm_auth (refresh against the stored accounts server).
"""
import os
import secrets
import uuid
import logging
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from database import db
from dependencies import require_owner
from models import User
from utils.crypto import encrypt, decrypt
from utils.crm_auth import crm_creds, forget, remember
from utils.deal_sync import apply_sync
import routes.zoho_write as zw

router = APIRouter()
logger = logging.getLogger(__name__)

CLIENT_ID = os.environ.get("ZOHO_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("ZOHO_CLIENT_SECRET", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "").rstrip("/")
REDIRECT_URI = f"{APP_BASE_URL}/api/integrations/zoho/callback"
PROVIDER = "zoho_oauth"
SCOPES = ",".join([
    "ZohoCRM.modules.deals.ALL", "ZohoCRM.modules.contacts.ALL", "ZohoCRM.modules.notes.ALL",
    "ZohoCRM.modules.tasks.ALL", "ZohoCRM.modules.calls.ALL", "ZohoCRM.modules.accounts.ALL",
    "ZohoCRM.settings.fields.ALL", "ZohoCRM.users.READ",
])
ACCOUNTS_HOSTS = {
    "accounts.zoho.com", "accounts.zoho.eu", "accounts.zoho.in", "accounts.zoho.com.au",
    "accounts.zoho.jp", "accounts.zohocloud.ca", "accounts.zoho.sa", "accounts.zoho.uk",
    "accounts.zoho.com.cn",
}

STAGE_MAP = {
    "qualification": "qualified",
    "needs analysis": "qualified",
    "value proposition": "proposal",
    "identify decision makers": "qualified",
    "id. decision makers": "qualified",
    "perception analysis": "proposal",
    "proposal/price quote": "proposal",
    "negotiation/review": "negotiation",
    "closed won": "closed_won",
    "closed lost": "closed_lost",
    "closed-lost to competition": "closed_lost",
}
DEAL_FIELDS = "id,Deal_Name,Amount,Stage,Probability,Closing_Date,Account_Name,Description"


def _configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET and APP_BASE_URL)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _friendly(err: str) -> str:
    if err == "invalid_client":
        return "Zoho didn't recognise InFlow's app in your region. Please contact support."
    if err in ("invalid_code", "invalid_grant"):
        return "The Zoho sign-in expired before it finished. Please try connecting again."
    return f"Zoho sign-in failed: {err or 'unknown error'}"


def _accounts_server(url: str) -> str:
    p = urlparse(url or "")
    if p.scheme != "https" or p.hostname not in ACCOUNTS_HOSTS:
        return ""
    return f"https://{p.hostname}"


async def _token(accounts_server: str, data: dict) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(f"{accounts_server}/oauth/v2/token",
                              data={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET, **data})
    try:
        j = r.json()
    except Exception:
        j = {}
    if not j.get("access_token"):
        raise ValueError(_friendly(j.get("error") or f"status {r.status_code}"))
    return j


async def refresh_access(conn: dict) -> dict:
    """Mint an access token for a stored connection. Returns {"token", "instance_url"}."""
    j = await _token(conn["accounts_server"], {"grant_type": "refresh_token",
                                                "refresh_token": decrypt(conn["refresh_token_encrypted"])})
    return {"token": j["access_token"], "instance_url": (j.get("api_domain") or conn.get("instance_url", "")).rstrip("/")}


def map_deals(records: list, user_id: str) -> list:
    now = _now()
    deals = []
    for d in records or []:
        if not isinstance(d, dict):
            continue
        try:
            amount = float(d.get("Amount") or 0)
        except (ValueError, TypeError):
            amount = 0.0
        stage = STAGE_MAP.get((d.get("Stage") or "Qualification").lower(), "qualified")
        account = d.get("Account_Name") or {}
        company = account.get("name") if isinstance(account, dict) else str(account or "")
        zid = str(d.get("id") or "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (d.get("Deal_Name") or "Zoho Deal")[:200],
            "company": (company or "Unknown")[:200],
            "value": round(amount, 2),
            "stage": stage,
            "probability": int(d.get("Probability") or (100 if stage == "closed_won" else 50)),
            "expected_close_date": d.get("Closing_Date") or None,
            "notes": (d.get("Description") or "")[:500] or f"Zoho deal {zid}",
            "zoho_deal_id": zid,
            "external_id": zid or None,
            "source": "zoho",
            "synced": True,
            "created_at": now, "updated_at": now,
        })
    return deals


async def import_deals(conn: dict) -> int:
    creds = await crm_creds(conn)
    if creds.get("error"):
        raise ValueError(creds["error"])
    records = []
    for page in range(1, 11):
        j, err = await zw._req("GET", creds, "/Deals", {"fields": DEAL_FIELDS, "per_page": 200, "page": page})
        if err:
            raise ValueError(err["error"])
        records.extend((j or {}).get("data") or [])
        if not ((j or {}).get("info") or {}).get("more_records"):
            break
    res = await apply_sync(conn["org_id"], "zoho", map_deals(records, conn.get("user_id")), PROVIDER)
    await db.business_connections.update_one(
        {"org_id": conn["org_id"], "platform": "zoho", "provider": PROVIDER},
        {"$set": {"records_synced": res["synced"], "last_synced": _now()}})
    return res["synced"]


async def _conn(org_id: str) -> dict:
    return await db.business_connections.find_one({"org_id": org_id, "platform": "zoho", "provider": PROVIDER}, {"_id": 0})


@router.get("/integrations/zoho/status")
async def zoho_status(user: User = Depends(require_owner)):
    c = await _conn(user.org_id)
    connected = {"status": c.get("status"), "records_synced": c.get("records_synced", 0),
                 "last_synced": c.get("last_synced"), "account_name": c.get("account_name"),
                 "location": c.get("location")} if c else None
    return {"configured": _configured(), "connected": connected}


@router.get("/integrations/zoho/start")
async def zoho_start(user: User = Depends(require_owner)):
    if not _configured():
        raise HTTPException(status_code=503, detail="Zoho CRM sign-in isn't configured on the server yet.")
    state = secrets.token_urlsafe(32)
    await db.zoho_oauth_states.insert_one({
        "state": state, "org_id": user.org_id, "user_id": user.user_id,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()})
    q = urlencode({"response_type": "code", "client_id": CLIENT_ID, "scope": SCOPES, "redirect_uri": REDIRECT_URI,
                   "access_type": "offline", "prompt": "consent", "state": state})
    return {"url": f"https://accounts.zoho.com/oauth/v2/auth?{q}"}


@router.get("/integrations/zoho/callback")
async def zoho_callback(request: Request, code: str = "", state: str = "", error: str = "", location: str = ""):
    def back(err: str = "", records: int = 0):
        q = {"zoho_error": err} if err else {"zoho": "connected", "records": records}
        return RedirectResponse(f"{APP_BASE_URL}/connect-business?{urlencode(q)}")

    row = await db.zoho_oauth_states.find_one_and_delete({"state": state}) if state else None
    if not row or row.get("expires_at", "") < _now():
        return back("This sign-in link expired. Please click Connect again.")
    if error:
        return back("Zoho sign-in was cancelled." if error == "access_denied" else _friendly(error))
    accounts_server = _accounts_server(request.query_params.get("accounts-server", ""))
    if not code or not accounts_server:
        return back("Zoho didn't return a valid sign-in. Please try again.")
    try:
        tok = await _token(accounts_server, {"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT_URI})
    except ValueError as e:
        return back(str(e))
    if not tok.get("refresh_token"):
        return back("Zoho didn't grant offline access. Please try connecting again.")
    api_domain = (tok.get("api_domain") or "").rstrip("/")
    who, _ = await zw._req("GET", {"token": tok["access_token"], "instance_url": api_domain}, "/users", {"type": "CurrentUser"})
    me = ((who or {}).get("users") or [{}])[0]
    org_id = row["org_id"]

    # Replace any older Zoho connection (Scalekit / paste-credentials) and its synced deals.
    await db.business_connections.delete_many({"org_id": org_id, "platform": "zoho", "provider": {"$ne": PROVIDER}})
    await db.deals.delete_many({"org_id": org_id, "source": "zoho", "synced": True, "provider": "scalekit"})
    old = await _conn(org_id)
    if old:
        forget(old)
    conn = {
        "connection_id": (old or {}).get("connection_id") or f"conn_{uuid.uuid4().hex[:12]}",
        "org_id": org_id, "user_id": row["user_id"], "platform": "zoho", "provider": PROVIDER,
        "status": "ACTIVE", "is_live": True, "revenue_role": "pipeline",
        "account_name": f"Zoho CRM — {me.get('email') or me.get('full_name') or (location or '').upper() or 'connected'}",
        "refresh_token_encrypted": encrypt(tok["refresh_token"]),
        "accounts_server": accounts_server, "instance_url": api_domain, "location": location,
        "connected_at": _now(), "last_synced": _now(), "records_synced": 0,
    }
    await db.business_connections.update_one({"org_id": org_id, "platform": "zoho", "provider": PROVIDER},
                                             {"$set": conn}, upsert=True)
    remember(conn, {"token": tok["access_token"], "instance_url": api_domain})
    try:
        records = await import_deals(conn)
    except Exception as e:
        logger.warning(f"[zoho] initial import failed for {org_id}: {e}")
        records = 0
    return back(records=records)


@router.post("/integrations/zoho/sync")
async def zoho_sync(user: User = Depends(require_owner)):
    c = await _conn(user.org_id)
    if not c:
        raise HTTPException(status_code=404, detail="Zoho CRM isn't connected")
    try:
        n = await import_deals(c)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {e}")
    return {"ok": True, "records_synced": n, "message": f"✅ Synced {n} deals from Zoho CRM."}


@router.post("/integrations/zoho/disconnect")
async def zoho_disconnect(user: User = Depends(require_owner)):
    c = await _conn(user.org_id)
    if not c:
        raise HTTPException(status_code=404, detail="Zoho CRM isn't connected")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(f"{c['accounts_server']}/oauth/v2/token/revoke",
                              params={"token": decrypt(c["refresh_token_encrypted"])})
    except Exception as e:
        logger.warning(f"[zoho] revoke failed for {user.org_id}: {e}")
    forget(c)
    await db.business_connections.delete_one({"org_id": user.org_id, "platform": "zoho", "provider": PROVIDER})
    removed = await db.deals.delete_many({"org_id": user.org_id, "source": "zoho", "synced": True,
                                          "provider": {"$ne": "scalekit"}})
    return {"ok": True, "records_removed": removed.deleted_count,
            "message": f"Zoho CRM disconnected — removed {removed.deleted_count} synced deals."}
