"""Public contact agent — multi-step conversational AI.

Flow:
  1. Visitor opens /contact and starts a chat (POST /api/contact/agent/start).
  2. Agent (Claude) chats with them, classifies intent, gathers context, and
     proposes an action (send_reply or escalate) — never executes autonomously.
  3. Visitor clicks Approve / Edit / Cancel on the proposed action.
  4. On approve: backend executes via Resend, agent confirms in the chat.

Two actions only (per product decision): send_reply, escalate. No refunds,
no account creation, no magic links. The agent persists its memory in
db.contact_chat_sessions so context is preserved across turns.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal
import os
import uuid
import asyncio
import logging
import json

from database import db
from utils.email import send_email

logger = logging.getLogger(__name__)
router = APIRouter()

ESCALATION_EMAIL = os.environ.get("CONTACT_ESCALATION_EMAIL", "hello@inflow.io")
RATE_LIMIT_PER_IP_PER_HOUR = 30  # higher than form because chat is multi-turn
AI_TIMEOUT = 30
MAX_HISTORY_TURNS = 12
VALID_CATEGORIES = {"sales", "support", "refund", "billing", "other"}
VALID_ACTIONS = {"send_reply", "escalate"}
VALID_SENTIMENTS = {"positive", "neutral", "frustrated", "anxious", "confused"}


class StartRequest(BaseModel):
    pass


class ChatRequest(BaseModel):
    session_id: str
    message: str = Field(..., min_length=1, max_length=4000)


class ApproveRequest(BaseModel):
    session_id: str
    action_id: str
    edits: Optional[dict] = None  # {subject?, body?, to?}


class CancelRequest(BaseModel):
    session_id: str
    action_id: str


def _client_ip(request: Request) -> str:
    xf = request.headers.get("x-forwarded-for")
    if xf:
        return xf.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


SYSTEM_PROMPT = """You are Flow AI, the contact assistant for InFlow — a B2B SaaS platform for pricing optimization, sales pipeline management, and revenue intelligence.

────────────────────────────────────────
PRODUCT KNOWLEDGE (never invent beyond this)
────────────────────────────────────────

PLANS (flat per workspace / month — unlimited team members on every plan). Yearly billing saves ~30% vs paying monthly.
- Essential — $99/mo or $830/yr. Sales pipeline, core analytics, 2 integrations, churn monitoring, email support.
- Pro — $149/mo or $1,250/yr. Everything in Essential + 4 integrations, CSV import, AI insights, CRO analysis, revenue forecasting, priority support.
- Enterprise — $400/mo or $3,360/yr. Everything in Pro + unlimited integrations, Custom API access, Smart Assist AI (in-app data analyst), Revenue Intelligence, Competitor Intelligence, dedicated account support, team invites (unlimited seats).

Pricing is flat per workspace — NOT per user. One price covers the whole team, with unlimited members. Billing is managed from Settings → Manage Billing.

FREE TRIAL
- 14 days. Email signup only, NO credit card required.
- What's included during the trial:
  • Full sales pipeline, dashboard, and core analytics
  • 2 connected integrations (same cap as Essential — not 4)
  • AI Insights, CRO analysis, churn prediction, and revenue forecasting (Pro-level AI features)
  • Smart Assist AI (in-app data analyst) — available to every tier
- What's NOT included during the trial:
  • Custom API access — Enterprise only
  • More than 2 integrations — needs Pro
  • Team invites / multiple seats — Enterprise only
- On day 15, account flips to "expired" and the user must pick a paid plan to keep using InFlow. Their data is preserved.
- Trial cannot be extended automatically — that's an escalation to a human.

LIVE INTEGRATIONS (10 total)
- Revenue: Stripe, PayPal, Shopify, Xero, QuickBooks
- Pipeline: HubSpot, Salesforce, Zoho CRM
- Analytics/Signal: Mixpanel, Amplitude
- Enterprise also unlocks Custom API (POST structured JSON into the InFlow API — ideal for homegrown systems).

TIER-GATED FEATURES (cross-reference before answering)
- CSV import: Pro and Enterprise only
- AI Insights / CRO / Revenue Forecasting / Pricing Optimizer: Pro and Enterprise
- Smart Assist AI: Enterprise only
- Custom API: Enterprise only
- Team invites / multi-seat management: Enterprise only

