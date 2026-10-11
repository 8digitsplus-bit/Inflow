"""Live CRM credentials for write-back + sync.

Decrypts stored secrets and, for connections that use app credentials, mints a
short-lived access token with an in-memory cache:
  - Salesforce (client-credentials flow): Consumer Key/Secret + My Domain
  - Zoho CRM (refresh-token flow): refresh token + client id/secret + data center
Everything else returns the stored token as-is. Returns {"token", "instance_url"}
plus "error" when a token couldn't be minted (never raises).
"""
import time

from utils.crypto import decrypt

_cache: dict = {}


def _dec(v) -> str:
    try:
        return decrypt(v) if v else ""
    except Exception:
        return ""


def _mints(conn: dict) -> bool:
    p = conn.get("platform")
    return p == "zoho" or (p == "salesforce" and bool(conn.get("client_id")))


async def crm_creds(conn: dict) -> dict:
    if not conn:
        return {"token": "", "instance_url": ""}
    if not _mints(conn):
        return {"token": _dec(conn.get("api_key_encrypted")), "instance_url": conn.get("instance_url", "")}
    key = conn.get("connection_id") or f"{conn.get('org_id')}:{conn.get('platform')}"
    hit = _cache.get(key)
    if hit and hit[1] > time.time():
        return hit[0]
    try:
        if conn["platform"] == "zoho":
            from routes.zoho_integration import exchange_token
            t = await exchange_token(_dec(conn.get("api_key_encrypted")), conn.get("client_id", ""),
                                     _dec(conn.get("client_secret_encrypted")), conn.get("instance_url", "com"))
            creds, ttl = {"token": t["access_token"], "instance_url": t["api_domain"]}, int(t.get("expires_in") or 3600) - 300
        else:
            from routes.salesforce_integration import client_credentials_token
            t = await client_credentials_token(conn.get("login_domain") or conn.get("instance_url", ""),
                                               conn.get("client_id", ""), _dec(conn.get("client_secret_encrypted")))
            creds, ttl = {"token": t["access_token"], "instance_url": t["instance_url"]}, 600
    except Exception as e:
        return {"token": "", "instance_url": conn.get("instance_url", ""), "error": str(e)}
    _cache[key] = (creds, time.time() + max(60, ttl))
    return creds


def forget(conn: dict):
    _cache.pop(conn.get("connection_id") or f"{conn.get('org_id')}:{conn.get('platform')}", None)
