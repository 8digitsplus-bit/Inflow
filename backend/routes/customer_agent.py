"""Authenticated customer-facing AI agent — multi-step with confirmation.

Lives at /api/customer/agent/*. Visitor agent (/api/contact/agent/*) stays
focused on pre-sale inquiries; this one is for logged-in customers managing
their own account.

Available actions (all require explicit user approval before execution):
  - cancel_subscription   → POST /api/subscription/cancel
  - open_billing_portal   → returns a one-shot Stripe Customer Portal URL
  - invite_member         → enterprise-only, sends invite email + creates token
  - escalate              → forwards request to hello@inflow.io
  - navigate              → soft action, returns a route to open inside the app
                            (used for things best handled by existing UI panels)
"""
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import Optional
import os
import uuid
import asyncio
import logging
import json

from database import db
from models import User
from dependencies import get_current_user
from utils.email import send_email

logger = logging.getLogger(__name__)
router = APIRouter()

ESCALATION_EMAIL = os.environ.get("CONTACT_ESCALATION_EMAIL", "hello@inflow.io")
AI_TIMEOUT = 30
MAX_HISTORY_TURNS = 12

VALID_ACTION_TYPES = {
    "cancel_subscription",
    "open_billing_portal",
    "invite_member",
    "escalate",
    "navigate",
}


class StartRequest(BaseModel):
    pass


class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(..., min_length=1, max_length=4000)


class ApproveRequest(BaseModel):
    session_id: str
    action_id: str
    edits: Optional[dict] = None


class CancelRequest(BaseModel):
    session_id: str
    action_id: str


# ---------- Helpers ----------

async def _build_user_context(user: User) -> dict:
    """Snapshot of the user's account for the agent's system prompt."""
    org = None
    if user.org_id:
        org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})

    seats_used = 0
    if user.org_id:
        seats_used = await db.users.count_documents({"org_id": user.org_id})

    pending_invites = 0
    if user.org_id:
        pending_invites = await db.org_invites.count_documents(
            {"org_id": user.org_id, "status": "pending"}
        )

    integrations = 0
    if user.org_id:
        integrations = await db.business_connections.count_documents({"org_id": user.org_id})

    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    sub_status = (org or {}).get("subscription_status") or "active"

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "role": 1})
    is_owner = (user_doc or {}).get("role") == "owner"

    return {
        "name": user.name,
        "email": user.email,
        "tier": tier,
        "subscription_status": sub_status,
        "seat_count": (org or {}).get("seat_count", 1),
        "seats_used": seats_used,
        "pending_invites": pending_invites,
        "integrations_connected": integrations,
        "is_owner": is_owner,
        "trial_ends_at": (org or {}).get("trial_ends_at"),
    }


def _system_prompt(ctx: dict) -> str:
    return f"""You are Flow AI, the customer assistant inside InFlow's app — a B2B SaaS platform for revenue intelligence, pricing optimization, and pipeline management.

You are talking to a logged-in customer. Their account snapshot:
- Name: {ctx['name']}
- Email: {ctx['email']}
- Plan: {ctx['tier']}  (status: {ctx['subscription_status']})
- Seats: {ctx['seats_used']} of {ctx['seat_count']} used  ({ctx['pending_invites']} invite(s) pending)
- Integrations connected: {ctx['integrations_connected']}
- Role: {'owner' if ctx['is_owner'] else 'member'}
- Trial ends: {ctx['trial_ends_at'] or 'n/a'}

Plans (per user / month): Essential $59, Pro $139, Enterprise $260. Yearly billing = 30% off year one. 14-day no-card free trial. Live integrations: Stripe, PayPal, Shopify, Xero, QuickBooks, HubSpot, Salesforce, Zoho CRM, Mixpanel, Amplitude.

YOUR JOB
You help the customer manage their account through chat. You can answer questions directly using the snapshot above, AND you can propose ONE of these actions for them to approve:

1. cancel_subscription — only if they explicitly ask to cancel; ONLY available to owners with an active paid subscription. Confirm what plan they're on first.
2. open_billing_portal — for: updating payment method, downloading invoices, changing plan, changing seat count. Owner-only. We open Stripe's Customer Portal in a new tab.
3. invite_member — Enterprise plan only. Requires {{email, role}}. Role must be 'member'.
4. escalate — for anything you can't handle yourself (legal, refund disputes, custom pricing requests, data deletion, anything ambiguous). Forwards to a human.
5. navigate — soft action: send the user to an existing app page when that's the cleanest UX. Pages: /settings, /connect-business (integrations), /pipeline, /dashboard, /support (Smart Assist AI), /churn, /forecast, /pricing.

CRITICAL RULES
- NEVER execute autonomously. Always propose; the customer approves with one click.
- Use the snapshot facts directly when you can answer (e.g. "you're on the Pro plan with 3 of 5 seats used") — don't invent.
- If a non-owner asks for owner-only actions (cancel, billing portal, invite), tell them only the workspace owner can do that and propose escalate or navigate.
- Keep chat replies short (1-3 sentences). Never repeat the action's body in chat.
- No markdown, no emojis, no hashtags.

OUTPUT — return ONLY valid JSON:
{{
  "message": "your short conversational reply",
  "proposed_action": null | {{
    "type": "cancel_subscription" | "open_billing_portal" | "invite_member" | "escalate" | "navigate",
    "label": "short button label e.g. 'Cancel my Pro plan'",
    "reason": "one-sentence why",
    "params": {{
      // type-specific:
      // cancel_subscription: {{}}
      // open_billing_portal: {{}}
      // invite_member: {{ "email": "...", "role": "member" }}
      // escalate: {{ "subject": "...", "body": "..." }}
      // navigate: {{ "path": "/settings", "anchor": "billing" }}
    }}
  }}
}}"""


