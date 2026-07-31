from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import os
import uuid
import json
import logging

from database import db
from models import User
from dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


class ChatMessage(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class TicketCreate(BaseModel):
    subject: str
    description: str
    conversation_id: Optional[str] = None


class ActionRequest(BaseModel):
    action: str
    params: Optional[dict] = None
    conversation_id: Optional[str] = None


SYSTEM_PROMPT = """You are the AI support assistant for InFlow, a B2B SaaS platform for revenue intelligence.

STRICT RULES:
1. ONLY answer questions about InFlow, its features, pricing, billing, and account management.
2. If asked about anything unrelated to InFlow, say: "I can only help with InFlow-related questions. Is there anything about your account or our features I can help with?"
3. NEVER guess or make up information. If you don't know something, say: "I'm not sure about that. Let me create a support ticket so our team can help you."
4. NEVER invent features that don't exist. Only reference the features listed below.
5. Be concise, professional, and helpful. Keep responses under 150 words unless a detailed explanation is needed.

INFLOW FEATURES (only reference these):
- Sales Pipeline: Kanban board for managing deals with drag-and-drop, KPIs, pipeline charts
- Sales Performance: Win rates, deal velocity, stage analytics
- Sales Revenue: MRR tracking, revenue trends, revenue by stage
- Revenue Intelligence: Unified overview combining all revenue and pipeline data with AI recommendations
- Churn & Retention: Customer health scores, churn prediction, retention trends, risk alerts
- CRO (Conversion Rate Optimization): Funnel analysis, A/B test tracking, bottleneck detection
- Pricing Optimizer: AI-powered pricing analysis with competitor comparison and optimal price recommendations
- Live Integration: Integrate Stripe, Shopify, HubSpot, Salesforce, QuickBooks to sync data
- Smart Assist: AI chat (this) + ticket system

PRICING (exact values, do not modify — flat subscription per workspace):
- Essential: $75/month or $747/year (save with annual billing) — Sales Pipeline, Core analytics, Email support, Churn alerts
- Pro: $179/month or $1,695/year (save with annual billing) — Everything in Essential + Sales Performance, Priority support, Advanced analytics, Revenue forecasting, Churn prediction, CRO tools
- Enterprise: $327/month or $2,499/year (save with annual billing) — Everything in Pro + Sales Revenue, Revenue Intelligence, Competitor Intelligence, Custom integrations, API access
- Pricing is a flat subscription — one price per workspace, billed monthly or yearly.
- 14-Day Free Trial: Full access, no credit card required, unlimited usage on all plans

ACTIONS YOU CAN PERFORM:
When the user wants to perform one of these actions, include an ACTION block at the END of your response in this exact format:

[ACTION:upgrade:PLAN_ID]
[ACTION:cancel]
[ACTION:connect:PLATFORM]

Available actions:
- Upgrade subscription: [ACTION:upgrade:essential_monthly] or [ACTION:upgrade:pro_monthly] or [ACTION:upgrade:enterprise_monthly] (also _yearly variants)
- Cancel subscription: [ACTION:cancel]
- Connect business platform: [ACTION:connect:stripe] or [ACTION:connect:shopify] or [ACTION:connect:hubspot] or [ACTION:connect:salesforce] or [ACTION:connect:quickbooks]

IMPORTANT action rules:
- Always confirm the action with the user BEFORE including the ACTION block
- If the user says "upgrade to Pro" — respond with the details and include the action block so they can proceed
- If the user says "cancel my subscription" — confirm they want to cancel and include the action block
- If the user says "connect Stripe" — explain what will happen and include the action block
- Never include an ACTION block unless the user has explicitly expressed intent to perform the action
- For upgrades, always mention the price before including the action"""


def get_priority_level(tier: str) -> str:
    if "enterprise" in tier:
        return "priority"
    if "pro" in tier:
        return "priority"
    return "standard"


def parse_actions(text: str):
    """Extract action blocks from AI response text."""
    actions = []
    clean_text = text
    
    import re
    pattern = r'\[ACTION:(\w+)(?::([^\]]+))?\]'
    matches = re.findall(pattern, text)
    
    for match in matches:
        action_type = match[0]
        action_param = match[1] if match[1] else None
        actions.append({"type": action_type, "param": action_param})
    
    clean_text = re.sub(r'\[ACTION:[^\]]+\]', '', text).strip()
    
    return clean_text, actions


@router.post("/support/chat")
async def chat_with_support(msg: ChatMessage, user: User = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        conv_id = msg.conversation_id or f"conv_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)

        deals_count = await db.deals.count_documents({"user_id": user.user_id})
        connections_cursor = db.business_connections.find(
            {"user_id": user.user_id, "status": "active"}, {"_id": 0, "platform": 1}
        )
        connections = [c["platform"] async for c in connections_cursor]
        tickets_count = await db.support_tickets.count_documents({"user_id": user.user_id})

        priority = get_priority_level(user.subscription_tier)

        user_context = f"""
USER CONTEXT (use this for personalized, accurate responses):
- Name: {user.name}
- Email: {user.email}
- Current Plan: {user.subscription_tier}
- Support Level: {priority}
- Active Deals: {deals_count}
- Connected Platforms: {', '.join(connections) if connections else 'None connected yet'}
- Previous Tickets: {tickets_count}
"""

        existing = await db.support_conversations.find_one(
            {"conversation_id": conv_id, "user_id": user.user_id}, {"_id": 0}
        )

        if not existing:
            await db.support_conversations.insert_one({
                "conversation_id": conv_id,
                "user_id": user.user_id,
                "priority": priority,
                "messages": [],
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            })

        user_msg_doc = {"role": "user", "content": msg.message, "timestamp": now.isoformat()}
        await db.support_conversations.update_one(
            {"conversation_id": conv_id},
            {"$push": {"messages": user_msg_doc}, "$set": {"updated_at": now.isoformat()}}
        )

        conv = await db.support_conversations.find_one(
            {"conversation_id": conv_id}, {"_id": 0, "messages": 1}
        )
        history_msgs = conv.get("messages", [])[-10:]

        chat = LlmChat(
            api_key=api_key,
            session_id=f"support_{conv_id}",
            system_message=SYSTEM_PROMPT + user_context
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        context = ""
        for m in history_msgs[:-1]:
            role = "User" if m["role"] == "user" else "Assistant"
            context += f"{role}: {m['content']}\n"

        prompt = msg.message
        if context:
            prompt = f"Previous conversation:\n{context}\nUser: {msg.message}"

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)

        clean_response, actions = parse_actions(ai_response)

        ai_msg_doc = {
            "role": "assistant",
            "content": clean_response,
            "actions": actions,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await db.support_conversations.update_one(
            {"conversation_id": conv_id},
            {"$push": {"messages": ai_msg_doc}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )

        return {
            "conversation_id": conv_id,
            "response": clean_response,
            "actions": actions,
            "priority": priority,
        }

    except ImportError:
        raise HTTPException(status_code=500, detail="AI service not available")
    except Exception as e:
        logger.error(f"Support chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Support chat failed: {str(e)}")


@router.post("/support/action")
async def execute_action(req: ActionRequest, user: User = Depends(get_current_user)):
    """Execute an action suggested by the AI."""
    action = req.action
    params = req.params or {}

    if action == "cancel":
        user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "subscription_tier": 1})
        tier = user_doc.get("subscription_tier", "trial") if user_doc else "trial"
        if tier in ("expired", "cancelled"):
            return {"success": False, "message": "No active subscription to cancel."}
        now = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {"subscription_tier": "cancelled", "previous_tier": tier, "cancelled_at": now, "subscription_status": "cancelled"}}
        )
        return {"success": True, "message": f"Your {tier} subscription has been cancelled.", "action": "cancel"}

    elif action == "connect":
        platform = params.get("platform", "")
        valid = ["stripe", "shopify", "hubspot", "salesforce", "quickbooks"]
        if platform not in valid:
            return {"success": False, "message": f"Unknown platform. Available: {', '.join(valid)}"}
        existing = await db.business_connections.find_one(
            {"user_id": user.user_id, "platform": platform}, {"_id": 0}
        )
        if existing and existing.get("status") == "active":
            return {"success": False, "message": f"{platform.title()} is already connected."}
        return {"success": True, "message": f"Redirecting to connect {platform.title()}...", "action": "connect", "platform": platform, "redirect": f"/connect-business"}

    elif action == "upgrade":
        plan = params.get("plan", "")
        if not plan:
            return {"success": False, "message": "No plan specified."}
        return {"success": True, "message": f"Redirecting to checkout for {plan}...", "action": "upgrade", "plan": plan, "redirect": "/settings"}

    return {"success": False, "message": "Unknown action."}


