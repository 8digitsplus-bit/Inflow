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


class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None
    page_context: Optional[str] = None


class SessionRename(BaseModel):
    title: str


# ── Tool Definitions ──────────────────────────────────────────────
TOOLS = {
    "query_deals": {
        "desc": "Search deals pipeline. Filter by stage, company, or value.",
        "params": "stage, company, min_value, max_value, limit (default 10)",
    },
    "analytics_summary": {
        "desc": "Overview: MRR, deal count, win rate, average deal size, stage distribution.",
        "params": "none",
    },
    "integration_status": {
        "desc": "Check connected platforms and their sync status.",
        "params": "none",
    },
    "revenue_breakdown": {
        "desc": "Monthly won revenue for last 6 months with growth rates.",
        "params": "none",
    },
    "churn_risk": {
        "desc": "Identify stagnant deals, low-probability deals, at-risk revenue.",
        "params": "none",
    },
    "deal_details": {
        "desc": "Get full details of a specific deal.",
        "params": "deal_name or deal_id",
    },
    "forecast": {
        "desc": "6-month revenue forecast: best/expected/conservative scenarios.",
        "params": "none",
    },
    "search_deals": {
        "desc": "Full-text search across deal names and companies.",
        "params": "query (required)",
    },
    "top_opportunities": {
        "desc": "List the highest-value open deals ranked by weighted value (probability * value).",
        "params": "limit (default 5)",
    },
    "stage_velocity": {
        "desc": "Average days deals spend in each pipeline stage.",
        "params": "none",
    },
    "draft_email": {
        "desc": "Draft a follow-up or outreach email for a specific deal.",
        "params": "deal_name or deal_id, email_type (follow_up, proposal, check_in)",
    },
    "score_deal": {
        "desc": "Score a deal 0-100 based on value, stage, probability, and activity recency.",
        "params": "deal_name or deal_id",
    },
}

SYSTEM_PROMPT = """You are InFlow AI — a sharp, proactive revenue intelligence copilot embedded in a B2B SaaS dashboard.

You speak naturally and concisely. Users ask you questions in plain English about their pipeline, revenue, deals, and forecasts.

AVAILABLE TOOLS:
{tools}

TOOL CALL FORMAT (one per line):
<<TOOL:tool_name|param1=value1,param2=value2>>

Examples:
<<TOOL:query_deals|stage=negotiation,limit=5>>
<<TOOL:analytics_summary|>>
<<TOOL:score_deal|deal_name=Acme Corp>>
<<TOOL:draft_email|deal_name=Acme Corp,email_type=follow_up>>

RULES:
1. Call multiple tools in one response when needed (each on its own line).
2. After receiving tool results, give a clear, structured answer with bullet points and data highlights.
3. Use currency formatting ($X,XXX) for monetary values.
4. Be proactive — if someone asks about pipeline health, pull analytics AND churn risk together.
5. NEVER fabricate data. Only reference data from tool results.
6. Keep responses concise but insight-rich. Lead with the key takeaway.
7. This is READ-ONLY mode. If a user asks to change data, explain you're in recommendation mode and suggest what they should do.
8. When giving recommendations, be specific and actionable.

PAGE CONTEXT:
The user is currently viewing: {page_context}
Tailor your responses to be relevant to what they're looking at.

USER: {user_name} ({user_plan} plan)"""


def build_tools_text() -> str:
    lines = []
    for name, info in TOOLS.items():
        lines.append(f"- {name}: {info['desc']} | Params: {info['params']}")
    return "\n".join(lines)


# ── Tool Executors ────────────────────────────────────────────────

