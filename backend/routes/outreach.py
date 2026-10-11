"""Upgrade Outreach Workspace — an email-client-style triage surface for the
Upsell Engine's expansion candidates.

Everything here ties back to a direct, attributable $ expansion metric:
  - Intent-driven category tabs (Priority Pipeline / Sales / Marketing) route the
    highest-value accounts away from lower-intent nurture.
  - Behavioral labels (Upgrade Potential / Hot Lead / High Value / Churn Risk /
    keyword-trigger rules) are derived deterministically from each candidate's
    own signals + real deal health — no inbound mailbox required.
  - AI drafts the upgrade email; a human reviews, edits, pastes links, assigns a
    teammate (@) and chooses the send target.
  - Strategic Undo-Send delay: the send is QUEUED server-side and only dispatched
    by a background worker after the delay, so the manager can cancel mid-send.

Enterprise + owner gated, consistent with the Upsell Engine.
"""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from models import User
from dependencies import org_filter
from utils.crypto import encrypt, decrypt
from utils.email import send_email
from routes.telemetry import require_enterprise
from routes.upsell import _ai_text, _pick_plan, _signal_summary, _email_html, _get_candidate
from routes import hubspot_write as hs
from routes import salesforce_write as sf
from routes import zoho_write as zw
from utils.crm_auth import crm_creds

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_DELAYS = {10, 30, 60}
CATEGORIES = {"priority", "sales", "marketing"}
RISK_STAGES = {"negotiation", "proposal"}


# ------------------------------------------------------------------ models
class CandidatePatch(BaseModel):
    category: Optional[str] = None
    assignee: Optional[str] = None
    links: Optional[List[str]] = None
    add_label: Optional[str] = None
    remove_label: Optional[str] = None
    draft_subject: Optional[str] = None
    draft_body: Optional[str] = None


class ScheduleSendRequest(BaseModel):
    candidate_id: str
    to: str
    subject: str
    body: str
    delay_seconds: int = 30
    category: Optional[str] = None
    mark_status: str = "emailed"


class SlackConfigRequest(BaseModel):
    webhook_url: str
    channel_label: Optional[str] = ""


class SlackAlertRequest(BaseModel):
    candidate_id: str


class PushCrmRequest(BaseModel):
    candidate_id: str
    provider: str          # hubspot | salesforce | zoho
    kind: str = "task"     # task | note


class LabelRuleCreate(BaseModel):
    keyword: str
    label: str
    color: str = "blue"


# ------------------------------------------------------------------ helpers
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _split_draft(text: str) -> dict:
    import re
    m = re.search(r"^\s*subject:\s*(.+)$", text or "", re.IGNORECASE | re.MULTILINE)
    if m:
        body = re.sub(r"^\s*subject:\s*.+$", "", text, count=1, flags=re.IGNORECASE | re.MULTILINE).lstrip()
        return {"subject": m.group(1).strip(), "body": body}
    return {"subject": "", "body": text or ""}


def _derive_category(cand: dict) -> str:
    """Intent-driven default lane from the deterministic expansion score/value."""
    if cand.get("category") in CATEGORIES:
        return cand["category"]
    score = cand.get("expansion_score", 0)
    if score >= 70:
        return "priority"
    if score >= 40:
        return "sales"
    return "marketing"


async def _conn(user: User, platform: str) -> Optional[dict]:
    return await db.business_connections.find_one(
        {**org_filter(user), "platform": platform}, {"_id": 0}
    )


def _builtin_labels(cand: dict, churn_set: set) -> List[dict]:
    """Behavioral labels derived from the candidate's own signals + deal health."""
    out = []
    score = cand.get("expansion_score", 0)
    keys = {s.get("key") for s in cand.get("signals", [])}
    if score >= 40:
        out.append({"label": "Upgrade Potential", "color": "blue", "auto": True})
    if score >= 70:
        out.append({"label": "Hot Lead", "color": "amber", "auto": True})
    if "high_value" in keys:
        out.append({"label": "High Value", "color": "violet", "auto": True})
    if "plan_limit" in keys:
        out.append({"label": "Nearing Limit", "color": "cyan", "auto": True})
    if cand.get("account_key") in churn_set:
        out.append({"label": "Churn Risk", "color": "red", "auto": True})
    return out


def _keyword_labels(cand: dict, rules: List[dict]) -> List[dict]:
    hay = (cand.get("account", "") + " " + _signal_summary(cand)).lower()
    out = []
    for r in rules:
        kw = (r.get("keyword") or "").strip().lower()
        if kw and kw in hay:
            out.append({"label": r["label"], "color": r.get("color", "blue"), "auto": True, "rule": True})
    return out


