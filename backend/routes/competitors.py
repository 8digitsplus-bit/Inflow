"""Competitor Intelligence — track competitors' public pricing over time.

Add a competitor + their pricing-page URL → InFlow fetches the public page,
uses AI (Claude via Emergent LLM key) to extract a structured pricing table +
positioning summary. Plans are editable, re-scannable (with price-change
tracking), and benchmarked against the org's own reference pricing.

Only fetches publicly published pricing pages. Enterprise-tier, owner-only.
"""
import os
import re
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from models import User
from dependencies import get_current_user, require_owner, org_filter

logger = logging.getLogger(__name__)
router = APIRouter()

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"


# ---------------------------------------------------------------- models
class Plan(BaseModel):
    name: str = ""
    price: Optional[float] = None
    period: str = "monthly"          # monthly | yearly | one-time | custom
    currency: str = "USD"
    features: List[str] = []


class CompetitorCreate(BaseModel):
    name: str
    url: str


class CompetitorUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    plans: Optional[List[Plan]] = None
    positioning_summary: Optional[str] = None


class MyPricing(BaseModel):
    plans: List[Plan] = []


class IntelPlan(BaseModel):
    objectives: List[str] = []
    focus_areas: List[str] = []
    key_questions: List[str] = []
    notes: str = ""


class ActionCreate(BaseModel):
    title: str
    category: str = "strategy"       # pricing | product | messaging | strategy
    detail: str = ""


class ActionUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    detail: Optional[str] = None
    status: Optional[str] = None     # todo | in_progress | done


class ShareCreate(BaseModel):
    teams: List[str] = []            # sales | product | leadership | marketing
    channel: str = "export"          # export | copy | link
    note: str = ""


_ACTION_CATS = ("pricing", "product", "messaging", "strategy")
_ACTION_STATUS = ("todo", "in_progress", "done")


# ---------------------------------------------------------------- helpers
async def require_enterprise(user: User = Depends(require_owner)) -> User:
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    if "enterprise" not in (tier or ""):
        raise HTTPException(
            status_code=403,
            detail="Competitor Intelligence is an Enterprise feature. Upgrade to unlock competitor pricing tracking.",
        )
    return user


def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _norm_url(url: str) -> str:
    url = (url or "").strip()
    if url and not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


async def _fetch_page_text(url: str) -> str:
    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True, headers={"User-Agent": UA}) as client:
        r = await client.get(url)
        r.raise_for_status()
        html = r.text
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return "\n".join(lines)[:16000]


def _parse_json(raw: str) -> dict:
    if not isinstance(raw, str):
        raw = str(raw)
    raw = raw.strip()
    # strip markdown fences
    raw = re.sub(r"^```(?:json)?", "", raw).strip()
    raw = re.sub(r"```$", "", raw).strip()
    # grab the outermost JSON object
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end + 1]
    return json.loads(raw)