SECURITY & TRUST
- TLS 1.3 in transit, AES encryption at rest, Stripe handles all payment data (InFlow never sees card numbers).
- Integration credentials (API keys, OAuth tokens) encrypted with AES-256 before storage.
- Optional 2FA on every plan.
- Data is never used to train AI models.

SUPPORT LEVELS
- Essential: email support (business hours, ~24h reply)
- Pro: priority email support (~4h business-hours reply)
- Enterprise: dedicated account contact + same-day responses

CANCELLATION / REFUNDS / POLICY
- Self-serve cancel any time via Settings → Manage Billing. No lock-in contracts.
- Refunds are not automatic — unused days are NOT pro-rated on cancellation. If a customer feels wronged (mis-charge, duplicate invoice, buggy experience) escalate to a human — don't promise a refund yourself.
- Annual customers who cancel keep access until the end of the paid year.

────────────────────────────────────────
HOW TO BEHAVE — the four pillars
────────────────────────────────────────

1. ACTIVE LISTENING
   - Before proposing an action, confirm you've understood. Example: "Just to make sure I've got this right — you're on the Pro trial and looking to know if Mixpanel counts toward your 4-integration limit?"
   - Ask ONE clarifying question at a time, not a list. Only ask when the answer is genuinely needed to help.
   - Reflect the visitor's goal back in your own words when they ask something complex.

2. KNOWLEDGEABILITY
   - Answer from the PRODUCT KNOWLEDGE section above. If the question touches something not covered there (custom pricing, SOC 2 status, roadmap dates, specific API rate limits, anything internal), DO NOT guess — say you'll route it to a human and propose `escalate`.
   - When you're confident, be specific. Quote actual prices, actual integration names, actual limits. Don't hedge with "I think" or "I'm not sure" when the answer is in the section above.

3. ACCOUNTABILITY & TRANSPARENCY
   - If you can't do something (extend a trial, grant a refund, custom contract terms), say so clearly and explain why, then offer the real path forward (human escalation).
   - If the visitor points out a frustrating policy (no trial extension, no automatic refunds) acknowledge it — don't deflect. Example: "That's fair — I get why that's annoying. The honest answer is refunds aren't automatic, but I can get this in front of someone who can look at your specific case."
   - Never pretend the product does something it doesn't. Better to say "that's not something InFlow handles today" than to invent a workaround.

4. PERSONALISATION (within this session)
   - Once the visitor tells you their name, use it naturally (first name only, not every message).
   - Reference things they've said earlier in the conversation — "you mentioned you're running a team of five, so Pro at a flat $149/mo covers all of them".
   - Tailor the depth of your answer to what they seem to need: a one-line answer for a quick check, a structured breakdown for a serious evaluation.
   - Do NOT guess personal details (name, company, industry) they haven't shared. If you don't know, don't assume.

────────────────────────────────────────
SENTIMENT DETECTION & TONE ADAPTATION
────────────────────────────────────────

On every visitor message, infer their emotional state and adapt your tone accordingly. Output the detected sentiment in JSON.

SIGNALS to read:
- Word choice ("frustrated", "annoyed", "love it", "confused", "urgent", "ridiculous", "thanks!")
- Punctuation/caps ("WHY?!", "...", repeated "??")
- Pace (rapid-fire short messages = urgency or frustration; one long thoughtful message = considered)
- Direct emotional statements ("this is so annoying", "you're amazing")

CATEGORIES:
- positive: visitor is enthusiastic, grateful, exploring with energy
- neutral: factual, calm, transactional — the default
- frustrated: visibly annoyed, complaining, sarcastic, impatient
- anxious: worried about a decision, deadline, or risk; hesitant
- confused: lost, asking the same thing differently, stuck on a concept

TONE PLAYBOOK (apply implicitly — never label or announce the sentiment to the visitor):
- positive → match their warmth; light, energetic. "Glad you're digging it — happy to help with the next step."
- neutral → professional, direct, friendly. The default voice.
- frustrated → drop the sales-y warmth, lead with empathy + acknowledgment, then the answer. "That's genuinely annoying — let me sort this." Shorter sentences. Don't gush. Take the issue seriously.
- anxious → reassuring, concrete. Quote actual prices/policies/timelines so they can plan. Avoid hedging language ("maybe", "should") that fuels uncertainty.
- confused → slow down. One concept at a time. Use simple analogies. Confirm understanding before moving on.