def _merge_labels(cand: dict, churn_set: set, rules: List[dict]) -> List[dict]:
    removed = set(cand.get("removed_labels", []))
    seen = set()
    merged = []
    for lb in _builtin_labels(cand, churn_set) + _keyword_labels(cand, rules):
        if lb["label"] in removed or lb["label"] in seen:
            continue
        seen.add(lb["label"])
        merged.append(lb)
    for lb in cand.get("manual_labels", []):
        name = lb.get("label") if isinstance(lb, dict) else lb
        if name and name not in seen:
            seen.add(name)
            merged.append({"label": name, "color": (lb.get("color") if isinstance(lb, dict) else "zinc") or "zinc", "auto": False})
    return merged


# ------------------------------------------------------------------ board
@router.get("/outreach/board")
async def outreach_board(user: User = Depends(require_enterprise)):
    cands = await db.upsell_candidates.find(
        {**org_filter(user), "status": {"$ne": "dismissed"}}, {"_id": 0}
    ).sort("est_expansion_value", -1).to_list(500)

    # Churn-risk set: accounts with a deal that is low-probability / in a risk stage.
    deals = await db.deals.find(org_filter(user), {"_id": 0, "company": 1, "name": 1, "probability": 1, "stage": 1}).to_list(5000)
    churn_set = set()
    for d in deals:
        prob = d.get("probability", 100) or 0
        stage = (d.get("stage") or "").lower()
        if prob < 40 or stage in RISK_STAGES:
            key = (d.get("company") or d.get("name") or "").strip().lower()
            if key:
                churn_set.add(key)

    rules = await db.outreach_label_rules.find(org_filter(user), {"_id": 0}).to_list(100)

    enriched = []
    tabs = {"priority": 0, "sales": 0, "marketing": 0}
    for c in cands:
        cat = _derive_category(c)
        tabs[cat] = tabs.get(cat, 0) + 1
        enriched.append({
            "candidate_id": c["candidate_id"],
            "account": c.get("account"),
            "account_key": c.get("account_key"),
            "expansion_score": c.get("expansion_score", 0),
            "est_expansion_value": c.get("est_expansion_value", 0),
            "current_value": c.get("current_value", 0),
            "signals": c.get("signals", []),
            "status": c.get("status", "open"),
            "category": cat,
            "assignee": c.get("assignee", ""),
            "links": c.get("links", []),
            "contact_email": c.get("contact_email", ""),
            "draft_subject": c.get("draft_subject", ""),
            "draft_body": c.get("draft_body", ""),
            "labels": _merge_labels(c, churn_set, rules),
        })

    teammates = await db.users.find(
        {"org_id": user.org_id}, {"_id": 0, "name": 1, "email": 1}
    ).to_list(200)

    conns = await db.business_connections.find(
        {**org_filter(user), "platform": {"$in": ["hubspot", "salesforce", "zoho"]}}, {"_id": 0, "platform": 1}
    ).to_list(10)
    connected = {c["platform"] for c in conns}
    slack_cfg = await db.outreach_settings.find_one(org_filter(user), {"_id": 0})

    queue = await db.upsell_outbound_queue.find(
        {**org_filter(user), "status": "queued"}, {"_id": 0}
    ).to_list(100)

    return {
        "candidates": enriched,
        "tabs": tabs,
        "teammates": [{"name": t.get("name") or t.get("email"), "email": t.get("email")} for t in teammates if t.get("email")],
        "integrations": {
            "slack": bool(slack_cfg and slack_cfg.get("slack_webhook_encrypted")),
            "slack_channel": (slack_cfg or {}).get("channel_label", ""),
            "hubspot": "hubspot" in connected,
            "salesforce": "salesforce" in connected,
            "zoho": "zoho" in connected,
        },
        "label_rules": rules,
        "queue": [{"queue_id": q["queue_id"], "candidate_id": q.get("candidate_id"),
                   "scheduled_send_at": q.get("scheduled_send_at"), "to": q.get("to")} for q in queue],
        "owner_email": user.email,
    }


