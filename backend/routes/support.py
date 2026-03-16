from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import os
import uuid
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


INFLOW_KNOWLEDGE = """You are the AI support assistant for InFlow, a B2B SaaS platform for pricing optimization, sales pipeline management, and revenue intelligence.

PRODUCT KNOWLEDGE:
- InFlow helps businesses optimize pricing, manage sales pipelines, track revenue, predict churn, and improve conversion rates.
- Key features: Sales Pipeline (Kanban board), Sales Performance analytics, Sales Revenue tracking, Revenue Intelligence, Churn & Retention monitoring, CRO (Conversion Rate Optimization), Pricing Optimizer, Connect Your Business (integrations).
- Integrations: Stripe (payments), Shopify, HubSpot, Salesforce, QuickBooks — connected via the "Connect Business" page.

PRICING TIERS:
- Essential: $59/mo or $496/yr — Sales Pipeline, Core analytics, Email support, 1,500 usages/month
- Pro: $149/mo or $1,252/yr — Everything in Essential + Sales Performance, Priority support, Advanced analytics, Revenue forecasting, Churn prediction, CRO tools, 7,500 usages/month
- Enterprise: $249/mo or $2,092/yr — Everything in Pro + Sales Revenue, Revenue Intelligence, Custom integrations, API access, 20,000 usages/month
- 14-Day Free Trial available for all new users

COMMON SUPPORT TOPICS:
- Billing: Users can manage subscriptions and cancel from Settings page. Payments processed via Stripe.
- Features: Each tier unlocks specific features. Upgrade from Settings page.
- Data: Connect business tools from the "Connect Business" page in the sidebar.
- Pipeline: Deals are managed via drag-and-drop Kanban board. Create, edit, delete deals.
- AI Insights: Available on Pro+ tiers. Generates strategic recommendations.

GUIDELINES:
- Be helpful, concise, and professional.
- If you can help with the question, provide a clear answer.
- If the issue requires human intervention (account issues, bugs, refunds, custom requests), suggest creating a support ticket.
- Always be empathetic and solution-oriented.
- Reference specific InFlow features and pages when relevant.
"""


def get_priority_level(tier: str) -> str:
    if "enterprise" in tier:
        return "priority"
    if "pro" in tier:
        return "priority"
    return "standard"


@router.post("/support/chat")
async def chat_with_support(
    msg: ChatMessage,
    user: User = Depends(get_current_user)
):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        conv_id = msg.conversation_id or f"conv_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)

        # Get user context
        deals_count = await db.deals.count_documents({"user_id": user.user_id})
        connections = await db.business_connections.count_documents({"user_id": user.user_id, "status": "active"})
        tickets_count = await db.support_tickets.count_documents({"user_id": user.user_id})

        priority = get_priority_level(user.subscription_tier)

        user_context = f"""
USER CONTEXT (use this to personalize your response):
- Name: {user.name}
- Email: {user.email}
- Subscription: {user.subscription_tier}
- Support Level: {priority}
- Active Deals: {deals_count}
- Connected Platforms: {connections}
- Previous Tickets: {tickets_count}
"""

        # Check if conversation exists
        existing = await db.support_conversations.find_one(
            {"conversation_id": conv_id, "user_id": user.user_id},
            {"_id": 0}
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

        # Store user message
        user_msg_doc = {
            "role": "user",
            "content": msg.message,
            "timestamp": now.isoformat(),
        }
        await db.support_conversations.update_one(
            {"conversation_id": conv_id},
            {"$push": {"messages": user_msg_doc}, "$set": {"updated_at": now.isoformat()}}
        )

        # Get conversation history for context
        conv = await db.support_conversations.find_one(
            {"conversation_id": conv_id},
            {"_id": 0, "messages": 1}
        )
        history_msgs = conv.get("messages", [])[-10:]  # last 10 messages for context

        chat = LlmChat(
            api_key=api_key,
            session_id=f"support_{conv_id}",
            system_message=INFLOW_KNOWLEDGE + user_context
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        # Build conversation context
        context = ""
        for m in history_msgs[:-1]:
            role = "User" if m["role"] == "user" else "Assistant"
            context += f"{role}: {m['content']}\n"

        prompt = msg.message
        if context:
            prompt = f"Previous conversation:\n{context}\nUser: {msg.message}"

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)

        # Store AI response
        ai_msg_doc = {
            "role": "assistant",
            "content": ai_response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await db.support_conversations.update_one(
            {"conversation_id": conv_id},
            {"$push": {"messages": ai_msg_doc}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )

        return {
            "conversation_id": conv_id,
            "response": ai_response,
            "priority": priority,
        }

    except ImportError:
        raise HTTPException(status_code=500, detail="AI service not available")
    except Exception as e:
        logger.error(f"Support chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Support chat failed: {str(e)}")


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
        {"conversation_id": conversation_id, "user_id": user.user_id},
        {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.post("/support/tickets")
async def create_ticket(
    ticket: TicketCreate,
    user: User = Depends(get_current_user)
):
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
        {"user_id": user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return tickets


@router.get("/support/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, user: User = Depends(get_current_user)):
    ticket = await db.support_tickets.find_one(
        {"ticket_id": ticket_id, "user_id": user.user_id},
        {"_id": 0}
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket
