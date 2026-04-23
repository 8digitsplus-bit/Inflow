"""
Migration: ensure every user belongs to an organization.
Runs once on backend startup. Idempotent — safe to run repeatedly.

For every user without an `org_id`:
  1. Create a solo organization with the user as owner.
  2. Stamp the user with `org_id` and `role='owner'`.
  3. Stamp existing shared records (deals, business_connections, pricing_analyses)
     with the new org_id.
"""
import uuid
import logging
from datetime import datetime, timezone

from database import db

logger = logging.getLogger(__name__)


async def migrate_users_to_orgs() -> int:
    """Returns number of users migrated."""
    migrated = 0
    cursor = db.users.find({"org_id": {"$exists": False}}, {"_id": 0})
    async for user_doc in cursor:
        user_id = user_doc["user_id"]
        org_id = f"org_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        # Name the solo org after the user's name (fallback to email)
        org_name = user_doc.get("name") or user_doc.get("email", "My Organization")
        if not org_name.lower().endswith(("'s team", " team", " org")):
            org_name = f"{org_name}'s Team"

        await db.organizations.insert_one({
            "org_id": org_id,
            "name": org_name,
            "owner_user_id": user_id,
            "subscription_tier": user_doc.get("subscription_tier", "trial"),
            "subscription_status": user_doc.get("subscription_status", "active"),
            "seat_count": 1,
            "stripe_subscription_id": user_doc.get("stripe_subscription_id"),
            "created_at": now,
        })

        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"org_id": org_id, "role": "owner"}}
        )

        # Stamp existing shared records with org_id
        for coll in ("deals", "business_connections", "pricing_analyses"):
            await db[coll].update_many(
                {"user_id": user_id, "org_id": {"$exists": False}},
                {"$set": {"org_id": org_id}}
            )
        migrated += 1

    if migrated:
        logger.info("Org migration: %d users migrated to solo orgs", migrated)
    return migrated
