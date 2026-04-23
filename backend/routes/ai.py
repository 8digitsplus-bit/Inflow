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
    """AI pricing analysis from dashboard summary data."""
    if user.subscription_tier == "free":
        raise HTTPException(status_code=403, detail="Upgrade to Pro or Enterprise for AI pricing analysis")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        data = await request.json()
        product_data = data.get("product_data", {})

        summary_parts = [
            f"Total products analyzed: {product_data.get('total_products', 0)}",
            f"Average price: ${product_data.get('avg_price', 0):.2f}",
            f"Price gap vs optimal: ${product_data.get('price_gap', 0):.2f}",
            f"Potential revenue uplift: ${product_data.get('revenue_uplift', 0):.2f}",
        ]

        products = product_data.get("products", [])
        if products:
            summary_parts.append("\nProduct breakdown:")
            for p in products:
                summary_parts.append(f"  {p.get('name','?')}: current ${p.get('current',0)}, optimal ${p.get('optimal',0)}, segment: {p.get('segment','N/A')}")

        chat = LlmChat(
            api_key=api_key,
            session_id=f"pricing_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert pricing strategist for B2B SaaS.
            Do NOT use emojis, hashtags, or markdown formatting symbols like # ## ** or *. Write in plain, professional English.
            Keep your ENTIRE response under 150 words. Be direct and scannable."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        prompt = f"""Give a brief pricing strategy summary for this portfolio:

{chr(10).join(summary_parts)}

Respond with: one sentence assessment, 3 specific recommendations (one line each), and the single highest-impact pricing change to make."""

        ai_response = await call_llm_with_timeout(chat, prompt)
        return {"analysis": ai_response}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI pricing analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail="AI analysis failed. Please try again.")


@router.post("/ai/insights")
async def get_ai_insights(
    insight_request: AIInsightRequest,
    user: User = Depends(get_current_user)
):
    """Get AI insights for various contexts"""
    if user.subscription_tier == "free":
        raise HTTPException(
            status_code=403,
            detail="Upgrade to Pro or Enterprise for AI insights"
        )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        chat = LlmChat(
            api_key=api_key,
            session_id=f"insight_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert business intelligence analyst specializing in B2B SaaS.
            Do NOT use emojis, hashtags, or markdown formatting symbols like # ## ** or *. Write in plain, professional English.
            Keep your ENTIRE response under 120 words. Be direct and scannable.
            Focus on revenue optimization, deal velocity, and pipeline health."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        data_context = ""
        if insight_request.data:
            data_context = f"\n\nRelevant data:\n{insight_request.data}"

        prompt = f"{insight_request.context}{data_context}\n\nProvide 3 key insights (one sentence each) and 1 top priority action."

        ai_response = await call_llm_with_timeout(chat, prompt)

        return {"insight": ai_response}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI insight error: {str(e)}")
        raise HTTPException(status_code=500, detail="AI insight failed. Please try again.")


@router.post("/ai/churn-prediction")
async def predict_churn(
    request: Request,
    user: User = Depends(get_current_user)
):
    """Get AI-powered churn predictions"""
    if user.subscription_tier in ["free", "essential_monthly", "essential_yearly"]:
        raise HTTPException(
            status_code=403,
            detail="Upgrade to Pro or Priority for AI churn prediction"
        )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        data = await request.json()
        deal_data = data.get("deal_data", {})

        chat = LlmChat(
            api_key=api_key,
            session_id=f"churn_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert customer success analyst specializing in B2B SaaS churn prediction.
            Do NOT use emojis, hashtags, or markdown formatting symbols like # ## ** or *. Write in plain, professional English.
            Keep your ENTIRE response under 120 words. Be direct and scannable."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        prompt = f"""Churn risk assessment for:
{deal_data}

Respond with: Risk score (0-100), top 2 risk factors (one line each), and 1 recommended action."""

        ai_response = await call_llm_with_timeout(chat, prompt)

        return {"prediction": ai_response}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Churn prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail="Churn prediction failed. Please try again.")


@router.post("/ai/cro-recommendations")
async def get_cro_recommendations(
    request: Request,
    user: User = Depends(get_current_user)
):
    """Get AI-powered CRO recommendations"""
    if user.subscription_tier in ["free", "essential_monthly", "essential_yearly"]:
        raise HTTPException(
            status_code=403,
            detail="Upgrade to Pro or Priority for AI CRO recommendations"
        )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        data = await request.json()
        funnel_data = data.get("funnel_data", {})

        # Summarize data for the LLM instead of dumping raw JSON
        summary_parts = [f"Overall Conversion: {funnel_data.get('overall_conversion', 'N/A')}%"]
        summary_parts.append(f"Total Opportunities: {funnel_data.get('total_opportunities', 'N/A')}")
        summary_parts.append(f"Won Deals: {funnel_data.get('won_deals', 'N/A')}")
        summary_parts.append(f"Avg Cycle: {funnel_data.get('avg_cycle_days', 'N/A')} days")

        for stage in funnel_data.get("funnel_data", []):
            summary_parts.append(f"  {stage.get('stage', '?')}: {stage.get('count', 0)} deals ({stage.get('conversion', 0)}%)")

        for conv in funnel_data.get("stage_conversions", []):
            summary_parts.append(f"  {conv.get('from', '?')} -> {conv.get('to', '?')}: {conv.get('rate', 0)}%")

        for bn in funnel_data.get("bottlenecks", []):
            summary_parts.append(f"  Bottleneck at {bn.get('stage', '?')}: {bn.get('avg_days', 0)} days, {bn.get('stuck_deals', 0)} stuck deals")

        funnel_summary = "\n".join(summary_parts)

        chat = LlmChat(
            api_key=api_key,
            session_id=f"cro_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert conversion rate optimization specialist for B2B SaaS.
            Analyze funnel data and provide a brief, scannable summary.
            Do NOT use emojis, hashtags, or markdown formatting symbols like # ## ** or *. Write in plain, professional English.
            Keep your ENTIRE response under 150 words. Be direct and punchy.
            Format: 1 sentence summary, then 3 bullet-point recommendations (1 line each), then 1 key metric to watch."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        prompt = f"""Give a brief CRO summary for this B2B SaaS funnel:

{funnel_summary}

Respond with:
- One sentence overall assessment
- 3 quick recommendations (one line each, be specific)
- One key metric to focus on"""

        ai_response = await call_llm_with_timeout(chat, prompt)

        return {"recommendations": ai_response}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CRO recommendation error: {str(e)}")
        raise HTTPException(status_code=500, detail="AI analysis failed. Please try again.")
