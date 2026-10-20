"""Self-service account deletion (30-day grace) + automatic deletion of long-inactive accounts."""
import asyncio
import hashlib
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from database import db
from dependencies import get_current_user
from models import User
from routes.payments import _same_mode, stripe_sdk
from utils.account_lifecycle import GRACE_DAYS, INACTIVE_DAYS, WARNING_DAYS, fmt_date, send_account_email
from utils.email import send_email, build_notice_email_html
from utils.rate_limit import limiter, check_email_rate_limit, record_email_failure, reset_email_attempts

logger = logging.getLogger(__name__)
router = APIRouter()

INACTIVE_TIERS = {"expired", "cancelled", "free"}
CODE_TTL_MINUTES = 10
CODE_MAX_ATTEMPTS = 5


class DeleteAccountRequest(BaseModel):
    confirm: str
    password: Optional[str] = None
    code: Optional[str] = None


def _email_hint(email: str) -> str:
    return email[:3] + "***" + email[email.index("@"):]


async def _other_members(user_doc: dict) -> int:
    if not user_doc.get("org_id"):
        return 0
    return await db.users.count_documents({"org_id": user_doc["org_id"], "user_id": {"$ne": user_doc["user_id"]}})


async def _has_active_plan(user_doc: dict) -> bool:
    org = await db.organizations.find_one({"org_id": user_doc.get("org_id")}, {"_id": 0}) if user_doc.get("org_id") else None
    tier = (org or user_doc).get("subscription_tier") or "free"
    if tier in INACTIVE_TIERS:
        return False
    if tier == "trial":
        end = (org or {}).get("trial_end") or user_doc.get("trial_end")
        return bool(end) and datetime.fromisoformat(str(end).replace("Z", "+00:00")) > datetime.now(timezone.utc)
    return True


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def _verify_reauth(user_doc: dict, body: DeleteAccountRequest):
    # Per-account throttle (independent of client IP) on top of the IP limiter.
    throttle_key = f"account-delete:{user_doc['user_id']}"
    check_email_rate_limit(throttle_key)
    if user_doc.get("password_hash"):
        if not body.password or not bcrypt.checkpw(body.password.encode("utf-8"), user_doc["password_hash"].encode("utf-8")):
            record_email_failure(throttle_key)
            raise HTTPException(status_code=401, detail="Incorrect password")
        reset_email_attempts(throttle_key)
        return
    # Deletion codes live in their own collection so sign-in 2FA codes can't be used here (and vice versa).
    doc = await db.account_delete_codes.find_one({"user_id": user_doc["user_id"]}, {"_id": 0})
    expired = not doc or datetime.now(timezone.utc) > datetime.fromisoformat(doc["expires_at"])
    if expired or doc["code_hash"] != _hash_code((body.code or "").strip()):
        record_email_failure(throttle_key)
        if doc and not expired:
            res = await db.account_delete_codes.find_one_and_update(
                {"user_id": user_doc["user_id"]}, {"$inc": {"attempts": 1}}, return_document=True)
            if res and res.get("attempts", 0) >= CODE_MAX_ATTEMPTS:
                await db.account_delete_codes.delete_many({"user_id": user_doc["user_id"]})
        raise HTTPException(status_code=401, detail="Invalid or expired code")
    await db.account_delete_codes.delete_many({"user_id": user_doc["user_id"]})
    reset_email_attempts(throttle_key)


async def _cancel_stripe_subscription(user_doc: dict):
    org = await db.organizations.find_one({"org_id": user_doc.get("org_id")}, {"_id": 0}) if user_doc.get("org_id") else {}
    owner = (org or {}) if user_doc.get("role") == "owner" else {}
    sub_id = next((d.get("stripe_subscription_id") for d in (user_doc, owner) if d.get("stripe_subscription_id") and _same_mode(d)), None)
    api_key = os.environ.get("STRIPE_API_KEY")
    if not sub_id or not api_key:
        return
    try:
        stripe_sdk.api_key = api_key
        await asyncio.to_thread(stripe_sdk.Subscription.cancel, sub_id)
    except stripe_sdk.InvalidRequestError as e:
        logger.warning("Subscription %s already gone while deleting account: %s", sub_id, e)
    except Exception:
        logger.exception("Stripe cancel failed during account deletion for %s", user_doc["user_id"])
        raise HTTPException(status_code=502, detail="We couldn't cancel your subscription, so your account wasn't deleted. Please try again or contact support.")


