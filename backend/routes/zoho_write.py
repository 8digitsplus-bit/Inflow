"""Zoho CRM v8 write-back client via Scalekit AgentKit tools (Action Workspace,
deal room, Outreach, High-Intent). Scalekit owns the OAuth + token refresh.

creds = {"scalekit_account_id"} from utils.crm_auth.
All functions return {"ok": bool, ...} instead of raising.

Mapping to the workspace action kinds:
  note  -> Notes (parent = Deal / Contact)
  task  -> Tasks (What_Id + $se_module=Deals, or Who_Id = Contact)
  call  -> Calls (Outbound/Inbound, completed, 5 min)
  email -> Note titled "Email: <subject>" (Zoho has no logged-email record)
  deal  -> Deals (Deal_Name, Amount, Stage, Closing_Date, Contact_Name)
  offer -> Note titled "Offer" on the deal
"""
import re
from datetime import datetime, timezone, timedelta

from routes.scalekit_integration import _sk_post

PRIORITY = {"LOW": "Low", "MEDIUM": "Normal", "HIGH": "High"}
SCOPE_HINT = "ZohoCRM.modules.ALL, ZohoCRM.settings.fields.READ, ZohoCRM.users.READ"
ZOHO_CODES = ("INVALID_TOKEN", "AUTHENTICATION_FAILURE", "OAUTH_SCOPE_MISMATCH", "NO_PERMISSION", "MANDATORY_NOT_FOUND")
RECONNECT = "Zoho CRM isn't connected. Connect it with one click (via Scalekit) on the Integrations page."


def _unauth(creds: dict) -> dict:
    return {"ok": False, "code": 401, "error": creds.get("error") or RECONNECT}


def _err(status: int, j) -> dict:
    item = (j.get("data") or [{}])[0] if isinstance(j, dict) and isinstance(j.get("data"), list) else (j if isinstance(j, dict) else {})
    code, msg = item.get("code", ""), item.get("message", "")
    if status == 401 or code in ("INVALID_TOKEN", "AUTHENTICATION_FAILURE"):
        return {"ok": False, "code": 401, "error": "Zoho CRM authentication failed. Reconnect Zoho CRM on the Integrations page."}
    if code == "OAUTH_SCOPE_MISMATCH":
        return {"ok": False, "code": 403, "error": f"The Zoho connection is missing scopes. Add {SCOPE_HINT} to the Scalekit connection and reconnect."}
    if code == "NO_PERMISSION" or status == 403:
        return {"ok": False, "code": 403, "error": "Your Zoho user lacks permission for this action."}
    if code == "MANDATORY_NOT_FOUND":
        field = (item.get("details") or {}).get("api_name", "a required field")
        return {"ok": False, "code": status, "error": f"Zoho requires '{field}' for this record."}
    return {"ok": False, "code": status, "error": msg or f"Zoho CRM returned status {status}"}


def _sk_err(status: int, j: dict) -> dict:
    msg = str(j.get("message") or j.get("error") or "")
    up = msg.upper()
    for code in ZOHO_CODES:
        if code in up:
            return _err(status, {"code": code, "message": msg})
    if "CONNECTED ACCOUNT" in up or status == 401:
        return {"ok": False, "code": 401, "error": "Zoho CRM's Scalekit connection isn't active. Reconnect Zoho CRM on the Integrations page."}
    return {"ok": False, "code": status, "error": f"Zoho CRM (via Scalekit) failed: {msg[:200] or f'status {status}'}"}


async def _tool(creds: dict, name: str, params: dict):
    acc = (creds or {}).get("scalekit_account_id")
    if not acc:
        return None, _unauth(creds or {})
    try:
        r = await _sk_post("/api/v1/execute_tool", {"connected_account_id": acc, "tool_name": name, "params": params})
    except Exception as e:
        return None, {"ok": False, "error": f"Could not reach Zoho CRM via Scalekit: {e}"}
    try:
        j = r.json() if r.content else {}
    except Exception:
        j = {}
    if r.status_code >= 400:
        return None, _sk_err(r.status_code, j if isinstance(j, dict) else {})
    data = (j.get("data") if isinstance(j, dict) else None) or {}
    if isinstance(data, dict) and str(data.get("status", "")).lower() == "error":
        return None, _err(400, data)
    return data, None


