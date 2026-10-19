"""Scheduled data sync — plan-based automatic refresh of every connected integration.

Essential: weekly on a chosen day + time. Pro (and trial): daily at a chosen time.
Enterprise: "real-time" = every 15 minutes (true webhooks come later). Expired/cancelled: off.
Runs inside the server (see server.py worker); due schedules are claimed atomically so a
sync never runs twice even with several server replicas. Manual "Sync now" stays on every plan.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from dependencies import get_current_user, require_owner
from models import User

router = APIRouter()
logger = logging.getLogger(__name__)

REALTIME_MINUTES = 15
LOCK_MINUTES = 30
DEFAULTS = {"enabled": True, "weekday": 0, "time": "07:00", "timezone": "UTC"}
MODE_LABEL = {"weekly": "Weekly", "daily": "Daily", "realtime": "Real-time (every 15 min)", "off": "Off"}
_last_ensure = {"at": None}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def mode_for_tier(tier: str) -> str:
    t = tier or "trial"
    if t.startswith("enterprise"):
        return "realtime"
    if t.startswith("pro") or t == "trial":
        return "daily"
    if t.startswith("essential"):
        return "weekly"
    return "off"


def compute_next(mode: str, sched: dict, after: datetime):
    if mode == "off" or not sched.get("enabled", True):
        return None
    if mode == "realtime":
        return after + timedelta(minutes=REALTIME_MINUTES)
    try:
        tz = ZoneInfo(sched.get("timezone") or "UTC")
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    h, m = (int(x) for x in (sched.get("time") or "07:00").split(":"))
    local = after.astimezone(tz)
    cand = local.replace(hour=h, minute=m, second=0, microsecond=0)
    if mode == "daily":
        if cand <= local:
            cand += timedelta(days=1)
    else:
        cand += timedelta(days=(int(sched.get("weekday", 0)) - local.weekday()) % 7)
        if cand <= local:
            cand += timedelta(days=7)
    return cand.astimezone(timezone.utc)


async def _org_mode(org_id: str) -> str:
    org = await db.organizations.find_one({"org_id": org_id}, {"_id": 0, "subscription_tier": 1})
    return mode_for_tier((org or {}).get("subscription_tier"))


async def _schedule(org_id: str) -> dict:
    """Schedule doc for an org (created with defaults on first use), with mode kept in step with the plan."""
    doc = await db.sync_schedules.find_one({"org_id": org_id}, {"_id": 0})
    mode = await _org_mode(org_id)
    if not doc:
        doc = {"org_id": org_id, **DEFAULTS, "mode": mode, "created_at": _now().isoformat()}
        nxt = compute_next(mode, doc, _now())
        doc["next_run_at"] = nxt.isoformat() if nxt else None
        await db.sync_schedules.update_one({"org_id": org_id}, {"$setOnInsert": doc}, upsert=True)
        return await db.sync_schedules.find_one({"org_id": org_id}, {"_id": 0})
    if doc.get("mode") != mode:
        nxt = compute_next(mode, doc, _now())
        upd = {"mode": mode, "next_run_at": nxt.isoformat() if nxt else None}
        await db.sync_schedules.update_one({"org_id": org_id}, {"$set": upd})
        doc.update(upd)
    return doc


# ------------------------------------------------------------------ running a sync
def _target(conn: dict):
    """(label, async fn(owner) -> result dict) for a connection, or None if it can't be pulled."""
    from routes.business import PLATFORMS, sync_platform
    from routes.custom_integration import sync_custom_source
    from routes.scalekit_integration import scalekit_sync, LABELS
    from routes.zoho_integration import zoho_sync
    from routes.quickbooks_integration import qbo_sync

    platform, provider = conn.get("platform"), conn.get("provider")
    if provider == "scalekit":
        return f"{LABELS.get(platform, platform)} (Scalekit)", lambda u: scalekit_sync(platform, user=u)
    if provider == "zoho_oauth":
        return "Zoho CRM", lambda u: zoho_sync(user=u)
    if provider == "qbo_oauth":
        return "QuickBooks", lambda u: qbo_sync(user=u)
    if platform == "custom_api":
        return conn.get("source_name") or "Custom API", lambda u: sync_custom_source(conn["connection_id"], current_user=u)
    if platform in PLATFORMS and conn.get("api_key_encrypted"):
        return PLATFORMS[platform]["name"], lambda u: sync_platform(platform, current_user=u)
    return None


