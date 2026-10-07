from fastapi import APIRouter, HTTPException, Request, Depends
import os
import uuid
import asyncio
import logging

from database import db
from models import User, PricingAnalysis, PricingAnalysisRequest, AIInsightRequest
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

AI_TIMEOUT = 45  # seconds


async def call_llm_with_timeout(chat, message, timeout=AI_TIMEOUT):
    """Call LLM with timeout and single retry on failure."""
    from emergentintegrations.llm.chat import UserMessage
    for attempt in range(2):
        try:
            return await asyncio.wait_for(
                chat.send_message(UserMessage(text=message)),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            if attempt == 0:
                logger.warning("LLM call timed out, retrying...")
                continue
            raise HTTPException(status_code=504, detail="AI service timed out. Please try again.")
        except Exception as e:
            if attempt == 0 and ("502" in str(e) or "503" in str(e) or "BadGateway" in str(e)):
                logger.warning(f"LLM transient error, retrying: {e}")
                await asyncio.sleep(1)
                continue
            raise


AI_MODEL = "claude-sonnet-5-5"


def _parse_ai_json(text: str):
    """Best-effort parse of a single JSON object from an LLM response."""
    import json
    import re
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t).strip()
    try:
        return json.loads(t)
    except Exception:
        a, b = t.find("{"), t.rfind("}")
        if a != -1 and b > a:
            try:
                return json.loads(t[a:b + 1])
            except Exception:
                return None
    return None


async def _ai_cards(system: str, prompt: str, session_prefix: str, fallback: dict):
    """Return (structured_dict, ai_used). Falls back to a deterministic card set. Never raises."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            return fallback, False
        chat = LlmChat(
            api_key=api_key,
            session_id=f"{session_prefix}_{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("anthropic", AI_MODEL)
        resp = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=AI_TIMEOUT)
        parsed = _parse_ai_json(resp if isinstance(resp, str) else str(resp))
        if isinstance(parsed, dict) and parsed:
            return parsed, True
        return fallback, False
    except Exception as e:
        logger.warning("AI cards failed (%s): %s", session_prefix, e)
        return fallback, False


@router.post("/ai/pricing-analysis-product")
async def analyze_pricing_product(
    analysis_request: PricingAnalysisRequest,
    user: User = Depends(get_current_user)
):
    """Get AI-powered pricing analysis for a single product"""
    if user.subscription_tier == "free":
        raise HTTPException(
            status_code=403,
            detail="Upgrade to Pro or Enterprise for AI pricing analysis"
        )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        chat = LlmChat(
            api_key=api_key,
            session_id=f"pricing_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert pricing strategist and revenue optimization consultant.
            Analyze pricing data and provide actionable recommendations. Be concise but thorough.
            Structure your response with numbered sections and bullet points.
            Do NOT use emojis, hashtags, or markdown formatting symbols like # ## ** or *. Write in plain, professional English with clear section titles on their own line followed by a colon.
            Always include: 1) Optimal price recommendation, 2) Margin analysis, 3) Competitive positioning, 
            4) Volume impact assessment, 5) Discount strategy, 6) Risk factors, 7) Implementation roadmap."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        avg_competitor = sum(analysis_request.competitor_prices) / max(len(analysis_request.competitor_prices), 1)

        cogs_section = ""
        if analysis_request.cost_of_goods:
            current_margin = ((analysis_request.current_price - analysis_request.cost_of_goods) / max(analysis_request.current_price, 1)) * 100
            cogs_section = f"""
Cost of Goods: ${analysis_request.cost_of_goods}
Current Gross Margin: {current_margin:.1f}%"""

        volume_section = ""
        if analysis_request.monthly_volume:
            monthly_rev = analysis_request.current_price * analysis_request.monthly_volume
            volume_section = f"""
Monthly Volume: {analysis_request.monthly_volume} units
Monthly Revenue: ${monthly_rev:,.2f}"""

        discount_section = ""
        if analysis_request.discount_percentage and analysis_request.discount_percentage > 0:
            effective_price = analysis_request.current_price * (1 - analysis_request.discount_percentage / 100)
            discount_section = f"""