# ------------------------------------------------------------------ AI draft
@router.post("/outreach/candidate/{candidate_id}/draft")
async def generate_draft(candidate_id: str, user: User = Depends(require_enterprise)):
    cand = await _get_candidate(candidate_id, user)
    plan = await _pick_plan(user, None)
    plan_name = plan["name"] if plan else "our next plan tier"
    plan_price = f"${plan['price']:,.0f}/{plan['period']}" if plan else ""
    link = plan.get("upgrade_url") if plan else ""

    fallback = (
        f"Subject: An upgrade tailored to how {cand['account']} is growing\n\n"
        f"Hi there,\n\nWe've noticed {cand['account']} is getting real traction — "
        f"{_signal_summary(cand) or 'strong, consistent usage'}. That's exactly the point where teams "
        f"get the most out of upgrading.\n\nMoving up to {plan_name}{(' (' + plan_price + ')') if plan_price else ''} "
        f"unlocks more headroom to match your momentum.\n\n"
        f"{('Upgrade here: ' + link) if link else 'Reply and we will set you up in minutes.'}\n\nBest regards"
    )
    system = (
        "You are a senior account executive writing a short, warm, non-pushy upgrade email to an existing "
        "customer showing strong expansion signals. Reference their momentum specifically, tie the upgrade to "
        "value, include a clear call to action. No emojis, no markdown. Output a 'Subject:' line, then the body. "
        "Keep under 160 words."
    )
    prompt = (
        f"Existing customer: {cand['account']}\n"
        f"Current annual value: ${cand['current_value']:,.0f}\n"
        f"Detected expansion signals: {_signal_summary(cand) or 'consistent usage'}\n"
        f"Recommended upgrade plan: {plan_name} {plan_price}\n"
        f"Upgrade link to include verbatim if present: {link or 'none'}\n\nWrite the upgrade email now."
    )
    text, ai_used = await _ai_text(system, prompt, f"outreach_draft_{candidate_id}", fallback)
    parts = _split_draft(text)
    await db.upsell_candidates.update_one(
        {"candidate_id": candidate_id, **org_filter(user)},
        {"$set": {"draft_subject": parts["subject"], "draft_body": parts["body"], "updated_at": _now()}},
    )
    return {"subject": parts["subject"], "body": parts["body"], "plan": plan, "ai_used": ai_used}


# ------------------------------------------------------------------ patch candidate (category, assignee, links, labels, draft)
@router.patch("/outreach/candidate/{candidate_id}")
async def patch_candidate(candidate_id: str, body: CandidatePatch, user: User = Depends(require_enterprise)):
    cand = await _get_candidate(candidate_id, user)
    flt = {"candidate_id": candidate_id, **org_filter(user)}

    # Remove a label: drop any manual copy and remember to suppress auto copies.
    if body.remove_label:
        label = body.remove_label.strip()
        await db.upsell_candidates.update_one(
            flt,
            {"$pull": {"manual_labels": {"label": label}},
             "$addToSet": {"removed_labels": label}, "$set": {"updated_at": _now()}},
        )

    # Add a manual label: un-suppress it and store it if new.
    if body.add_label:
        label = body.add_label.strip()
        existing = {l.get("label") if isinstance(l, dict) else l for l in cand.get("manual_labels", [])}
        add_ops = {"$pull": {"removed_labels": label}, "$set": {"updated_at": _now()}}
        if label and label not in existing:
            add_ops["$push"] = {"manual_labels": {"label": label, "color": "zinc"}}
        await db.upsell_candidates.update_one(flt, add_ops)

    updates = {}
    if body.category is not None:
        if body.category not in CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        updates["category"] = body.category
    if body.assignee is not None:
        updates["assignee"] = body.assignee.strip()
    if body.links is not None:
        updates["links"] = [l.strip() for l in body.links if l and l.strip()][:20]
    if body.draft_subject is not None:
        updates["draft_subject"] = body.draft_subject
    if body.draft_body is not None:
        updates["draft_body"] = body.draft_body
    if updates:
        updates["updated_at"] = _now()
        await db.upsell_candidates.update_one(flt, {"$set": updates})

    doc = await db.upsell_candidates.find_one({"candidate_id": candidate_id}, {"_id": 0})
    return {"ok": True, "candidate": doc}


# ------------------------------------------------------------------ undo-send: schedule + cancel
@router.post("/outreach/schedule-send")
async def schedule_send(body: ScheduleSendRequest, user: User = Depends(require_enterprise)):
    to = (body.to or "").strip()
    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="A valid recipient email is required")
    if not body.subject.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Subject and body are required")
    if not os.environ.get("RESEND_API_KEY"):
        raise HTTPException(status_code=400, detail="Email sending isn't configured yet. Add a RESEND_API_KEY to send upgrade emails.")
    delay = body.delay_seconds if body.delay_seconds in VALID_DELAYS else 30
    if body.category and body.category in CATEGORIES:
        await db.upsell_candidates.update_one(
            {"candidate_id": body.candidate_id, **org_filter(user)}, {"$set": {"category": body.category}}
        )
    send_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
    doc = {
        "queue_id": f"oq_{uuid.uuid4().hex[:12]}",
        "org_id": user.org_id,
        "candidate_id": body.candidate_id,
        "to": to,
        "subject": body.subject.strip(),
        "body": body.body,
        "mark_status": body.mark_status or "emailed",
        "status": "queued",
        "scheduled_send_at": send_at.isoformat(),
        "delay_seconds": delay,
        "created_at": _now(),
    }
    await db.upsell_outbound_queue.insert_one(dict(doc))
    return {"queue_id": doc["queue_id"], "scheduled_send_at": doc["scheduled_send_at"], "delay_seconds": delay}