ESCALATION RULE:
- If sentiment is frustrated AND category is refund/billing — escalate immediately, no clarifying questions. Visitor doesn't want a back-and-forth.
- If sentiment is anxious AND it's a sales question — answer fully, then offer to put them in touch with a human for extra reassurance.

────────────────────────────────────────
ACTIONS (these are the only things you can propose)
────────────────────────────────────────

1. send_reply — for sales / support questions you CAN answer well using PRODUCT KNOWLEDGE. Draft a clear, accurate, personable reply (120–220 words) that the system will email to the visitor. Require their email before proposing.
2. escalate — for refund / billing / press / partnership / legal / custom pricing / roadmap questions / anything outside PRODUCT KNOWLEDGE, or anything genuinely ambiguous. The system forwards their full message + your summary to a human, visitor gets a brief acknowledgement.

────────────────────────────────────────
STYLE RULES
────────────────────────────────────────
- Chat replies: 1–3 sentences. The long answer lives in the email body, not the chat bubble.
- Never execute an action — you PROPOSE, the visitor approves.
- No markdown, emojis, hashtags, or code fences in the email body. Plain English.
- Use contractions (I'll, you're, we're). Sound like a smart, warm human — not a bot.
- Acknowledge uncertainty when it exists; never fake confidence.

OUTPUT FORMAT — return ONLY valid JSON, nothing else:
{
  "message": "your short conversational chat reply (tone-adapted to sentiment)",
  "category": "sales" | "support" | "refund" | "billing" | "other" | null,
  "sentiment": "positive" | "neutral" | "frustrated" | "anxious" | "confused",
  "needs": ["email"] | ["clarification"] | null,
  "proposed_action": null | {
    "type": "send_reply" | "escalate",
    "to": "visitor@example.com",
    "subject": "Re: your question to InFlow",
    "body": "the full email body in plain text",
    "reason": "one-sentence why this action"
  }
}"""


async def _ask_agent(history: list, user_message: str) -> dict:
    """Call Claude with the full conversation and parse JSON response."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return {
            "message": "I'm temporarily unavailable. Please email hello@inflow.io and we'll get back to you.",
            "category": "other",
            "needs": None,
            "proposed_action": None,
            "_error": "no_llm_key",
        }

    # Build history string. emergentintegrations LlmChat is per-call; pass
    # prior turns as plain text context so Claude can stay coherent.
    context_lines = []
    for turn in history[-MAX_HISTORY_TURNS:]:
        role = "Visitor" if turn["role"] == "user" else "Assistant"
        context_lines.append(f"{role}: {turn['content']}")
    if context_lines:
        prompt = "Conversation so far:\n" + "\n".join(context_lines) + f"\n\nVisitor: {user_message}\n\nReply with JSON only."
    else:
        prompt = f"Visitor: {user_message}\n\nReply with JSON only."

    chat = LlmChat(
        api_key=api_key,
        session_id=f"contact_agent_{uuid.uuid4().hex[:8]}",
        system_message=SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        raw = await asyncio.wait_for(
            chat.send_message(UserMessage(text=prompt)),
            timeout=AI_TIMEOUT,
        )
    except asyncio.TimeoutError:
        return {
            "message": "Sorry, that took longer than expected. Could you rephrase?",
            "category": None,
            "needs": None,
            "proposed_action": None,
            "_error": "timeout",
        }
    except Exception as e:
        logger.error("Claude contact agent failed: %s", e)
        return {
            "message": "Something went wrong on my end. You can email hello@inflow.io directly and we'll respond there.",
            "category": "other",
            "needs": None,
            "proposed_action": None,
            "_error": str(e)[:200],
        }

    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Agent returned non-JSON: %s", text[:200])
        return {
            "message": text[:500] if text else "Could you tell me a bit more about what you need?",
            "category": None,
            "needs": None,
            "proposed_action": None,
        }

    # Sanitize
    out = {
        "message": str(data.get("message", "")).strip()[:1200] or "Tell me more about what you need.",
        "category": data.get("category") if data.get("category") in VALID_CATEGORIES else None,
        "sentiment": data.get("sentiment") if data.get("sentiment") in VALID_SENTIMENTS else "neutral",
        "needs": data.get("needs") if isinstance(data.get("needs"), list) else None,
        "proposed_action": None,
    }

    pa = data.get("proposed_action")
    if isinstance(pa, dict) and pa.get("type") in VALID_ACTIONS:
        out["proposed_action"] = {
            "id": uuid.uuid4().hex[:12],
            "type": pa["type"],
            "to": str(pa.get("to", ""))[:200],
            "subject": str(pa.get("subject", "Re: your message to InFlow"))[:200],
            "body": str(pa.get("body", ""))[:6000],
            "reason": str(pa.get("reason", ""))[:300],
        }

    return out


def _wrap_reply_html(plain_reply: str) -> str:
    paragraphs = [p.strip() for p in plain_reply.split("\n\n") if p.strip()]
    body = "".join(
        f'<p style="color:#3f3f46;font-size:15px;line-height:1.65;margin:0 0 16px 0;">{p}</p>'
        for p in paragraphs
    )
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;max-width:560px;">
        <tr><td>
          <div style="color:#6366f1;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:20px;">InFlow</div>
          {body}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _escalation_html(visitor_email: str, body: str, category: str | None) -> str:
    safe = body.replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#18181b;">
  <p><strong>Category:</strong> {category or "other"}</p>
  <p><strong>From:</strong> {visitor_email}</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:16px 0;"/>
  <p>{safe}</p>
</body></html>"""


async def _check_rate_limit(ip: str):
    hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = await db.contact_chat_messages.count_documents(
        {"ip": ip, "created_at": {"$gte": hour_ago.isoformat()}, "role": "user"}
    )
    if recent >= RATE_LIMIT_PER_IP_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many messages — please try again later.")


@router.post("/contact/agent/start")
async def start_chat(request: Request):
    """Begin a new chat session. Returns session_id + opening greeting."""
    ip = _client_ip(request)
    session_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc).isoformat()

    greeting = (
        "Hi, I'm Flow AI. Ask me anything about InFlow's plans, integrations, or how the product works — "
        "or share a request and I'll route it to the right person. What's on your mind?"
    )

    await db.contact_chat_sessions.insert_one({
        "session_id": session_id,
        "ip": ip,
        "created_at": now,
        "updated_at": now,
        "visitor_email": None,
        "category": None,
        "pending_action": None,
        "completed_actions": [],
    })
    await db.contact_chat_messages.insert_one({
        "session_id": session_id,
        "ip": ip,
        "role": "assistant",
        "content": greeting,
        "created_at": now,
    })

    return {"session_id": session_id, "greeting": greeting}


@router.post("/contact/agent/chat")
async def chat(req: ChatRequest, request: Request):
    """Send a visitor message; agent responds, optionally with a proposed action."""
    ip = _client_ip(request)
    await _check_rate_limit(ip)

    session = await db.contact_chat_sessions.find_one({"session_id": req.session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.now(timezone.utc).isoformat()

    # Persist user message
    await db.contact_chat_messages.insert_one({
        "session_id": req.session_id,
        "ip": ip,
        "role": "user",
        "content": req.message,
        "created_at": now,
    })

    # Pull last N messages for context
    cursor = db.contact_chat_messages.find(
        {"session_id": req.session_id},
        {"_id": 0, "role": 1, "content": 1},
    ).sort("created_at", 1).limit(MAX_HISTORY_TURNS * 2)
    history = await cursor.to_list(length=MAX_HISTORY_TURNS * 2)
    # Exclude the just-inserted user message — _ask_agent appends it
    history = history[:-1] if history and history[-1]["role"] == "user" else history

    agent_out = await _ask_agent(history, req.message)

    # Persist assistant message + pending action
    update = {"updated_at": now}
    if agent_out.get("category"):
        update["category"] = agent_out["category"]
    if agent_out.get("proposed_action"):
        update["pending_action"] = agent_out["proposed_action"]

    await db.contact_chat_sessions.update_one(
        {"session_id": req.session_id},
        {"$set": update},
    )

    await db.contact_chat_messages.insert_one({
        "session_id": req.session_id,
        "ip": ip,
        "role": "assistant",
        "content": agent_out["message"],
        "proposed_action": agent_out.get("proposed_action"),
        "sentiment": agent_out.get("sentiment"),
        "created_at": now,
    })

    return {
        "message": agent_out["message"],
        "category": agent_out.get("category"),
        "sentiment": agent_out.get("sentiment"),
        "proposed_action": agent_out.get("proposed_action"),
    }


@router.post("/contact/agent/approve")
async def approve_action(req: ApproveRequest, request: Request):
    """Visitor approves the pending action (with optional edits) → execute it."""
    session = await db.contact_chat_sessions.find_one({"session_id": req.session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    pending = session.get("pending_action")
    if not pending or pending.get("id") != req.action_id:
        raise HTTPException(status_code=400, detail="No matching pending action.")

    # Apply edits (visitor can tweak email body or recipient before sending)
    edits = req.edits or {}
    to = (edits.get("to") or pending["to"]).strip()
    subject = (edits.get("subject") or pending["subject"]).strip()
    body = (edits.get("body") or pending["body"]).strip()

    if not to or "@" not in to:
        raise HTTPException(status_code=400, detail="A valid email is required.")

    action_type = pending["type"]
    send_result = {"sent": False, "reason": None}
    confirmation_msg = ""

    if action_type == "send_reply":
        send_result = await send_email(
            to=to, subject=subject, html=_wrap_reply_html(body), text=body,
        )
        if send_result.get("sent"):
            confirmation_msg = f"Sent to {to}. Check your inbox in a minute or two — anything else I can help with?"
        else:
            confirmation_msg = (
                "I tried to send that, but our email provider blocked it (likely a domain "
                "verification issue on our side). I'll forward the message to a human instead."
            )
            # Fall back to escalation so the message isn't lost
            await send_email(
                to=ESCALATION_EMAIL,
                subject=f"[InFlow contact · send_reply fallback] {to}",
                html=_escalation_html(to, body, session.get("category")),
                text=f"From: {to}\n\n{body}",
            )

    elif action_type == "escalate":
        send_result = await send_email(
            to=ESCALATION_EMAIL,
            subject=f"[InFlow contact · {session.get('category') or 'other'}] {to}",
            html=_escalation_html(to, body, session.get("category")),
            text=f"From: {to}\n\n{body}",
        )
        # Also send the visitor a brief ack
        await send_email(
            to=to,
            subject="We got your message",
            html=_wrap_reply_html("Thanks for reaching out — a member of our team will reply within one business day.\n\n— The InFlow Team"),
            text="Thanks for reaching out — a member of our team will reply within one business day.\n\n— The InFlow Team",
        )
        confirmation_msg = f"I've passed your request along to a human. They'll reply to {to} within one business day."

    now = datetime.now(timezone.utc).isoformat()

    completed = {
        **pending,
        "to": to,
        "subject": subject,
        "body": body,
        "executed_at": now,
        "send_result": send_result,
    }

    await db.contact_chat_sessions.update_one(
        {"session_id": req.session_id},
        {
            "$set": {"pending_action": None, "updated_at": now, "visitor_email": to},
            "$push": {"completed_actions": completed},
        },
    )

    await db.contact_chat_messages.insert_one({
        "session_id": req.session_id,
        "ip": _client_ip(request),
        "role": "assistant",
        "content": confirmation_msg,
        "system_event": "action_executed",
        "executed_action": {"type": action_type, "to": to, "sent": send_result.get("sent", False)},
        "created_at": now,
    })

    return {
        "ok": True,
        "message": confirmation_msg,
        "executed": {"type": action_type, "to": to, "sent": send_result.get("sent", False)},
    }


@router.post("/contact/agent/cancel")
async def cancel_action(req: CancelRequest):
    """Visitor cancels the pending action."""
    session = await db.contact_chat_sessions.find_one({"session_id": req.session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    pending = session.get("pending_action")
    if not pending or pending.get("id") != req.action_id:
        return {"ok": True}  # idempotent

    now = datetime.now(timezone.utc).isoformat()
    await db.contact_chat_sessions.update_one(
        {"session_id": req.session_id},
        {"$set": {"pending_action": None, "updated_at": now}},
    )
    await db.contact_chat_messages.insert_one({
        "session_id": req.session_id,
        "ip": "system",
        "role": "assistant",
        "content": "No problem — what would you like to do instead?",
        "system_event": "action_cancelled",
        "created_at": now,
    })
    return {"ok": True, "message": "No problem — what would you like to do instead?"}
