"""Salesforce REST write-back client (API v59.0) for the Action Workspace.

Uses the access token + instance_url the user already stored on connect. All
functions return a structured dict ({"ok": bool, ...}) instead of raising, so
the route layer can surface clean errors. Salesforce access tokens are short
lived (~2h) so a 401 is reported as a "reconnect Salesforce" message.

Mapping to the workspace action kinds:
  note  -> ContentNote + ContentDocumentLink (linked to Opportunity/Contact)
  task  -> Task (WhatId=Opportunity / WhoId=Contact)
  call  -> Task with TaskSubtype=Call, Status=Completed
  email -> Task with TaskSubtype=Email, Status=Completed
  deal  -> Opportunity (Name, Amount, StageName, CloseDate)
  offer -> Quote (Name, OpportunityId, Pricebook2Id from the standard price book)
"""
import base64
import httpx
from datetime import datetime, timezone, timedelta

SF_VERSION = "v59.0"
PRIORITY_MAP = {"LOW": "Low", "MEDIUM": "Normal", "HIGH": "High"}


def _instance(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if u and not u.startswith("http"):
        u = f"https://{u}"
    return u


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _err(status: int, msg: str = "") -> dict:
    if status == 401:
        return {"ok": False, "code": 401,
                "error": "Salesforce authentication failed or the access token expired. Reconnect Salesforce with a fresh access token."}
    if status == 403:
        return {"ok": False, "code": 403,
                "error": "Your Salesforce user lacks permission for this action. Check object/field-level security."}
    return {"ok": False, "code": status, "error": msg or f"Salesforce returned status {status}"}


def _parse_error(resp) -> str:
    try:
        j = resp.json()
    except Exception:
        return ""
    if isinstance(j, list) and j:
        return j[0].get("message") or j[0].get("errorCode") or ""
    if isinstance(j, dict):
        return j.get("message") or j.get("error_description") or ""
    return ""


async def _query(creds: dict, soql: str):
    token, inst = creds.get("token"), _instance(creds.get("instance_url"))
    if not token or not inst:
        return {"ok": False, "code": 401, "records": [],
                "error": "Salesforce isn't authenticated. Reconnect Salesforce."}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{inst}/services/data/{SF_VERSION}/query",
                                 headers=_headers(token), params={"q": soql})
    except Exception as e:
        return {"ok": False, "records": [], "error": f"Could not reach Salesforce: {e}"}
    if r.status_code == 200:
        return {"ok": True, "records": r.json().get("records", [])}
    e = _err(r.status_code, _parse_error(r))
    e["records"] = []
    return e


async def _create(creds: dict, obj: str, body: dict) -> dict:
    token, inst = creds.get("token"), _instance(creds.get("instance_url"))
    if not token or not inst:
        return {"ok": False, "code": 401,
                "error": "Salesforce isn't authenticated. Reconnect Salesforce with a valid access token."}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{inst}/services/data/{SF_VERSION}/sobjects/{obj}/",
                                  headers=_headers(token), json=body)
    except Exception as e:
        return {"ok": False, "error": f"Could not reach Salesforce: {e}"}
    if r.status_code in (200, 201):
        return {"ok": True, "id": (r.json() or {}).get("id")}
    return _err(r.status_code, _parse_error(r))


# ------------------------------------------------------------------ reads (pickers)
async def list_targets(creds: dict, limit: int = 50) -> dict:
    out = {"deals": [], "contacts": [], "error": None}
    q = await _query(creds, f"SELECT Id, Name, Amount, StageName FROM Opportunity ORDER BY CreatedDate DESC LIMIT {limit}")
    if not q.get("ok"):
        out["error"] = q.get("error")
        return out
    for rec in q["records"]:
        out["deals"].append({"id": rec.get("Id"), "label": rec.get("Name") or f"Opportunity {rec.get('Id')}",
                             "amount": rec.get("Amount"), "stage": rec.get("StageName")})
    qc = await _query(creds, f"SELECT Id, Name, Email FROM Contact ORDER BY CreatedDate DESC LIMIT {limit}")
    if qc.get("ok"):
        for c in qc["records"]:
            out["contacts"].append({"id": c.get("Id"), "label": c.get("Name") or c.get("Email") or f"Contact {c.get('Id')}",
                                    "email": c.get("Email")})
    return out