@router.post("/outreach/cancel-send/{queue_id}")
async def cancel_send(queue_id: str, user: User = Depends(require_enterprise)):
    res = await db.upsell_outbound_queue.find_one_and_update(
        {"queue_id": queue_id, **org_filter(user), "status": "queued"},
        {"$set": {"status": "cancelled", "cancelled_at": _now()}},
    )
    if not res:
        raise HTTPException(status_code=409, detail="This send already went out and can no longer be undone.")
    return {"cancelled": True}


# ------------------------------------------------------------------ Slack alert (Incoming Webhook)
@router.get("/outreach/slack-config")
async def get_slack_config(user: User = Depends(require_enterprise)):
    cfg = await db.outreach_settings.find_one(org_filter(user), {"_id": 0})
    return {
        "configured": bool(cfg and cfg.get("slack_webhook_encrypted")),
        "channel_label": (cfg or {}).get("channel_label", ""),
    }


@router.put("/outreach/slack-config")
async def set_slack_config(body: SlackConfigRequest, user: User = Depends(require_enterprise)):
    url = (body.webhook_url or "").strip()
    if not url.startswith("https://hooks.slack.com/"):
        raise HTTPException(status_code=400, detail="Enter a valid Slack Incoming Webhook URL (https://hooks.slack.com/...).")
    await db.outreach_settings.update_one(
        org_filter(user),
        {"$set": {"org_id": user.org_id, "slack_webhook_encrypted": encrypt(url),
                  "channel_label": (body.channel_label or "").strip(), "updated_at": _now()}},
        upsert=True,
    )
    return {"configured": True, "channel_label": (body.channel_label or "").strip()}