@router.get("/account/deletion")
async def deletion_info(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return {
        "has_password": bool(user_doc.get("password_hash")),
        "blocked_by_members": user_doc.get("role") == "owner" and await _other_members(user_doc) > 0,
        "grace_days": GRACE_DAYS,
        "email_hint": _email_hint(user_doc["email"]),
    }


@router.post("/account/delete/code")
@limiter.limit("3/10 minutes")
async def send_deletion_code(request: Request, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    code = f"{secrets.randbelow(10**6):06d}"
    await db.account_delete_codes.delete_many({"user_id": user.user_id})
    await db.account_delete_codes.insert_one({
        "user_id": user.user_id, "code_hash": _hash_code(code), "attempts": 0,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)).isoformat(),
    })
    result = await send_email(
        to=user_doc["email"], subject=f"{code} is your code to confirm account deletion",
        html=build_notice_email_html("Confirm your account deletion", [
            f"Your code is {code}. It expires in {CODE_TTL_MINUTES} minutes.",
            "If you didn't ask to delete your InFlow account, ignore this email and consider securing your account.",
        ]),
        text=f"Your InFlow account deletion code is {code}. It expires in {CODE_TTL_MINUTES} minutes.",
    )
    return {"email_sent": result["sent"], "email_hint": _email_hint(user_doc["email"])}


@router.post("/account/delete")
@limiter.limit("5/hour")
async def request_deletion(request: Request, body: DeleteAccountRequest, response: Response, user: User = Depends(get_current_user)):
    if body.confirm.strip().upper() != "DELETE":
        raise HTTPException(status_code=400, detail='Type DELETE to confirm')
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    await _verify_reauth(user_doc, body)
    if user_doc.get("role") == "owner" and await _other_members(user_doc) > 0:
        raise HTTPException(status_code=409, detail="Transfer ownership or remove the other members from your workspace before deleting your account.")

    await _cancel_stripe_subscription(user_doc)
    now = datetime.now(timezone.utc)
    purge_at = (now + timedelta(days=GRACE_DAYS)).isoformat()
    cancelled = {"subscription_tier": "cancelled", "subscription_status": "cancelled", "cancelled_at": now.isoformat()}
    await db.users.update_one({"user_id": user.user_id}, {"$set": {
        **cancelled, "deletion_status": "pending", "deletion_requested_at": now.isoformat(), "purge_at": purge_at,
    }})
    if user_doc.get("role") == "owner" and user_doc.get("org_id"):
        await db.organizations.update_one({"org_id": user_doc["org_id"]}, {"$set": cancelled})
    await db.user_sessions.delete_many({"user_id": user.user_id})
    response.delete_cookie(key="session_token", path="/", samesite="none", secure=True)
    logger.info("Account deletion requested: %s (purge %s)", user.user_id, purge_at)

    when = fmt_date(purge_at)
    asyncio.create_task(send_account_email(
        user_doc["email"], "Your InFlow account will be deleted", f"Your account will be deleted on {when}",
        ["We've received your request to delete your InFlow account. Your subscription has been cancelled and you've been signed out on all devices.",
         f"On {when} your account, workspace and all data stored in InFlow will be permanently deleted. Data in your connected tools (CRM, Stripe, accounting) isn't affected.",
         "Changed your mind? Just sign in before then and your account will be restored."],
        cta_label="Sign in to restore",
    ))
    return {"status": "scheduled", "purge_at": purge_at}


# ---------- permanent deletion ----------