Current Avg Discount: {analysis_request.discount_percentage}%
Effective Selling Price: ${effective_price:.2f}"""

        history_section = ""
        if analysis_request.price_history:
            history_section = "\nPrice History:"
            for h in analysis_request.price_history[:5]:
                history_section += f"\n  - {h.get('date', 'N/A')}: ${h.get('price', 0)} ({h.get('note', '')})"

        prompt = f"""Analyze this pricing scenario and provide comprehensive optimization recommendations:

Product: {analysis_request.product_name}
Current Price: ${analysis_request.current_price}
Competitor Prices: {', '.join([f'${p}' for p in analysis_request.competitor_prices])}
Average Competitor Price: ${avg_competitor:.2f}
Target Margin: {analysis_request.target_margin}%
Market Segment: {analysis_request.market_segment}{cogs_section}{volume_section}{discount_section}{history_section}

Provide a comprehensive analysis covering:
1. **Optimal Price** - Specific recommendation with reasoning
2. **Margin Analysis** - Current vs optimal margins, break-even assessment
3. **Competitive Positioning** - Where you stand vs competitors, recommended strategy (penetration/premium/competitive)
4. **Volume Impact** - How the price change might affect volume and total revenue
5. **Discount Strategy** - Recommended discount tiers and when to apply them
6. **Risk Assessment** - Key risks of changing price and mitigation strategies
7. **Implementation Roadmap** - Step-by-step plan to implement the new pricing"""

        ai_response = await call_llm_with_timeout(chat, prompt)

        price_diff = avg_competitor - analysis_request.current_price
        suggested_adjustment = min(max(price_diff * 0.3, -analysis_request.current_price * 0.15), analysis_request.current_price * 0.25)
        optimal_price = round(analysis_request.current_price + suggested_adjustment, 2)

        cogs = analysis_request.cost_of_goods or (analysis_request.current_price * 0.6)
        current_margin = round(((analysis_request.current_price - cogs) / max(analysis_request.current_price, 1)) * 100, 1)
        optimal_margin = round(((optimal_price - cogs) / max(optimal_price, 1)) * 100, 1)
        volume = analysis_request.monthly_volume or 100
        current_monthly_rev = analysis_request.current_price * volume
        optimal_monthly_rev = optimal_price * volume * 0.97
        revenue_impact = round(optimal_monthly_rev - current_monthly_rev, 2)

        analysis = PricingAnalysis(
            user_id=user.user_id,
            product_name=analysis_request.product_name,
            current_price=analysis_request.current_price,
            competitor_prices=analysis_request.competitor_prices,
            target_margin=analysis_request.target_margin,
            market_segment=analysis_request.market_segment,
            ai_recommendation=ai_response,
            optimal_price=optimal_price
        )

        analysis_dict = analysis.model_dump()
        analysis_dict["created_at"] = analysis_dict["created_at"].isoformat()
        if analysis_request.cost_of_goods:
            analysis_dict["cost_of_goods"] = analysis_request.cost_of_goods
        if analysis_request.monthly_volume:
            analysis_dict["monthly_volume"] = analysis_request.monthly_volume
        await db.pricing_analyses.insert_one(analysis_dict)

        return {
            "analysis_id": analysis.analysis_id,
            "optimal_price": optimal_price,
            "recommendation": ai_response,
            "competitor_average": round(avg_competitor, 2),
            "price_position": "below" if analysis_request.current_price < avg_competitor else "above",
            "current_margin": current_margin,
            "optimal_margin": optimal_margin,
            "revenue_impact_monthly": revenue_impact,
            "price_change_pct": round(((optimal_price - analysis_request.current_price) / max(analysis_request.current_price, 1)) * 100, 1),
            "competitor_range": {
                "min": round(min(analysis_request.competitor_prices), 2),
                "max": round(max(analysis_request.competitor_prices), 2),
                "avg": round(avg_competitor, 2)
            }
        }

    except ImportError:
        raise HTTPException(status_code=500, detail="AI service not available")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail="AI analysis failed. Please try again.")


@router.post("/ai/pricing-analysis")
async def analyze_pricing_summary(request: Request, user: User = Depends(get_current_user)):
    """Pricing AI: explains the deterministic pricing numbers and prescribes price moves. Lane: pricing only."""
    if user.subscription_tier == "free":
        raise HTTPException(status_code=403, detail="Upgrade to Pro or Enterprise for AI pricing analysis")

    from routes.analytics import get_pricing_analytics
    p = await get_pricing_analytics(user=user, sources=None)
    gaps = [g for g in p.get("price_comparison_data", []) if abs(g.get("gap", 0) or 0) > 0][:6]
    uplift = p.get("potential_revenue_uplift", 0) or 0

    fallback = {
        "headline": f"Closing your price-to-optimal gap could add about ${uplift:,.0f} in revenue.",
        "upside": uplift,
        "moves": ([
            {"change": f"Move {g.get('product')} from ${g.get('current_price', 0):,.0f} to ${g.get('optimal_price', 0):,.0f}",
             "rationale": "Priced below the modeled optimal for its segment",
             "projected_delta": g.get("gap", 0), "confidence": "medium"} for g in gaps[:4]
        ] or [{"change": "Run a pricing analysis on your top products",
               "rationale": "No price gaps detected yet", "projected_delta": 0, "confidence": "low"}]),
    }

    gaps_txt = "\n".join(
        f"- {g.get('product')}: current ${g.get('current_price', 0):,.0f}, optimal ${g.get('optimal_price', 0):,.0f}, gap ${g.get('gap', 0):,.0f}"
        for g in gaps) or "No per-product gaps available."
    system = (
        "You are a B2B SaaS PRICING strategist. You ONLY address pricing and packaging. "
        "Never give churn/retention, funnel/CRO, or forecasting advice. "
        "Ground every move in the numbers provided; never invent products or figures. "
        "Return ONLY strict minified JSON (no prose, no markdown) matching exactly: "
        '{"headline":string,"upside":number,"moves":[{"change":string,"rationale":string,"projected_delta":number,"confidence":"high"|"medium"|"low"}]}. '
        "Max 4 moves, ordered by projected_delta descending."
    )
    prompt = (
        f"Products analyzed: {p.get('total_analyses')}\n"
        f"Avg current price: ${p.get('avg_current_price', 0):,.2f}\n"
        f"Avg optimal price: ${p.get('avg_optimal_price', 0):,.2f}\n"
        f"Avg price gap: ${p.get('price_gap', 0):,.2f}\n"
        f"Potential revenue uplift: ${uplift:,.0f}\n"
        f"Per-product gaps:\n{gaps_txt}\n\n"
        "Recommend specific price moves and the projected revenue delta of each."
    )
    result, used = await _ai_cards(system, prompt, f"pricing_{user.user_id}", fallback)
    return {**result, "ai_used": used}


@router.post("/ai/insights")
async def get_ai_insights(insight_request: AIInsightRequest, user: User = Depends(get_current_user)):
    """Insights AI: executive revenue-health summary across the business. Lane: overview + pointers, not deep tactics."""
    if user.subscription_tier == "free":
        raise HTTPException(status_code=403, detail="Upgrade to Pro or Enterprise for AI insights")

    from routes.analytics import get_revenue_analytics
    r = await get_revenue_analytics(user=user, sources=None)
    closed = r.get("closed_revenue", 0) or 0
    pipeline = r.get("total_pipeline", 0) or 0
    projected = r.get("projected_revenue", 0) or 0
    win = r.get("win_rate", 0) or 0

    fallback = {
        "headline": f"${closed:,.0f} collected with ${pipeline:,.0f} in pipeline and a {win}% win rate.",
        "signals": [
            {"signal": "Weighted pipeline", "trend": "flat", "impact": projected,
             "action": "Prioritize the deals with the highest expected value"},
            {"signal": "Win rate", "trend": "flat", "impact": closed,
             "action": "Review stage conversion in Conversion Optimization"},
            {"signal": "Open pipeline", "trend": "flat", "impact": pipeline,
             "action": "Keep late-stage deals moving to protect the forecast"},
        ],
    }

    system = (
        "You are a revenue operations analyst giving an EXECUTIVE revenue-health summary. "
        "Stay at the overview level: overall revenue, pipeline health and momentum. "
        "Do NOT produce detailed churn save-plays, specific price changes or funnel experiments — "
        "those live in dedicated tools; if relevant, name the signal and point to them. "
        "Ground everything in the numbers provided; no invented figures. "
        "Return ONLY strict minified JSON (no prose, no markdown) matching exactly: "
        '{"headline":string,"signals":[{"signal":string,"trend":"up"|"down"|"flat","impact":number,"action":string}]}. '
        "Exactly 3 signals, each tied to a dollar impact."
    )
    prompt = (
        f"Collected revenue: ${closed:,.0f}\nTotal pipeline: ${pipeline:,.0f}\n"
        f"Projected (weighted) revenue: ${projected:,.0f}\nWin rate: {win}%\n"
        f"Avg deal size: ${r.get('avg_deal_size', 0) or 0:,.0f}\n"
        f"Context from caller: {insight_request.context or 'n/a'}\n\n"
        "Summarize revenue health in exactly 3 signals, each with a dollar impact and a one-line next step."
    )
    result, used = await _ai_cards(system, prompt, f"insight_{user.user_id}", fallback)
    return {**result, "ai_used": used}


@router.post("/ai/churn-prediction")
async def predict_churn(request: Request, user: User = Depends(get_current_user)):
    """Retention AI: explains the deterministic churn numbers and prescribes save-plays. Lane: retention only."""
    if user.subscription_tier in ["free", "essential_monthly", "essential_yearly"]:
        raise HTTPException(status_code=403, detail="Upgrade to Pro or Priority for AI churn prediction")

    from routes.analytics import get_churn_analytics
    c = await get_churn_analytics(user=user, sources=None)
    at_risk = (c.get("at_risk_deals") or [])[:6]
    reasons = (c.get("churn_reasons") or [])[:3]
    rar = c.get("revenue_at_risk", 0) or 0

    fallback = {
        "headline": f"Churn {c.get('churn_rate', 0)}% with ${rar:,.0f} of open pipeline at risk — protect your highest-value accounts first.",
        "risk_score": int(min(100, round((c.get('churn_rate', 0) or 0) * 2 + max(0, 100 - (c.get('nrr', 100) or 100)) * 0.5))),
        "at_risk_revenue": rar,
        "drivers": ([{"factor": r.get("reason"), "detail": f"{r.get('pct', 0)}% of lost deals"} for r in reasons]
                    or [{"factor": "Net revenue retention", "detail": f"NRR at {c.get('nrr', 100)}%"}]),
        "save_plays": ([{"account": d.get("company") or d.get("name"),
                         "play": "Schedule an executive check-in and re-confirm success criteria",
                         "value": d.get("value", 0)} for d in at_risk[:4]]
                       or [{"account": "Portfolio", "play": "Stand up a QBR cadence for accounts below 50% win probability",
                            "value": rar}]),
    }

    accounts_txt = "\n".join(
        f"- {d.get('company') or d.get('name')}: ${d.get('value', 0):,.0f}, stage {d.get('stage')}, {d.get('probability')}% win, risk {d.get('risk_level')}"
        for d in at_risk) or "No specific at-risk accounts flagged."
    reasons_txt = ", ".join(f"{r.get('reason')} ({r.get('pct')}%)" for r in reasons) or "n/a"
    system = (
        "You are a B2B SaaS RETENTION strategist. You ONLY diagnose churn/retention and prescribe retention save-plays. "
        "Never give pricing, funnel/CRO or forecasting advice — those belong to other tools. "
        "Ground every statement in the numbers provided; do not invent accounts or figures. "
        "Return ONLY strict minified JSON (no prose, no markdown) matching exactly: "
        '{"headline":string,"risk_score":number,"at_risk_revenue":number,'
        '"drivers":[{"factor":string,"detail":string}],'
        '"save_plays":[{"account":string,"play":string,"value":number}]}. '
        "Max 3 drivers and 4 save_plays. Tie each save_play to a real at-risk account when available."
    )
    prompt = (
        f"Churn rate: {c.get('churn_rate')}%\nRetention: {c.get('retention_rate')}%\nNRR: {c.get('nrr')}%\n"
        f"Revenue at risk (open pipeline): ${rar:,.0f}\nLost revenue: ${c.get('lost_revenue', 0):,.0f}\n"
        f"CLV: ${c.get('clv', 0):,.0f} | ARPA: ${c.get('arpa', 0):,.0f} | Health score: {c.get('health_score')}\n"
        f"Top loss reasons: {reasons_txt}\nAt-risk accounts:\n{accounts_txt}\n\n"
        "Explain what is driving churn and give concrete save-plays for the named accounts."
    )
    result, used = await _ai_cards(system, prompt, f"churn_{user.user_id}", fallback)
    return {**result, "ai_used": used}


@router.post("/ai/cro-recommendations")
async def get_cro_recommendations(request: Request, user: User = Depends(get_current_user)):
    """CRO AI: turns the deterministic funnel into testable experiments. Lane: conversion/velocity only."""
    if user.subscription_tier in ["free", "essential_monthly", "essential_yearly"]:
        raise HTTPException(status_code=403, detail="Upgrade to Pro or Priority for AI CRO recommendations")

    from routes.analytics import get_cro_analytics
    c = await get_cro_analytics(user=user, sources=None)
    bottlenecks = (c.get("bottlenecks") or [])[:4]
    funnel = c.get("funnel_data") or []

    fallback = {
        "headline": f"Overall conversion is {c.get('overall_conversion', 0)}% — the biggest drop-off is your best lift opportunity.",
        "hypotheses": ([{"stage": b.get("stage"),
                         "change": f"Add a targeted follow-up play to reduce drop-off at {b.get('stage')}",
                         "metric": "stage conversion", "expected_lift": "+5-10%", "value_at_stake": 0}
                        for b in bottlenecks[:3]]
                       or [{"stage": "Proposal", "change": "A/B test a tighter proposal template",
                            "metric": "proposal to win", "expected_lift": "+5%", "value_at_stake": 0}]),
    }

    funnel_txt = "\n".join(
        f"- {f.get('stage')}: {f.get('count')} deals, {f.get('conversion')}% cumulative, {f.get('drop_off')}% drop"
        for f in funnel) or "No funnel data."
    bn_txt = "\n".join(f"- {b.get('stage')}: {b.get('drop_rate')}% drop ({b.get('severity')})"
                       for b in bottlenecks) or "No major bottlenecks."
    system = (
        "You are a conversion-rate-optimization EXPERIMENT designer for B2B SaaS. "
        "You ONLY address funnel conversion and deal velocity. "
        "Never give pricing, churn/retention or forecasting advice. "
        "Ground every hypothesis in the funnel numbers provided; no invented stages. "
        "Return ONLY strict minified JSON (no prose, no markdown) matching exactly: "
        '{"headline":string,"hypotheses":[{"stage":string,"change":string,"metric":string,"expected_lift":string,"value_at_stake":number}]}. '
        "Max 3 hypotheses, each a single testable change on a named stage."
    )
    prompt = (
        f"Overall conversion: {c.get('overall_conversion')}%\nTotal opportunities: {c.get('total_opportunities')}\n"
        f"Won deals: {c.get('won_deals')}\nAvg cycle: {c.get('avg_cycle_days')} days\n"
        f"Funnel:\n{funnel_txt}\nBottlenecks:\n{bn_txt}\n\n"
        "Propose testable experiments to lift conversion at the weakest stages."
    )
    result, used = await _ai_cards(system, prompt, f"cro_{user.user_id}", fallback)
    return {**result, "ai_used": used}
