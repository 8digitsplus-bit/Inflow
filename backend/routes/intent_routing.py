"""Speed-to-Lead routing — AE roster, trigger rules, routing log and alert channels.

Rules fire the moment a profile crosses a critical intent trigger (see
intent_engine.schedule_routing): round-robin across an AE pool with optional
territory / deal-size bands, then alert by email, Slack and a CRM owner task.
"""
import uuid
import statistics
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from models import User
from dependencies import org_filter, require_paid, require_paid_owner
from utils.crypto import encrypt
from routes.intent_common import EVENT_TYPES, CRM_PROVIDERS, now_iso, slack_webhook, post_slack
from routes.intent_engine import assign_lead, schedule_routing, log_activity

router = APIRouter()


class AeReq(BaseModel):
    name: str
    email: str
    territories: List[str] = []
    min_deal: Optional[float] = None
    max_deal: Optional[float] = None
    active: bool = True
    crm_owner_ids: dict = {}


class AePatch(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    territories: Optional[List[str]] = None
    min_deal: Optional[float] = None
    max_deal: Optional[float] = None
    active: Optional[bool] = None
    crm_owner_ids: Optional[dict] = None


class Actions(BaseModel):
    email: bool = True
    slack: bool = False
    crm: str = ""
    briefing: bool = True


class RuleReq(BaseModel):
    name: str
    enabled: bool = True
    priority: int = 10
    event_types: List[str] = []
    min_score: int = 60
    min_value: float = 0
    window_hours: int = 72
    ae_ids: List[str] = []
    sla_minutes: int = 5
    actions: Actions = Actions()


class AssignReq(BaseModel):
    ae_id: str


class SlackReq(BaseModel):
    webhook_url: str
    channel_label: Optional[str] = ""


def _ae_doc(body: AeReq) -> dict:
    if not body.name.strip() or "@" not in body.email:
        raise HTTPException(status_code=400, detail="AE name and a valid email are required")
    return {"name": body.name.strip()[:80], "email": body.email.strip().lower(),
            "territories": [t.strip().upper()[:20] for t in body.territories if t.strip()][:10],
            "min_deal": body.min_deal or None, "max_deal": body.max_deal or None, "active": body.active,
            "crm_owner_ids": {k: str(v).strip()[:40] for k, v in (body.crm_owner_ids or {}).items() if k in CRM_PROVIDERS and str(v).strip()}}


def _rule_doc(body: RuleReq) -> dict:
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Rule name is required")
    if body.actions.crm and body.actions.crm not in CRM_PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported CRM")
    return {"name": body.name.strip()[:80], "enabled": body.enabled, "priority": body.priority,
            "event_types": [e for e in body.event_types if e in EVENT_TYPES],
            "min_score": max(0, min(100, body.min_score)), "min_value": max(0.0, body.min_value),
            "window_hours": max(1, min(720, body.window_hours)), "ae_ids": body.ae_ids[:50],
            "sla_minutes": max(1, min(1440, body.sla_minutes)), "actions": body.actions.model_dump(),
            "updated_at": now_iso()}


# ------------------------------------------------------------------ AE roster
@router.get("/intent/aes")
async def list_aes(user: User = Depends(require_paid)):
    return await db.intent_aes.find(org_filter(user), {"_id": 0}).sort("created_at", 1).to_list(200)


@router.post("/intent/aes")
async def create_ae(body: AeReq, user: User = Depends(require_paid_owner)):
    doc = {"ae_id": f"ae_{uuid.uuid4().hex[:10]}", "org_id": user.org_id, **_ae_doc(body),
           "assigned_count": 0, "last_assigned_at": None, "created_at": now_iso()}
    await db.intent_aes.insert_one(dict(doc))
    return doc


@router.put("/intent/aes/{ae_id}")
async def update_ae(ae_id: str, body: AePatch, user: User = Depends(require_paid_owner)):
    cur = await db.intent_aes.find_one({"ae_id": ae_id, **org_filter(user)}, {"_id": 0})
    if not cur:
        raise HTTPException(status_code=404, detail="AE not found")
    merged = {k: cur.get(k) for k in AeReq.model_fields if cur.get(k) is not None}
    merged.update(body.model_dump(exclude_unset=True))
    await db.intent_aes.update_one({"ae_id": ae_id}, {"$set": _ae_doc(AeReq(**merged))})
    return await db.intent_aes.find_one({"ae_id": ae_id}, {"_id": 0})


@router.delete("/intent/aes/{ae_id}")
async def delete_ae(ae_id: str, user: User = Depends(require_paid_owner)):
    res = await db.intent_aes.delete_one({"ae_id": ae_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="AE not found")
    await db.intent_routing_rules.update_many(org_filter(user), {"$pull": {"ae_ids": ae_id}})
    return {"deleted": True}


# ------------------------------------------------------------------ routing rules
@router.get("/intent/routing-rules")
async def list_rules(user: User = Depends(require_paid)):
    return await db.intent_routing_rules.find(org_filter(user), {"_id": 0}).sort("priority", 1).to_list(100)


async def _kick(user: User):
    """Re-evaluate open, unassigned profiles so a new/edited rule routes instantly."""
    leads = await db.intent_leads.find(
        {**org_filter(user), "assignment": None, "status": {"$nin": ["dismissed", "won", "lost"]}}, {"_id": 0, "activity": 0}
    ).to_list(500)
    for l in leads:
        await schedule_routing(user.org_id, l)


@router.post("/intent/routing-rules")
async def create_rule(body: RuleReq, user: User = Depends(require_paid_owner)):
    doc = {"rule_id": f"rr_{uuid.uuid4().hex[:10]}", "org_id": user.org_id, **_rule_doc(body), "created_at": now_iso()}
    await db.intent_routing_rules.insert_one(dict(doc))
    await _kick(user)
    return doc


@router.put("/intent/routing-rules/{rule_id}")
async def update_rule(rule_id: str, body: RuleReq, user: User = Depends(require_paid_owner)):
    res = await db.intent_routing_rules.update_one({"rule_id": rule_id, **org_filter(user)}, {"$set": _rule_doc(body)})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    await _kick(user)
    return await db.intent_routing_rules.find_one({"rule_id": rule_id}, {"_id": 0})


@router.delete("/intent/routing-rules/{rule_id}")
async def delete_rule(rule_id: str, user: User = Depends(require_paid_owner)):
    res = await db.intent_routing_rules.delete_one({"rule_id": rule_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"deleted": True}


# ------------------------------------------------------------------ routing log + stats
@router.get("/intent/routing-log")
async def routing_log(user: User = Depends(require_paid)):
    logs = await db.intent_routing_log.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(100)
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    auto = [l for l in logs if not l.get("manual")]
    lat = [l["latency_ms"] for l in auto if l.get("latency_ms") is not None]
    rules = {r["rule_id"]: r for r in await db.intent_routing_rules.find(org_filter(user), {"_id": 0}).to_list(100)}
    sla_ok = sum(1 for l in auto if l.get("alerted_ms", l["latency_ms"]) <= 5 * 60 * 1000)
    return {
        "logs": logs,
        "stats": {"median_latency_ms": int(statistics.median(lat)) if lat else None,
                  "routed_24h": sum(1 for l in logs if l["created_at"] >= since),
                  "sla_pct": round(100 * sla_ok / len(auto)) if auto else None,
                  "total": len(logs), "active_rules": sum(1 for r in rules.values() if r.get("enabled"))},
    }


# ------------------------------------------------------------------ manual assign / re-route
@router.post("/intent/profiles/{lead_id}/assign")
async def manual_assign(lead_id: str, body: AssignReq, user: User = Depends(require_paid_owner)):
    lead = await db.intent_leads.find_one({"lead_id": lead_id, **org_filter(user)}, {"_id": 0, "activity": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Profile not found")
    ae = await db.intent_aes.find_one({"ae_id": body.ae_id, **org_filter(user)}, {"_id": 0})
    if not ae:
        raise HTTPException(status_code=404, detail="AE not found")
    rule = None
    if (lead.get("assignment") or {}).get("rule_id"):
        rule = await db.intent_routing_rules.find_one({"rule_id": lead["assignment"]["rule_id"]}, {"_id": 0})
    trig = {"key": "manual", "label": f"Manually assigned by {user.name or user.email}"}
    res = await assign_lead(user.org_id, lead, ae, None, trig, None, user.name or user.email)
    if rule:
        res["previous_rule"] = rule["name"]
    return res


@router.post("/intent/profiles/{lead_id}/reroute")
async def reroute(lead_id: str, user: User = Depends(require_paid_owner)):
    lead = await db.intent_leads.find_one({"lead_id": lead_id, **org_filter(user)}, {"_id": 0, "activity": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.intent_leads.update_one({"lead_id": lead_id}, {"$set": {"assignment": None, "status": "new"}})
    await log_activity(lead_id, "routing", "Assignment cleared — re-evaluating routing rules", user.name or user.email)
    await schedule_routing(user.org_id, {**lead, "assignment": None, "status": "new"})
    return {"ok": True}


# ------------------------------------------------------------------ Slack alert channel
@router.get("/intent/slack-config")
async def get_slack(user: User = Depends(require_paid)):
    cfg = await db.outreach_settings.find_one(org_filter(user), {"_id": 0})
    return {"configured": bool(await slack_webhook(user.org_id)), "channel_label": (cfg or {}).get("channel_label", "")}


@router.put("/intent/slack-config")
async def set_slack(body: SlackReq, user: User = Depends(require_paid_owner)):
    url = (body.webhook_url or "").strip()
    if not url.startswith("https://hooks.slack.com/"):
        raise HTTPException(status_code=400, detail="Enter a valid Slack Incoming Webhook URL (https://hooks.slack.com/...).")
    await db.outreach_settings.update_one(
        org_filter(user), {"$set": {"org_id": user.org_id, "slack_webhook_encrypted": encrypt(url),
                                    "channel_label": (body.channel_label or "").strip(), "updated_at": now_iso()}}, upsert=True)
    return {"configured": True, "channel_label": (body.channel_label or "").strip()}


@router.post("/intent/slack-test")
async def test_slack(user: User = Depends(require_paid_owner)):
    res = await post_slack(user.org_id, "InFlow Speed-to-Lead is connected", [("Workspace", user.name or user.email)],
                           "Hot-account alerts will land in this channel the moment a buyer crosses a trigger.")
    if not res.get("ok"):
        raise HTTPException(status_code=422, detail=res.get("error"))
    return res
