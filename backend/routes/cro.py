"""Conversion Rate Optimization — a guided 5-stage cycle.

Analyze Data -> Identify Friction -> Formulate Hypotheses -> Run Tests -> Implement & Iterate.

Stage 1 (Analyze) reuses the real pipeline funnel (see /analytics/cro). Stages 2-5 are
stateful, org-scoped records: friction points, hypotheses, A/B tests (with a real
two-proportion significance test) and implemented wins. AI suggestions (friction &
hypotheses) use Claude via the Emergent LLM key. Paid feature.
"""
import os
import re
import json
import math
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from models import User
from dependencies import require_paid, org_filter

logger = logging.getLogger(__name__)
router = APIRouter()

CLAUDE_MODEL = "claude-sonnet-4-5-20250929"
STAGES = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]
_FRICTION_CATS = ("speed", "navigation", "form", "copy", "trust", "other")
_SEVERITY = ("high", "medium", "low")
_HYP_STATUS = ("draft", "testing", "validated", "rejected")
_TEST_STATUS = ("planned", "running", "completed")


# ---------------------------------------------------------------- models
class FrictionCreate(BaseModel):
    title: str
    stage: str = ""
    category: str = "other"
    severity: str = "medium"
    note: str = ""


class FrictionUpdate(BaseModel):
    title: Optional[str] = None
    stage: Optional[str] = None
    category: Optional[str] = None
    severity: Optional[str] = None
    note: Optional[str] = None


class HypothesisCreate(BaseModel):
    statement: str
    metric: str = ""
    expected_lift: str = ""
    stage: str = ""
    friction_id: Optional[str] = None


class HypothesisUpdate(BaseModel):
    statement: Optional[str] = None
    metric: Optional[str] = None
    expected_lift: Optional[str] = None
    stage: Optional[str] = None
    status: Optional[str] = None


class TestCreate(BaseModel):
    name: str
    metric: str = ""
    hypothesis_id: Optional[str] = None
    control_label: str = "Original"
    variant_label: str = "Variant"
    monthly_visitors: int = 0
    value_per_conversion: Optional[float] = None


class TestUpdate(BaseModel):
    name: Optional[str] = None
    metric: Optional[str] = None
    status: Optional[str] = None
    control_label: Optional[str] = None
    variant_label: Optional[str] = None
    control_visitors: Optional[int] = None
    control_conversions: Optional[int] = None
    variant_visitors: Optional[int] = None
    variant_conversions: Optional[int] = None
    monthly_visitors: Optional[int] = None
    value_per_conversion: Optional[float] = None


class ImplementationCreate(BaseModel):
    title: str
    test_id: Optional[str] = None
    hypothesis_id: Optional[str] = None
    stage: str = ""
    impact: str = ""
    revenue_impact: Optional[float] = None
    note: str = ""


# ---------------------------------------------------------------- helpers
def _clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm_cdf(z: float) -> float:
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _ab_stats(cv: int, cc: int, vv: int, vc: int) -> dict:
    """Two-proportion significance for an A/B test."""
    out = {"control_rate": None, "variant_rate": None, "improvement": None, "confidence": None, "winner": None}
    if not cv or not vv or cv <= 0 or vv <= 0:
        return out
    p1 = cc / cv
    p2 = vc / vv
    out["control_rate"] = round(p1 * 100, 2)
    out["variant_rate"] = round(p2 * 100, 2)
    out["improvement"] = round(((p2 - p1) / p1 * 100), 1) if p1 > 0 else (100.0 if p2 > 0 else 0.0)
    pooled = (cc + vc) / (cv + vv)
    se = math.sqrt(pooled * (1 - pooled) * (1 / cv + 1 / vv)) if 0 < pooled < 1 else 0.0
    if se == 0:
        conf = 0.0
    else:
        z = abs(p2 - p1) / se
        conf = (2 * _norm_cdf(z) - 1) * 100
    out["confidence"] = round(conf, 1)
    if conf >= 90 and p1 != p2:
        out["winner"] = "variant" if p2 > p1 else "control"
    else:
        out["winner"] = "inconclusive"
    return out


