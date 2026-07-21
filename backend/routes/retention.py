from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone
import uuid
import os
import asyncio
import logging

from database import db
from models import User
from dependencies import get_current_user, org_filter

logger = logging.getLogger(__name__)

router = APIRouter()

PAID_TIERS = {"pro_monthly", "pro_yearly", "enterprise_monthly", "enterprise_yearly"}

ACTIONS = {
    "outreach": {
        "label": "Personalized outreach",
        "system": (
            "You are a senior customer success manager writing a personalized retention email "
            "to an at-risk customer. Write a warm, specific, non-salesy email that acknowledges "
            "their situation, reaffirms value, and invites a conversation. Do NOT use emojis, "
            "hashtags, or markdown symbols. Output a Subject line, then the email body. Keep it under 180 words."
        ),
    },
    "offer": {
        "label": "Special offer",
        "system": (
            "You are a retention strategist designing a targeted save offer for an at-risk customer. "
            "Recommend a specific, ROI-justified offer (discount %, term extension, or added value), "
            "explain why it fits this account, state the guardrails (max discount, expiry), and draft a "
            "short message presenting it. Do NOT use emojis, hashtags, or markdown symbols. Use plain "
            "section titles followed by a colon. Keep it concise."
        ),
    },
    "support": {
        "label": "Support engagement",
        "system": (
            "You are a customer success lead planning a proactive support engagement for an at-risk "
            "account. Produce a short action plan: the likely friction points, a health-check agenda, "
            "who to loop in, and a suggested check-in cadence. Do NOT use emojis, hashtags, or markdown "
            "symbols. Use plain section titles followed by a colon. Keep it concise and actionable."
        ),
    },
    "workflow": {
        "label": "Retention workflow",
        "system": (
            "You are a revenue operations expert designing a multi-step retention workflow to save an "
            "at-risk account and protect recurring revenue. Lay out a sequenced play (day-by-day or "
            "step-by-step) combining outreach, value reinforcement, support, and an offer if needed, "
            "with the goal and success metric for each step. Do NOT use emojis, hashtags, or markdown "
            "symbols. Use plain numbered steps. Keep it tight."
        ),
    },
}


def _fallback_content(action_type: str, deal: dict) -> str:
    name = deal.get("name") or deal.get("company") or "this account"
    company = deal.get("company") or "the account"
    value = deal.get("value") or 0
    if action_type == "outreach":
        return (
            f"Subject: Checking in on {company}\n\n"
            f"Hi there,\n\nI wanted to personally reach out about your account with us. We noticed it has "
            f"been a little quiet lately, and your success matters to us. I'd love to understand how things "
            f"are going and where we can add more value.\n\nWould you have 15 minutes this week for a quick "
            f"call? I'll come prepared with a couple of ideas tailored to {company}.\n\nBest regards"
        )
    if action_type == "offer":
        return (
            f"Recommended offer:\nExtend a 15 to 20 percent loyalty discount for the next renewal term, "
            f"or add a value-add (onboarding session or premium support) at no cost.\n\n"
            f"Why it fits:\n{company} represents ${value:,.0f} of recurring revenue at risk; a targeted "
            f"save offer costs far less than re-acquisition.\n\nGuardrails:\nMax 20 percent discount, expires "
            f"in 14 days, single use.\n\nMessage:\nWe value your partnership and would like to offer a special "
            f"renewal incentive to keep {company} growing with us."
        )
    if action_type == "support":
        return (
            f"Support engagement plan for {company}:\n\n"
            f"Likely friction: onboarding gaps, low feature adoption, or an unresolved ticket.\n"
            f"Health-check agenda: review goals, current usage, blockers, and quick wins.\n"
            f"Loop in: account owner and a product specialist.\n"
            f"Cadence: proactive check-in now, follow-up in 7 days, then monthly."
        )
    return (
        f"Retention workflow for {company} (${value:,.0f} at risk):\n\n"
        f"1. Personalized outreach within 24 hours to reopen the conversation.\n"
        f"2. Value reinforcement: share a tailored ROI recap and one relevant win.\n"
        f"3. Support engagement: proactive health check to remove friction.\n"
        f"4. Save offer if needed: targeted incentive within guardrails.\n"
        f"5. Confirm renewal and log the outcome to protect recurring revenue."
    )