async def _save(creds: dict, tool: str, params: dict) -> dict:
    j, err = await _tool(creds, tool, params)
    if err:
        return err
    items = j.get("data") if isinstance(j, dict) else None
    item = (items or [{}])[0] if isinstance(items, list) else (j if isinstance(j, dict) else {})
    status = str(item.get("status", "")).lower()
    rid = (item.get("details") or {}).get("id") or item.get("id")
    if status == "error" or (status != "success" and not rid):
        return _err(400, j)
    return {"ok": True, "id": str(rid or "")}


def _rel(ttype: str, tid: str) -> dict:
    if not tid:
        return {}
    if ttype == "deal":
        return {"What_Id": {"id": str(tid)}, "$se_module": "Deals"}
    if ttype == "contact":
        return {"Who_Id": {"id": str(tid)}}
    return {}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _rid(v) -> str:
    return re.sub(r"[^0-9]", "", str(v))


# ------------------------------------------------------------------ reads
async def list_targets(creds: dict, limit: int = 100) -> dict:
    out = {"deals": [], "contacts": [], "error": None}
    j, err = await _tool(creds, "zohocrm_v8_deals_list", {"fields": "id,Deal_Name,Amount,Stage", "per_page": limit,
                                                         "sort_by": "Modified_Time", "sort_order": "desc"})
    if err:
        out["error"] = err["error"]
        return out
    for d in (j or {}).get("data") or []:
        out["deals"].append({"id": str(d.get("id")), "label": d.get("Deal_Name") or f"Deal {d.get('id')}",
                             "amount": d.get("Amount"), "stage": d.get("Stage")})
    jc, errc = await _tool(creds, "zohocrm_v8_contacts_list", {"fields": "id,Full_Name,Email", "per_page": limit})
    if not errc:
        for c in (jc or {}).get("data") or []:
            out["contacts"].append({"id": str(c.get("id")), "label": c.get("Full_Name") or c.get("Email") or f"Contact {c.get('id')}",
                                    "email": c.get("Email")})
    return out


async def list_pipelines(creds: dict) -> dict:
    """Expose the Deals Stage picklist as one synthetic pipeline (like Salesforce)."""
    j, err = await _tool(creds, "zohocrm_v8_module_fields_get", {"module": "Deals"})
    stages = []
    if not err:
        for f in (j or {}).get("fields") or []:
            if f.get("api_name") == "Stage":
                stages = [{"id": v.get("actual_value") or v.get("display_value"), "label": v.get("display_value")}
                          for v in f.get("pick_list_values") or [] if v.get("display_value")]
    return {"pipelines": [{"id": "default", "label": "Deal stages", "stages": stages}], "error": None}


async def get_deal(creds: dict, deal_id: str) -> dict:
    j, err = await _tool(creds, "zohocrm_v8_deal_get", {"record_id": _rid(deal_id)})
    if err:
        return {**err, "fields": {}}
    d = ((j or {}).get("data") or [{}])[0]
    return {"ok": True, "fields": {"dealname": d.get("Deal_Name") or "", "amount": str(d.get("Amount") or ""),
                                   "dealstage": d.get("Stage") or ""}}


async def update_deal(creds: dict, deal_id: str, fields: dict) -> dict:
    rec = {"record_id": _rid(deal_id)}
    if fields.get("dealname"):
        rec["Deal_Name"] = fields["dealname"]
    if fields.get("amount") not in (None, ""):
        try:
            rec["Amount"] = float(fields["amount"])
        except (ValueError, TypeError):
            pass
    if fields.get("dealstage"):
        rec["Stage"] = fields["dealstage"]
    return await _save(creds, "zohocrm_v8_deal_update", rec)