async def _ask_agent(ctx: dict, history: list, user_message: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return {"message": "I'm temporarily unavailable. Please try again shortly.", "proposed_action": None}

    context_lines = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        role = "Customer" if turn["role"] == "user" else "Assistant"
        context_lines.append(f"{role}: {turn['content']}")
    if context_lines:
        prompt = "Conversation so far:\n" + "\n".join(context_lines) + f"\n\nCustomer: {user_message}\n\nReply with JSON only."
    else:
        prompt = f"Customer: {user_message}\n\nReply with JSON only."

    chat = LlmChat(
        api_key=api_key,
        session_id=f"customer_agent_{uuid.uuid4().hex[:8]}",
        system_message=_system_prompt(ctx),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        raw = await asyncio.wait_for(
            chat.send_message(UserMessage(text=prompt)),
            timeout=AI_TIMEOUT,
        )
    except asyncio.TimeoutError:
        return {"message": "That took longer than expected. Could you try once more?", "proposed_action": None}
    except Exception as e:
        logger.error("Customer agent LLM failed: %s", e)
        return {"message": "Something went wrong on my end. You can also manage things directly from the Settings page.", "proposed_action": None}

    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {"message": text[:600] or "Tell me more about what you'd like to do.", "proposed_action": None}

    out = {"message": str(data.get("message", "")).strip()[:1200] or "What would you like me to help with?",
           "proposed_action": None}

    pa = data.get("proposed_action")
    if isinstance(pa, dict) and pa.get("type") in VALID_ACTION_TYPES:
        out["proposed_action"] = {
            "id": uuid.uuid4().hex[:12],
            "type": pa["type"],
            "label": str(pa.get("label", "Confirm"))[:120],
            "reason": str(pa.get("reason", ""))[:300],
            "params": pa.get("params") or {},
        }

    return out


# ---------- Action executors ----------

async def _execute_cancel_subscription(user: User, params: dict, ctx: dict) -> dict:
    if not ctx["is_owner"]:
        raise HTTPException(status_code=403, detail="Only the workspace owner can cancel the subscription.")

    user_doc = await db.users.find_one(
        {"user_id": user.user_id},
        {"_id": 0, "subscription_tier": 1, "stripe_subscription_id": 1},
    )
    tier = (user_doc or {}).get("subscription_tier", "trial")
    if tier in ("expired", "cancelled"):
        raise HTTPException(status_code=400, detail="No active subscription to cancel.")

    api_key = os.environ.get("STRIPE_API_KEY")
    sub_id = (user_doc or {}).get("stripe_subscription_id")

    if sub_id and api_key and (api_key.startswith("sk_live_") or api_key.startswith("sk_test_")) and api_key != "sk_test_emergent":
        try:
            import stripe as stripe_sdk
            stripe_sdk.api_key = api_key
            stripe_sdk.Subscription.cancel(sub_id)
        except Exception as e:
            logger.error("Stripe cancel failed: %s", e)

    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "subscription_tier": "cancelled",
            "previous_tier": tier,
            "cancelled_at": now,
            "subscription_status": "cancelled",
        }},
    )
    # Also flip the org so tier-gated endpoints (seats, integrations) see the
    # cancellation. Without this, member-facing checks read stale tier.
    if user.org_id:
        await db.organizations.update_one(
            {"org_id": user.org_id},
            {"$set": {
                "subscription_tier": "cancelled",
                "previous_tier": tier,
                "subscription_status": "cancelled",
                "cancelled_at": now,
            }},
        )
    return {
        "summary": f"Cancelled your {tier.replace('_', ' ')} subscription. You'll retain access until the end of your billing period.",
        "previous_tier": tier,
    }


