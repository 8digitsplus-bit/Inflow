"""Live CRM credentials for write-back + sync.

Decrypts stored secrets and, for Salesforce client-credentials connections, mints
a short-lived access token with an in-memory cache. Zoho CRM is connected via
Scalekit, so its creds are just the Scalekit connected-account id. Everything else
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
    if conn.get("platform") == "zoho":
        if conn.get("provider") == "scalekit" and conn.get("scalekit_account_id"):
            return {"token": "", "instance_url": "", "scalekit_account_id": conn["scalekit_account_id"]}
        return {"token": "", "instance_url": "",
                "error": "Zoho CRM now connects via Scalekit. Reconnect it with one click on the Integrations page."}
    if not (conn.get("platform") == "salesforce" and conn.get("client_id")):
        return {"token": _dec(conn.get("api_key_encrypted")), "instance_url": conn.get("instance_url", "")}
    key = conn.get("connection_id") or f"{conn.get('org_id')}:{conn.get('platform')}"
    hit = _cache.get(key)
    if hit and hit[1] > time.time():
        return hit[0]
    try:
        from routes.salesforce_integration import client_credentials_token
        t = await client_credentials_token(conn.get("login_domain") or conn.get("instance_url", ""),
                                           conn.get("client_id", ""), _dec(conn.get("client_secret_encrypted")))
        creds = {"token": t["access_token"], "instance_url": t["instance_url"]}
    except Exception as e:
        return {"token": "", "instance_url": conn.get("instance_url", ""), "error": str(e)}
    _cache[key] = (creds, time.time() + 600)
    return creds


def forget(conn: dict):
    _cache.pop(conn.get("connection_id") or f"{conn.get('org_id')}:{conn.get('platform')}", None)
