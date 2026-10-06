"""Seed SAMPLE 'synced' deals that mirror the exact shape routes/scalekit_integration.py
produces for QuickBooks / Salesforce / Stripe. Lets the InFlow side (Deals page + revenue
metrics) be exercised while the live Scalekit DEV OAuth is being sorted out.

- Every seeded doc carries sample=True so it's trivially removable and never collides
  with a real sync (a real sync deletes by {source, synced:True} and re-inserts).
- Run:   cd /app/backend && python3 seed_scalekit_sample.py [org_id] [user_id]
         (defaults to testpro@test.com's org)
- Clean: cd /app/backend && python3 seed_scalekit_sample.py --clean [org_id]
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

DEFAULT_ORG = "org_15337f4cefc9"          # testpro@test.com
DEFAULT_USER = "user_393ea5f333cb"        # testpro@test.com


def _deal(user_id, name, company, value, stage, probability, source, close, notes):
    now = datetime.now(timezone.utc).isoformat()
    return {
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}", "user_id": user_id,
        "name": name, "company": company, "value": round(float(value), 2),
        "stage": stage, "probability": probability,
        "expected_close_date": close, "notes": notes, "source": source,
        "synced": True, "sample": True,
        "created_at": now, "updated_at": now,
    }


# --- QuickBooks invoices -> closed_won, company = customer name (matches _map_records)
QB = [
    ("Invoice 1001", "Northwind Traders", 4200, "2026-05-12"),
    ("Invoice 1002", "Acme Corp",          8800, "2026-05-20"),
    ("Invoice 1003", "Globex LLC",        15200, "2026-06-01"),
    ("Invoice 1004", "Soylent Inc",        3100, "2026-06-10"),
    ("Invoice 1005", "Initech",            6750, "2026-06-18"),
    ("Invoice 1006", "Umbrella Co",       12400, "2026-06-25"),
]

# --- Salesforce opportunities -> company hardcoded "Salesforce" (matches current mapper),
#     stage derived from StageName. (name, amount, stage, probability, close)
SF = [
    ("Enterprise Expansion - Hooli",   45000, "negotiation", 40,  "2026-07-15"),
    ("New Logo - Pied Piper",          28000, "proposal",    40,  "2026-07-01"),
    ("Renewal - Stark Industries",     60000, "closed_won",  100, "2026-06-05"),
    ("Upsell - Wayne Enterprises",     32000, "qualified",   40,  "2026-08-01"),
    ("Pilot - Cyberdyne Systems",      18000, "closed_lost", 40,  "2026-05-28"),
]

# --- Stripe charges (succeeded) -> closed_won, company = billing name. (desc, name, amount, date)
ST = [
    ("Beta Plan", "Jane Cooper",   149, "2026-06-20"),
    ("Beta Plan", "Robert Fox",    149, "2026-06-21"),
    ("Beta Plan", "Cody Fisher",   149, "2026-06-22"),
    ("Pro Plan",  "Esther Howard", 299, "2026-06-23"),
    ("Beta Plan", "Guy Hawkins",   149, "2026-06-24"),
]


async def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    clean = "--clean" in sys.argv
    org_id = args[0] if args else DEFAULT_ORG
    user_id = args[1] if len(args) > 1 else DEFAULT_USER

    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]

    removed = (await db.deals.delete_many({"org_id": org_id, "sample": True})).deleted_count
    print(f"Removed {removed} previous sample deals from {org_id}.")
    if clean:
        print("Clean complete.")
        return

    docs = []
    for name, comp, val, close in QB:
        docs.append(_deal(user_id, name, comp, val, "closed_won", 100, "quickbooks", close, "QuickBooks invoice"))
    for name, amt, stage, prob, close in SF:
        docs.append(_deal(user_id, name, "Salesforce", amt, stage, prob, "salesforce", close, "Salesforce opportunity"))
    for desc, who, amt, close in ST:
        docs.append(_deal(user_id, desc, who, amt, "closed_won", 100, "stripe", close, "Stripe payment"))

    for d in docs:
        d["org_id"] = org_id
    await db.deals.insert_many(docs)

    # Reflect a sync summary on the connection rows so the Connect Business "last synced"
    # reads correctly (status stays whatever it is; we do NOT fake an ACTIVE connection).
    now = datetime.now(timezone.utc).isoformat()
    for src, n in (("quickbooks", len(QB)), ("salesforce", len(SF)), ("stripe", len(ST))):
        await db.business_connections.update_one(
            {"org_id": org_id, "platform": src, "provider": "scalekit"},
            {"$set": {"records_synced": n, "last_synced": now, "sample": True}},
            upsert=False,
        )

    tot = sum(d["value"] for d in docs)
    won = sum(d["value"] for d in docs if d["stage"] == "closed_won")
    print(f"Seeded {len(docs)} sample deals into {org_id} (user {user_id}).")
    print(f"  QuickBooks: {len(QB)} | Salesforce: {len(SF)} | Stripe: {len(ST)}")
    print(f"  Total value: ${tot:,.2f} | Closed-won (collected): ${won:,.2f}")


if __name__ == "__main__":
    asyncio.run(main())
