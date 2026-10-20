"""Account deletion lifecycle shared by sign-in (restore) and the account routes/worker.

- Self-service deletion: status "pending" for GRACE_DAYS; signing in again restores the account.
- Inactivity: no active plan + no sign-in for INACTIVE_DAYS -> warning email WARNING_DAYS before deletion.
"""
import asyncio
import logging
import os
from datetime import datetime, timezone

from fastapi import HTTPException

from database import db
from utils.email import send_email, build_notice_email_html

logger = logging.getLogger(__name__)

GRACE_DAYS = 30
INACTIVE_DAYS = 365
WARNING_DAYS = 30


def sign_in_url():
    base = os.environ.get("FRONTEND_URL")
    return f"{base.rstrip('/')}/auth?mode=login" if base else None


def fmt_date(iso: str) -> str:
    return datetime.fromisoformat(iso).strftime("%-d %B %Y")


async def send_account_email(to: str, subject: str, heading: str, paragraphs: list, cta_label: str = None):
    url = sign_in_url() if cta_label else None
    await send_email(to=to, subject=subject, html=build_notice_email_html(heading, paragraphs, cta_label, url),
                     text="\n\n".join(paragraphs))


async def on_sign_in(user_doc: dict) -> dict:
    """Record activity and cancel any pending deletion / inactivity warning. Mutates and returns user_doc."""
    if user_doc.get("deletion_status") == "purging":
        raise HTTPException(status_code=401, detail="This account has been deleted.")
    now = datetime.now(timezone.utc).isoformat()
    restored = False
    if user_doc.get("deletion_status") == "pending":
        res = await db.users.update_one(
            {"user_id": user_doc["user_id"], "deletion_status": "pending"},
            {"$set": {"deletion_restored_at": now},
             "$unset": {"deletion_status": "", "deletion_requested_at": "", "purge_at": ""}},
        )
        if res.modified_count != 1:
            raise HTTPException(status_code=401, detail="This account has been deleted.")
        restored = True
    update = {"$set": {"last_seen_at": now}}
    if user_doc.get("inactive_warning_sent_at"):
        update["$unset"] = {"inactive_warning_sent_at": "", "inactive_purge_at": ""}
    await db.users.update_one({"user_id": user_doc["user_id"]}, update)
    for k in ("deletion_status", "deletion_requested_at", "purge_at", "inactive_warning_sent_at", "inactive_purge_at"):
        user_doc.pop(k, None)
    if restored:
        user_doc["account_restored"] = True
        logger.info("Account deletion cancelled by sign-in: %s", user_doc["user_id"])
        asyncio.create_task(send_account_email(
            user_doc["email"], "Your InFlow account has been restored", "Your account deletion was cancelled",
            ["You signed back in, so your InFlow account and data have been restored and won't be deleted.",
             "Your subscription was cancelled when you asked to delete your account. Choose a plan in Settings to keep using InFlow.",
             "If this wasn't you, change your password and contact us straight away."],
        ))
    return user_doc