async def list_pipelines(creds: dict) -> dict:
    """Salesforce has no pipelines; expose the OpportunityStage picklist as one synthetic pipeline."""
    q = await _query(creds, "SELECT MasterLabel FROM OpportunityStage WHERE IsActive = true ORDER BY SortOrder")
    stages = []
    if q.get("ok"):
        for s in q["records"]:
            lbl = s.get("MasterLabel")
            if lbl:
                stages.append({"id": lbl, "label": lbl})
    return {"pipelines": [{"id": "default", "label": "Opportunity stages", "stages": stages}], "error": None}


# ------------------------------------------------------------------ writes
async def _create_note(creds: dict, text: str, linked_id: str) -> dict:
    title = (text or "Note").strip().split("\n")[0][:60] or "Note"
    content = base64.b64encode((text or "").encode("utf-8")).decode("ascii")
    note = await _create(creds, "ContentNote", {"Title": title, "Content": content})
    if not note.get("ok"):
        return note
    if linked_id:
        link = await _create(creds, "ContentDocumentLink", {
            "ContentDocumentId": note["id"], "LinkedEntityId": linked_id,
            "ShareType": "V", "Visibility": "AllUsers",
        })
        if not link.get("ok"):
            return link
    return note


async def _create_task(creds: dict, title: str, description: str, priority: str,
                       activity_date: str, ttype: str, tid: str,
                       subtype: str = None, status: str = "Not Started") -> dict:
    body = {"Subject": (title or "Follow up")[:255], "Status": status,
            "Priority": PRIORITY_MAP.get((priority or "").upper(), "Normal")}
    if description:
        body["Description"] = description
    if activity_date:
        body["ActivityDate"] = str(activity_date)[:10]
    if subtype:
        body["TaskSubtype"] = subtype
    if ttype == "deal" and tid:
        body["WhatId"] = tid
    elif ttype == "contact" and tid:
        body["WhoId"] = tid
    return await _create(creds, "Task", body)


async def _create_opportunity(creds: dict, p: dict) -> dict:
    body = {"Name": (p.get("dealname") or "New opportunity")[:120]}
    if p.get("amount") not in (None, ""):
        try:
            body["Amount"] = float(p["amount"])
        except (ValueError, TypeError):
            pass
    body["StageName"] = p.get("dealstage") or "Prospecting"
    cd = p.get("closedate") or ""
    body["CloseDate"] = str(cd)[:10] if cd else (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
    return await _create(creds, "Opportunity", body)


async def _create_quote(creds: dict, p: dict, opportunity_id: str) -> dict:
    if not opportunity_id:
        return {"ok": False, "error": "Salesforce quotes attach to an opportunity — pick a deal as the target."}
    pb = await _query(creds, "SELECT Id FROM Pricebook2 WHERE IsStandard = true AND IsActive = true LIMIT 1")
    if not pb.get("ok"):
        return pb
    recs = pb.get("records") or []
    if not recs:
        return {"ok": False, "error": "No active standard price book found in Salesforce. Ask an admin to activate the Standard Price Book, then retry."}
    body = {"Name": (p.get("title") or p.get("dealname") or "Quote")[:80],
            "OpportunityId": opportunity_id, "Pricebook2Id": recs[0].get("Id")}
    exp = p.get("expiration") or ""
    if exp:
        body["ExpirationDate"] = str(exp)[:10]
    return await _create(creds, "Quote", body)


async def write(kind: str, creds: dict, payload: dict, target: dict) -> dict:
    p = payload or {}
    tgt = target or {}
    ttype, tid = tgt.get("type"), tgt.get("id")
    if kind == "note":
        return await _create_note(creds, p.get("body") or "", tid)
    if kind == "task":
        return await _create_task(creds, p.get("title"), p.get("body"), p.get("priority"),
                                  p.get("due_date"), ttype, tid, subtype=None, status="Not Started")
    if kind == "call":
        return await _create_task(creds, p.get("title"), p.get("notes"), None,
                                  p.get("when"), ttype, tid, subtype="Call", status="Completed")
    if kind == "email":
        return await _create_task(creds, p.get("subject"), p.get("text"), None,
                                  p.get("when"), ttype, tid, subtype="Email", status="Completed")
    if kind == "deal":
        return await _create_opportunity(creds, p)
    if kind == "offer":
        return await _create_quote(creds, p, tid)
    return {"ok": False, "error": "This action isn't supported for Salesforce."}
