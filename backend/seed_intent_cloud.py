"""Seed the High-Intent Buyers hub (intent data cloud, speed-to-lead, storefronts) for testpro.

Resets the org's intent profiles/events and loads SAMPLE digital signals (source="sample")
for real open-deal accounts plus one digital-only account, an AE roster, one routing rule
and one red-carpet storefront rule. Also points testpro's "Demo Stripe" connection at the
environment's Stripe TEST key so promo-code pushes can be exercised end-to-end.

Run: cd /app/backend && PYTHONPATH=/app/backend python3 seed_intent_cloud.py
"""
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta

from dotenv import dotenv_values

from database import db
from utils.crypto import encrypt
from routes.intent_engine import ingest_events, rebuild_all, process_intent_routing_once

TEST_EMAIL = "testpro@test.com"
H = 3600

# account, domain, region, [(type, hours_ago, path, contact)]
SAMPLES = [
    ("Nakatomi Trading", "nakatomi.com", "NA", [
        ("docs_view", 150, "/docs/api", "h.gruber@nakatomi.com"), ("whitepaper_download", 96, "/whitepaper/roi-guide.pdf", "h.gruber@nakatomi.com"),
        ("pricing_view", 50, "/pricing", "h.gruber@nakatomi.com"), ("pricing_view", 20, "/pricing#enterprise", "j.takagi@nakatomi.com"),
        ("pricing_view", 3, "/pricing", "j.takagi@nakatomi.com"), ("quote_request", 1, "/request-quote", "j.takagi@nakatomi.com")]),
    ("Pied Piper", "piedpiper.com", "NA", [
        ("docs_view", 120, "/docs/getting-started", "richard@piedpiper.com"), ("docs_view", 118, "/docs/integrations", "richard@piedpiper.com"),
        ("webinar_attended", 72, "/webinar/revenue-ops-live", "jared@piedpiper.com"), ("pricing_view", 8, "/pricing", "richard@piedpiper.com"),
        ("pricing_view", 6, "/plans", "richard@piedpiper.com"), ("demo_request", 2, "/book-a-demo", "richard@piedpiper.com")]),
    ("Hooli", "hooli.com", "EMEA", [
        ("case_study_view", 200, "/customers/scale-story", "gavin@hooli.com"), ("whitepaper_download", 140, "/ebook/pricing-playbook", "gavin@hooli.com"),
        ("pricing_view", 30, "/pricing", "denpok@hooli.com"), ("pricing_view", 26, "/pricing#compare", "denpok@hooli.com")]),
    ("Wonka Industries", "wonka.com", "EMEA", [
        ("webinar_registered", 170, "/webinar/forecasting", "charlie@wonka.com"), ("webinar_attended", 140, "/webinar/forecasting", "charlie@wonka.com"),
        ("whitepaper_download", 60, "/whitepaper/forecast-accuracy.pdf", "charlie@wonka.com")]),
    ("Tyrell Corporation", "tyrell.com", "APAC", [
        ("docs_view", 100, "/docs/security", "rachael@tyrell.com"), ("docs_view", 90, "/docs/sso", "rachael@tyrell.com"),
        ("docs_view", 80, "/docs/api-reference", "rachael@tyrell.com"), ("pricing_view", 70, "/pricing", "rachael@tyrell.com")]),
    ("Globex", "globex.com", "NA", [
        ("page_view", 30, "/", "hank@globex.com"), ("pricing_view", 12, "/pricing", "hank@globex.com"),
        ("pricing_view", 5, "/pricing", "hank@globex.com"), ("trial_signup", 4, "/signup", "hank@globex.com")]),
    ("Soylent Inc", "soylent.com", "NA", [
        ("page_view", 220, "/", "ops@soylent.com"), ("case_study_view", 210, "/customers", "ops@soylent.com")]),
]

