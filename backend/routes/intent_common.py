"""Shared constants + push helpers for the High-Intent Buyers hub.

Used by the intent data cloud, speed-to-lead routing, agent briefings and
red-carpet storefronts. Every push helper returns {"ok": bool, ...} and never raises.
"""
import re
import logging
from datetime import datetime, timezone, date
from typing import Optional

import httpx

from database import db
from utils.crypto import decrypt
from routes import hubspot_write as hs
from routes import salesforce_write as sf
from routes import pipedrive_write as pd
from routes import zoho_write as zw
from utils.crm_auth import crm_creds

logger = logging.getLogger(__name__)

CRM_PROVIDERS = {"hubspot": "HubSpot", "salesforce": "Salesforce", "pipedrive": "Pipedrive", "zoho": "Zoho CRM"}
PUSH_DESTINATIONS = {**CRM_PROVIDERS, "slack": "Slack"}

# type -> (label, weight, category)
EVENT_TYPES = {
    "quote_request": ("Request-a-quote submitted", 25, "Sales"),
    "demo_request": ("Demo requested", 22, "Sales"),
    "trial_signup": ("Trial signup", 18, "Product"),
    "pricing_view": ("Pricing page visit", 15, "Marketing"),
    "webinar_attended": ("Webinar attended", 12, "Marketing"),
    "whitepaper_download": ("Whitepaper download", 10, "Marketing"),
    "case_study_view": ("Case study view", 8, "Marketing"),
    "form_submit": ("Form submitted", 8, "Marketing"),
    "docs_view": ("Product docs view", 6, "Product"),
    "webinar_registered": ("Webinar registration", 6, "Marketing"),
    "page_view": ("Page view", 1, "Marketing"),
}
CRITICAL_EVENTS = {"quote_request", "demo_request", "pricing_view", "trial_signup"}
DEFAULT_PATTERNS = {
    "quote_request": ["/quote", "/request-quote", "/contact-sales"],
    "demo_request": ["/demo", "/book-a-demo"],
    "trial_signup": ["/signup", "/trial"],
    "pricing_view": ["/pricing", "/plans"],
    "webinar_attended": ["/webinar"],
    "whitepaper_download": ["/whitepaper", "/ebook", ".pdf"],
    "case_study_view": ["/customers", "/case-stud"],
    "docs_view": ["/docs", "/documentation", "/api-reference"],
}
FREE_EMAIL_DOMAINS = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com",
                      "proton.me", "protonmail.com", "live.com", "me.com", "msn.com"}
WON_STAGES = {"won", "closed_won", "closed won", "closed", "customer"}
LOST_STAGES = {"lost", "closed_lost", "closed lost", "churned", "cancelled", "disqualified"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_ts(v) -> Optional[datetime]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v / 1000 if v > 1e11 else v, tz=timezone.utc)
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def classify_url(url: str, patterns: dict) -> str:
    u = (url or "").lower()
    for etype, pats in patterns.items():
        if etype in EVENT_TYPES and any(p and p.lower() in u for p in pats):
            return etype
    return "page_view"


def company_from_domain(domain: str) -> str:
    root = (domain or "").lower().split(".")[0]
    return " ".join(w.capitalize() for w in re.split(r"[-_]", root) if w)


def resolve_identity(email: str, company: str, domain: str) -> tuple[str, str, str]:
    """(account_key, account_name, domain) — company wins, then a business email domain."""
    email = (email or "").strip().lower()
    dom = (domain or "").strip().lower().replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
    if not dom and "@" in email:
        d = email.split("@", 1)[1]
        if d not in FREE_EMAIL_DOMAINS:
            dom = d
    name = (company or "").strip()[:120]
    if not name and dom:
        name = company_from_domain(dom)
    return (name.lower() if name else ""), name, dom


def event_meta(etype: str) -> tuple[str, int, str]:
    return EVENT_TYPES.get(etype, EVENT_TYPES["page_view"])


async def org_conn(org_id: str, platform: str) -> Optional[dict]:
    conn = await db.business_connections.find_one(
        {"org_id": org_id, "platform": platform, "api_key_encrypted": {"$nin": [None, ""]}}, {"_id": 0}
    )
    return conn or await db.business_connections.find_one({"org_id": org_id, "platform": platform}, {"_id": 0})


def conn_creds(conn: Optional[dict]) -> dict:
    if not conn:
        return {"token": "", "instance_url": ""}
    try:
        token = decrypt(conn["api_key_encrypted"]) if conn.get("api_key_encrypted") else ""
    except Exception:
        token = ""
    return {"token": token, "instance_url": conn.get("instance_url", "")}


async def slack_webhook(org_id: str) -> str:
    cfg = await db.outreach_settings.find_one({"org_id": org_id}, {"_id": 0})
    if not cfg or not cfg.get("slack_webhook_encrypted"):
        return ""
    try:
        return decrypt(cfg["slack_webhook_encrypted"])
    except Exception:
        return ""