async def run_tool(name: str, params: Dict[str, str], user_id: str) -> Dict[str, Any]:
    if name == "query_deals":
        q = {"user_id": user_id}
        if params.get("stage"):
            q["stage"] = params["stage"]
        if params.get("company"):
            q["company"] = {"$regex": params["company"], "$options": "i"}
        if params.get("min_value"):
            q["value"] = {"$gte": float(params["min_value"])}
        if params.get("max_value"):
            q.setdefault("value", {})["$lte"] = float(params["max_value"])
        limit = int(params.get("limit", 10))
        deals = await db.deals.find(q, {"_id": 0}).sort("value", -1).to_list(limit)
        total = await db.deals.count_documents(q)
        return {"deals": deals, "total": total, "showing": len(deals)}

    elif name == "analytics_summary":
        deals = await db.deals.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
        total_val = sum(d.get("value", 0) for d in deals)
        won = [d for d in deals if d.get("stage") == "closed_won"]
        lost = [d for d in deals if d.get("stage") == "closed_lost"]
        active = [d for d in deals if d.get("stage") not in ("closed_won", "closed_lost")]
        wr = (len(won) / (len(won) + len(lost)) * 100) if (len(won) + len(lost)) > 0 else 0
        stages = {}
        for d in deals:
            s = d.get("stage", "unknown")
            stages[s] = stages.get(s, 0) + 1
        return {
            "total_deals": len(deals), "pipeline_value": round(total_val, 2),
            "active": len(active), "won": len(won), "lost": len(lost),
            "win_rate": round(wr, 1), "avg_deal": round(total_val / max(len(deals), 1), 2),
            "by_stage": stages,
        }

    elif name == "integration_status":
        conns = await db.business_connections.find(
            {"user_id": user_id}, {"_id": 0, "platform": 1, "status": 1, "connected_at": 1}
        ).to_list(20)
        return {"connections": conns, "active_count": len([c for c in conns if c.get("status") == "active"])}

    elif name == "revenue_breakdown":
        deals = await db.deals.find(
            {"user_id": user_id, "stage": "closed_won"}, {"_id": 0, "value": 1, "updated_at": 1, "created_at": 1}
        ).to_list(1000)
        monthly = {}
        for d in deals:
            dt = d.get("updated_at") or d.get("created_at")
            if isinstance(dt, str):
                try:
                    dt = datetime.fromisoformat(dt)
                except Exception:
                    continue
            if dt:
                key = dt.strftime("%Y-%m")
                monthly[key] = monthly.get(key, 0) + d.get("value", 0)
        return {"monthly": {k: round(v, 2) for k, v in sorted(monthly.items())}, "total_won": round(sum(monthly.values()), 2)}

    elif name == "churn_risk":
        deals = await db.deals.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
        now = datetime.now(timezone.utc)
        stagnant, low_prob = [], []
        for d in deals:
            if d.get("stage") in ("closed_won", "closed_lost"):
                continue
            updated = d.get("updated_at")
            if isinstance(updated, str):
                try:
                    updated = datetime.fromisoformat(updated)
                except Exception:
                    continue
            if updated:
                if updated.tzinfo is None:
                    updated = updated.replace(tzinfo=timezone.utc)
                days = (now - updated).days
                if days > 14:
                    stagnant.append({"name": d["name"], "company": d.get("company"), "stage": d["stage"], "value": d["value"], "days_stagnant": days})
            if d.get("probability", 50) < 30:
                low_prob.append({"name": d["name"], "company": d.get("company"), "value": d["value"], "probability": d.get("probability")})
        risk_val = sum(d["value"] for d in stagnant) + sum(d["value"] for d in low_prob)
        return {"stagnant": stagnant[:10], "low_probability": low_prob[:10], "at_risk_value": round(risk_val, 2)}

    elif name == "deal_details":
        q = {"user_id": user_id}
        if params.get("deal_id"):
            q["deal_id"] = params["deal_id"]
        elif params.get("deal_name"):
            q["name"] = {"$regex": params["deal_name"], "$options": "i"}
        deal = await db.deals.find_one(q, {"_id": 0})
        return {"deal": deal} if deal else {"error": "Deal not found"}

    elif name == "forecast":
        deals = await db.deals.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
        prob_map = {"lead": 10, "qualified": 25, "proposal": 50, "negotiation": 75}
        open_deals = [d for d in deals if d.get("stage") in prob_map]
        won = [d for d in deals if d.get("stage") == "closed_won"]
        weighted = sum(d.get("value", 0) * prob_map.get(d.get("stage"), 10) / 100 for d in open_deals)
        won_rev = sum(d.get("value", 0) for d in won)
        base = won_rev / max(6, 1)
        return {
            "weighted_pipeline": round(weighted, 2), "won_revenue": round(won_rev, 2),
            "monthly_base": round(base, 2), "open_deals": len(open_deals),
            "expected_6mo": round((base + weighted / 6) * 6, 2),
            "best_6mo": round((base + weighted / 4) * 6, 2),
            "worst_6mo": round((base * 0.7 + weighted * 0.4 / 6) * 6, 2),
        }

    elif name == "search_deals":
        query_str = params.get("query", "")
        deals = await db.deals.find(
            {"user_id": user_id, "$or": [
                {"name": {"$regex": query_str, "$options": "i"}},
                {"company": {"$regex": query_str, "$options": "i"}},
            ]}, {"_id": 0}
        ).to_list(10)
        return {"results": deals, "count": len(deals)}

    elif name == "top_opportunities":
        limit = int(params.get("limit", 5))
        deals = await db.deals.find(
            {"user_id": user_id, "stage": {"$nin": ["closed_won", "closed_lost"]}}, {"_id": 0}
        ).to_list(500)
        prob_map = {"lead": 10, "qualified": 25, "proposal": 50, "negotiation": 75}
        for d in deals:
            d["weighted_value"] = d.get("value", 0) * prob_map.get(d.get("stage"), 10) / 100
        deals.sort(key=lambda x: x["weighted_value"], reverse=True)
        return {"opportunities": deals[:limit]}

    elif name == "stage_velocity":
        deals = await db.deals.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
        stage_days = {}
        now = datetime.now(timezone.utc)
        for d in deals:
            stage = d.get("stage", "unknown")
            created = d.get("created_at")
            updated = d.get("updated_at")
            if isinstance(created, str):
                try:
                    created = datetime.fromisoformat(created)
                except Exception:
                    continue
            if isinstance(updated, str):
                try:
                    updated = datetime.fromisoformat(updated)
                except Exception:
                    updated = None
            if created:
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                end = updated if updated else now
                if isinstance(end, str):
                    end = datetime.fromisoformat(end)
                if end.tzinfo is None:
                    end = end.replace(tzinfo=timezone.utc)
                days = (end - created).days
                stage_days.setdefault(stage, []).append(days)
        result = {}
        for stage, days_list in stage_days.items():
            result[stage] = round(sum(days_list) / len(days_list), 1)
        return {"avg_days_by_stage": result}

    elif name == "draft_email":
        deal_name = params.get("deal_name")
        deal_id = params.get("deal_id")
        email_type = params.get("email_type", "follow_up")
        q = {"user_id": user_id}
        if deal_id:
            q["deal_id"] = deal_id
        elif deal_name:
            q["name"] = {"$regex": deal_name, "$options": "i"}
        deal = await db.deals.find_one(q, {"_id": 0})
        if not deal:
            return {"error": "Deal not found"}
        return {
            "deal": deal,
            "email_type": email_type,
            "instruction": "Generate the email based on this deal data and email_type.",
        }

    elif name == "score_deal":
        deal_name = params.get("deal_name")
        deal_id = params.get("deal_id")
        q = {"user_id": user_id}
        if deal_id:
            q["deal_id"] = deal_id
        elif deal_name:
            q["name"] = {"$regex": deal_name, "$options": "i"}
        deal = await db.deals.find_one(q, {"_id": 0})
        if not deal:
            return {"error": "Deal not found"}
        now = datetime.now(timezone.utc)
        updated = deal.get("updated_at")
        if isinstance(updated, str):
            try:
                updated = datetime.fromisoformat(updated)
            except Exception:
                updated = None
        recency_days = 0
        if updated:
            if updated.tzinfo is None:
                updated = updated.replace(tzinfo=timezone.utc)
            recency_days = (now - updated).days
        return {
            "deal": deal,
            "recency_days": recency_days,
            "instruction": "Score this deal 0-100 considering value, stage progression, probability, and recency.",
        }

    return {"error": f"Unknown tool: {name}"}


