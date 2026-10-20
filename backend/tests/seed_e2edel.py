"""Seed / cleanup helpers for account-deletion E2E tests (e2edel* users). Usage: python3 seed_e2edel.py seed|member|unmember|cleanup|show|pastpurge"""
import asyncio, os, sys, json
from datetime import datetime, timezone, timedelta
import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
IDS = ["user_e2edel01", "user_e2edel02", "user_e2edel03"]
ORGS = ["org_e2edel01", "org_e2edel02"]


async def seed():
    await cleanup()
    now = datetime.now(timezone.utc)
    await db.users.insert_one({"user_id": "user_e2edel01", "email": "e2edel01@test.local", "name": "E2E Delete",
                               "password_hash": bcrypt.hashpw(b"Passw0rd!x", bcrypt.gensalt()).decode(),
                               "org_id": "org_e2edel01", "role": "owner", "subscription_tier": "pro_monthly",
                               "subscription_status": "active", "created_at": now.isoformat()})
    await db.organizations.insert_one({"org_id": "org_e2edel01", "owner_user_id": "user_e2edel01",
                                       "subscription_tier": "pro_monthly", "name": "E2E Team"})
    await db.deals.insert_one({"deal_id": "deal_e2edel01", "org_id": "org_e2edel01", "user_id": "user_e2edel01", "name": "E2E deal", "value": 100})
    await db.users.insert_one({"user_id": "user_e2edel02", "email": "e2edel02@test.local", "name": "E2E Google",
                               "org_id": "org_e2edel02", "role": "owner", "subscription_tier": "trial",
                               "subscription_status": "active", "trial_start": now.isoformat(),
                               "trial_end": (now + timedelta(days=10)).isoformat(), "created_at": now.isoformat()})
    await db.organizations.insert_one({"org_id": "org_e2edel02", "owner_user_id": "user_e2edel02",
                                       "subscription_tier": "trial", "trial_end": (now + timedelta(days=10)).isoformat(),
                                       "name": "E2E Google Team"})
    await db.user_sessions.insert_one({"user_id": "user_e2edel02", "session_token": "session_e2edel02_test",
                                       "expires_at": (now + timedelta(days=1)).isoformat(), "created_at": now.isoformat()})
    print("seeded")


async def cleanup():
    await db.users.delete_many({"user_id": {"$in": IDS}})
    await db.organizations.delete_many({"org_id": {"$in": ORGS}})
    for c in ["user_sessions", "otp_codes", "deals"]:
        await db[c].delete_many({"$or": [{"user_id": {"$in": IDS}}, {"org_id": {"$in": ORGS}}]})
    print("cleaned")


async def show():
    async for u in db.users.find({"user_id": {"$in": IDS}}, {"_id": 0, "password_hash": 0}):
        print(json.dumps(u, default=str))
    async for o in db.organizations.find({"org_id": {"$in": ORGS}}, {"_id": 0}):
        print("ORG", json.dumps(o, default=str))
    async for o in db.otp_codes.find({"user_id": {"$in": IDS}}, {"_id": 0}):
        print("OTP", json.dumps(o, default=str))
    print("sessions", await db.user_sessions.count_documents({"user_id": {"$in": IDS}}))
    print("deals", await db.deals.count_documents({"org_id": {"$in": ORGS}}))
    print("account_deletions", await db.account_deletions.count_documents({}))


async def main(cmd):
    if cmd == "seed": await seed()
    elif cmd == "cleanup": await cleanup()
    elif cmd == "show": await show()
    elif cmd == "member":
        await db.users.insert_one({"user_id": "user_e2edel03", "org_id": "org_e2edel01", "role": "member",
                                   "email": "e2edel03@test.local", "name": "E2E Member"}); print("member added")
    elif cmd == "unmember":
        await db.users.delete_many({"user_id": "user_e2edel03"}); print("member removed")
    elif cmd == "pastpurge":
        uid = sys.argv[2]
        r = await db.users.update_one({"user_id": uid, "deletion_status": "pending"},
                                      {"$set": {"purge_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()}})
        print("modified", r.modified_count)

asyncio.run(main(sys.argv[1]))