async def connected_destinations(org_id: str) -> dict:
    conns = await db.business_connections.find(
        {"org_id": org_id, "platform": {"$in": [*CRM_PROVIDERS, "stripe"]}}, {"_id": 0, "platform": 1}
    ).to_list(50)
    have = {c["platform"] for c in conns}
    out = {p: p in have for p in CRM_PROVIDERS}
    out["stripe"] = "stripe" in have
    out["slack"] = bool(await slack_webhook(org_id))
    return out


async def post_slack(org_id: str, title: str, fields: list, body: str = "", context: str = "") -> dict:
    url = await slack_webhook(org_id)
    if not url:
        return {"ok": False, "error": "Connect Slack first — add an Incoming Webhook URL in Speed-to-Lead settings."}
    blocks = [{"type": "header", "text": {"type": "plain_text", "text": title[:150]}}]
    if fields:
        blocks.append({"type": "section", "fields": [{"type": "mrkdwn", "text": f"*{k}:*\n{v}"} for k, v in fields[:10]]})
    if body:
        blocks.append({"type": "section", "text": {"type": "mrkdwn", "text": body[:2900]}})
    if context:
        blocks.append({"type": "context", "elements": [{"type": "mrkdwn", "text": context[:300]}]})
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, json={"text": title, "blocks": blocks})
    except Exception as e:
        return {"ok": False, "error": f"Could not reach Slack: {e}"}
    if r.status_code != 200:
        return {"ok": False, "error": f"Slack rejected the message (status {r.status_code})."}
    return {"ok": True}


def linked_deal(lead: Optional[dict], provider: str) -> str:
    lead = lead or {}
    return (lead.get("crm_links") or {}).get(provider) or (lead.get("hubspot_deal_id") if provider == "hubspot" else "") or ""


def _crm_missing(provider: str) -> dict:
    return {"ok": False, "error": f"Connect {CRM_PROVIDERS.get(provider, provider)} first to push this."}


async def crm_task(org_id: str, provider: str, title: str, body: str, owner_id: str = "", lead: Optional[dict] = None) -> dict:
    """Create a HIGH-priority due-today task, assigned to the AE's CRM owner id when known."""
    conn = await org_conn(org_id, provider)
    if not conn:
        return _crm_missing(provider)
    creds = await crm_creds(conn)
    owner_id = (owner_id or "").strip()
    today = date.today().isoformat()
    deal_id = linked_deal(lead, provider)
    if provider == "hubspot":
        props = {"hs_timestamp": str(hs.now_ms()), "hs_task_subject": title[:250], "hs_task_body": body,
                 "hs_task_status": "NOT_STARTED", "hs_task_priority": "HIGH"}
        if owner_id:
            props["hubspot_owner_id"] = owner_id
        payload = {"properties": props}
        if deal_id:
            payload["associations"] = hs._assoc("task", "deal", deal_id)
        res = await hs._post(creds["token"], "/crm/v3/objects/tasks", payload)
        if res.get("ok") and owner_id and deal_id:
            await hs.update_deal(creds["token"], deal_id, {"hubspot_owner_id": owner_id})
        res.pop("raw", None)
        return res
    if provider == "salesforce":
        sbody = {"Subject": title[:255], "Description": body, "Priority": "High",
                 "Status": "Not Started", "ActivityDate": today}
        if owner_id:
            sbody["OwnerId"] = owner_id
        if deal_id:
            sbody["WhatId"] = deal_id
        return await sf._create(creds, "Task", sbody)
    if provider == "pipedrive":
        pbody = {"subject": title[:250], "type": "task", "done": False, "due_date": today, "note": pd._to_html(body)}
        if owner_id.isdigit():
            pbody["owner_id"] = int(owner_id)
        if deal_id.isdigit():
            pbody["deal_id"] = int(deal_id)
        return await pd._post(creds, "/api/v2/activities", pbody)
    if provider == "zoho":
        return await zw.create_task(creds, title, body, "HIGH", today, owner_id, "deal" if deal_id else "", deal_id)
    return {"ok": False, "error": "Unsupported CRM"}


async def crm_note(org_id: str, provider: str, title: str, body: str, lead: Optional[dict] = None) -> dict:
    conn = await org_conn(org_id, provider)
    if not conn:
        return _crm_missing(provider)
    creds = await crm_creds(conn)
    text = f"{title}\n\n{body}"
    deal_id = linked_deal(lead, provider)
    if provider == "hubspot":
        res = await hs.create_note(creds["token"], text.replace("\n", "<br/>"), "deal" if deal_id else None, deal_id)
        res.pop("raw", None)
        return res
    if provider == "salesforce":
        return await sf.write("note", creds, {"body": text}, {})
    if provider == "pipedrive":
        # Pipedrive notes require a parent record, so standalone notes land as a done activity.
        return await pd._post(creds, "/api/v2/activities", {"subject": title[:250], "type": "task", "done": True,
                                                              "note": pd._to_html(body)})
    if provider == "zoho":
        if deal_id:
            return await zw.create_note(creds, title, body, "deal", deal_id)
        # Zoho notes require a parent record, so standalone notes land as a completed task.
        return await zw.create_task(creds, title, body, "MEDIUM", done=True)
    return {"ok": False, "error": "Unsupported CRM"}