async def _owner(org_id: str):
    doc = await db.users.find_one({"org_id": org_id, "role": "owner"}, {"_id": 0})
    return User(**doc) if doc else None


async def run_org_sync(org_id: str, trigger: str, run_id: str) -> dict:
    started = _now()
    owner = await _owner(org_id)
    results = []
    conns = await db.business_connections.find({"org_id": org_id}, {"_id": 0}).to_list(200) if owner else []
    for conn in conns:
        target = _target(conn)
        if not target:
            continue
        label, fn = target
        # Heartbeat: keep the lock alive while a long run is still working through connections.
        await db.sync_schedules.update_one({"org_id": org_id}, {"$set": {
            "locked_until": (_now() + timedelta(minutes=LOCK_MINUTES)).isoformat()}})
        try:
            res = await fn(owner)
            results.append({"platform": conn.get("platform"), "label": label, "ok": True,
                            "records": (res or {}).get("records_synced", 0)})
        except HTTPException as e:
            results.append({"platform": conn.get("platform"), "label": label, "ok": False, "error": str(e.detail)[:200]})
        except Exception as e:
            logger.warning(f"[sync] {org_id} {label} failed: {e}")
            results.append({"platform": conn.get("platform"), "label": label, "ok": False, "error": str(e)[:200]})
    failed = sum(1 for r in results if not r["ok"])
    status = "ok" if not failed else ("failed" if failed == len(results) else "partial")
    if not results:
        status = "nothing"
    finished = _now()
    await db.sync_runs.update_one({"run_id": run_id}, {"$set": {
        "status": status, "results": results, "finished_at": finished.isoformat(),
        "duration_s": round((finished - started).total_seconds(), 1)}})
    return {"status": status, "results": results}


async def _execute(org_id: str, trigger: str, run_id: str, reschedule: bool):
    try:
        out = await run_org_sync(org_id, trigger, run_id)
        status = out["status"]
    except Exception as e:
        logger.error(f"[sync] run {run_id} crashed: {e}")
        status = "failed"
        await db.sync_runs.update_one({"run_id": run_id}, {"$set": {"status": "failed", "finished_at": _now().isoformat(),
                                                                    "results": [{"label": "Sync", "ok": False, "error": str(e)[:200]}]}})
    upd = {"locked_until": None, "last_run_at": _now().isoformat(), "last_status": status, "last_run_id": run_id}
    sched = await _schedule(org_id)
    if reschedule or sched["mode"] == "realtime":
        nxt = compute_next(sched["mode"], sched, _now())
        upd["next_run_at"] = nxt.isoformat() if nxt else None
    await db.sync_schedules.update_one({"org_id": org_id}, {"$set": upd})


async def _claim(org_id: str, extra_filter: dict) -> bool:
    now = _now()
    res = await db.sync_schedules.find_one_and_update(
        {"org_id": org_id, **extra_filter,
         "$or": [{"locked_until": None}, {"locked_until": {"$exists": False}}, {"locked_until": {"$lte": now.isoformat()}}]},
        {"$set": {"locked_until": (now + timedelta(minutes=LOCK_MINUTES)).isoformat()}})
    return res is not None


async def _start_run(org_id: str, trigger: str) -> str:
    run_id = f"sync_{uuid.uuid4().hex[:12]}"
    await db.sync_runs.insert_one({"run_id": run_id, "org_id": org_id, "trigger": trigger, "status": "running",
                                   "started_at": _now().isoformat(), "results": []})
    await db.sync_schedules.update_one({"org_id": org_id}, {"$set": {"last_status": "running", "last_run_id": run_id}})
    return run_id


async def _ensure_schedules():
    """Every ~10 min: give every org with connections a schedule and keep modes in step with plans."""
    if _last_ensure["at"] and _now() - _last_ensure["at"] < timedelta(minutes=10):
        return
    _last_ensure["at"] = _now()
    for org_id in await db.business_connections.distinct("org_id"):
        if org_id:
            await _schedule(org_id)