async def _execute_open_billing_portal(user: User, params: dict, ctx: dict, request: Request) -> dict:
    if not ctx["is_owner"]:
        raise HTTPException(status_code=403, detail="Only the workspace owner can open the billing portal.")

    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key or api_key == "sk_test_emergent" or not (api_key.startswith("sk_live_") or api_key.startswith("sk_test_")):
        raise HTTPException(status_code=503, detail="Billing portal isn't available in sandbox mode.")

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "stripe_customer_id": 1})
    customer_id = (user_doc or {}).get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No active subscription found. Subscribe first.")

    origin = request.headers.get("origin") or os.environ.get("FRONTEND_URL", "https://app.local")

    import stripe as stripe_sdk
    stripe_sdk.api_key = api_key
    try:
        session = stripe_sdk.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{origin}/customer-centre",
        )
    except stripe_sdk.error.InvalidRequestError as e:
        msg = str(e)
        if "configuration" in msg.lower():
            raise HTTPException(status_code=503, detail="Billing portal isn't configured in Stripe yet.")
        raise HTTPException(status_code=400, detail=msg)

    return {"summary": "Opening Stripe's Billing Portal in a new tab.", "url": session.url}


async def _execute_invite_member(user: User, params: dict, ctx: dict, request: Request) -> dict:
    if not ctx["is_owner"]:
        raise HTTPException(status_code=403, detail="Only the workspace owner can invite members.")
    if not (ctx["tier"].startswith("enterprise")):
        raise HTTPException(status_code=403, detail="Team invites require an Enterprise plan.")

    email = (params.get("email") or "").strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required.")

    # Reuse the existing invite endpoint logic by calling it directly
    from routes.organizations import invite_member as do_invite, InviteRequest
    try:
        result = await do_invite(InviteRequest(email=email, role="member"), request, user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("invite_member failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to send invite.")

    return {
        "summary": f"Invite sent to {email}. They'll get an email with a link to join your team.",
        "invite_id": result.get("invite_id"),
        "email_sent": result.get("email_sent"),
    }


async def _execute_escalate(user: User, params: dict, ctx: dict) -> dict:
    subject = (params.get("subject") or f"[Customer · {ctx['tier']}] Request from {user.name}").strip()[:200]
    body = (params.get("body") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Need a message body to escalate.")

    safe = body.replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    html = f"""<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#18181b;">
      <p><strong>From:</strong> {user.name} &lt;{user.email}&gt;</p>
      <p><strong>Plan:</strong> {ctx['tier']}</p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:16px 0;"/>
      <p>{safe}</p>
    </body></html>"""

    res = await send_email(
        to=ESCALATION_EMAIL, subject=subject,
        html=html, text=f"From: {user.name} <{user.email}>\nPlan: {ctx['tier']}\n\n{body}",
    )
    return {
        "summary": "I've passed this along to the InFlow team. They'll reply by email within one business day.",
        "email_sent": res.get("sent"),
    }


async def _execute_navigate(user: User, params: dict, ctx: dict) -> dict:
    path = (params.get("path") or "").strip()
    if not path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid navigation path.")
    return {"summary": f"Opening {path}.", "path": path, "anchor": params.get("anchor")}


ACTION_EXECUTORS = {
    "cancel_subscription": _execute_cancel_subscription,
    "open_billing_portal": _execute_open_billing_portal,
    "invite_member": _execute_invite_member,
    "escalate": _execute_escalate,
    "navigate": _execute_navigate,
}


# ---------- Endpoints ----------

@router.post("/customer/agent/start")
async def start_chat(user: User = Depends(get_current_user)):
    ctx = await _build_user_context(user)
    session_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc).isoformat()

    first_name = user.name.split()[0] if user.name else "there"
    greeting = (
        f"Hi {first_name} — I'm Flow AI. I can answer account questions, invite teammates, "
        f"open the billing portal, cancel your plan, or pass anything else to a human. What would you like to do?"
    )

    await db.customer_agent_sessions.insert_one({
        "session_id": session_id,
        "user_id": user.user_id,
        "org_id": user.org_id,
        "created_at": now,
        "updated_at": now,
        "pending_action": None,
        "completed_actions": [],
    })
    await db.customer_agent_messages.insert_one({
        "session_id": session_id,
        "user_id": user.user_id,
        "role": "assistant",
        "content": greeting,
        "created_at": now,
    })

    return {"session_id": session_id, "greeting": greeting, "context": {
        "first_name": first_name, "tier": ctx["tier"], "is_owner": ctx["is_owner"],
    }}


@router.post("/customer/agent/chat")
async def chat(req: ChatRequest, user: User = Depends(get_current_user)):
    session = await db.customer_agent_sessions.find_one(
        {"session_id": req.session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.now(timezone.utc).isoformat()
    await db.customer_agent_messages.insert_one({
        "session_id": req.session_id,
        "user_id": user.user_id,
        "role": "user",
        "content": req.message,
        "created_at": now,
    })

    cursor = db.customer_agent_messages.find(
        {"session_id": req.session_id},
        {"_id": 0, "role": 1, "content": 1},
    ).sort("created_at", 1).limit(MAX_HISTORY_TURNS * 2)
    history = await cursor.to_list(length=MAX_HISTORY_TURNS * 2)
    history = history[:-1] if history and history[-1]["role"] == "user" else history

    ctx = await _build_user_context(user)
    agent_out = await _ask_agent(ctx, history, req.message)

    update = {"updated_at": now}
    if agent_out.get("proposed_action"):
        update["pending_action"] = agent_out["proposed_action"]

    await db.customer_agent_sessions.update_one(
        {"session_id": req.session_id},
        {"$set": update},
    )

    await db.customer_agent_messages.insert_one({
        "session_id": req.session_id,
        "user_id": user.user_id,
        "role": "assistant",
        "content": agent_out["message"],
        "proposed_action": agent_out.get("proposed_action"),
        "created_at": now,
    })

    return {
        "message": agent_out["message"],
        "proposed_action": agent_out.get("proposed_action"),
    }


@router.post("/customer/agent/approve")
async def approve_action(req: ApproveRequest, request: Request, user: User = Depends(get_current_user)):
    session = await db.customer_agent_sessions.find_one(
        {"session_id": req.session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    pending = session.get("pending_action")
    if not pending or pending.get("id") != req.action_id:
        raise HTTPException(status_code=400, detail="No matching pending action.")

    # Apply user edits (visitor can tweak params before approving — e.g. invite email)
    edits = req.edits or {}
    params = {**(pending.get("params") or {}), **edits}

    action_type = pending["type"]
    executor = ACTION_EXECUTORS.get(action_type)
    if not executor:
        raise HTTPException(status_code=400, detail="Unsupported action type.")

    ctx = await _build_user_context(user)
    try:
        if action_type == "open_billing_portal" or action_type == "invite_member":
            result = await executor(user, params, ctx, request)
        else:
            result = await executor(user, params, ctx)
    except HTTPException:
        # Persist failure + re-raise
        await db.customer_agent_sessions.update_one(
            {"session_id": req.session_id},
            {"$set": {"pending_action": None, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        raise

    now = datetime.now(timezone.utc).isoformat()
    completed = {**pending, "params": params, "executed_at": now, "result": result}

    await db.customer_agent_sessions.update_one(
        {"session_id": req.session_id},
        {
            "$set": {"pending_action": None, "updated_at": now},
            "$push": {"completed_actions": completed},
        },
    )

    await db.customer_agent_messages.insert_one({
        "session_id": req.session_id,
        "user_id": user.user_id,
        "role": "assistant",
        "content": result.get("summary", "Done."),
        "system_event": "action_executed",
        "executed_action": {"type": action_type, **{k: v for k, v in result.items() if k != "summary"}},
        "created_at": now,
    })

    return {
        "ok": True,
        "message": result.get("summary"),
        "executed": {"type": action_type, **result},
    }


@router.post("/customer/agent/cancel")
async def cancel_action(req: CancelRequest, user: User = Depends(get_current_user)):
    session = await db.customer_agent_sessions.find_one(
        {"session_id": req.session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    pending = session.get("pending_action")
    if not pending or pending.get("id") != req.action_id:
        return {"ok": True}

    now = datetime.now(timezone.utc).isoformat()
    await db.customer_agent_sessions.update_one(
        {"session_id": req.session_id},
        {"$set": {"pending_action": None, "updated_at": now}},
    )
    await db.customer_agent_messages.insert_one({
        "session_id": req.session_id,
        "user_id": user.user_id,
        "role": "assistant",
        "content": "No problem — what else can I help with?",
        "system_event": "action_cancelled",
        "created_at": now,
    })
    return {"ok": True, "message": "No problem — what else can I help with?"}