@router.get("/support/conversations")
async def list_conversations(user: User = Depends(get_current_user)):
    convs = await db.support_conversations.find(
        {"user_id": user.user_id},
        {"_id": 0, "conversation_id": 1, "priority": 1, "created_at": 1, "updated_at": 1, "messages": {"$slice": -1}}
    ).sort("updated_at", -1).to_list(50)
    
    result = []
    for c in convs:
        last_msg = c.get("messages", [{}])[0] if c.get("messages") else {}
        result.append({
            "conversation_id": c["conversation_id"],
            "priority": c.get("priority", "standard"),
            "last_message": last_msg.get("content", "")[:80],
            "last_role": last_msg.get("role", ""),
            "created_at": c.get("created_at"),
            "updated_at": c.get("updated_at"),
        })
    return result


@router.get("/support/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: User = Depends(get_current_user)):
    conv = await db.support_conversations.find_one(
        {"conversation_id": conversation_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.post("/support/tickets")
async def create_ticket(ticket: TicketCreate, user: User = Depends(get_current_user)):
    priority = get_priority_level(user.subscription_tier)
    now = datetime.now(timezone.utc)
    ticket_id = f"ticket_{uuid.uuid4().hex[:12]}"
    doc = {
        "ticket_id": ticket_id,
        "user_id": user.user_id,
        "user_email": user.email,
        "user_name": user.name,
        "subject": ticket.subject,
        "description": ticket.description,
        "conversation_id": ticket.conversation_id,
        "status": "open",
        "priority": priority,
        "tier": user.subscription_tier,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.support_tickets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/support/tickets")
async def list_tickets(user: User = Depends(get_current_user)):
    tickets = await db.support_tickets.find(
        {"user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return tickets


@router.get("/support/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, user: User = Depends(get_current_user)):
    ticket = await db.support_tickets.find_one(
        {"ticket_id": ticket_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket
