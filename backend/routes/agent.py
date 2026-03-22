from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import os
import uuid
import json
import re
import logging

from database import db
from models import User
from dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


class AgentMessage(BaseModel):
    message: str
    conversation_id: Optional[str] = None


AGENT_TOOLS = {
    "query_deals": {
        "description": "Search and analyze the user's deals pipeline. Can filter by stage, company, or value range.",
        "params": "stage (optional), company (optional), min_value (optional), max_value (optional), limit (optional, default 10)"
    },
    "get_analytics_summary": {
        "description": "Get a comprehensive analytics overview: MRR, total revenue, deal count, win rate, average deal size, stage distribution.",
        "params": "none"
    },
    "check_integrations": {
        "description": "Check the status of all connected platforms (Stripe, Shopify, HubSpot, Salesforce, QuickBooks, CSV imports).",
        "params": "none"
    },
    "get_revenue_breakdown": {
        "description": "Get revenue broken down by month for the last 6 months, including growth rates.",
        "params": "none"
    },
    "get_churn_analysis": {
        "description": "Analyze churn risk: identify deals that have been stagnant, deals with low probability, and at-risk revenue.",
        "params": "none"
    },
    "get_deal_details": {
        "description": "Get full details of a specific deal by name or deal_id.",
        "params": "deal_name (optional), deal_id (optional)"
    },
    "update_deal_stage": {
        "description": "Move a deal to a different pipeline stage. Stages: lead, qualified, proposal, negotiation, closed_won, closed_lost.",
        "params": "deal_id (required), new_stage (required)"
    },
    "get_forecast": {
        "description": "Get a 6-month revenue forecast with best/expected/conservative scenarios.",
        "params": "none"
    },
    "search_deals": {
        "description": "Full-text search across deal names and company names.",
        "params": "query (required)"
    },
    "remember": {
        "description": "Save an important fact, preference, or insight about the user for future conversations. Use this when you learn something worth remembering: a goal, a recurring issue, a preference, key context about their business, or a resolved problem.",
        "params": "fact (required) - the fact/insight to remember"
    },
    "recall_memory": {
        "description": "Retrieve all saved memories/context about this user from previous conversations.",
        "params": "none"
    },
    "escalate_to_ticket": {
        "description": "Auto-escalate the current issue to a support ticket when you cannot fully resolve it. Include a detailed summary of what was investigated and what remains unresolved. Use this when: the issue requires human intervention, you've exhausted your tools, the user is frustrated, or the problem is outside your capabilities.",
        "params": "subject (required), summary (required), severity (optional: low/medium/high, default medium)"
    },
}

AGENT_SYSTEM_PROMPT = """You are InFlow's Agentic AI Assistant — an advanced AI that can investigate data, analyze patterns, and take actions on behalf of the user.

You have access to TOOLS that let you query the user's real business data. Use them proactively to give data-driven answers.

AVAILABLE TOOLS:
{tools_description}

HOW TO USE TOOLS:
When you need data or want to take an action, output a tool call in this EXACT format on its own line:
<<TOOL:tool_name|param1=value1,param2=value2>>

Examples:
<<TOOL:query_deals|stage=negotiation,limit=5>>
<<TOOL:get_analytics_summary|>>
<<TOOL:search_deals|query=Acme Corp>>
<<TOOL:update_deal_stage|deal_id=deal_abc123,new_stage=proposal>>
<<TOOL:remember|fact=User's primary goal is to reduce churn below 5 percent>>
<<TOOL:escalate_to_ticket|subject=Stripe sync data mismatch,summary=Investigated sync issue. Found 12 deals missing from Stripe. Needs manual reconciliation.,severity=high>>

RULES:
1. You can call MULTIPLE tools in a single response — put each on its own line.
2. After receiving tool results, analyze the data and give a clear, structured response.
3. Be proactive: if the user asks "how's my pipeline?" — call get_analytics_summary AND query_deals to give a thorough answer.
4. For action requests (like moving a deal), ALWAYS confirm with the user first by showing what you plan to do. Only include the tool call for actions after confirmation.
5. Format your final response with clear sections, bullet points, and data highlights.
6. If you don't need any tools, just respond directly.
7. Keep responses concise but data-rich. Use currency formatting ($X,XXX) for monetary values.
8. NEVER fabricate data. Only reference data returned by tools.

MEMORY:
- At the start of each conversation, you receive the user's saved memories. Reference these naturally.
- Use the `remember` tool to save important facts: business goals, recurring issues, preferences, key decisions, resolved problems.
- Examples of what to remember: "User focuses on enterprise clients", "Stripe sync was fixed by reconnecting on March 15", "User prefers weekly pipeline reviews".
- Don't save trivial or temporary information.

AUTO-ESCALATION:
- If you CANNOT resolve the user's issue after investigation (e.g., a bug, data corruption, billing dispute, platform error), use `escalate_to_ticket` to create a support ticket automatically.
- Include ALL context: what you investigated, what you found, and what remains unresolved.
- Tell the user you've escalated and what to expect.
- Escalate when: the issue requires human/engineering intervention, you've hit the limits of your tools, the user explicitly asks for human help, or you detect the same issue recurring.

{user_memories}

PERSONALITY:
- You're a sharp revenue operations analyst
- Lead with insights, not just data dumps
- Flag risks and opportunities proactively
- Be direct and actionable
- Reference past context naturally when relevant

USER CONTEXT:
- Name: {user_name}
- Plan: {user_plan}
"""


