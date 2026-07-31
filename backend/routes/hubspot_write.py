"""HubSpot CRM v3 write-back client (Private App token).

Powers the Action Workspace: create notes, tasks, log activities (call/email),
and create deals — each associated to a live HubSpot record. Read helpers list
deals/contacts/pipelines so the user can pick a real association target.

All functions return a structured dict ({"ok": bool, ...}) rather than raising,
so the route layer can surface clear, human-readable errors (invalid token,
missing write scopes, etc.). Nothing here executes without an explicit call from
the confirm step.
"""
import httpx
from datetime import datetime, timezone

HUBSPOT_BASE = "https://api.hubapi.com"

# Default HUBSPOT_DEFINED association typeIds (from-object -> to-object)
ASSOC_TYPES = {
    ("note", "contact"): 202, ("note", "deal"): 214,
    ("task", "contact"): 204, ("task", "deal"): 216,
    ("call", "contact"): 194, ("call", "deal"): 206,
    ("email", "contact"): 198, ("email", "deal"): 210,
    ("deal", "contact"): 3,
}


def _assoc(kind: str, target_type: str, target_id: str) -> list:
    tid = ASSOC_TYPES.get((kind, target_type))
    if not tid or not target_id:
        return []
    return [{
        "to": {"id": str(target_id)},
        "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": tid}],
    }]


def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def to_ms(value) -> int:
    """Best-effort convert an ISO date/datetime string to epoch ms; default now."""
    if not value:
        return now_ms()
    try:
        s = str(value)
        if len(s) == 10:  # date only
            s = s + "T00:00:00+00:00"
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return now_ms()


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _post(token: str, path: str, payload: dict) -> dict:
    if not token:
        return {"ok": False, "code": 401,
                "error": "HubSpot isn't authenticated. Reconnect HubSpot with a valid Private App token that has write access."}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{HUBSPOT_BASE}{path}", headers=_headers(token), json=payload)
    except httpx.TimeoutException:
        return {"ok": False, "error": "HubSpot request timed out. Please try again."}
    except Exception as e:
        return {"ok": False, "error": f"Could not reach HubSpot: {e}"}

    if r.status_code in (200, 201):
        d = r.json()
        return {"ok": True, "id": d.get("id"), "raw": d}

    try:
        err = r.json()
    except Exception:
        err = {}
    ctx = err.get("context") or {}
    if r.status_code == 401:
        return {"ok": False, "code": 401,
                "error": "HubSpot authentication failed. Reconnect HubSpot with a valid Private App token."}
    if r.status_code == 403:
        missing = ctx.get("requiredScopes") or ctx.get("missingScopes") or []
        if isinstance(missing, str):
            missing = [missing]
        return {"ok": False, "code": 403, "missing_scopes": missing,
                "error": "Your HubSpot token is missing write permission. Reconnect HubSpot with write scopes (deals + contacts write)."}
    return {"ok": False, "code": r.status_code,
            "error": err.get("message") or f"HubSpot returned status {r.status_code}"}


# ------------------------------------------------------------------ reads (target pickers)
async def list_targets(token: str, limit: int = 50) -> dict:
    """Live deals + contacts (with real HubSpot object IDs) for association picking."""
    out = {"deals": [], "contacts": [], "error": None}
    if not token:
        out["error"] = "HubSpot isn't authenticated. Reconnect HubSpot with a valid Private App token."
        return out
    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            rd = await client.get(f"{HUBSPOT_BASE}/crm/v3/objects/deals", headers=_headers(token),
                                  params={"limit": limit, "properties": "dealname,amount,dealstage,pipeline"})
        except Exception as e:
            out["error"] = f"Could not reach HubSpot: {e}"
            return out
        if rd.status_code == 401:
            out["error"] = "HubSpot authentication failed. Reconnect HubSpot with a valid Private App token."
            return out
        if rd.status_code == 403:
            out["error"] = "Your HubSpot token can't read records. Reconnect HubSpot with CRM read scopes."
            return out
        if rd.status_code == 200:
            for d in rd.json().get("results", []):
                p = d.get("properties", {})
                out["deals"].append({"id": d.get("id"), "label": p.get("dealname") or f"Deal {d.get('id')}",
                                     "amount": p.get("amount"), "stage": p.get("dealstage")})
        try:
            rc = await client.get(f"{HUBSPOT_BASE}/crm/v3/objects/contacts", headers=_headers(token),
                                  params={"limit": limit, "properties": "firstname,lastname,email"})
            if rc.status_code == 200:
                for c in rc.json().get("results", []):
                    p = c.get("properties", {})
                    name = (f"{p.get('firstname', '')} {p.get('lastname', '')}").strip() or p.get("email") or f"Contact {c.get('id')}"
                    out["contacts"].append({"id": c.get("id"), "label": name, "email": p.get("email")})
        except Exception:
            pass
    return out