# ------------------------------------------------------------------ writes
async def create_note(creds: dict, title: str, content: str, ttype: str, tid: str) -> dict:
    if not tid or ttype not in ("deal", "contact"):
        return {"ok": False, "error": "Zoho notes attach to a record — pick a deal or contact."}
    return await _save(creds, "zohocrm_v8_note_create", {
        "Note_Title": (title or "Note")[:120], "Note_Content": content or title or "Note",
        "parent_id": str(tid), "parent_module": "Deals" if ttype == "deal" else "Contacts"})


async def _create(creds: dict, module: str, record: dict) -> dict:
    return await _save(creds, "zohocrm_v8_record_create", {"module": module, "record": record})


async def create_task(creds: dict, title: str, body: str, priority: str = "MEDIUM", due: str = "",
                      owner_id: str = "", ttype: str = "", tid: str = "", done: bool = False) -> dict:
    rec = {"Subject": (title or "Follow up")[:250], "Status": "Completed" if done else "Not Started",
           "Priority": PRIORITY.get((priority or "").upper(), "Normal"), **_rel(ttype, tid)}
    if body:
        rec["Description"] = body
    if due:
        rec["Due_Date"] = str(due)[:10]
    if owner_id:
        rec["Owner"] = {"id": str(owner_id)}
    return await _create(creds, "Tasks", rec)


async def write(kind: str, creds: dict, payload: dict, target: dict) -> dict:
    p, tgt = payload or {}, target or {}
    ttype, tid = tgt.get("type"), tgt.get("id")
    if kind == "note":
        body = p.get("body") or ""
        return await create_note(creds, body.strip().split("\n")[0][:60] or "Note", body, ttype, tid)
    if kind == "task":
        return await create_task(creds, p.get("title"), p.get("body"), p.get("priority"), p.get("due_date"), "", ttype, tid)
    if kind == "call":
        rec = {"Subject": (p.get("title") or "Call")[:250],
               "Call_Type": "Inbound" if (p.get("direction") or "").upper() == "INBOUND" else "Outbound",
               "Call_Start_Time": (p.get("when") and f"{str(p['when'])[:10]}T12:00:00+00:00") or _now(),
               "Call_Duration": "05:00", **_rel(ttype, tid)}
        if p.get("notes"):
            rec["Description"] = p["notes"]
        return await _create(creds, "Calls", rec)
    if kind == "email":
        return await create_note(creds, f"Email: {p.get('subject') or ''}"[:120], p.get("text") or "", ttype, tid)
    if kind == "deal":
        rec = {"Deal_Name": (p.get("dealname") or "New deal")[:120], "Stage": p.get("dealstage") or "Qualification",
               "Closing_Date": str(p.get("closedate") or "")[:10] or (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")}
        if p.get("amount") not in (None, ""):
            try:
                rec["Amount"] = float(p["amount"])
            except (ValueError, TypeError):
                pass
        if p.get("contact_id"):
            rec["Contact_Name"] = str(p["contact_id"])
        return await _save(creds, "zohocrm_v8_deal_create", rec)
    if kind == "offer":
        if ttype != "deal" or not tid:
            return {"ok": False, "error": "Zoho offers attach to a deal — pick a deal as the target."}
        lines = [p.get("title") or "Offer"]
        if p.get("amount") not in (None, ""):
            lines.append(f"Amount: ${p['amount']}")
        if p.get("discount") not in (None, ""):
            lines.append(f"Discount: {p['discount']}%")
        if p.get("expiration"):
            lines.append(f"Valid until: {p['expiration']}")
        if p.get("notes"):
            lines.append(str(p["notes"]))
        return await create_note(creds, "Offer", "\n".join(lines), "deal", tid)
    return {"ok": False, "error": "This action isn't supported for Zoho CRM."}
