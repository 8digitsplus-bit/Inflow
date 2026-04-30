"""Public contact endpoint.

Flow:
  1. Visitor submits {name, email, message} on /contact.
  2. Claude classifies intent into {sales, support, refund, billing, other}.
  3. If intent is sales/support → Claude drafts a reply, Resend sends it directly
     to the visitor. Fire-and-forget.
  4. If intent is refund/billing → escalate to ESCALATION_EMAIL (default
     hello@inflow.io) with the original message; visitor receives a short ack.
  5. Every inquiry is persisted to db.contact_messages for audit.

No auth required — the endpoint is public but lightly rate-limited per IP.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timezone, timedelta
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
AUTO_REPLY_CATEGORIES = {"sales", "support"}
ESCALATE_CATEGORIES = {"refund", "billing"}
VALID_CATEGORIES = AUTO_REPLY_CATEGORIES | ESCALATE_CATEGORIES | {"other"}

RATE_LIMIT_PER_IP_PER_HOUR = 5
AI_TIMEOUT = 30


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    message: str = Field(..., min_length=10, max_length=4000)
    company: str | None = Field(None, max_length=120)


def _client_ip(request: Request) -> str:
    xf = request.headers.get("x-forwarded-for")
    if xf:
        return xf.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _classify_and_draft(name: str, email: str, message: str, company: str | None) -> dict:
    """Single Claude call that returns {category, confidence, reply}."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        logger.warning("EMERGENT_LLM_KEY missing — skipping AI classification")
        return {"category": "other", "confidence": 0.0, "reply": None}

    system = """You are the customer contact triage assistant for InFlow, a B2B SaaS platform for pricing optimization, sales pipeline management, and revenue intelligence. InFlow offers three plans (Essential $59/user/mo, Pro $139/user/mo, Enterprise $260/user/mo) with a 14-day no-card free trial. Integrations: Stripe, PayPal, Shopify, Xero, QuickBooks, HubSpot, Salesforce, Zoho CRM, Mixpanel, Amplitude.

Your job:
1. Classify the incoming message into exactly one of: sales, support, refund, billing, other.
   - sales: pre-sale interest, pricing questions, demo requests, plan comparisons
   - support: how-to questions, product feature questions, integration setup help
   - refund: refund requests, cancellation complaints, chargebacks
   - billing: invoice disputes, subscription management issues, payment failures (for existing paying users)
   - other: press, partnership, legal, recruiting, or anything unclear
2. If category is sales or support, draft a concise reply (120-220 words) that:
   - Opens with "Hi {first_name},"
   - Answers the question directly using accurate InFlow facts above
   - Ends with: "— The InFlow Team"
   - Plain text only. No markdown, no emojis, no hashtags.
3. If category is refund, billing, or other, set reply to null — a human will take over.

Return ONLY valid JSON:
{"category": "sales|support|refund|billing|other", "confidence": 0.0-1.0, "reply": "text or null"}"""

    prompt = f"""Sender: {name} <{email}>
Company: {company or "(not provided)"}

Message:
{message}"""

    chat = LlmChat(
        api_key=api_key,
        session_id=f"contact_{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        raw = await asyncio.wait_for(
            chat.send_message(UserMessage(text=prompt)),
            timeout=AI_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning("Claude classification timed out for %s", email)
        return {"category": "other", "confidence": 0.0, "reply": None}
    except Exception as e:
        logger.error("Claude classification failed: %s", e)
        return {"category": "other", "confidence": 0.0, "reply": None}

    # Strip code fences if Claude added any
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("` \n")

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Claude returned non-JSON for contact classification: %s", text[:200])
        return {"category": "other", "confidence": 0.0, "reply": None}

    category = data.get("category", "other").lower().strip()
    if category not in VALID_CATEGORIES:
        category = "other"

    return {
        "category": category,
        "confidence": float(data.get("confidence", 0.0) or 0.0),
        "reply": data.get("reply") if category in AUTO_REPLY_CATEGORIES else None,
    }


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
      <p style="color:#71717a;font-size:11px;margin-top:20px;">This reply was sent automatically. If it didn't answer your question, just reply and a human will follow up.</p>
    </td></tr>
  </table>
</body></html>"""


def _escalation_html(name: str, email: str, company: str | None, message: str, category: str) -> str:
    safe_msg = message.replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return f"""<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#18181b;">
  <p><strong>Category:</strong> {category}</p>
  <p><strong>From:</strong> {name} &lt;{email}&gt;</p>
  <p><strong>Company:</strong> {company or "—"}</p>
  <hr style="border:none;border-top:1px solid #e4e4e7;margin:16px 0;"/>
  <p>{safe_msg}</p>
</body></html>"""


def _ack_html(first_name: str) -> str:
    return f"""<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:36px;max-width:520px;">
        <tr><td>
          <div style="color:#6366f1;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:20px;">InFlow</div>
          <p style="color:#3f3f46;font-size:15px;line-height:1.65;margin:0 0 14px 0;">Hi {first_name},</p>
          <p style="color:#3f3f46;font-size:15px;line-height:1.65;margin:0 0 14px 0;">Thanks for reaching out — we received your message and a member of our team will review it and get back to you within one business day.</p>
          <p style="color:#3f3f46;font-size:15px;line-height:1.65;margin:0;">— The InFlow Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


async def _process_inquiry(message_id: str, payload: ContactRequest):
    """Background: classify → send reply or escalate → update DB."""
    try:
        result = await _classify_and_draft(payload.name, payload.email, payload.message, payload.company)
        category = result["category"]
        reply = result.get("reply")

        first_name = payload.name.split()[0] if payload.name.strip() else "there"

        auto_replied = False
        escalated = False
        send_result = {"sent": False, "reason": None, "id": None}

        if category in AUTO_REPLY_CATEGORIES and reply:
            send_result = await send_email(
                to=payload.email,
                subject="Re: your message to InFlow",
                html=_wrap_reply_html(reply),
                text=reply,
            )
            auto_replied = send_result.get("sent", False)

        if category in ESCALATE_CATEGORIES or category == "other":
            # Forward to escalation inbox
            esc = await send_email(
                to=ESCALATION_EMAIL,
                subject=f"[InFlow contact · {category}] {payload.name}",
                html=_escalation_html(payload.name, payload.email, payload.company, payload.message, category),
                text=f"From: {payload.name} <{payload.email}>\nCategory: {category}\n\n{payload.message}",
            )
            escalated = esc.get("sent", False)
            # And send a brief ack to the visitor so they know it landed
            await send_email(
                to=payload.email,
                subject="We got your message",
                html=_ack_html(first_name),
                text=f"Hi {first_name},\n\nThanks for reaching out — we'll review and reply within one business day.\n\n— The InFlow Team",
            )

        await db.contact_messages.update_one(
            {"message_id": message_id},
            {"$set": {
                "category": category,
                "confidence": result.get("confidence", 0.0),
                "auto_replied": auto_replied,
                "escalated": escalated,
                "reply_text": reply if auto_replied else None,
                "email_send_result": send_result.get("reason"),
                "processed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
    except Exception as e:
        logger.exception("Contact processing failed for %s: %s", message_id, e)
        await db.contact_messages.update_one(
            {"message_id": message_id},
            {"$set": {"category": "error", "error": str(e)[:500], "processed_at": datetime.now(timezone.utc).isoformat()}},
        )


@router.post("/contact")
async def submit_contact(payload: ContactRequest, request: Request):
    """Public endpoint — accept a contact message and process it asynchronously."""
    ip = _client_ip(request)
    now = datetime.now(timezone.utc)
    hour_ago = now - timedelta(hours=1)

    recent = await db.contact_messages.count_documents(
        {"ip": ip, "created_at": {"$gte": hour_ago.isoformat()}}
    )
    if recent >= RATE_LIMIT_PER_IP_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many messages — please try again later.")

    message_id = uuid.uuid4().hex
    doc = {
        "message_id": message_id,
        "name": payload.name,
        "email": payload.email,
        "company": payload.company,
        "message": payload.message,
        "ip": ip,
        "created_at": now.isoformat(),
        "category": None,
        "confidence": None,
        "auto_replied": False,
        "escalated": False,
        "reply_text": None,
        "processed_at": None,
    }
    await db.contact_messages.insert_one(doc)

    # Fire-and-forget — don't block the user on AI + email latency
    asyncio.create_task(_process_inquiry(message_id, payload))

    return {"message_id": message_id, "status": "received"}