async def list_deal_pipelines(token: str) -> dict:
    """Deal pipelines + stages (internal ids) for the create-deal form."""
    if not token:
        return {"pipelines": [], "error": None}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{HUBSPOT_BASE}/crm/v3/pipelines/deals", headers=_headers(token))
        if r.status_code != 200:
            return {"pipelines": [], "error": None}
        out = []
        for p in r.json().get("results", []):
            out.append({"id": p.get("id"), "label": p.get("label"),
                        "stages": [{"id": s.get("id"), "label": s.get("label")} for s in p.get("stages", [])]})
        return {"pipelines": out, "error": None}
    except Exception:
        return {"pipelines": [], "error": None}


# ------------------------------------------------------------------ writes
async def create_note(token, body, target_type, target_id, when=None) -> dict:
    payload = {"properties": {"hs_timestamp": str(to_ms(when)), "hs_note_body": body or ""}}
    a = _assoc("note", target_type, target_id)
    if a:
        payload["associations"] = a
    return await _post(token, "/crm/v3/objects/notes", payload)


async def create_task(token, title, body, priority, due_date, target_type, target_id) -> dict:
    props = {"hs_timestamp": str(to_ms(due_date)), "hs_task_subject": title or "Follow up",
             "hs_task_status": "NOT_STARTED", "hs_task_priority": (priority or "MEDIUM").upper()}
    if body:
        props["hs_task_body"] = body
    payload = {"properties": props}
    a = _assoc("task", target_type, target_id)
    if a:
        payload["associations"] = a
    return await _post(token, "/crm/v3/objects/tasks", payload)


async def log_call(token, title, notes, when, direction, target_type, target_id) -> dict:
    props = {"hs_timestamp": str(to_ms(when)), "hs_call_title": title or "Call",
             "hs_call_status": "COMPLETED", "hs_call_direction": (direction or "OUTBOUND").upper()}
    if notes:
        props["hs_call_body"] = notes
    payload = {"properties": props}
    a = _assoc("call", target_type, target_id)
    if a:
        payload["associations"] = a
    return await _post(token, "/crm/v3/objects/calls", payload)


async def log_email(token, subject, text, when, target_type, target_id) -> dict:
    props = {"hs_timestamp": str(to_ms(when)), "hs_email_subject": subject or "Email",
             "hs_email_text": text or "", "hs_email_status": "SENT", "hs_email_direction": "EMAIL"}
    payload = {"properties": props}
    a = _assoc("email", target_type, target_id)
    if a:
        payload["associations"] = a
    return await _post(token, "/crm/v3/objects/emails", payload)


async def create_deal(token, dealname, amount=None, dealstage=None, pipeline=None, close_date=None, contact_id=None) -> dict:
    props = {"dealname": dealname}
    if amount not in (None, ""):
        props["amount"] = str(amount)
    if dealstage:
        props["dealstage"] = dealstage
    if pipeline:
        props["pipeline"] = pipeline
    if close_date:
        props["closedate"] = str(close_date)[:10]
    payload = {"properties": props}
    a = _assoc("deal", "contact", contact_id) if contact_id else []
    if a:
        payload["associations"] = a
    return await _post(token, "/crm/v3/objects/deals", payload)


