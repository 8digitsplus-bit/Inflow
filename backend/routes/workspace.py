"""Action Workspace — two-way "System of Action" write-backs to connected tools.

InFlow's read-only data becomes actionable here: users take control and push
changes back into their CRM. Phase 1 targets HubSpot with four write actions —
add a note, create a task, log an activity (call/email), and create a new deal —
each with a human-in-the-loop preview + confirm before anything executes.

Flow: compose (optional AI draft) -> save as DRAFT -> preview -> Confirm/execute
(real HubSpot write) -> logged to history. If HubSpot isn't authenticated or the
token lacks write scopes, the action is saved as `failed` with a clear reason and
can be retried after reconnecting — nothing is silently dropped.

Paid-tier gated; the execute/write steps are owner-only. Architecture is provider
generic so more integrations can plug in later (currently: hubspot).
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from models import User
from dependencies import get_current_user, org_filter, require_paid, require_paid_owner
from utils.crypto import decrypt
from routes.upsell import _ai_text
from routes import hubspot_write as hs

logger = logging.getLogger(__name__)
router = APIRouter()

WRITE_PROVIDERS = {"hubspot": "HubSpot"}
KINDS = {"note", "task", "call", "email", "deal"}
TARGET_KINDS = {"note", "task", "call", "email"}  # require an association target


# ------------------------------------------------------------------ models
class Target(BaseModel):
    type: Optional[str] = None   # deal | contact
    id: Optional[str] = None
    label: Optional[str] = None


class ActionCreate(BaseModel):
    provider: str = "hubspot"
    kind: str
    target: Optional[Target] = None
    payload: dict = {}
    ai_used: bool = False


class AIDraftReq(BaseModel):
    kind: str
    target_label: Optional[str] = ""
    context: Optional[str] = ""
    tone: Optional[str] = "professional"


# ------------------------------------------------------------------ helpers
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


async def _hs_conn(user: User) -> Optional[dict]:
    return await db.business_connections.find_one(
        {**org_filter(user), "platform": "hubspot"}, {"_id": 0}
    )


def _hs_token(conn: Optional[dict]) -> str:
    if not conn:
        return ""
    enc = conn.get("api_key_encrypted")
    try:
        return decrypt(enc) if enc else ""
    except Exception:
        return ""


async def _log(action_id: str, user: User, atype: str, detail: str):
    await db.workspace_actions.update_one(
        {"action_id": action_id},
        {"$push": {"activity": {"ts": _now(), "type": atype, "detail": detail,
                                "by": user.name or user.email}}},
    )


# ------------------------------------------------------------------ status
@router.get("/workspace/status")
async def workspace_status(user: User = Depends(require_paid)):
    conns = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": list(WRITE_PROVIDERS)}}, {"_id": 0}
    ).to_list(20)
    providers = []
    for c in conns:
        providers.append({
            "platform": c["platform"],
            "name": WRITE_PROVIDERS.get(c["platform"], c["platform"]),
            "connected": True,
            "account_name": c.get("account_name", ""),
            "has_token": bool(c.get("api_key_encrypted")),
        })
    drafts = await db.workspace_actions.count_documents({**org_filter(user), "status": "draft"})
    executed = await db.workspace_actions.count_documents({**org_filter(user), "status": "executed"})
    return {
        "is_owner": user.role == "owner",
        "providers": providers,
        "drafts": drafts,
        "executed": executed,
    }


# ------------------------------------------------------------------ live targets
@router.get("/workspace/targets")
async def workspace_targets(provider: str = "hubspot", user: User = Depends(require_paid)):
    if provider != "hubspot":
        raise HTTPException(status_code=400, detail="Unsupported provider")
    conn = await _hs_conn(user)
    if not conn:
        raise HTTPException(status_code=400, detail="Connect HubSpot first to load records.")
    token = _hs_token(conn)
    targets = await hs.list_targets(token)
    pipelines = await hs.list_deal_pipelines(token)
    return {
        "deals": targets["deals"],
        "contacts": targets["contacts"],
        "pipelines": pipelines["pipelines"],
        "error": targets.get("error"),
    }


# ------------------------------------------------------------------ AI draft
@router.post("/workspace/ai-draft")
async def workspace_ai_draft(body: AIDraftReq, user: User = Depends(require_paid)):
    if body.kind not in KINDS:
        raise HTTPException(status_code=400, detail="Invalid action kind")
    who = body.target_label or "this account"
    ctx = (body.context or "").strip() or "a recent sales interaction"
    tone = body.tone or "professional"
    if body.kind == "note":
        system = "You write concise, factual CRM notes for sales reps. Output ONLY the note body (2-4 sentences), no preamble."
        prompt = f"Write a CRM note about {who}. Context: {ctx}. Tone: {tone}."
        fb = f"Note re: {who}. {ctx}. Logged for the record and next-step follow-up."
        text, _ = await _ai_text(system, prompt, f"ws_note_{user.user_id}", fb)
        return {"content": text.strip()}
    if body.kind == "task":
        system = ("You create clear sales follow-up tasks. Respond with a first line 'Title: <short task title>' "
                  "then a blank line, then 1-2 sentences of task detail. No other text.")
        prompt = f"Create a follow-up task for {who}. Context: {ctx}. Tone: {tone}."
        fb = f"Title: Follow up with {who}\n\nReach out regarding {ctx} and confirm next steps."
        text, _ = await _ai_text(system, prompt, f"ws_task_{user.user_id}", fb)
        return {"content": text.strip()}
    if body.kind == "call":
        system = ("You write brief call-logging notes for a CRM. Respond with a first line 'Title: <short call title>' "
                  "then a blank line, then 2-3 sentence call summary. No other text.")
        prompt = f"Summarize a sales call with {who}. Context: {ctx}. Tone: {tone}."
        fb = f"Title: Call with {who}\n\nDiscussed {ctx}. Positive engagement; agreed to follow up with next steps."
        text, _ = await _ai_text(system, prompt, f"ws_call_{user.user_id}", fb)
        return {"content": text.strip()}
    if body.kind == "email":
        system = ("You draft short, effective sales emails. Respond with a first line 'Subject: <subject>' then a blank "
                  "line, then the email body. No other text, no markdown.")
        prompt = f"Draft an email to {who}. Context: {ctx}. Tone: {tone}."
        fb = f"Subject: Following up — {who}\n\nHi there,\n\nGreat connecting about {ctx}. Sharing a quick recap and next steps — happy to jump on a short call this week.\n\nBest regards"
        text, _ = await _ai_text(system, prompt, f"ws_email_{user.user_id}", fb)
        return {"content": text.strip()}
    raise HTTPException(status_code=400, detail="AI drafting isn't available for this action kind")


# ------------------------------------------------------------------ actions CRUD
def _validate_action(kind: str, target: Optional[Target], payload: dict):
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail="Invalid action kind")
    if kind in TARGET_KINDS:
        if not target or target.type not in ("deal", "contact") or not target.id:
            raise HTTPException(status_code=400, detail="Pick a HubSpot record (deal or contact) to attach this to.")
    if kind == "note" and not (payload.get("body") or "").strip():
        raise HTTPException(status_code=400, detail="Note body is required")
    if kind == "task" and not (payload.get("title") or "").strip():
        raise HTTPException(status_code=400, detail="Task title is required")
    if kind == "call" and not (payload.get("title") or "").strip():
        raise HTTPException(status_code=400, detail="Call title is required")
    if kind == "email" and not (payload.get("subject") or "").strip():
        raise HTTPException(status_code=400, detail="Email subject is required")
    if kind == "deal" and not (payload.get("dealname") or "").strip():
        raise HTTPException(status_code=400, detail="Deal name is required")


@router.post("/workspace/actions")
async def create_action(body: ActionCreate, user: User = Depends(require_paid_owner)):
    if body.provider not in WRITE_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    _validate_action(body.kind, body.target, body.payload or {})
    tgt = (body.target.dict() if body.target else {"type": None, "id": None, "label": None})
    now = _now()
    doc = {
        "action_id": f"wsa_{uuid.uuid4().hex[:12]}",
        "org_id": user.org_id,
        "provider": body.provider,
        "kind": body.kind,
        "target": tgt,
        "payload": body.payload or {},
        "ai_used": bool(body.ai_used),
        "status": "draft",
        "result": None,
        "activity": [{"ts": now, "type": "draft", "detail": f"Draft created: {body.kind}",
                      "by": user.name or user.email}],
        "created_by": user.name or user.email,
        "created_at": now,
        "updated_at": now,
    }
    await db.workspace_actions.insert_one(dict(doc))
    return _clean(doc)


@router.get("/workspace/actions")
async def list_actions(user: User = Depends(require_paid)):
    return await db.workspace_actions.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(300)


@router.delete("/workspace/actions/{action_id}")
async def delete_action(action_id: str, user: User = Depends(require_paid_owner)):
    res = await db.workspace_actions.delete_one({"action_id": action_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"deleted": True}


# ------------------------------------------------------------------ execute (human-in-the-loop confirm -> real write)
@router.post("/workspace/actions/{action_id}/execute")
async def execute_action(action_id: str, user: User = Depends(require_paid_owner)):
    action = await db.workspace_actions.find_one({"action_id": action_id, **org_filter(user)}, {"_id": 0})
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    if action.get("status") == "executed":
        raise HTTPException(status_code=400, detail="This action was already executed")

    conn = await _hs_conn(user)
    token = _hs_token(conn)
    kind = action["kind"]
    p = action.get("payload") or {}
    tgt = action.get("target") or {}
    ttype, tid = tgt.get("type"), tgt.get("id")

    if kind == "note":
        res = await hs.create_note(token, p.get("body"), ttype, tid, p.get("when"))
    elif kind == "task":
        res = await hs.create_task(token, p.get("title"), p.get("body"), p.get("priority"), p.get("due_date"), ttype, tid)
    elif kind == "call":
        res = await hs.log_call(token, p.get("title"), p.get("notes"), p.get("when"), p.get("direction"), ttype, tid)
    elif kind == "email":
        res = await hs.log_email(token, p.get("subject"), p.get("text"), p.get("when"), ttype, tid)
    elif kind == "deal":
        res = await hs.create_deal(token, p.get("dealname"), p.get("amount"), p.get("dealstage"),
                                   p.get("pipeline"), p.get("closedate"), p.get("contact_id"))
    else:
        raise HTTPException(status_code=400, detail="Unknown action kind")

    now = _now()
    if res.get("ok"):
        result = {"ok": True, "hubspot_id": res.get("id"), "executed_at": now}
        await db.workspace_actions.update_one(
            {"action_id": action_id},
            {"$set": {"status": "executed", "result": result, "updated_at": now}},
        )
        await _log(action_id, user, "execute", f"Pushed to HubSpot (id {res.get('id')})")
        return {"status": "executed", "result": result}

    # failure — persist as failed with a clear reason; keep it retryable
    result = {"ok": False, "error": res.get("error"), "code": res.get("code"),
              "missing_scopes": res.get("missing_scopes"), "failed_at": now}
    await db.workspace_actions.update_one(
        {"action_id": action_id},
        {"$set": {"status": "failed", "result": result, "updated_at": now}},
    )
    await _log(action_id, user, "failed", res.get("error") or "HubSpot write failed")
    # 422 so the readable detail passes the ingress to the UI
    raise HTTPException(status_code=422, detail=res.get("error") or "HubSpot write failed")