async def _purge(user_doc: dict, reason: str):
    uid, oid = user_doc["user_id"], user_doc.get("org_id")
    org_wide = bool(oid) and user_doc.get("role") == "owner" and await _other_members(user_doc) == 0
    match = {"$or": [{"user_id": uid}, {"org_id": oid}]} if org_wide else {"user_id": uid}

    api_key = os.environ.get("STRIPE_API_KEY")
    if api_key and user_doc.get("stripe_customer_id") and _same_mode(user_doc):
        try:
            stripe_sdk.api_key = api_key
            await asyncio.to_thread(stripe_sdk.Customer.delete, user_doc["stripe_customer_id"])
        except Exception as e:
            logger.warning("Stripe customer delete failed for %s: %s", uid, e)

    await send_account_email(
        user_doc["email"], "Your InFlow account has been deleted", "Your InFlow account has been deleted",
        ["As requested, your InFlow account, workspace and all data stored in InFlow have been permanently deleted."
         if reason == "user_request" else
         "Your InFlow account had no active plan and wasn't used for 12 months, so it and all data stored in InFlow have been permanently deleted.",
         "Thanks for trying InFlow. You're welcome back any time."],
    )

    counts = {}
    for name in await db.list_collection_names():
        if name in ("users", "account_deletions"):
            continue
        res = await db[name].delete_many(match)
        if res.deleted_count:
            counts[name] = res.deleted_count
    await db.contact_messages.delete_many({"email": user_doc["email"]})
    await db.users.delete_one({"user_id": uid})
    await db.account_deletions.insert_one({
        "deletion_id": f"del_{uuid.uuid4().hex[:12]}",
        "user_ref": hashlib.sha256(uid.encode()).hexdigest()[:16],
        "reason": reason,
        "requested_at": user_doc.get("deletion_requested_at") or user_doc.get("inactive_warning_sent_at"),
        "purged_at": datetime.now(timezone.utc).isoformat(),
        "deleted_counts": counts,
    })
    logger.info("Account purged (%s): %s, %d collections", reason, uid, len(counts))


async def process_account_lifecycle_once():
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Start the inactivity clock for accounts that have never had a sign-in recorded.
    await db.users.update_many({"last_seen_at": {"$exists": False}}, {"$set": {"last_seen_at": now_iso}})

    warn_cutoff = (now - timedelta(days=INACTIVE_DAYS - WARNING_DAYS)).isoformat()
    async for u in db.users.find({"last_seen_at": {"$lte": warn_cutoff}, "inactive_warning_sent_at": {"$exists": False},
                                  "deletion_status": {"$exists": False}}, {"_id": 0, "password_hash": 0}):
        if await _has_active_plan(u) or (u.get("role") == "owner" and await _other_members(u) > 0):
            continue
        purge_at = (now + timedelta(days=WARNING_DAYS)).isoformat()
        res = await db.users.update_one({"user_id": u["user_id"], "inactive_warning_sent_at": {"$exists": False}},
                                        {"$set": {"inactive_warning_sent_at": now_iso, "inactive_purge_at": purge_at}})
        if res.modified_count:
            when = fmt_date(purge_at)
            await send_account_email(
                u["email"], "Your InFlow account will be deleted soon", f"Your account will be deleted on {when}",
                ["Your InFlow account hasn't been used for 11 months and has no active plan.",
                 f"To protect your data, inactive accounts are deleted after 12 months. On {when} your account and all data stored in InFlow will be permanently deleted.",
                 "Want to keep it? Just sign in before then."],
                cta_label="Sign in to keep my account",
            )

    stale_claim = (now - timedelta(hours=1)).isoformat()
    while True:
        doc = await db.users.find_one_and_update(
            {"$or": [
                {"deletion_status": "pending", "purge_at": {"$lte": now_iso}},
                {"deletion_status": {"$exists": False}, "inactive_purge_at": {"$lte": now_iso}},
                {"deletion_status": "purging", "purge_claimed_at": {"$lte": stale_claim}},
            ]},
            {"$set": {"deletion_status": "purging", "purge_claimed_at": now_iso}},
            projection={"_id": 0},
        )
        if not doc:
            break
        reason = "user_request" if doc.get("purge_at") else "inactive"
        if reason == "inactive" and await _has_active_plan(doc):
            await db.users.update_one({"user_id": doc["user_id"]}, {"$unset": {
                "deletion_status": "", "purge_claimed_at": "", "inactive_warning_sent_at": "", "inactive_purge_at": ""}})
            continue
        try:
            await _purge(doc, reason)
        except Exception:
            logger.exception("Account purge failed for %s (will retry)", doc["user_id"])