async def execute_tool(tool_name: str, params: Dict[str, str], user: User) -> Dict[str, Any]:
    """Execute an agent tool and return results."""
    user_id = user.user_id

    if tool_name == "query_deals":
        query = {"user_id": user_id}
        if params.get("stage"):
            query["stage"] = params["stage"]
        if params.get("company"):
            query["company"] = {"$regex": params["company"], "$options": "i"}
        if params.get("min_value"):
            query["value"] = {"$gte": float(params["min_value"])}
        if params.get("max_value"):
            query.setdefault("value", {})
            query["value"]["$lte"] = float(params["max_value"])
        limit = int(params.get("limit", 10))
        deals = await db.deals.find(query, {"_id": 0}).sort("value", -1).to_list(limit)
        total = await db.deals.count_documents(query)
        return {"deals": deals, "total_matching": total, "showing": len(deals)}

    elif tool_name == "get_analytics_summary":
        deals = await db.deals.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
        total_value = sum(d.get("value", 0) for d in deals)
        won = [d for d in deals if d.get("stage") == "closed_won"]
        lost = [d for d in deals if d.get("stage") == "closed_lost"]
        active = [d for d in deals if d.get("stage") not in ("closed_won", "closed_lost")]
        win_rate = (len(won) / (len(won) + len(lost)) * 100) if (len(won) + len(lost)) > 0 else 0
        avg_value = total_value / len(deals) if deals else 0
        stages = {}
        for d in deals:
            s = d.get("stage", "unknown")
            stages[s] = stages.get(s, 0) + 1
        stage_values = {}
        for d in deals:
            s = d.get("stage", "unknown")
            stage_values[s] = stage_values.get(s, 0) + d.get("value", 0)
        return {
            "total_deals": len(deals),
            "total_pipeline_value": round(total_value, 2),
            "active_deals": len(active),
            "won_deals": len(won),
            "lost_deals": len(lost),
            "win_rate_percent": round(win_rate, 1),
            "average_deal_value": round(avg_value, 2),
            "deals_by_stage": stages,
            "value_by_stage": {k: round(v, 2) for k, v in stage_values.items()},
        }

    elif tool_name == "check_integrations":
        connections = await db.business_connections.find(
            {"user_id": user_id}, {"_id": 0, "platform": 1, "status": 1, "connected_at": 1}
        ).to_list(20)
        return {"connections": connections, "total_connected": len([c for c in connections if c.get("status") == "active"])}

    elif tool_name == "get_revenue_breakdown":
        deals = await db.deals.find(
            {"user_id": user_id, "stage": "closed_won"}, {"_id": 0, "value": 1, "updated_at": 1, "created_at": 1}
        ).to_list(1000)
        monthly = {}
        for d in deals:
            dt = d.get("updated_at") or d.get("created_at")
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt)
            if dt:
                key = dt.strftime("%Y-%m")
                monthly[key] = monthly.get(key, 0) + d.get("value", 0)
        sorted_months = sorted(monthly.items())
        return {"monthly_revenue": {k: round(v, 2) for k, v in sorted_months}, "total_won_revenue": round(sum(monthly.values()), 2)}

    elif tool_name == "get_churn_analysis":
        deals = await db.deals.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
        now = datetime.now(timezone.utc)
        stagnant = []
        low_prob = []
        for d in deals:
            if d.get("stage") in ("closed_won", "closed_lost"):
                continue
            updated = d.get("updated_at")
            if isinstance(updated, str):
                updated = datetime.fromisoformat(updated)
            if updated:
                if updated.tzinfo is None:
                    updated = updated.replace(tzinfo=timezone.utc)
                days_since = (now - updated).days
                if days_since > 14:
                    stagnant.append({"name": d["name"], "company": d.get("company"), "stage": d["stage"], "value": d["value"], "days_stagnant": days_since})
            if d.get("probability", 50) < 30:
                low_prob.append({"name": d["name"], "company": d.get("company"), "stage": d["stage"], "value": d["value"], "probability": d.get("probability")})
        at_risk_value = sum(d["value"] for d in stagnant) + sum(d["value"] for d in low_prob)
        return {
            "stagnant_deals": sorted(stagnant, key=lambda x: x["days_stagnant"], reverse=True)[:10],
            "low_probability_deals": sorted(low_prob, key=lambda x: x["probability"])[:10],
            "total_at_risk_value": round(at_risk_value, 2),
        }

    elif tool_name == "get_deal_details":
        query = {"user_id": user_id}
        if params.get("deal_id"):
            query["deal_id"] = params["deal_id"]
        elif params.get("deal_name"):
            query["name"] = {"$regex": params["deal_name"], "$options": "i"}
        deal = await db.deals.find_one(query, {"_id": 0})
        return {"deal": deal} if deal else {"error": "Deal not found"}

    elif tool_name == "update_deal_stage":
        deal_id = params.get("deal_id")
        new_stage = params.get("new_stage")
        valid_stages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]
        if new_stage not in valid_stages:
            return {"error": f"Invalid stage. Valid stages: {', '.join(valid_stages)}"}
        result = await db.deals.update_one(
            {"deal_id": deal_id, "user_id": user_id},
            {"$set": {"stage": new_stage, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        if result.modified_count == 0:
            return {"error": "Deal not found or not modified"}
        return {"success": True, "deal_id": deal_id, "new_stage": new_stage}

    elif tool_name == "get_forecast":
        deals = await db.deals.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
        stage_prob = {"lead": 10, "qualified": 25, "proposal": 50, "negotiation": 75}
        open_deals = [d for d in deals if d.get("stage") in stage_prob]
        closed_won = [d for d in deals if d.get("stage") == "closed_won"]
        weighted = sum(d.get("value", 0) * (stage_prob.get(d.get("stage"), 10) / 100) for d in open_deals)
        won_revenue = sum(d.get("value", 0) for d in closed_won)
        base_monthly = won_revenue / max(6, 1)
        return {
            "weighted_pipeline": round(weighted, 2),
            "total_won_revenue": round(won_revenue, 2),
            "base_monthly_revenue": round(base_monthly, 2),
            "open_deals": len(open_deals),
            "expected_6mo": round((base_monthly + weighted / 6) * 6, 2),
            "best_6mo": round((base_monthly + weighted / 4) * 6, 2),
            "worst_6mo": round((base_monthly * 0.7 + weighted * 0.4 / 6) * 6, 2),
        }

    elif tool_name == "search_deals":
        query_str = params.get("query", "")
        deals = await db.deals.find(
            {"user_id": user_id, "$or": [
                {"name": {"$regex": query_str, "$options": "i"}},
                {"company": {"$regex": query_str, "$options": "i"}},
            ]}, {"_id": 0}
        ).to_list(10)
        return {"results": deals, "count": len(deals)}

    elif tool_name == "remember":
        fact = params.get("fact", "").strip()
        if not fact:
            return {"error": "No fact provided to remember"}
        now = datetime.now(timezone.utc)
        await db.agent_memory.update_one(
            {"user_id": user_id},
            {"$push": {"memories": {"fact": fact, "saved_at": now.isoformat()}},
             "$set": {"updated_at": now.isoformat()},
             "$setOnInsert": {"created_at": now.isoformat()}},
            upsert=True,
        )
        # Keep only the latest 50 memories per user
        await db.agent_memory.update_one(
            {"user_id": user_id},
            {"$push": {"memories": {"$each": [], "$slice": -50}}}
        )
        return {"saved": True, "fact": fact}

    elif tool_name == "recall_memory":
        mem_doc = await db.agent_memory.find_one({"user_id": user_id}, {"_id": 0, "memories": 1})
        memories = mem_doc.get("memories", []) if mem_doc else []
        return {"memories": memories, "count": len(memories)}

    elif tool_name == "escalate_to_ticket":
        subject = params.get("subject", "Auto-escalated issue")
        summary = params.get("summary", "The agent could not resolve this issue.")
        severity = params.get("severity", "medium")
        now = datetime.now(timezone.utc)
        ticket_id = f"ticket_{uuid.uuid4().hex[:12]}"
        ticket = {
            "ticket_id": ticket_id,
            "user_id": user_id,
            "subject": f"[Auto-Escalated] {subject}",
            "description": summary,
            "status": "open",
            "priority": "priority" if severity == "high" else "normal",
            "severity": severity,
            "source": "agent_escalation",
            "conversation_id": params.get("_conversation_id"),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.support_tickets.insert_one(ticket)
        del ticket["_id"]
        return {"escalated": True, "ticket_id": ticket_id, "subject": subject, "severity": severity}

    return {"error": f"Unknown tool: {tool_name}"}


def parse_tool_calls(text: str) -> List[Dict[str, Any]]:
    """Parse tool calls from AI response text."""
    pattern = r'<<TOOL:(\w+)\|([^>]*)>>'
    matches = re.findall(pattern, text)
    calls = []
    for tool_name, params_str in matches:
        params = {}
        if params_str.strip():
            for pair in params_str.split(","):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    params[k.strip()] = v.strip()
        calls.append({"tool": tool_name, "params": params})
    return calls


def clean_tool_calls(text: str) -> str:
    """Remove tool call syntax from response text."""
    return re.sub(r'<<TOOL:\w+\|[^>]*>>', '', text).strip()


def build_tools_description() -> str:
    lines = []
    for name, info in AGENT_TOOLS.items():
        lines.append(f"- **{name}**: {info['description']}\n  Parameters: {info['params']}")
    return "\n".join(lines)


@router.post("/support/agent")
async def agent_chat(msg: AgentMessage, user: User = Depends(get_current_user)):
    """Agentic AI endpoint - can investigate data and take actions."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        conv_id = msg.conversation_id or f"agent_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)

        # Create or get conversation
        existing = await db.support_conversations.find_one(
            {"conversation_id": conv_id, "user_id": user.user_id}, {"_id": 0}
        )
        if not existing:
            await db.support_conversations.insert_one({
                "conversation_id": conv_id,
                "user_id": user.user_id,
                "mode": "agent",
                "priority": "priority",
                "messages": [],
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            })

        # Save user message
        user_msg_doc = {"role": "user", "content": msg.message, "timestamp": now.isoformat()}
        await db.support_conversations.update_one(
            {"conversation_id": conv_id},
            {"$push": {"messages": user_msg_doc}, "$set": {"updated_at": now.isoformat()}}
        )

        # Get conversation history
        conv = await db.support_conversations.find_one(
            {"conversation_id": conv_id}, {"_id": 0, "messages": 1}
        )
        history = conv.get("messages", [])[-10:]

        # Load user memories for cross-conversation context
        mem_doc = await db.agent_memory.find_one({"user_id": user.user_id}, {"_id": 0, "memories": 1})
        memories = mem_doc.get("memories", []) if mem_doc else []
        memory_text = ""
        if memories:
            memory_lines = [f"- {m['fact']} (saved {m.get('saved_at', 'unknown')})" for m in memories[-20:]]
            memory_text = "SAVED MEMORIES ABOUT THIS USER:\n" + "\n".join(memory_lines)

        # Build system prompt
        tools_desc = build_tools_description()
        system_prompt = AGENT_SYSTEM_PROMPT.format(
            tools_description=tools_desc,
            user_name=user.name,
            user_plan=user.subscription_tier,
            user_memories=memory_text,
        )

        # Build conversation context
        context_parts = []
        for m in history[:-1]:
            role = "User" if m["role"] == "user" else "Assistant"
            context_parts.append(f"{role}: {m['content']}")

        prompt = msg.message
        if context_parts:
            prompt = "Previous conversation:\n" + "\n".join(context_parts) + f"\n\nUser: {msg.message}"

        # Agent loop - max 3 iterations
        steps = []
        final_response = ""
        max_iterations = 3

        for iteration in range(max_iterations):
            chat = LlmChat(
                api_key=api_key,
                session_id=f"agent_{conv_id}_{iteration}",
                system_message=system_prompt,
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")

            full_prompt = prompt
            if steps:
                tool_results = "\n\nTOOL RESULTS FROM PREVIOUS CALLS:\n"
                for step in steps:
                    tool_results += f"\n[{step['tool']}] Result:\n{json.dumps(step['result'], indent=2, default=str)}\n"
                full_prompt = prompt + tool_results + "\n\nNow analyze the data above and provide your response. If you need more data, call more tools. Otherwise, give your final analysis."

            user_message = UserMessage(text=full_prompt)
            ai_response = await chat.send_message(user_message)

            # Parse tool calls
            tool_calls = parse_tool_calls(ai_response)

            if not tool_calls:
                # No more tool calls - this is the final response
                final_response = clean_tool_calls(ai_response)
                break
            else:
                # Execute tools
                for tc in tool_calls:
                    tool_name = tc["tool"]
                    tool_params = tc["params"]
                    # Inject conversation_id for escalation tool
                    if tool_name == "escalate_to_ticket":
                        tool_params["_conversation_id"] = conv_id
                    if tool_name in AGENT_TOOLS:
                        try:
                            result = await execute_tool(tool_name, tool_params, user)
                            steps.append({
                                "tool": tool_name,
                                "params": tool_params,
                                "result": result,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                        except Exception as e:
                            steps.append({
                                "tool": tool_name,
                                "params": tool_params,
                                "result": {"error": str(e)},
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })

                # If this is the last iteration, get final response
                if iteration == max_iterations - 1:
                    final_response = clean_tool_calls(ai_response) or "I've gathered the data but couldn't formulate a complete response. Here's what I found in the investigation steps."

        # Check if auto-escalation happened
        escalated_ticket = None
        memory_saved = False
        for s in steps:
            if s["tool"] == "escalate_to_ticket" and s["result"].get("escalated"):
                escalated_ticket = s["result"]
            if s["tool"] == "remember" and s["result"].get("saved"):
                memory_saved = True

        # Also parse any remaining action blocks (upgrade/cancel/connect)
        from routes.support import parse_actions
        clean_response, actions = parse_actions(final_response)

        # Save assistant response
        ai_msg_doc = {
            "role": "assistant",
            "content": clean_response,
            "mode": "agent",
            "steps": [{"tool": s["tool"], "params": {k: v for k, v in s["params"].items() if not k.startswith("_")}, "summary": _summarize_result(s)} for s in steps],
            "actions": actions,
            "escalated": escalated_ticket,
            "memory_saved": memory_saved,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await db.support_conversations.update_one(
            {"conversation_id": conv_id},
            {"$push": {"messages": ai_msg_doc}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )

        return {
            "conversation_id": conv_id,
            "response": clean_response,
            "steps": [{"tool": s["tool"], "params": {k: v for k, v in s["params"].items() if not k.startswith("_")}, "summary": _summarize_result(s)} for s in steps],
            "actions": actions,
            "mode": "agent",
            "escalated": escalated_ticket,
            "memory_saved": memory_saved,
        }

    except ImportError:
        raise HTTPException(status_code=500, detail="AI service not available")
    except Exception as e:
        logger.error(f"Agent error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Agent failed: {str(e)}")


def _summarize_result(step: Dict) -> str:
    """Create a short human-readable summary of a tool result."""
    tool = step["tool"]
    result = step.get("result", {})

    if "error" in result:
        return f"Error: {result['error']}"

    if tool == "query_deals":
        return f"Found {result.get('total_matching', 0)} deals (showing {result.get('showing', 0)})"
    elif tool == "get_analytics_summary":
        return f"Pipeline: {result.get('total_deals', 0)} deals worth ${result.get('total_pipeline_value', 0):,.0f} | Win rate: {result.get('win_rate_percent', 0)}%"
    elif tool == "check_integrations":
        return f"{result.get('total_connected', 0)} active integrations"
    elif tool == "get_revenue_breakdown":
        return f"Total won revenue: ${result.get('total_won_revenue', 0):,.0f}"
    elif tool == "get_churn_analysis":
        return f"At-risk value: ${result.get('total_at_risk_value', 0):,.0f}"
    elif tool == "get_deal_details":
        d = result.get("deal", {})
        return f"Deal: {d.get('name', 'N/A')} ({d.get('stage', 'N/A')}) - ${d.get('value', 0):,.0f}" if d else "Deal not found"
    elif tool == "update_deal_stage":
        return f"Moved deal to {result.get('new_stage', 'N/A')}" if result.get("success") else result.get("error", "Failed")
    elif tool == "get_forecast":
        s = result.get("summary", {})
        return f"Forecasted revenue: ${s.get('expected_total', 0):,.0f} (expected)"
    elif tool == "search_deals":
        return f"Found {result.get('count', 0)} matching deals"
    elif tool == "remember":
        return f"Saved: {result.get('fact', '')[:60]}"
    elif tool == "recall_memory":
        return f"Loaded {result.get('count', 0)} memories"
    elif tool == "escalate_to_ticket":
        return f"Escalated: {result.get('subject', 'Issue')} ({result.get('severity', 'medium')})" if result.get("escalated") else result.get("error", "Failed")
    return "Completed"