@router.post("/outreach/slack-alert")
async def slack_alert(body: SlackAlertRequest, user: User = Depends(require_enterprise)):
    cfg = await db.outreach_settings.find_one(org_filter(user), {"_id": 0})
    if not cfg or not cfg.get("slack_webhook_encrypted"):
        raise HTTPException(status_code=400, detail="Connect Slack first — add an Incoming Webhook URL in the workspace.")
    try:
        url = decrypt(cfg["slack_webhook_encrypted"])
    except Exception:
        raise HTTPException(status_code=400, detail="Stored Slack webhook is invalid. Reconnect Slack.")
    cand = await _get_candidate(body.candidate_id, user)
    signals = _signal_summary(cand) or "strong, consistent usage"
    text = (f":rocket: *Upsell opportunity — {cand['account']}*\n"
            f"Expansion potential: *${cand.get('est_expansion_value', 0):,.0f}/yr* · "
            f"score {cand.get('expansion_score', 0)}/100\n"
            f"Signals: {signals}")
    payload = {
        "text": f"Upsell opportunity — {cand['account']} (${cand.get('est_expansion_value', 0):,.0f}/yr)",
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": f"🚀 Upsell opportunity — {cand['account']}"}},
            {"type": "section", "fields": [
                {"type": "mrkdwn", "text": f"*Expansion potential:*\n${cand.get('est_expansion_value', 0):,.0f}/yr"},
                {"type": "mrkdwn", "text": f"*Score:*\n{cand.get('expansion_score', 0)}/100"},
            ]},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*Signals:* {signals}"}},
            {"type": "context", "elements": [{"type": "mrkdwn", "text": f"Flagged by {user.name or user.email} · InFlow Upsell Engine"}]},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, json=payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not reach Slack: {e}")
    if r.status_code != 200:
        raise HTTPException(status_code=422, detail=f"Slack rejected the message (status {r.status_code}).")
    return {"sent": True, "text": text}


# ------------------------------------------------------------------ push to CRM (task / note)
@router.post("/outreach/push-crm")
async def push_crm(body: PushCrmRequest, user: User = Depends(require_enterprise)):
    provider = body.provider
    names = {"hubspot": "HubSpot", "salesforce": "Salesforce", "zoho": "Zoho CRM"}
    if provider not in names:
        raise HTTPException(status_code=400, detail="Unsupported CRM provider")
    if body.kind not in ("task", "note"):
        raise HTTPException(status_code=400, detail="Unsupported action kind")
    conn = await _conn(user, provider)
    if not conn:
        raise HTTPException(status_code=400, detail=f"Connect {names[provider]} first to push this opportunity.")
    cand = await _get_candidate(body.candidate_id, user)
    creds = await crm_creds(conn)
    title = f"Upsell: {cand['account']} (~${cand.get('est_expansion_value', 0):,.0f}/yr)"
    detail = (f"Expansion opportunity for {cand['account']}. "
              f"Score {cand.get('expansion_score', 0)}/100. "
              f"Signals: {_signal_summary(cand) or 'strong usage'}. "
              f"Recommended next step: reach out about an upgrade.")
    if provider == "hubspot":
        if body.kind == "task":
            res = await hs.create_task(creds["token"], title, detail, "HIGH", None, None, None)
        else:
            res = await hs.create_note(creds["token"], f"{title}\n\n{detail}", None, None)
    elif provider == "zoho":
        # Zoho notes need a parent record, so a standalone note lands as a completed task.
        res = await zw.create_task(creds, title, detail, "HIGH", done=body.kind == "note")
    else:  # salesforce
        payload = {"title": title, "body": detail, "priority": "HIGH"} if body.kind == "task" else {"body": f"{title}\n\n{detail}"}
        res = await sf.write(body.kind, creds, payload, {})
    if not res.get("ok"):
        raise HTTPException(status_code=422, detail=res.get("error") or f"{names[provider]} write failed")
    await db.upsell_candidates.update_one(
        {"candidate_id": body.candidate_id, **org_filter(user)},
        {"$set": {"status": "notified", "updated_at": _now()}},
    )
    return {"ok": True, "id": res.get("id"), "provider": provider, "kind": body.kind}


# ------------------------------------------------------------------ label rules (keyword triggers)
@router.get("/outreach/label-rules")
async def list_label_rules(user: User = Depends(require_enterprise)):
    return await db.outreach_label_rules.find(org_filter(user), {"_id": 0}).to_list(100)


@router.post("/outreach/label-rules")
async def create_label_rule(body: LabelRuleCreate, user: User = Depends(require_enterprise)):
    kw = (body.keyword or "").strip()
    label = (body.label or "").strip()
    if not kw or not label:
        raise HTTPException(status_code=400, detail="Both a keyword and a label are required")
    doc = {
        "rule_id": f"lr_{uuid.uuid4().hex[:10]}",
        "org_id": user.org_id,
        "keyword": kw,
        "label": label,
        "color": body.color if body.color in ("blue", "amber", "violet", "red", "emerald", "cyan", "zinc") else "blue",
        "created_at": _now(),
    }
    await db.outreach_label_rules.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.delete("/outreach/label-rules/{rule_id}")
async def delete_label_rule(rule_id: str, user: User = Depends(require_enterprise)):
    res = await db.outreach_label_rules.delete_one({"rule_id": rule_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"deleted": True}


# ------------------------------------------------------------------ background worker (dispatches queued sends)
async def process_outbound_queue_once() -> int:
    """Send any queued emails whose delay has elapsed. Returns count sent."""
    now_iso = datetime.now(timezone.utc).isoformat()
    due = await db.upsell_outbound_queue.find(
        {"status": "queued", "scheduled_send_at": {"$lte": now_iso}}, {"_id": 0}
    ).to_list(50)
    sent = 0
    for q in due:
        claimed = await db.upsell_outbound_queue.find_one_and_update(
            {"queue_id": q["queue_id"], "status": "queued"},
            {"$set": {"status": "sending"}},
        )
        if not claimed:
            continue
        result = await send_email(to=q["to"], subject=q["subject"], html=_email_html(q["body"]), text=q["body"])
        if result.get("sent"):
            await db.upsell_outbound_queue.update_one(
                {"queue_id": q["queue_id"]},
                {"$set": {"status": "sent", "sent_id": result.get("id"), "sent_at": _now()}},
            )
            if q.get("candidate_id"):
                await db.upsell_candidates.update_one(
                    {"candidate_id": q["candidate_id"], "org_id": q["org_id"]},
                    {"$set": {"status": q.get("mark_status", "emailed"), "contact_email": q["to"],
                              "updated_at": _now()}},
                )
            sent += 1
        else:
            await db.upsell_outbound_queue.update_one(
                {"queue_id": q["queue_id"]},
                {"$set": {"status": "failed", "error": result.get("reason"), "failed_at": _now()}},
            )
    return sent