AES = [
    {"name": "Jordan Lee", "email": "8digitsplus+jordan@gmail.com", "territories": ["NA"], "min_deal": None, "max_deal": 100000},
    {"name": "Priya Shah", "email": "8digitsplus+priya@gmail.com", "territories": ["EMEA", "APAC"], "min_deal": None, "max_deal": None},
    {"name": "Marco Silva", "email": "8digitsplus+marco@gmail.com", "territories": [], "min_deal": 100000, "max_deal": None},
]


async def main():
    user = await db.users.find_one({"email": TEST_EMAIL}, {"_id": 0})
    if not user:
        print(f"{TEST_EMAIL} not found — aborting")
        return
    org = user["org_id"]
    now = datetime.now(timezone.utc)
    iso = now.isoformat()
    for coll in ("intent_leads", "intent_events", "intent_visitors", "intent_aes", "intent_routing_rules",
                 "intent_routing_log", "storefront_rules", "storefront_links", "storefront_quote_requests"):
        await db[coll].delete_many({"org_id": org})

    for acct, dom, region, evs in SAMPLES:
        await ingest_events(org, [{"type": t, "company": acct, "domain": dom, "email": who, "region": region,
                                   "url": f"https://www.example-vendor.com{path}", "ts": (now - timedelta(seconds=h * H)).isoformat(),
                                   "properties": {"sample": "true"}} for t, h, path, who in evs], "sample")

    ae_ids = []
    for i, a in enumerate(AES):
        aid = f"ae_seed{i}"
        ae_ids.append(aid)
        await db.intent_aes.insert_one({"ae_id": aid, "org_id": org, **a, "active": True, "crm_owner_ids": {},
                                        "assigned_count": 0, "last_assigned_at": None, "created_at": iso})

    await db.storefront_rules.insert_one({
        "rule_id": "sf_seed_enterprise", "org_id": org, "name": "Enterprise red carpet", "enabled": True, "priority": 1,
        "min_score": 70, "event_types": ["pricing_view", "quote_request", "demo_request"], "accounts": [],
        "headline": "Your pre-approved enterprise pricing is ready",
        "message": "Because your team has been evaluating us closely, we've unlocked terms normally reserved for signed partners.",
        "discount_pct": 12.0, "contract_terms": "Net-60 payment terms · annual contract billed quarterly · 30-day opt-out",
        "cta_label": "Lock in this pricing", "cta_url": "https://inflowft.com/pricing", "expires_days": 14,
        "impressions": 0, "quote_requests": 0, "stripe": None, "created_at": iso, "updated_at": iso})

    await rebuild_all(org)
    await db.intent_routing_rules.insert_one({
        "rule_id": "rr_seed_hot", "org_id": org, "name": "Hot pricing / quote intent → AE now", "enabled": True, "priority": 1,
        "event_types": ["pricing_view", "quote_request", "demo_request", "trial_signup"], "min_score": 70, "min_value": 0,
        "window_hours": 24, "ae_ids": ae_ids, "sla_minutes": 5,
        "actions": {"email": True, "slack": False, "crm": "", "briefing": True},
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat()})
    await rebuild_all(org)
    await asyncio.sleep(1)
    await process_intent_routing_once()

    stripe_key = dotenv_values(Path(__file__).parent / ".env").get("STRIPE_API_KEY") or ""
    if stripe_key.startswith("sk_test_") and len(stripe_key) > 30:
        await db.business_connections.update_one(
            {"org_id": org, "platform": "stripe", "account_name": "Demo Stripe"},
            {"$set": {"api_key_encrypted": encrypt(stripe_key), "api_key_last4": stripe_key[-4:]}})

    pending = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    if pending:
        await asyncio.wait(pending, timeout=90)
    leads = await db.intent_leads.find({"org_id": org}, {"_id": 0, "account": 1, "intent_score": 1, "status": 1,
                                                          "assignment.ae_name": 1, "agent_briefing.ai_used": 1}).sort("intent_score", -1).to_list(50)
    for l in leads:
        print(l)


if __name__ == "__main__":
    asyncio.run(main())