async def _claude_json(system: str, prompt: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("LLM key not configured")
    chat = LlmChat(api_key=api_key, session_id=f"cro_{uuid.uuid4().hex[:10]}", system_message=system).with_model("anthropic", CLAUDE_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    m = re.search(r"\{.*\}", resp, re.DOTALL)
    return json.loads(m.group(0)) if m else {}


async def _funnel_summary(user: User) -> dict:
    deals = await db.deals.find(org_filter(user), {"_id": 0}).to_list(3000)
    counts = {s: len([d for d in deals if d.get("stage") == s]) for s in STAGES}
    order = ["lead", "qualified", "proposal", "negotiation", "closed_won"]
    total = sum(counts[s] for s in order)
    drops = []
    for i in range(len(order) - 1):
        cur, nxt = counts[order[i]], counts[order[i + 1]]
        if cur > 0:
            drops.append({"from": order[i], "to": order[i + 1], "drop_rate": round((cur - nxt) / cur * 100, 1)})
    drops.sort(key=lambda d: d["drop_rate"], reverse=True)
    return {"counts": counts, "total": total, "drops": drops,
            "overall": round(counts["closed_won"] / max(total, 1) * 100, 1)}


async def _avg_deal_value(user: User) -> float:
    deals = await db.deals.find({**org_filter(user), "stage": "closed_won"}, {"_id": 0, "value": 1}).to_list(3000)
    vals = [d.get("value", 0) for d in deals if d.get("value")]
    return round(sum(vals) / len(vals), 2) if vals else 0.0


@router.get("/cro/summary")
async def cro_summary(user: User = Depends(require_paid)):
    impls = await db.cro_implementations.find(org_filter(user), {"_id": 0}).to_list(500)
    lift = sum(float(i.get("revenue_impact") or 0) for i in impls)
    validated = await db.cro_hypotheses.count_documents({**org_filter(user), "status": "validated"})
    tests_completed = await db.cro_tests.count_documents({**org_filter(user), "status": "completed"})
    return {
        "revenue_lift_shipped": round(lift, 2),
        "changes_shipped": len(impls),
        "validated_hypotheses": validated,
        "tests_completed": tests_completed,
        "avg_deal_value": await _avg_deal_value(user),
    }


# ---------------------------------------------------------------- Stage 2: Friction
@router.get("/cro/friction")
async def list_friction(user: User = Depends(require_paid)):
    return await db.cro_friction.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/cro/friction")
async def create_friction(body: FrictionCreate, user: User = Depends(require_paid)):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Friction title is required.")
    doc = {
        "friction_id": f"fr_{uuid.uuid4().hex[:12]}", "org_id": user.org_id,
        "title": body.title.strip()[:160], "stage": body.stage[:40],
        "category": body.category if body.category in _FRICTION_CATS else "other",
        "severity": body.severity if body.severity in _SEVERITY else "medium",
        "note": (body.note or "")[:500], "source": "manual",
        "created_at": _now(), "updated_at": _now(),
    }
    await db.cro_friction.insert_one(dict(doc))
    return _clean(doc)


@router.post("/cro/friction/suggest")
async def suggest_friction(user: User = Depends(require_paid)):
    fn = await _funnel_summary(user)
    if fn["total"] == 0:
        raise HTTPException(status_code=400, detail="No pipeline data yet — add deals so we can spot drop-offs.")
    drops = "; ".join(f"{d['from']}->{d['to']}: {d['drop_rate']}% drop" for d in fn["drops"][:4]) or "no major drops"
    prompt = (
        f"Our sales/signup funnel drop-offs: {drops}. Overall conversion: {fn['overall']}%.\n"
        "Identify the likely FRICTION points causing these drop-offs (e.g. slow pages, confusing navigation, "
        "long forms, weak copy, missing trust signals). Return STRICT JSON only:\n"
        '{"friction":[{"title":"short friction point","stage":"lead|qualified|proposal|negotiation","category":"speed|navigation|form|copy|trust|other","severity":"high|medium|low","note":"1 sentence why"}]} Max 5.'
    )
    try:
        data = await _claude_json("You are a CRO expert. Turn funnel drop-offs into concrete friction points. STRICT JSON only.", prompt)
        items = data.get("friction", [])
        ai_used = True
    except Exception as e:
        logger.warning("CRO friction suggest failed: %s", e)
        items = [{"title": f"High drop-off from {d['from']} to {d['to']}", "stage": d["from"],
                  "category": "other", "severity": "high" if d["drop_rate"] > 50 else "medium",
                  "note": f"{d['drop_rate']}% of deals are lost here."} for d in fn["drops"][:3]]
        ai_used = False
    existing = {f["title"].strip().lower() for f in await db.cro_friction.find(org_filter(user), {"_id": 0, "title": 1}).to_list(200)}
    created = []
    for it in (items or [])[:5]:
        if not isinstance(it, dict):
            continue
        title = str(it.get("title", ""))[:160].strip()
        if not title or title.lower() in existing:
            continue
        doc = {
            "friction_id": f"fr_{uuid.uuid4().hex[:12]}", "org_id": user.org_id, "title": title,
            "stage": str(it.get("stage", ""))[:40],
            "category": it.get("category") if it.get("category") in _FRICTION_CATS else "other",
            "severity": it.get("severity") if it.get("severity") in _SEVERITY else "medium",
            "note": str(it.get("note", ""))[:500], "source": "ai", "created_at": _now(), "updated_at": _now(),
        }
        await db.cro_friction.insert_one(dict(doc))
        existing.add(title.lower())
        created.append(_clean(doc))
    return {"created": created, "ai_used": ai_used}


@router.put("/cro/friction/{friction_id}")
async def update_friction(friction_id: str, body: FrictionUpdate, user: User = Depends(require_paid)):
    if not await db.cro_friction.find_one({"friction_id": friction_id, **org_filter(user)}, {"_id": 0}):
        raise HTTPException(status_code=404, detail="Friction not found")
    upd = {}
    if body.title is not None:
        upd["title"] = body.title.strip()[:160]
    if body.stage is not None:
        upd["stage"] = body.stage[:40]
    if body.category is not None and body.category in _FRICTION_CATS:
        upd["category"] = body.category
    if body.severity is not None and body.severity in _SEVERITY:
        upd["severity"] = body.severity
    if body.note is not None:
        upd["note"] = body.note[:500]
    upd["updated_at"] = _now()
    await db.cro_friction.update_one({"friction_id": friction_id}, {"$set": upd})
    return _clean(await db.cro_friction.find_one({"friction_id": friction_id}, {"_id": 0}))


@router.delete("/cro/friction/{friction_id}")
async def delete_friction(friction_id: str, user: User = Depends(require_paid)):
    res = await db.cro_friction.delete_one({"friction_id": friction_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Friction not found")
    return {"status": "deleted"}


# ---------------------------------------------------------------- Stage 3: Hypotheses
@router.get("/cro/hypotheses")
async def list_hypotheses(user: User = Depends(require_paid)):
    return await db.cro_hypotheses.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/cro/hypotheses")
async def create_hypothesis(body: HypothesisCreate, user: User = Depends(require_paid)):
    if not body.statement.strip():
        raise HTTPException(status_code=400, detail="Hypothesis statement is required.")
    doc = {
        "hypothesis_id": f"hy_{uuid.uuid4().hex[:12]}", "org_id": user.org_id,
        "statement": body.statement.strip()[:280], "metric": body.metric[:80],
        "expected_lift": body.expected_lift[:40], "stage": body.stage[:40],
        "friction_id": body.friction_id, "status": "draft", "source": "manual",
        "created_at": _now(), "updated_at": _now(),
    }
    await db.cro_hypotheses.insert_one(dict(doc))
    return _clean(doc)


@router.post("/cro/hypotheses/suggest")
async def suggest_hypotheses(user: User = Depends(require_paid)):
    friction = await db.cro_friction.find(org_filter(user), {"_id": 0}).to_list(200)
    if not friction:
        raise HTTPException(status_code=400, detail="Identify some friction points first (Step 2).")
    fr_lines = "; ".join(f"{f['title']} (stage {f.get('stage') or 'n/a'}, {f['category']})" for f in friction[:8])
    prompt = (
        f"Known friction points: {fr_lines}.\n"
        "For each key friction, formulate a testable CRO hypothesis in the form "
        "'Changing X will improve METRIC by ~Y%'. Return STRICT JSON only:\n"
        '{"hypotheses":[{"statement":"testable hypothesis","metric":"e.g. email sign-ups","expected_lift":"e.g. +15%","stage":"lead|qualified|proposal|negotiation"}]} Max 5.'
    )
    try:
        data = await _claude_json("You are a CRO expert. Turn friction into sharp, testable hypotheses. STRICT JSON only.", prompt)
        items = data.get("hypotheses", [])
        ai_used = True
    except Exception as e:
        logger.warning("CRO hypothesis suggest failed: %s", e)
        items = [{"statement": f"Reducing '{f['title']}' will improve conversion", "metric": "conversion rate", "expected_lift": "", "stage": f.get("stage", "")} for f in friction[:3]]
        ai_used = False
    existing = {h["statement"].strip().lower() for h in await db.cro_hypotheses.find(org_filter(user), {"_id": 0, "statement": 1}).to_list(200)}
    created = []
    for it in (items or [])[:5]:
        if not isinstance(it, dict):
            continue
        stmt = str(it.get("statement", ""))[:280].strip()
        if not stmt or stmt.lower() in existing:
            continue
        doc = {
            "hypothesis_id": f"hy_{uuid.uuid4().hex[:12]}", "org_id": user.org_id, "statement": stmt,
            "metric": str(it.get("metric", ""))[:80], "expected_lift": str(it.get("expected_lift", ""))[:40],
            "stage": str(it.get("stage", ""))[:40], "friction_id": None, "status": "draft", "source": "ai",
            "created_at": _now(), "updated_at": _now(),
        }
        await db.cro_hypotheses.insert_one(dict(doc))
        existing.add(stmt.lower())
        created.append(_clean(doc))
    return {"created": created, "ai_used": ai_used}


@router.put("/cro/hypotheses/{hypothesis_id}")
async def update_hypothesis(hypothesis_id: str, body: HypothesisUpdate, user: User = Depends(require_paid)):
    if not await db.cro_hypotheses.find_one({"hypothesis_id": hypothesis_id, **org_filter(user)}, {"_id": 0}):
        raise HTTPException(status_code=404, detail="Hypothesis not found")
    upd = {}
    if body.statement is not None:
        upd["statement"] = body.statement.strip()[:280]
    if body.metric is not None:
        upd["metric"] = body.metric[:80]
    if body.expected_lift is not None:
        upd["expected_lift"] = body.expected_lift[:40]
    if body.stage is not None:
        upd["stage"] = body.stage[:40]
    if body.status is not None and body.status in _HYP_STATUS:
        upd["status"] = body.status
    upd["updated_at"] = _now()
    await db.cro_hypotheses.update_one({"hypothesis_id": hypothesis_id}, {"$set": upd})
    return _clean(await db.cro_hypotheses.find_one({"hypothesis_id": hypothesis_id}, {"_id": 0}))


@router.delete("/cro/hypotheses/{hypothesis_id}")
async def delete_hypothesis(hypothesis_id: str, user: User = Depends(require_paid)):
    res = await db.cro_hypotheses.delete_one({"hypothesis_id": hypothesis_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Hypothesis not found")
    return {"status": "deleted"}


# ---------------------------------------------------------------- Stage 4: Tests
def _decorate_test(t: dict) -> dict:
    stats = _ab_stats(t.get("control_visitors", 0), t.get("control_conversions", 0),
                      t.get("variant_visitors", 0), t.get("variant_conversions", 0))
    proj = None
    vpc = t.get("value_per_conversion")
    mv = t.get("monthly_visitors") or 0
    if stats.get("control_rate") is not None and vpc and mv:
        delta = (stats["variant_rate"] - stats["control_rate"]) / 100.0
        proj = round(delta * mv * float(vpc) * 12, 2)
    return {**t, **stats, "projected_impact": proj}


@router.get("/cro/tests")
async def list_tests(user: User = Depends(require_paid)):
    tests = await db.cro_tests.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)
    return [_decorate_test(t) for t in tests]


@router.post("/cro/tests")
async def create_test(body: TestCreate, user: User = Depends(require_paid)):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Test name is required.")
    doc = {
        "test_id": f"ab_{uuid.uuid4().hex[:12]}", "org_id": user.org_id,
        "name": body.name.strip()[:160], "metric": body.metric[:80], "hypothesis_id": body.hypothesis_id,
        "control_label": body.control_label[:60] or "Original", "variant_label": body.variant_label[:60] or "Variant",
        "control_visitors": 0, "control_conversions": 0, "variant_visitors": 0, "variant_conversions": 0,
        "monthly_visitors": max(0, int(body.monthly_visitors or 0)),
        "value_per_conversion": float(body.value_per_conversion) if body.value_per_conversion is not None else None,
        "status": "planned", "created_at": _now(), "updated_at": _now(),
    }
    await db.cro_tests.insert_one(dict(doc))
    if body.hypothesis_id:
        await db.cro_hypotheses.update_one({"hypothesis_id": body.hypothesis_id, **org_filter(user)}, {"$set": {"status": "testing", "updated_at": _now()}})
    return _decorate_test(_clean(doc))


@router.put("/cro/tests/{test_id}")
async def update_test(test_id: str, body: TestUpdate, user: User = Depends(require_paid)):
    if not await db.cro_tests.find_one({"test_id": test_id, **org_filter(user)}, {"_id": 0}):
        raise HTTPException(status_code=404, detail="Test not found")
    upd = {}
    for f in ("name", "metric", "control_label", "variant_label"):
        v = getattr(body, f)
        if v is not None:
            upd[f] = v[:160]
    for f in ("control_visitors", "control_conversions", "variant_visitors", "variant_conversions", "monthly_visitors"):
        v = getattr(body, f)
        if v is not None:
            upd[f] = max(0, int(v))
    if body.value_per_conversion is not None:
        upd["value_per_conversion"] = max(0.0, float(body.value_per_conversion))
    if body.status is not None and body.status in _TEST_STATUS:
        upd["status"] = body.status
    upd["updated_at"] = _now()
    await db.cro_tests.update_one({"test_id": test_id}, {"$set": upd})
    return _decorate_test(_clean(await db.cro_tests.find_one({"test_id": test_id}, {"_id": 0})))


@router.delete("/cro/tests/{test_id}")
async def delete_test(test_id: str, user: User = Depends(require_paid)):
    res = await db.cro_tests.delete_one({"test_id": test_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Test not found")
    return {"status": "deleted"}


# ---------------------------------------------------------------- Stage 5: Implement & Iterate
@router.get("/cro/implementations")
async def list_implementations(user: User = Depends(require_paid)):
    return await db.cro_implementations.find(org_filter(user), {"_id": 0}).sort("implemented_at", -1).to_list(200)


@router.post("/cro/implementations")
async def create_implementation(body: ImplementationCreate, user: User = Depends(require_paid)):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Implementation title is required.")
    doc = {
        "impl_id": f"im_{uuid.uuid4().hex[:12]}", "org_id": user.org_id, "title": body.title.strip()[:200],
        "test_id": body.test_id, "hypothesis_id": body.hypothesis_id, "stage": body.stage[:40],
        "impact": body.impact[:120], "revenue_impact": float(body.revenue_impact) if body.revenue_impact is not None else 0.0,
        "note": (body.note or "")[:500], "implemented_at": _now(),
    }
    await db.cro_implementations.insert_one(dict(doc))
    if body.hypothesis_id:
        await db.cro_hypotheses.update_one({"hypothesis_id": body.hypothesis_id, **org_filter(user)}, {"$set": {"status": "validated", "updated_at": _now()}})
    return _clean(doc)


@router.delete("/cro/implementations/{impl_id}")
async def delete_implementation(impl_id: str, user: User = Depends(require_paid)):
    res = await db.cro_implementations.delete_one({"impl_id": impl_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Implementation not found")
    return {"status": "deleted"}
