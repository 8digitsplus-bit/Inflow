"""Seed rich sample data for the testpro@test.com user."""
import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    user = await db.users.find_one({"email": "testpro@test.com"}, {"_id": 0, "user_id": 1})
    if not user:
        print("User not found"); return
    uid = user["user_id"]

    # Clear existing deals & pricing analyses for this user
    await db.deals.delete_many({"user_id": uid})
    await db.pricing_analyses.delete_many({"user_id": uid})

    now = datetime.now(timezone.utc)

    # --- DEALS ---
    deals = [
        # CLOSED WON — varied dates & values
        {"name": "Acme Enterprise License", "company": "Acme Corp", "value": 85000, "stage": "closed_won", "probability": 100,
         "created_at": (now - timedelta(days=120)).isoformat(), "updated_at": (now - timedelta(days=30)).isoformat(),
         "expected_close_date": "2026-02-15", "notes": "Multi-year contract signed"},
        {"name": "Globex Annual Platform", "company": "Globex Industries", "value": 62000, "stage": "closed_won", "probability": 100,
         "created_at": (now - timedelta(days=95)).isoformat(), "updated_at": (now - timedelta(days=22)).isoformat(),
         "expected_close_date": "2026-02-28", "notes": "Upsold from starter plan"},
        {"name": "Initech Cloud Migration", "company": "Initech Solutions", "value": 47500, "stage": "closed_won", "probability": 100,
         "created_at": (now - timedelta(days=80)).isoformat(), "updated_at": (now - timedelta(days=15)).isoformat(),
         "expected_close_date": "2026-03-01", "notes": ""},
        {"name": "Wayne Corp Analytics Suite", "company": "Wayne Enterprises", "value": 120000, "stage": "closed_won", "probability": 100,
         "created_at": (now - timedelta(days=150)).isoformat(), "updated_at": (now - timedelta(days=60)).isoformat(),
         "expected_close_date": "2026-01-20", "notes": "Enterprise deal, champion = CTO"},
        {"name": "Stark Tech Pro Plan", "company": "Stark Technologies", "value": 35000, "stage": "closed_won", "probability": 100,
         "created_at": (now - timedelta(days=70)).isoformat(), "updated_at": (now - timedelta(days=10)).isoformat(),
         "expected_close_date": "2026-03-10", "notes": "Quick sales cycle"},
        {"name": "Umbrella Corp Expansion", "company": "Umbrella Corp", "value": 55000, "stage": "closed_won", "probability": 100,
         "created_at": (now - timedelta(days=110)).isoformat(), "updated_at": (now - timedelta(days=45)).isoformat(),
         "expected_close_date": "2026-02-05", "notes": "Expansion from previous contract"},
        {"name": "Cyberdyne Starter", "company": "Cyberdyne Systems", "value": 18000, "stage": "closed_won", "probability": 100,
         "created_at": (now - timedelta(days=60)).isoformat(), "updated_at": (now - timedelta(days=8)).isoformat(),
         "expected_close_date": "2026-03-15", "notes": "SMB entry deal"},

        # CLOSED LOST — churn data
        {"name": "Oscorp Data Platform", "company": "Oscorp Industries", "value": 42000, "stage": "closed_lost", "probability": 0,
         "created_at": (now - timedelta(days=100)).isoformat(), "updated_at": (now - timedelta(days=35)).isoformat(),
         "expected_close_date": "2026-02-20", "notes": "Lost to competitor — pricing concern"},
        {"name": "LexCorp Integration", "company": "LexCorp", "value": 28000, "stage": "closed_lost", "probability": 0,
         "created_at": (now - timedelta(days=85)).isoformat(), "updated_at": (now - timedelta(days=25)).isoformat(),
         "expected_close_date": "2026-03-01", "notes": "Budget was cut mid-quarter"},
        {"name": "Massive Dynamic Pilot", "company": "Massive Dynamic", "value": 15000, "stage": "closed_lost", "probability": 0,
         "created_at": (now - timedelta(days=65)).isoformat(), "updated_at": (now - timedelta(days=20)).isoformat(),
         "expected_close_date": "2026-03-05", "notes": "No response after proposal"},
        {"name": "Weyland Corp Assessment", "company": "Weyland-Yutani", "value": 73000, "stage": "closed_lost", "probability": 0,
         "created_at": (now - timedelta(days=130)).isoformat(), "updated_at": (now - timedelta(days=50)).isoformat(),
         "expected_close_date": "2026-01-30", "notes": "Timing not right, revisit Q3"},

        # LEADS — early stage
        {"name": "Soylent Inc Inbound Lead", "company": "Soylent Inc", "value": 30000, "stage": "lead", "probability": 15,
         "created_at": (now - timedelta(days=5)).isoformat(), "updated_at": (now - timedelta(days=5)).isoformat(),
         "expected_close_date": "2026-05-01", "notes": "Inbound from website"},
        {"name": "Tyrell Corp Outreach", "company": "Tyrell Corporation", "value": 95000, "stage": "lead", "probability": 10,
         "created_at": (now - timedelta(days=3)).isoformat(), "updated_at": (now - timedelta(days=3)).isoformat(),
         "expected_close_date": "2026-06-15", "notes": "Cold outreach, big target account"},
        {"name": "Omni Consumer Products", "company": "OCP", "value": 22000, "stage": "lead", "probability": 20,
         "created_at": (now - timedelta(days=18)).isoformat(), "updated_at": (now - timedelta(days=12)).isoformat(),
         "expected_close_date": "2026-04-30", "notes": "Referral from Acme"},
        {"name": "Buy N Large Analytics", "company": "Buy N Large", "value": 40000, "stage": "lead", "probability": 12,
         "created_at": (now - timedelta(days=22)).isoformat(), "updated_at": (now - timedelta(days=22)).isoformat(),
         "expected_close_date": "2026-05-15", "notes": "Discovered via trade show"},

        # QUALIFIED — progressing
        {"name": "Aperture Science Platform", "company": "Aperture Science", "value": 67000, "stage": "qualified", "probability": 35,
         "created_at": (now - timedelta(days=28)).isoformat(), "updated_at": (now - timedelta(days=7)).isoformat(),
         "expected_close_date": "2026-04-15", "notes": "Demo completed, positive feedback"},
        {"name": "Wonka Industries CRM", "company": "Wonka Industries", "value": 45000, "stage": "qualified", "probability": 40,
         "created_at": (now - timedelta(days=35)).isoformat(), "updated_at": (now - timedelta(days=10)).isoformat(),
         "expected_close_date": "2026-04-20", "notes": "Multiple stakeholders involved"},
        {"name": "Dunder Mifflin Digital", "company": "Dunder Mifflin", "value": 19000, "stage": "qualified", "probability": 30,
         "created_at": (now - timedelta(days=14)).isoformat(), "updated_at": (now - timedelta(days=5)).isoformat(),
         "expected_close_date": "2026-04-30", "notes": "Paper company going digital"},

        # PROPOSAL — serious deals
        {"name": "Nakatomi Corp Security Suite", "company": "Nakatomi Trading", "value": 110000, "stage": "proposal", "probability": 55,
         "created_at": (now - timedelta(days=45)).isoformat(), "updated_at": (now - timedelta(days=4)).isoformat(),
         "expected_close_date": "2026-04-01", "notes": "Proposal sent, awaiting legal review"},
        {"name": "Prestige Worldwide SaaS", "company": "Prestige Worldwide", "value": 52000, "stage": "proposal", "probability": 50,
         "created_at": (now - timedelta(days=40)).isoformat(), "updated_at": (now - timedelta(days=6)).isoformat(),
         "expected_close_date": "2026-04-10", "notes": "Strong interest, price negotiation next"},
        {"name": "Pied Piper Enterprise", "company": "Pied Piper", "value": 78000, "stage": "proposal", "probability": 60,
         "created_at": (now - timedelta(days=50)).isoformat(), "updated_at": (now - timedelta(days=3)).isoformat(),
         "expected_close_date": "2026-03-28", "notes": "Verbal commitment, waiting on PO"},

        # NEGOTIATION — near close
        {"name": "Hooli Integration Deal", "company": "Hooli", "value": 145000, "stage": "negotiation", "probability": 80,
         "created_at": (now - timedelta(days=55)).isoformat(), "updated_at": (now - timedelta(days=2)).isoformat(),
         "expected_close_date": "2026-03-25", "notes": "Final contract review, expected to close this week"},
        {"name": "Vandelay Industries Full Suite", "company": "Vandelay Industries", "value": 88000, "stage": "negotiation", "probability": 75,
         "created_at": (now - timedelta(days=48)).isoformat(), "updated_at": (now - timedelta(days=1)).isoformat(),
         "expected_close_date": "2026-03-30", "notes": "Legal approved, procurement next"},
        {"name": "Bluth Company Renewal", "company": "Bluth Company", "value": 32000, "stage": "negotiation", "probability": 70,
         "created_at": (now - timedelta(days=30)).isoformat(), "updated_at": (now - timedelta(days=1)).isoformat(),
         "expected_close_date": "2026-04-01", "notes": "Renewal with expansion"},

        # AT-RISK deals (low probability in active stages)
        {"name": "Initrode Global Stalled", "company": "Initrode Global", "value": 56000, "stage": "qualified", "probability": 15,
         "created_at": (now - timedelta(days=45)).isoformat(), "updated_at": (now - timedelta(days=30)).isoformat(),
         "expected_close_date": "2026-04-15", "notes": "Champion left company, deal stalled"},
        {"name": "Veridian Dynamics Risky", "company": "Veridian Dynamics", "value": 38000, "stage": "proposal", "probability": 20,
         "created_at": (now - timedelta(days=50)).isoformat(), "updated_at": (now - timedelta(days=25)).isoformat(),
         "expected_close_date": "2026-04-01", "notes": "Competitor made aggressive counteroffer"},
    ]

    deal_docs = []
    for d in deals:
        deal_docs.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": uid,
            **d,
        })
    await db.deals.insert_many(deal_docs)
    print(f"Inserted {len(deal_docs)} deals")

    # --- PRICING ANALYSES ---
    analyses = [
        {"product_name": "InFlow Pro Plan", "current_price": 149, "optimal_price": 179, "cost_of_goods": 45,
         "target_margin": 70, "market_segment": "mid_market", "competitor_prices": [129, 159, 199, 169]},
        {"product_name": "InFlow Essential", "current_price": 59, "optimal_price": 69, "cost_of_goods": 20,
         "target_margin": 65, "market_segment": "small_business", "competitor_prices": [49, 79, 59, 55]},
        {"product_name": "InFlow Enterprise", "current_price": 249, "optimal_price": 299, "cost_of_goods": 80,
         "target_margin": 68, "market_segment": "enterprise", "competitor_prices": [199, 349, 279, 299]},
        {"product_name": "Analytics Add-on", "current_price": 39, "optimal_price": 49, "cost_of_goods": 10,
         "target_margin": 75, "market_segment": "mid_market", "competitor_prices": [29, 49, 45, 35]},
        {"product_name": "API Access Tier", "current_price": 99, "optimal_price": 129, "cost_of_goods": 30,
         "target_margin": 70, "market_segment": "enterprise", "competitor_prices": [79, 149, 119, 99]},
        {"product_name": "Data Import Pro", "current_price": 29, "optimal_price": 35, "cost_of_goods": 8,
         "target_margin": 72, "market_segment": "small_business", "competitor_prices": [19, 39, 25, 29]},
    ]

    analysis_docs = []
    for i, a in enumerate(analyses):
        analysis_docs.append({
            "analysis_id": f"analysis_{uuid.uuid4().hex[:12]}",
            "user_id": uid,
            **a,
            "created_at": (now - timedelta(days=i * 7)).isoformat(),
        })
    await db.pricing_analyses.insert_many(analysis_docs)
    print(f"Inserted {len(analysis_docs)} pricing analyses")

    # Summary
    stages = {}
    for d in deal_docs:
        s = d["stage"]
        stages[s] = stages.get(s, 0) + 1
    print("\nDeal distribution:")
    for s, c in stages.items():
        print(f"  {s}: {c}")
    total_won = sum(d["value"] for d in deal_docs if d["stage"] == "closed_won")
    total_pipeline = sum(d["value"] for d in deal_docs if d["stage"] not in ["closed_won", "closed_lost"])
    total_lost = sum(d["value"] for d in deal_docs if d["stage"] == "closed_lost")
    print(f"\nTotal Won Revenue: ${total_won:,.0f}")
    print(f"Total Pipeline Value: ${total_pipeline:,.0f}")
    print(f"Total Lost Revenue: ${total_lost:,.0f}")
    print("\nSeed complete!")

asyncio.run(seed())
