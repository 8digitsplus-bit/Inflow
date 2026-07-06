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


@router.get("/competitors/benchmark")
async def benchmark(user: User = Depends(require_enterprise)):
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
