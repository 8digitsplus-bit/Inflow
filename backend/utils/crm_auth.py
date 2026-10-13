"""Live CRM credentials for write-back + sync.

Decrypts stored secrets and, for Salesforce client-credentials connections, mints
a short-lived access token with an in-memory cache; Zoho CRM (one-click OAuth) mints
one from its encrypted refresh token at the user's own data center. Everything else
returns the stored token as-is. Returns {"token", "instance_url"} plus "error"
when a token couldn't be minted (never raises).
"""
import time

from utils.crypto import decrypt

_cache: dict = {}


def _dec(v) -> str:
    try:
        return decrypt(v) if v else ""
    except Exception:
        return ""


async def crm_creds(conn: dict) -> dict:
    if not conn:
        return {"token": "", "instance_url": ""}
    zoho = conn.get("platform") == "zoho"
    if zoho and not (conn.get("provider") == "zoho_oauth" and conn.get("refresh_token_encrypted")):
        return {"token": "", "instance_url": "",
                "error": "Zoho CRM needs reconnecting. Click Connect Zoho CRM on the Integrations page."}
    if not zoho and not (conn.get("platform") == "salesforce" and conn.get("client_id")):
        return {"token": _dec(conn.get("api_key_encrypted")), "instance_url": conn.get("instance_url", "")}
    key = conn.get("connection_id") or f"{conn.get('org_id')}:{conn.get('platform')}"
    hit = _cache.get(key)
    if hit and hit[1] > time.time():
        return hit[0]
    try:
        if zoho:
            from routes.zoho_integration import refresh_access
            creds = await refresh_access(conn)
        else:
            from routes.salesforce_integration import client_credentials_token
            t = await client_credentials_token(conn.get("login_domain") or conn.get("instance_url", ""),
                                               conn.get("client_id", ""), _dec(conn.get("client_secret_encrypted")))
            creds = {"token": t["access_token"], "instance_url": t["instance_url"]}
    except Exception as e:
        return {"token": "", "instance_url": conn.get("instance_url", ""), "error": str(e)}
    _cache[key] = (creds, time.time() + (3000 if zoho else 600))
    return creds


def remember(conn: dict, creds: dict, ttl: int = 3000):
    _cache[conn.get("connection_id") or f"{conn.get('org_id')}:{conn.get('platform')}"] = (creds, time.time() + ttl)


def forget(conn: dict):
    _cache.pop(conn.get("connection_id") or f"{conn.get('org_id')}:{conn.get('platform')}", None)