def parse_tools(text: str) -> List[Dict]:
    matches = re.findall(r'<<TOOL:(\w+)\|([^>]*)>>', text)
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


def strip_tools(text: str) -> str:
    return re.sub(r'<<TOOL:\w+\|[^>]*>>', '', text).strip()


def summarize(step: Dict) -> str:
    tool, r = step["tool"], step.get("result", {})
    if "error" in r:
        return f"Error: {r['error']}"
    summaries = {
        "query_deals": lambda: f"Found {r.get('total', 0)} deals",
        "analytics_summary": lambda: f"{r.get('total_deals', 0)} deals | ${r.get('pipeline_value', 0):,.0f} pipeline | {r.get('win_rate', 0)}% win rate",
        "integration_status": lambda: f"{r.get('active_count', 0)} active integrations",
        "revenue_breakdown": lambda: f"Won revenue: ${r.get('total_won', 0):,.0f}",
        "churn_risk": lambda: f"At-risk: ${r.get('at_risk_value', 0):,.0f}",
        "deal_details": lambda: f"Deal: {r.get('deal', {}).get('name', 'N/A')}",
        "forecast": lambda: f"Expected 6mo: ${r.get('expected_6mo', 0):,.0f}",
        "search_deals": lambda: f"Found {r.get('count', 0)} matches",
        "top_opportunities": lambda: f"Top {len(r.get('opportunities', []))} opportunities",
        "stage_velocity": lambda: "Stage velocity computed",
        "draft_email": lambda: f"Email draft for: {r.get('deal', {}).get('name', 'N/A')}",
        "score_deal": lambda: f"Scoring: {r.get('deal', {}).get('name', 'N/A')}",
    }
    return summaries.get(tool, lambda: "Done")()


# ── API Endpoints ─────────────────────────────────────────────────