async def _generate_ai_content(action_type: str, deal: dict, user: User) -> tuple[str, bool]:
    """Return (content, ai_generated). Falls back to a template on any failure."""
    if user.subscription_tier not in PAID_TIERS:
        return _fallback_content(action_type, deal), False
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return _fallback_content(action_type, deal), False
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        cfg = ACTIONS[action_type]
        chat = LlmChat(
            api_key=api_key,
            session_id=f"retention_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message=cfg["system"],
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        prompt = (
            f"At-risk account context:\n"
            f"Deal/Contact: {deal.get('name', 'Unknown')}\n"
            f"Company: {deal.get('company', 'Unknown')}\n"
            f"Recurring value at risk: ${float(deal.get('value', 0)):,.0f}\n"
            f"Stage: {deal.get('stage', 'unknown')}\n"
            f"Win probability: {deal.get('probability', 'n/a')}%\n"
            f"Risk level: {deal.get('risk_level', 'unknown')}\n"
            f"Engagement score: {deal.get('engagement_score', 'n/a')}%\n"
            f"Days inactive: {deal.get('days_inactive', 'n/a')}\n\n"
            f"Produce the {cfg['label'].lower()} now."
        )
        resp = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=40)
        text = (resp or "").strip()
        return (text or _fallback_content(action_type, deal)), bool(text)
    except Exception as e:
        logger.warning(f"retention AI generation failed ({action_type}): {e}")
        return _fallback_content(action_type, deal), False


@router.post("/retention/plays")
async def create_retention_play(request: Request, user: User = Depends(get_current_user)):
    """Trigger a retention action for an at-risk deal and track it as a play."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    action_type = (body.get("action_type") or "").strip()
    if action_type not in ACTIONS:
        raise HTTPException(status_code=400, detail="Unknown action type")
    deal = body.get("deal") or {}
    if not deal.get("name") and not deal.get("company"):
        raise HTTPException(status_code=400, detail="A deal is required")

    content, ai_generated = await _generate_ai_content(action_type, deal, user)
    now = datetime.now(timezone.utc).isoformat()
    play = {
        "play_id": f"play_{uuid.uuid4().hex[:12]}",
        "org_id": user.org_id,
        "user_id": user.user_id,
        "deal_id": deal.get("id") or deal.get("deal_id"),
        "deal_name": deal.get("name") or deal.get("company"),
        "company": deal.get("company") or "",
        "value": float(deal.get("value", 0) or 0),
        "risk_level": deal.get("risk_level", "medium"),
        "action_type": action_type,
        "action_label": ACTIONS[action_type]["label"],
        "content": content,
        "ai_generated": ai_generated,
        "status": "open",
        "note": "",
        "created_at": now,
        "updated_at": now,
    }
    await db.retention_plays.insert_one({**play})
    return play


@router.get("/retention/plays")
async def list_retention_plays(user: User = Depends(get_current_user)):
    """List retention plays for the org with a revenue-protection summary."""
    plays = await db.retention_plays.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)
    active = [p for p in plays if p.get("status") in ("open", "in_progress")]
    saved = [p for p in plays if p.get("status") == "saved"]
    lost = [p for p in plays if p.get("status") == "lost"]
    summary = {
        "total": len(plays),
        "active": len(active),
        "saved_count": len(saved),
        "lost_count": len(lost),
        "revenue_in_play": round(sum(p.get("value", 0) for p in active), 2),
        "revenue_protected": round(sum(p.get("value", 0) for p in saved), 2),
    }
    return {"plays": plays, "summary": summary}


@router.patch("/retention/plays/{play_id}")
async def update_retention_play(play_id: str, request: Request, user: User = Depends(get_current_user)):
    """Update a play's status (open|in_progress|saved|lost) or note."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request body")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    status = body.get("status")
    if status is not None:
        if status not in ("open", "in_progress", "saved", "lost"):
            raise HTTPException(status_code=400, detail="Invalid status")
        updates["status"] = status
    if body.get("note") is not None:
        updates["note"] = str(body.get("note"))[:2000]

    result = await db.retention_plays.update_one(
        {"play_id": play_id, **org_filter(user)}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Play not found")
    play = await db.retention_plays.find_one({"play_id": play_id}, {"_id": 0})
    return play


@router.delete("/retention/plays/{play_id}")
async def delete_retention_play(play_id: str, user: User = Depends(get_current_user)):
    result = await db.retention_plays.delete_one({"play_id": play_id, **org_filter(user)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Play not found")
    return {"ok": True}
