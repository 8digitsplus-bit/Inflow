"""Seed the Multi-Platform Telemetry Sync demo for the test org.

- Upgrades testpro's org + user to Enterprise (so the Enterprise-gated feature is reachable).
- Creates a sample contract (Acme Corp: contracted 100 seats @ $139/seat).
- Writes a sample per-account usage reading (140 seats used) so a scan detects
  a 40-seat leak (~$5,560/mo unbilled) and the full recovery loop can be exercised.

Run: cd /app/backend && PYTHONPATH=/app/backend python3 seed_telemetry.py
"""
import asyncio
from datetime import datetime, timezone
from database import db

TEST_EMAIL = "testpro@test.com"


async def main():
    now = datetime.now(timezone.utc).isoformat()
    user = await db.users.find_one({"email": TEST_EMAIL})
    if not user:
        print(f"User {TEST_EMAIL} not found — aborting.")
        return
    org_id = user["org_id"]

    # Upgrade to Enterprise so the feature is reachable
    await db.users.update_one({"email": TEST_EMAIL}, {"$set": {"subscription_tier": "enterprise_monthly"}})
    await db.organizations.update_one(
        {"org_id": org_id},
        {"$set": {"subscription_tier": "enterprise_monthly", "subscription_status": "active"}},
    )

    # Sample contract
    await db.contracts.delete_many({"org_id": org_id, "account_key": "Acme Corp"})
    contract = {
        "contract_id": "ctr_demo_acme01",
        "org_id": org_id,
        "created_by": user["user_id"],
        "customer_name": "Acme Corp",
        "account_key": "Acme Corp",
        "stripe_customer_id": "",
        "usage_source": "mixpanel",
        "contracted_seats": 100,
        "contracted_api_calls": 5_000_000,
        "unit_price_per_seat": 139.0,
        "currency": "usd",
        "am_email": "8digitsplus@gmail.com",
        "created_at": now,
        "updated_at": now,
    }
    await db.contracts.insert_one(dict(contract))

    # Sample usage reading (over contract)
    await db.telemetry_usage.update_one(
        {"org_id": org_id, "source": "mixpanel", "account_key": "Acme Corp"},
        {"$set": {
            "org_id": org_id, "source": "mixpanel", "account_key": "Acme Corp",
            "seats_used": 140, "usage_volume": 6_400_000, "window_days": 30, "synced_at": now,
        }},
        upsert=True,
    )

    # Clear any prior demo leak so scan starts fresh
    await db.leaks.delete_many({"org_id": org_id, "contract_id": "ctr_demo_acme01"})

    print("Seed complete:")
    print(f"  org_id={org_id} upgraded to enterprise_monthly")
    print("  contract: Acme Corp — 100 seats @ $139")
    print("  usage: 140 seats used (40-seat overage ≈ $5,560/mo)")


if __name__ == "__main__":
    asyncio.run(main())
