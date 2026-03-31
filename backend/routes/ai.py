from fastapi import APIRouter, HTTPException, Request, Depends
import os
import uuid
import logging

from database import db
from models import User, PricingAnalysis, PricingAnalysisRequest, AIInsightRequest
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/ai/pricing-analysis")
async def analyze_pricing(
    analysis_request: PricingAnalysisRequest,
    user: User = Depends(get_current_user)
):
    """Get AI-powered pricing analysis"""
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

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)

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
    except Exception as e:
        logger.error(f"AI analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


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
            Provide concise, actionable insights using numbered points and bullet points.
            Do NOT use emojis, hashtags, or markdown formatting symbols like # ## ** or *. Write in plain, professional English.
            Focus on revenue optimization, deal velocity, and pipeline health."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        data_context = ""
        if insight_request.data:
            data_context = f"\n\nRelevant data:\n{insight_request.data}"

        prompt = f"{insight_request.context}{data_context}\n\nProvide 3-5 key insights and recommended actions."

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)

        return {"insight": ai_response}

    except Exception as e:
        logger.error(f"AI insight error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI insight failed: {str(e)}")


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
            Analyze customer data and provide actionable retention strategies. Be concise and data-driven.
            Do NOT use emojis, hashtags, or markdown formatting symbols like # ## ** or *. Write in plain, professional English with clear section titles.
            Focus on: 1) Churn risk score (0-100), 2) Key risk factors, 3) Recommended actions, 4) Timeline."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        prompt = f"""Analyze this customer/deal for churn risk:
{deal_data}

Provide:
1. Churn risk score (0-100) with reasoning
2. Top 3 risk factors
3. Recommended retention actions
4. Urgency level and timeline"""

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)

        return {"prediction": ai_response}

    except Exception as e:
        logger.error(f"Churn prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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

        chat = LlmChat(
            api_key=api_key,
            session_id=f"cro_{user.user_id}_{uuid.uuid4().hex[:8]}",
            system_message="""You are an expert conversion rate optimization specialist for B2B SaaS.
            Analyze funnel data and provide actionable recommendations to improve conversion rates.
            Do NOT use emojis, hashtags, or markdown formatting symbols like # ## ** or *. Write in plain, professional English with clear section titles.
            Focus on: 1) Quick wins, 2) High-impact changes, 3) A/B test ideas, 4) Process improvements."""
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        prompt = f"""Analyze this sales funnel data and provide CRO recommendations:
{funnel_data}

Provide:
1. Top 3 quick wins to improve conversion
2. Biggest bottleneck and how to fix it
3. A/B test recommendations
4. Process improvements for each stage"""

        user_message = UserMessage(text=prompt)
        ai_response = await chat.send_message(user_message)

        return {"recommendations": ai_response}

    except Exception as e:
        logger.error(f"CRO recommendation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
