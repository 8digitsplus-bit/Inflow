"""Revenue-role + primary-source helpers.

Prevents multi-source double-counting of COLLECTED revenue. The org designates ONE
"primary" revenue source of truth; only that source (plus manual deals) feeds headline
collected-revenue metrics. Other sources stay fully visible as deals/pipeline but are not
summed into revenue. Pipeline/signal sources never count as collected revenue.
"""
from typing import Optional
from database import db

# Fallback role when a connection has no explicit revenue_role (e.g. Scalekit-created rows).
_DEFAULT_ROLE = {
    # revenue (collected money)
    "stripe": "revenue", "quickbooks": "revenue", "paypal": "revenue", "square": "revenue",
    "square_online": "revenue", "paddle": "revenue", "chargebee": "revenue", "xero": "revenue",
    "sage": "revenue", "shopify": "revenue", "woocommerce": "revenue", "checkout": "revenue",
    "sumup": "revenue", "airwallex": "revenue", "squarespace": "revenue", "opencart": "revenue",
    "volusion": "revenue", "amazon_seller": "revenue",
    # pipeline (CRM forecast)
    "salesforce": "pipeline", "hubspot": "pipeline", "pipedrive": "pipeline", "zoho": "pipeline",
    "insightly": "pipeline", "freshsales": "pipeline", "monday": "pipeline", "dynamics": "pipeline",
    "oracle_cx": "pipeline",
    # signal (product/analytics — never money)
    "mixpanel": "signal", "amplitude": "signal", "posthog": "signal", "ga4": "signal",
    "adobe_analytics": "signal", "tableau": "signal", "logrocket": "signal", "intercom": "signal",
}


async def get_revenue_context(org_id: Optional[str]) -> dict:
    """Build {primary, roles, revenue_sources} for an org from its connections + setting."""
    if not org_id:
        return {"primary": None, "roles": {}, "revenue_sources": []}
    conns = await db.business_connections.find(
        {"org_id": org_id}, {"_id": 0, "platform": 1, "revenue_role": 1, "connected_at": 1}
    ).to_list(100)
    roles: dict = {}
    revenue_sources: list = []
    for c in sorted(conns, key=lambda x: str(x.get("connected_at") or "")):
        p = c.get("platform")
        if not p:
            continue
        role = c.get("revenue_role") or _DEFAULT_ROLE.get(p, "revenue")
        roles[p] = role
        if role == "revenue" and p not in revenue_sources:
            revenue_sources.append(p)
    org = await db.organizations.find_one(
        {"org_id": org_id}, {"_id": 0, "primary_revenue_source": 1}
    ) or {}
    primary = org.get("primary_revenue_source")
    if primary not in revenue_sources:  # unset or stale -> auto-pick first connected revenue source
        primary = revenue_sources[0] if revenue_sources else None
    return {"primary": primary, "roles": roles, "revenue_sources": revenue_sources}


def counts_as_revenue(deal: dict, ctx: dict) -> bool:
    """True if a deal should count toward COLLECTED revenue: manual deals + the primary source."""
    src = deal.get("source")
    if not src:
        return True  # manual / user-created
    return bool(ctx.get("primary")) and src == ctx["primary"]


def revenue_source_match(ctx: dict) -> dict:
    """Mongo clause selecting deals that count as collected revenue (source dimension only)."""
    manual = [{"source": {"$exists": False}}, {"source": None}]
    if ctx.get("primary"):
        return {"$or": manual + [{"source": ctx["primary"]}]}
    return {"$or": manual}