async def process_sync_schedules_once():
    await _ensure_schedules()
    now_iso = _now().isoformat()
    due = await db.sync_schedules.find(
        {"enabled": True, "next_run_at": {"$ne": None, "$lte": now_iso}}, {"_id": 0, "org_id": 1, "next_run_at": 1}
    ).to_list(100)
    for d in due:
        sched = await _schedule(d["org_id"])  # re-checks the plan (e.g. downgraded to expired -> off)
        if sched["mode"] == "off" or sched.get("next_run_at") != d["next_run_at"]:
            continue
        if await _claim(d["org_id"], {"next_run_at": d["next_run_at"]}):
            run_id = await _start_run(d["org_id"], "schedule")
            asyncio.create_task(_execute(d["org_id"], "schedule", run_id, reschedule=True))


# ------------------------------------------------------------------ API
class ScheduleUpdate(BaseModel):
    enabled: bool | None = None
    weekday: int | None = Field(default=None, ge=0, le=6)
    time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    timezone: str | None = None


def _public(doc: dict) -> dict:
    return {k: doc.get(k) for k in ("enabled", "weekday", "time", "timezone", "mode", "next_run_at",
                                    "last_run_at", "last_status", "last_run_id")}


async def _heal_stale_run(sched: dict) -> dict:
    """A run left 'running' after its lock expired (e.g. server restart) is marked interrupted."""
    if sched.get("last_status") == "running" and (sched.get("locked_until") or "") < _now().isoformat():
        await db.sync_runs.update_one({"run_id": sched.get("last_run_id"), "status": "running"},
                                      {"$set": {"status": "interrupted", "finished_at": _now().isoformat()}})
        await db.sync_schedules.update_one({"org_id": sched["org_id"]}, {"$set": {"last_status": "interrupted"}})
        sched["last_status"] = "interrupted"
    return sched


@router.get("/sync/settings")
async def sync_settings(user: User = Depends(get_current_user)):
    sched = await _heal_stale_run(await _schedule(user.org_id))
    org = await db.organizations.find_one({"org_id": user.org_id}, {"_id": 0, "subscription_tier": 1})
    conns = await db.business_connections.find({"org_id": user.org_id}, {"_id": 0}).to_list(200)
    connections = []
    for c in conns:
        t = _target(c)
        if t:
            connections.append({"platform": c.get("platform"), "label": t[0], "last_synced": c.get("last_synced"),
                                "records_synced": c.get("records_synced", 0), "status": c.get("status") or c.get("sync_status")})
    runs = await db.sync_runs.find({"org_id": user.org_id}, {"_id": 0}).sort("started_at", -1).to_list(10)
    return {"schedule": _public(sched), "mode_label": MODE_LABEL[sched["mode"]],
            "tier": (org or {}).get("subscription_tier", "trial"), "can_edit": user.role == "owner",
            "realtime_minutes": REALTIME_MINUTES, "connections": connections, "runs": runs}


@router.put("/sync/settings")
async def update_sync_settings(body: ScheduleUpdate, user: User = Depends(require_owner)):
    sched = await _schedule(user.org_id)
    upd = body.model_dump(exclude_none=True)
    if "timezone" in upd:
        try:
            ZoneInfo(upd["timezone"])
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(status_code=400, detail="Unknown timezone")
    if sched["mode"] == "off" and set(upd) - {"timezone"}:
        raise HTTPException(status_code=403, detail="Automatic sync needs an active plan.")
    merged = {**sched, **upd}
    nxt = compute_next(sched["mode"], merged, _now())
    upd.update({"next_run_at": nxt.isoformat() if nxt else None, "updated_at": _now().isoformat(),
                "updated_by": user.user_id})
    await db.sync_schedules.update_one({"org_id": user.org_id}, {"$set": upd})
    return {"ok": True, "schedule": _public({**merged, **upd})}


@router.post("/sync/run-now")
async def sync_run_now(user: User = Depends(require_owner)):
    await _schedule(user.org_id)
    if not await _claim(user.org_id, {}):
        raise HTTPException(status_code=409, detail="A sync is already running.")
    run_id = await _start_run(user.org_id, "manual")
    asyncio.create_task(_execute(user.org_id, "manual", run_id, reschedule=False))
    return {"ok": True, "run_id": run_id}