async def create_quote(token, title, expiration=None, deal_id=None) -> dict:
    """Create a draft HubSpot Quote (the "offer") associated to a deal."""
    props = {"hs_title": title or "Quote", "hs_status": "DRAFT"}
    if expiration:
        props["hs_expiration_date"] = str(expiration)[:10]
    payload = {"properties": props}
    if deal_id:
        # HUBSPOT_DEFINED quote -> deal association typeId is 64
        payload["associations"] = [{
            "to": {"id": str(deal_id)},
            "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 64}],
        }]
    return await _post(token, "/crm/v3/objects/quotes", payload)


# ------------------------------------------------------------------ deal read/update + activity (individual workspace)
async def _patch(token: str, path: str, payload: dict) -> dict:
    if not token:
        return {"ok": False, "code": 401,
                "error": "HubSpot isn't authenticated. Reconnect HubSpot with a valid Private App token that has write access."}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.patch(f"{HUBSPOT_BASE}{path}", headers=_headers(token), json=payload)
    except Exception as e:
        return {"ok": False, "error": f"Could not reach HubSpot: {e}"}
    if r.status_code in (200, 201):
        d = r.json()
        return {"ok": True, "id": d.get("id"), "raw": d}
    try:
        err = r.json()
    except Exception:
        err = {}
    if r.status_code == 401:
        return {"ok": False, "code": 401, "error": "HubSpot authentication failed. Reconnect HubSpot with a valid Private App token."}
    if r.status_code == 403:
        ctx = err.get("context") or {}
        missing = ctx.get("requiredScopes") or ctx.get("missingScopes") or []
        if isinstance(missing, str):
            missing = [missing]
        return {"ok": False, "code": 403, "missing_scopes": missing,
                "error": "Your HubSpot token is missing write permission. Reconnect HubSpot with deal write scope."}
    return {"ok": False, "code": r.status_code, "error": err.get("message") or f"HubSpot returned status {r.status_code}"}


async def get_deal(token: str, deal_id: str) -> dict:
    if not token or not deal_id:
        return {"ok": False, "error": "Not linked", "fields": {}}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{HUBSPOT_BASE}/crm/v3/objects/deals/{deal_id}", headers=_headers(token),
                                 params={"properties": "dealname,amount,dealstage,pipeline,closedate"})
    except Exception as e:
        return {"ok": False, "error": f"Could not reach HubSpot: {e}", "fields": {}}
    if r.status_code == 200:
        return {"ok": True, "fields": r.json().get("properties", {})}
    if r.status_code == 401:
        return {"ok": False, "error": "HubSpot authentication failed. Reconnect HubSpot with a valid Private App token.", "fields": {}}
    return {"ok": False, "error": f"HubSpot returned status {r.status_code}", "fields": {}}


async def update_deal(token: str, deal_id: str, fields: dict) -> dict:
    return await _patch(token, f"/crm/v3/objects/deals/{deal_id}", {"properties": fields})


_ENGAGEMENTS = [("notes", "hs_note_body", "note"), ("calls", "hs_call_title", "call"),
                ("emails", "hs_email_subject", "email"), ("tasks", "hs_task_subject", "task")]


async def list_deal_activity(token: str, deal_id: str, limit: int = 10) -> list:
    """Best-effort pull of a deal's HubSpot engagements for the merged timeline."""
    if not token or not deal_id:
        return []
    items = []
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            for obj_type, prop, kind in _ENGAGEMENTS:
                ra = await client.get(f"{HUBSPOT_BASE}/crm/v4/objects/deals/{deal_id}/associations/{obj_type}",
                                     headers=_headers(token), params={"limit": limit})
                if ra.status_code != 200:
                    continue
                ids = [str(r.get("toObjectId")) for r in ra.json().get("results", []) if r.get("toObjectId")][:limit]
                if not ids:
                    continue
                rb = await client.post(f"{HUBSPOT_BASE}/crm/v3/objects/{obj_type}/batch/read",
                                      headers=_headers(token),
                                      json={"properties": [prop, "hs_timestamp"], "inputs": [{"id": i} for i in ids]})
                if rb.status_code != 200:
                    continue
                for o in rb.json().get("results", []):
                    p = o.get("properties", {})
                    items.append({"source": "hubspot", "kind": kind,
                                  "detail": p.get(prop) or kind, "ts": p.get("hs_timestamp") or o.get("createdAt")})
    except Exception:
        return items
    return items