@router.post("/orchestrator/chat")
async def orchestrator_chat(msg: ChatMessage, user: User = Depends(get_current_user)):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        session_id = msg.session_id or f"copilot_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        page = msg.page_context or "Dashboard"

        # Get or create session
        session = await db.copilot_sessions.find_one(
            {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
        )
        if not session:
            await db.copilot_sessions.insert_one({
                "session_id": session_id,
                "user_id": user.user_id,
                "title": msg.message[:50],
                "messages": [],
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            })

        # Save user message
        user_msg = {"role": "user", "content": msg.message, "timestamp": now.isoformat()}
        await db.copilot_sessions.update_one(
            {"session_id": session_id, "user_id": user.user_id},
            {"$push": {"messages": user_msg}, "$set": {"updated_at": now.isoformat()}}
        )

        # Load conversation history
        session = await db.copilot_sessions.find_one(
            {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
        )
        history = session.get("messages", [])[-12:]

        # Build context from history
        context_parts = []
        for m in history[:-1]:
            role = "User" if m["role"] == "user" else "Assistant"
            context_parts.append(f"{role}: {m['content']}")

        prompt = msg.message
        if context_parts:
            prompt = "Conversation so far:\n" + "\n".join(context_parts[-8:]) + f"\n\nUser: {msg.message}"

        system = SYSTEM_PROMPT.format(
            tools=build_tools_text(),
            page_context=page,
            user_name=user.name,
            user_plan=user.subscription_tier or "trial",
        )

        # Agent loop (max 3 iterations)
        steps = []
        final_response = ""

        for iteration in range(3):
            chat = LlmChat(
                api_key=api_key,
                session_id=f"orch_{session_id}_{iteration}_{uuid.uuid4().hex[:6]}",
                system_message=system,
            ).with_model("anthropic", "claude-opus-4-6")

            full_prompt = prompt
            if steps:
                tool_results = "\n\nTOOL RESULTS:\n"
                for s in steps:
                    tool_results += f"\n[{s['tool']}]:\n{json.dumps(s['result'], indent=2, default=str)}\n"
                full_prompt = prompt + tool_results + "\n\nAnalyze the data and respond. Call more tools if needed, otherwise give your final answer."

            ai_response = await chat.send_message(UserMessage(text=full_prompt))
            tool_calls = parse_tools(ai_response)

            if not tool_calls:
                final_response = strip_tools(ai_response)
                break

            for tc in tool_calls:
                if tc["tool"] in TOOLS:
                    try:
                        result = await run_tool(tc["tool"], tc["params"], user.user_id)
                        steps.append({"tool": tc["tool"], "params": tc["params"], "result": result})
                    except Exception as e:
                        steps.append({"tool": tc["tool"], "params": tc["params"], "result": {"error": str(e)}})

            if iteration == 2:
                final_response = strip_tools(ai_response) or "I gathered the data — see the investigation steps for details."

        # Save assistant response
        ai_msg = {
            "role": "assistant",
            "content": final_response,
            "steps": [{"tool": s["tool"], "summary": summarize(s)} for s in steps],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await db.copilot_sessions.update_one(
            {"session_id": session_id, "user_id": user.user_id},
            {"$push": {"messages": ai_msg}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
        )

        return {
            "session_id": session_id,
            "response": final_response,
            "steps": [{"tool": s["tool"], "summary": summarize(s)} for s in steps],
        }

    except ImportError:
        raise HTTPException(status_code=500, detail="AI service not available")
    except Exception as e:
        logger.error(f"Orchestrator error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI request failed: {str(e)}")


@router.get("/orchestrator/sessions")
async def list_sessions(user: User = Depends(get_current_user)):
    sessions = await db.copilot_sessions.find(
        {"user_id": user.user_id},
        {"_id": 0, "session_id": 1, "title": 1, "created_at": 1, "updated_at": 1}
    ).sort("updated_at", -1).to_list(50)
    return {"sessions": sessions}


@router.get("/orchestrator/sessions/{session_id}")
async def get_session(session_id: str, user: User = Depends(get_current_user)):
    session = await db.copilot_sessions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/orchestrator/sessions/{session_id}")
async def delete_session(session_id: str, user: User = Depends(get_current_user)):
    result = await db.copilot_sessions.delete_one(
        {"session_id": session_id, "user_id": user.user_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": True}


@router.patch("/orchestrator/sessions/{session_id}")
async def rename_session(session_id: str, body: SessionRename, user: User = Depends(get_current_user)):
    result = await db.copilot_sessions.update_one(
        {"session_id": session_id, "user_id": user.user_id},
        {"$set": {"title": body.title, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"updated": True}