async def _extract_plans(text: str, name: str, url: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("LLM key not configured")
    chat = LlmChat(
        api_key=api_key,
        session_id=f"comp_{uuid.uuid4().hex[:10]}",
        system_message=(
            "You extract published pricing information from a SaaS pricing page. "
            "You return STRICT JSON only — no prose, no markdown fences."
        ),
    ).with_model("anthropic", CLAUDE_MODEL)
    prompt = (
        f"Company: {name}\nURL: {url}\n\nPricing page content:\n\"\"\"\n{text}\n\"\"\"\n\n"
        "Extract the pricing plans. Return ONLY valid JSON with this exact shape:\n"
        '{"plans":[{"name":"","price":<number or null>,"period":"monthly|yearly|one-time|custom",'
        '"currency":"USD","features":["short feature", "..."]}],'
        '"positioning_summary":"1-2 sentences on their pricing strategy and market positioning"}\n'
        "Rules: price is a plain number (no currency symbols/commas). For 'Contact us'/custom plans, "
        "price=null and period='custom'. Only include real published plans. Max 6 short features per plan."
    )
    resp = await chat.send_message(UserMessage(text=prompt))
    data = _parse_json(resp)
    plans = []
    for p in (data.get("plans") or [])[:8]:
        try:
            price = p.get("price")
            price = float(price) if price is not None and str(price) != "" else None
        except (TypeError, ValueError):
            price = None
        plans.append({
            "name": str(p.get("name", ""))[:60],
            "price": price,
            "period": p.get("period") if p.get("period") in ("monthly", "yearly", "one-time", "custom") else "monthly",
            "currency": str(p.get("currency", "USD"))[:6] or "USD",
            "features": [str(f)[:80] for f in (p.get("features") or [])][:6],
        })
    return {"plans": plans, "positioning_summary": str(data.get("positioning_summary", ""))[:400]}


def _diff_plans(old: list, new: list) -> list:
    changes = []
    old_by = {p["name"].strip().lower(): p for p in old if p.get("name")}
    new_by = {p["name"].strip().lower(): p for p in new if p.get("name")}
    for key, np in new_by.items():
        op = old_by.get(key)
        if not op:
            changes.append(f"New plan added: {np['name']}")
            continue
        o_price, n_price = op.get("price"), np.get("price")
        if o_price is not None and n_price is not None and abs(o_price - n_price) > 0.001:
            pct = ((n_price - o_price) / o_price * 100) if o_price else 0
            arrow = "↑" if n_price > o_price else "↓"
            changes.append(f"{np['name']}: {op.get('currency','USD')} {o_price:g} → {n_price:g} ({arrow}{abs(pct):.0f}%)")
    for key, op in old_by.items():
        if key not in new_by:
            changes.append(f"Plan removed: {op['name']}")
    return changes


async def _claude_json(system: str, prompt: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("LLM key not configured")
    chat = LlmChat(
        api_key=api_key,
        session_id=f"comp_{uuid.uuid4().hex[:10]}",
        system_message=system,
    ).with_model("anthropic", CLAUDE_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    return _parse_json(resp)


def _fallback_analysis(bench: dict, competitors: list) -> dict:
    pos = bench.get("position")
    patterns = []
    if bench.get("market_avg") is not None:
        patterns.append(f"Market average price is around {bench['market_avg']:g} across {len(competitors)} tracked competitor(s).")
    if pos == "above":
        patterns.append("You are priced above the market average — premium positioning.")
    elif pos == "below":
        patterns.append("You are priced below the market average — value positioning.")
    elif pos == "inline":
        patterns.append("Your pricing is in line with the market.")
    comps = [{"name": c["name"],
              "strengths": ([c.get("positioning_summary")] if c.get("positioning_summary") else []) or ["Public pricing available"],
              "weaknesses": ([] if c.get("plans") else ["No published pricing captured"])}
             for c in competitors]
    return {
        "summary": "Automated benchmark (AI narrative unavailable). Review the pricing patterns below.",
        "patterns": patterns or ["Add competitors and your pricing to surface patterns."],
        "competitors": comps,
        "your_strengths": [], "your_weaknesses": [],
        "opportunities": ["Set or refine your reference pricing to sharpen benchmarking."] if bench.get("my_avg") is None else [],
        "threats": [],
    }


def _fallback_actions(analysis: dict) -> list:
    acts = []
    for opp in (analysis.get("opportunities") or [])[:3]:
        acts.append({"title": f"Pursue: {opp}", "category": "strategy", "detail": opp})
    for th in (analysis.get("threats") or [])[:2]:
        acts.append({"title": f"Mitigate: {th}", "category": "strategy", "detail": th})
    if not acts:
        acts.append({"title": "Review competitor pricing and update your plans", "category": "pricing", "detail": "Keep your reference pricing current against the market."})
    return acts


# ---------------------------------------------------------------- status
@router.get("/competitors/status")
async def competitors_status(user: User = Depends(get_current_user)):
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0})
    tier = (org or {}).get("subscription_tier") or user.subscription_tier or "trial"
    return {"is_enterprise": "enterprise" in (tier or ""), "is_owner": user.role == "owner"}


# ---------------------------------------------------------------- my pricing + benchmark
# NOTE: These specific routes MUST be declared BEFORE the /{competitor_id} routes,
# otherwise FastAPI matches "my-pricing" / "benchmark" as a competitor_id.
@router.get("/competitors/my-pricing")
async def get_my_pricing(user: User = Depends(require_enterprise)):
    doc = await db.org_pricing.find_one({"org_id": user.org_id}, {"_id": 0})
    return doc or {"org_id": user.org_id, "plans": []}


@router.put("/competitors/my-pricing")
async def set_my_pricing(body: MyPricing, user: User = Depends(require_enterprise)):
    now = datetime.now(timezone.utc).isoformat()
    plans = [p.model_dump() for p in body.plans]
    await db.org_pricing.update_one(
        {"org_id": user.org_id},
        {"$set": {"org_id": user.org_id, "plans": plans, "updated_at": now}},
        upsert=True,
    )
    return {"org_id": user.org_id, "plans": plans}


def _avg_price(plans: list) -> Optional[float]:
    vals = [p["price"] for p in plans if p.get("price") is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


async def _compute_benchmark(user: User) -> dict:
    competitors = await db.competitors.find(org_filter(user), {"_id": 0}).to_list(200)
    my = await db.org_pricing.find_one({"org_id": user.org_id}, {"_id": 0})
    my_plans = (my or {}).get("plans", [])
    my_avg = _avg_price(my_plans)

    comp_summary = []
    for c in competitors:
        c_avg = _avg_price(c.get("plans", []))
        position = None
        if my_avg is not None and c_avg is not None:
            if c_avg > my_avg * 1.05:
                position = "you are cheaper"
            elif c_avg < my_avg * 0.95:
                position = "you are pricier"
            else:
                position = "priced in line"
        comp_summary.append({
            "competitor_id": c["competitor_id"], "name": c["name"], "url": c["url"],
            "avg_price": c_avg, "plan_count": len(c.get("plans", [])),
            "position_vs_you": position, "positioning_summary": c.get("positioning_summary", ""),
        })

    market_avg = _avg_price([{"price": cs["avg_price"]} for cs in comp_summary if cs["avg_price"] is not None])
    overall = None
    if my_avg is not None and market_avg is not None:
        if my_avg < market_avg * 0.95:
            overall = "below"
        elif my_avg > market_avg * 1.05:
            overall = "above"
        else:
            overall = "inline"
    return {
        "my_plans": my_plans,
        "my_avg": my_avg,
        "market_avg": market_avg,
        "position": overall,
        "competitors": comp_summary,
    }


@router.get("/competitors/benchmark")
async def benchmark(user: User = Depends(require_enterprise)):
    return await _compute_benchmark(user)


# ---------------------------------------------------------------- 5-stage intel workflow
@router.get("/competitors/plan")
async def get_intel_plan(user: User = Depends(require_enterprise)):
    doc = await db.competitor_intel_plan.find_one({"org_id": user.org_id}, {"_id": 0})
    return doc or {"org_id": user.org_id, "objectives": [], "focus_areas": [], "key_questions": [], "notes": ""}


@router.put("/competitors/plan")
async def set_intel_plan(body: IntelPlan, user: User = Depends(require_enterprise)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "org_id": user.org_id,
        "objectives": [s.strip() for s in body.objectives if s.strip()][:20],
        "focus_areas": [s.strip() for s in body.focus_areas if s.strip()][:12],
        "key_questions": [s.strip() for s in body.key_questions if s.strip()][:20],
        "notes": (body.notes or "")[:2000],
        "updated_at": now,
    }
    await db.competitor_intel_plan.update_one({"org_id": user.org_id}, {"$set": doc}, upsert=True)
    return doc


@router.post("/competitors/analyze")
async def analyze_landscape(user: User = Depends(require_enterprise)):
    competitors = await db.competitors.find(org_filter(user), {"_id": 0}).to_list(200)
    if not competitors:
        raise HTTPException(status_code=400, detail="Add at least one competitor in the Gather step first.")
    bench = await _compute_benchmark(user)
    plan = await db.competitor_intel_plan.find_one({"org_id": user.org_id}, {"_id": 0}) or {}

    comp_lines = []
    for c in competitors:
        plans = "; ".join(
            f"{p.get('name')}: {p.get('price') if p.get('price') is not None else 'custom'} {p.get('currency', 'USD')}/{p.get('period', '')}"
            for p in c.get("plans", [])
        ) or "no plans captured"
        comp_lines.append(f"- {c['name']} ({c['url']}): {plans}. Positioning: {c.get('positioning_summary', 'n/a')}")
    my_lines = "; ".join(f"{p.get('name')}: {p.get('price')}" for p in bench.get("my_plans", [])) or "not set"
    objectives = "; ".join(plan.get("objectives", [])) or "general competitive awareness"
    focus = ", ".join(plan.get("focus_areas", [])) or "pricing, product features"

    prompt = (
        f"Our objectives: {objectives}\nFocus areas: {focus}\n"
        f"Our pricing (avg {bench.get('my_avg')}): {my_lines}\n"
        f"Market avg: {bench.get('market_avg')} | Our position vs market: {bench.get('position')}\n"
        f"Competitors:\n" + "\n".join(comp_lines) + "\n\n"
        "Turn these raw facts into clear, decision-ready patterns. Compare competitor strengths and "
        "weaknesses against ours. Return STRICT JSON only with this exact shape:\n"
        '{"summary":"2-3 sentence executive summary","patterns":["market pattern",...],'
        '"competitors":[{"name":"","strengths":["",...],"weaknesses":["",...]}],'
        '"your_strengths":["",...],"your_weaknesses":["",...],'
        '"opportunities":["",...],"threats":["",...]}'
    )
    try:
        data = await _claude_json(
            "You are a competitive intelligence analyst. Turn raw competitor facts into clear patterns. STRICT JSON only, no markdown fences.",
            prompt,
        )
        ai_used = True
    except Exception as e:
        logger.warning("CI analyze failed: %s", e)
        data = _fallback_analysis(bench, competitors)
        ai_used = False

    # sanitize to expected lists
    def _lst(v):
        return [str(x)[:400] for x in v][:12] if isinstance(v, list) else []
    clean = {
        "summary": str(data.get("summary", ""))[:800],
        "patterns": _lst(data.get("patterns")),
        "competitors": [
            {"name": str(c.get("name", ""))[:80], "strengths": _lst(c.get("strengths")), "weaknesses": _lst(c.get("weaknesses"))}
            for c in (data.get("competitors") or [])[:20] if isinstance(c, dict)
        ],
        "your_strengths": _lst(data.get("your_strengths")),
        "your_weaknesses": _lst(data.get("your_weaknesses")),
        "opportunities": _lst(data.get("opportunities")),
        "threats": _lst(data.get("threats")),
    }
    now = datetime.now(timezone.utc).isoformat()
    await db.competitor_intel_analysis.update_one(
        {"org_id": user.org_id},
        {"$set": {"org_id": user.org_id, "analysis": clean, "benchmark": bench, "ai_used": ai_used, "generated_at": now}},
        upsert=True,
    )
    return {**clean, "benchmark": bench, "ai_used": ai_used, "generated_at": now}


@router.get("/competitors/analysis")
async def get_analysis(user: User = Depends(require_enterprise)):
    doc = await db.competitor_intel_analysis.find_one({"org_id": user.org_id}, {"_id": 0})
    if not doc:
        return {"analysis": None}
    return {**doc.get("analysis", {}), "benchmark": doc.get("benchmark"), "ai_used": doc.get("ai_used"), "generated_at": doc.get("generated_at")}


@router.get("/competitors/actions")
async def list_actions(user: User = Depends(require_enterprise)):
    return await db.competitor_intel_actions.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/competitors/actions/generate")
async def generate_actions(user: User = Depends(require_enterprise)):
    saved = await db.competitor_intel_analysis.find_one({"org_id": user.org_id}, {"_id": 0})
    if not saved:
        raise HTTPException(status_code=400, detail="Run the Analyze step first to generate actions.")
    analysis = saved.get("analysis", {})
    plan = await db.competitor_intel_plan.find_one({"org_id": user.org_id}, {"_id": 0}) or {}
    prompt = (
        "Based on this competitive analysis, recommend concrete next actions to adjust strategy, "
        "tweak prices, or update products.\n"
        f"Objectives: {'; '.join(plan.get('objectives', [])) or 'grow revenue'}\n"
        f"Summary: {analysis.get('summary', '')}\n"
        f"Opportunities: {analysis.get('opportunities', [])}\n"
        f"Threats: {analysis.get('threats', [])}\n"
        f"Our weaknesses: {analysis.get('your_weaknesses', [])}\n\n"
        'Return STRICT JSON only: {"actions":[{"title":"imperative action","category":"pricing|product|messaging|strategy","detail":"1 sentence on why/how"}]} Max 6 actions.'
    )
    try:
        data = await _claude_json(
            "You are a revenue strategist. Convert competitive insights into specific, actionable next steps. STRICT JSON only.",
            prompt,
        )
        items = data.get("actions", [])
        ai_used = True
    except Exception as e:
        logger.warning("CI actions failed: %s", e)
        items = _fallback_actions(analysis)
        ai_used = False

    now = datetime.now(timezone.utc).isoformat()
    existing = await db.competitor_intel_actions.find(org_filter(user), {"_id": 0}).to_list(200)
    existing_titles = {a.get("title", "").strip().lower() for a in existing}
    created = []
    for it in (items or [])[:6]:
        if not isinstance(it, dict):
            continue
        title = str(it.get("title", ""))[:140].strip()
        if not title or title.lower() in existing_titles:
            continue
        cat = it.get("category") if it.get("category") in _ACTION_CATS else "strategy"
        doc = {
            "action_id": f"act_{uuid.uuid4().hex[:12]}", "org_id": user.org_id,
            "title": title, "category": cat, "detail": str(it.get("detail", ""))[:280],
            "status": "todo", "source": "ai", "created_at": now, "updated_at": now,
        }
        await db.competitor_intel_actions.insert_one(dict(doc))
        existing_titles.add(title.lower())
        created.append(_clean(doc))
    return {"created": created, "ai_used": ai_used}


@router.post("/competitors/actions")
async def create_action(body: ActionCreate, user: User = Depends(require_enterprise)):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Action title is required.")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "action_id": f"act_{uuid.uuid4().hex[:12]}", "org_id": user.org_id,
        "title": body.title.strip()[:140],
        "category": body.category if body.category in _ACTION_CATS else "strategy",
        "detail": (body.detail or "")[:280], "status": "todo", "source": "manual",
        "created_at": now, "updated_at": now,
    }
    await db.competitor_intel_actions.insert_one(dict(doc))
    return _clean(doc)


@router.put("/competitors/actions/{action_id}")
async def update_action(action_id: str, body: ActionUpdate, user: User = Depends(require_enterprise)):
    existing = await db.competitor_intel_actions.find_one({"action_id": action_id, **org_filter(user)}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Action not found")
    updates = {}
    if body.title is not None:
        updates["title"] = body.title.strip()[:140]
    if body.category is not None and body.category in _ACTION_CATS:
        updates["category"] = body.category
    if body.detail is not None:
        updates["detail"] = body.detail[:280]
    if body.status is not None and body.status in _ACTION_STATUS:
        updates["status"] = body.status
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.competitor_intel_actions.update_one({"action_id": action_id}, {"$set": updates})
    return _clean(await db.competitor_intel_actions.find_one({"action_id": action_id}, {"_id": 0}))


@router.delete("/competitors/actions/{action_id}")
async def delete_action(action_id: str, user: User = Depends(require_enterprise)):
    res = await db.competitor_intel_actions.delete_one({"action_id": action_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Action not found")
    return {"status": "deleted"}


def _md_report(plan: dict, analysis: dict, bench: dict, actions: list, competitors: list) -> str:
    L = [f"# Competitive Intelligence Report",
         f"_Generated {datetime.now(timezone.utc).strftime('%b %d, %Y')}_", ""]
    if plan.get("objectives"):
        L += ["## Objectives"] + [f"- {o}" for o in plan["objectives"]] + [""]
    L += ["## Market benchmark",
          f"- Your average price: {bench.get('my_avg') if bench.get('my_avg') is not None else 'not set'}",
          f"- Market average: {bench.get('market_avg') if bench.get('market_avg') is not None else 'n/a'}",
          f"- Your position: {bench.get('position') or 'n/a'}",
          f"- Competitors tracked: {len(competitors)}", ""]
    if analysis:
        if analysis.get("summary"):
            L += ["## Executive summary", analysis["summary"], ""]
        if analysis.get("patterns"):
            L += ["## Key patterns"] + [f"- {p}" for p in analysis["patterns"]] + [""]
        if analysis.get("opportunities"):
            L += ["## Opportunities"] + [f"- {p}" for p in analysis["opportunities"]] + [""]
        if analysis.get("threats"):
            L += ["## Threats"] + [f"- {p}" for p in analysis["threats"]] + [""]
    if actions:
        L += ["## Recommended actions"] + [f"- [{a.get('status')}] ({a.get('category')}) {a.get('title')}" for a in actions] + [""]
    return "\n".join(L)


@router.get("/competitors/report")
async def intel_report(user: User = Depends(require_enterprise)):
    plan = await db.competitor_intel_plan.find_one({"org_id": user.org_id}, {"_id": 0}) or {}
    saved = await db.competitor_intel_analysis.find_one({"org_id": user.org_id}, {"_id": 0}) or {}
    analysis = saved.get("analysis", {})
    bench = saved.get("benchmark") or await _compute_benchmark(user)
    competitors = await db.competitors.find(org_filter(user), {"_id": 0}).to_list(200)
    actions = await db.competitor_intel_actions.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)
    md = _md_report(plan, analysis, bench, actions, competitors)
    return {"markdown": md, "generated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/competitors/shares")
async def list_shares(user: User = Depends(require_enterprise)):
    return await db.competitor_intel_shares.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(100)


@router.post("/competitors/shares")
async def create_share(body: ShareCreate, user: User = Depends(require_enterprise)):
    teams = [t for t in body.teams if t in ("sales", "product", "leadership", "marketing")]
    if not teams:
        raise HTTPException(status_code=400, detail="Select at least one team to share with.")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "share_id": f"shr_{uuid.uuid4().hex[:12]}", "org_id": user.org_id,
        "teams": teams, "channel": body.channel or "export", "note": (body.note or "")[:280],
        "shared_by": user.user_id, "created_at": now,
    }
    await db.competitor_intel_shares.insert_one(dict(doc))
    return _clean(doc)


# ---------------------------------------------------------------- CRUD + extract
@router.get("/competitors")
async def list_competitors(user: User = Depends(require_enterprise)):
    rows = await db.competitors.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows


@router.post("/competitors")
async def create_competitor(body: CompetitorCreate, user: User = Depends(require_enterprise)):
    now = datetime.now(timezone.utc).isoformat()
    url = _norm_url(body.url)
    doc = {
        "competitor_id": f"cmp_{uuid.uuid4().hex[:12]}",
        "org_id": user.org_id,
        "created_by": user.user_id,
        "name": body.name.strip(),
        "url": url,
        "plans": [],
        "positioning_summary": "",
        "status": "pending",
        "error": None,
        "last_scanned_at": None,
        "history": [],
        "created_at": now,
        "updated_at": now,
    }
    # attempt extraction
    try:
        text = await _fetch_page_text(url)
        extracted = await _extract_plans(text, doc["name"], url)
        doc["plans"] = extracted["plans"]
        doc["positioning_summary"] = extracted["positioning_summary"]
        doc["status"] = "extracted" if extracted["plans"] else "empty"
        doc["last_scanned_at"] = now
        if not extracted["plans"]:
            doc["error"] = "No pricing plans found on the page — add them manually or check the URL."
    except Exception as e:
        logger.warning("Competitor extraction failed for %s: %s", url, e)
        doc["status"] = "error"
        doc["error"] = f"Could not auto-extract ({str(e)[:120]}). Add plans manually below."
    await db.competitors.insert_one(dict(doc))
    return _clean(doc)


@router.post("/competitors/{competitor_id}/rescan")
async def rescan_competitor(competitor_id: str, user: User = Depends(require_enterprise)):
    comp = await db.competitors.find_one({"competitor_id": competitor_id, **org_filter(user)}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Competitor not found")
    now = datetime.now(timezone.utc).isoformat()
    try:
        text = await _fetch_page_text(comp["url"])
        extracted = await _extract_plans(text, comp["name"], comp["url"])
    except Exception as e:
        await db.competitors.update_one({"competitor_id": competitor_id},
                                        {"$set": {"status": "error", "error": f"Rescan failed ({str(e)[:120]}).", "last_scanned_at": now}})
        raise HTTPException(status_code=502, detail=f"Rescan failed: {str(e)[:150]}")

    changes = _diff_plans(comp.get("plans", []), extracted["plans"])
    history = comp.get("history", [])
    if changes:
        history = ([{"scanned_at": now, "changes": changes}] + history)[:20]
    await db.competitors.update_one(
        {"competitor_id": competitor_id},
        {"$set": {
            "plans": extracted["plans"],
            "positioning_summary": extracted["positioning_summary"] or comp.get("positioning_summary", ""),
            "status": "extracted" if extracted["plans"] else "empty",
            "error": None,
            "last_scanned_at": now,
            "history": history,
            "updated_at": now,
        }},
    )
    return {"status": "rescanned", "changes": changes, "plans": extracted["plans"]}


@router.put("/competitors/{competitor_id}")
async def update_competitor(competitor_id: str, body: CompetitorUpdate, user: User = Depends(require_enterprise)):
    comp = await db.competitors.find_one({"competitor_id": competitor_id, **org_filter(user)}, {"_id": 0})
    if not comp:
        raise HTTPException(status_code=404, detail="Competitor not found")
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.url is not None:
        updates["url"] = _norm_url(body.url)
    if body.positioning_summary is not None:
        updates["positioning_summary"] = body.positioning_summary[:400]
    if body.plans is not None:
        updates["plans"] = [p.model_dump() for p in body.plans]
        updates["status"] = "manual"
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.competitors.update_one({"competitor_id": competitor_id}, {"$set": updates})
    return _clean(await db.competitors.find_one({"competitor_id": competitor_id}, {"_id": 0}))


@router.delete("/competitors/{competitor_id}")
async def delete_competitor(competitor_id: str, user: User = Depends(require_enterprise)):
    res = await db.competitors.delete_one({"competitor_id": competitor_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Competitor not found")
    return {"status": "deleted"}
