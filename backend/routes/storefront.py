"""Automated Red-Carpet Storefronts — dynamic pricing / quote experiences for
high-intent visitors.

Owners configure rules (audience: min intent score, required intent events,
named accounts -> offer: headline, pre-approved discount, custom contract terms,
CTA). Delivery:
  1. the embeddable snippet personalizes the owner's own pricing page / quote form
  2. a hosted, per-account quote page at /rc/{token}
Pre-approved discounts can be pushed to the org's connected Stripe account as
real Coupons + Promotion Codes.
"""
import re
import uuid
import secrets
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

import stripe
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from database import db
from models import User
from dependencies import org_filter, require_paid, require_paid_owner
from utils.email import send_email
from utils.rate_limit import limiter
from routes.intent_common import EVENT_TYPES, now_iso, conn_creds
from routes.intent_engine import match_offer, ingest_events, log_activity

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()


class RuleReq(BaseModel):
    name: str
    enabled: bool = True
    priority: int = 10
    min_score: int = 60
    event_types: List[str] = []
    accounts: List[str] = []
    headline: str
    message: str = ""
    discount_pct: float = 0
    contract_terms: str = ""
    cta_label: str = "Claim your offer"
    cta_url: str = ""
    expires_days: int = 14


class PromoReq(BaseModel):
    code: Optional[str] = ""
    max_redemptions: int = 25


class LinkReq(BaseModel):
    lead_id: str


class QuoteReq(BaseModel):
    name: str
    email: str
    seats: Optional[int] = None
    message: Optional[str] = ""


def _doc(body: RuleReq) -> dict:
    if not body.name.strip() or not body.headline.strip():
        raise HTTPException(status_code=400, detail="A rule name and offer headline are required")
    if body.cta_url and not body.cta_url.startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="CTA link must start with https://")
    return {"name": body.name.strip()[:80], "enabled": body.enabled, "priority": body.priority,
            "min_score": max(0, min(100, body.min_score)),
            "event_types": [e for e in body.event_types if e in EVENT_TYPES],
            "accounts": [a.strip()[:120] for a in body.accounts if a.strip()][:50],
            "headline": body.headline.strip()[:140], "message": body.message.strip()[:400],
            "discount_pct": max(0.0, min(90.0, round(body.discount_pct, 1))),
            "contract_terms": body.contract_terms.strip()[:400], "cta_label": (body.cta_label or "Claim your offer").strip()[:40],
            "cta_url": body.cta_url.strip()[:400], "expires_days": max(1, min(90, body.expires_days)), "updated_at": now_iso()}


async def _rule(rule_id: str, user: User) -> dict:
    r = await db.storefront_rules.find_one({"rule_id": rule_id, **org_filter(user)}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Storefront rule not found")
    return r


# ------------------------------------------------------------------ rules CRUD
@router.get("/storefronts")
async def list_storefronts(user: User = Depends(require_paid)):
    rules = await db.storefront_rules.find(org_filter(user), {"_id": 0}).sort("priority", 1).to_list(100)
    quotes = await db.storefront_quote_requests.count_documents(org_filter(user))
    stripe_conn = await db.business_connections.find_one(
        {**org_filter(user), "platform": "stripe", "api_key_encrypted": {"$nin": [None, ""]}}, {"_id": 0, "account_name": 1})
    return {"rules": rules, "quote_requests": quotes,
            "impressions": sum(int(r.get("impressions", 0)) for r in rules),
            "stripe_connected": bool(stripe_conn), "stripe_account": (stripe_conn or {}).get("account_name", "")}


@router.post("/storefronts")
async def create_storefront(body: RuleReq, user: User = Depends(require_paid_owner)):
    doc = {"rule_id": f"sf_{uuid.uuid4().hex[:10]}", "org_id": user.org_id, **_doc(body),
           "impressions": 0, "quote_requests": 0, "stripe": None, "created_at": now_iso()}
    await db.storefront_rules.insert_one(dict(doc))
    return doc


@router.put("/storefronts/{rule_id}")
async def update_storefront(rule_id: str, body: RuleReq, user: User = Depends(require_paid_owner)):
    await _rule(rule_id, user)
    await db.storefront_rules.update_one({"rule_id": rule_id}, {"$set": _doc(body)})
    return await _rule(rule_id, user)


@router.delete("/storefronts/{rule_id}")
async def delete_storefront(rule_id: str, user: User = Depends(require_paid_owner)):
    res = await db.storefront_rules.delete_one({"rule_id": rule_id, **org_filter(user)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Storefront rule not found")
    return {"deleted": True}


@router.get("/storefronts/matches")
async def storefront_matches(user: User = Depends(require_paid)):
    leads = await db.intent_leads.find(
        {**org_filter(user), "status": {"$nin": ["dismissed", "lost"]}}, {"_id": 0, "activity": 0}
    ).sort("intent_score", -1).to_list(200)
    out = []
    for l in leads:
        offer = await match_offer(user.org_id, l)
        if offer:
            out.append({"lead_id": l["lead_id"], "account": l["account"], "intent_score": l["intent_score"],
                        "tier": l.get("tier"), "offer": offer, "link_token": (l.get("storefront_links") or {}).get(offer["rule_id"])})
    return out


# ------------------------------------------------------------------ Stripe promo codes (connected Stripe account)
async def _stripe_key(user: User) -> str:
    conn = await db.business_connections.find_one(
        {**org_filter(user), "platform": "stripe", "api_key_encrypted": {"$nin": [None, ""]}}, {"_id": 0})
    key = conn_creds(conn)["token"] if conn else ""
    if not key:
        raise HTTPException(status_code=400, detail="Connect your Stripe account (secret key) on the Integrations page to create promo codes.")
    return key


def _create_promo(key: str, rule: dict, code: str, max_red: int) -> dict:
    client = stripe.StripeClient(key)
    expires = datetime.now(timezone.utc) + timedelta(days=int(rule.get("expires_days", 14)))
    coupon = client.v1.coupons.create(params={
        "percent_off": float(rule["discount_pct"]), "duration": "once", "name": f"InFlow · {rule['name']}"[:40],
        "metadata": {"inflow_rule_id": rule["rule_id"], "source": "inflow_red_carpet"}})
    promo = client.v1.promotion_codes.create(params={
        "promotion": {"type": "coupon", "coupon": coupon.id}, "code": code,
        "max_redemptions": max_red, "expires_at": int(expires.timestamp()),
        "metadata": {"inflow_rule_id": rule["rule_id"]}})
    return {"coupon_id": coupon.id, "promotion_code_id": promo.id, "code": promo.code, "active": True,
            "max_redemptions": max_red, "expires_at": expires.isoformat(), "livemode": bool(promo.livemode),
            "created_at": now_iso()}


@router.post("/storefronts/{rule_id}/stripe-promo")
async def create_stripe_promo(rule_id: str, body: PromoReq, user: User = Depends(require_paid_owner)):
    rule = await _rule(rule_id, user)
    if not rule.get("discount_pct"):
        raise HTTPException(status_code=400, detail="Set a pre-approved discount % on this rule first.")
    if (rule.get("stripe") or {}).get("active"):
        raise HTTPException(status_code=409, detail="This rule already has an active Stripe promo code. Deactivate it first.")
    key = await _stripe_key(user)
    code = re.sub(r"[^A-Z0-9]", "", (body.code or "").upper())[:20] or f"RC{secrets.token_hex(3).upper()}"
    try:
        promo = await asyncio.to_thread(_create_promo, key, rule, code, max(1, min(10000, body.max_redemptions)))
    except stripe.AuthenticationError:
        raise HTTPException(status_code=422, detail="Stripe rejected the API key. Reconnect Stripe with a valid secret key.")
    except stripe.StripeError as e:
        raise HTTPException(status_code=422, detail=f"Stripe error: {e.user_message or str(e)[:160]}")
    await db.storefront_rules.update_one({"rule_id": rule_id}, {"$set": {"stripe": promo}})
    return promo


@router.delete("/storefronts/{rule_id}/stripe-promo")
async def deactivate_stripe_promo(rule_id: str, user: User = Depends(require_paid_owner)):
    rule = await _rule(rule_id, user)
    promo = rule.get("stripe") or {}
    if not promo.get("promotion_code_id"):
        raise HTTPException(status_code=404, detail="No Stripe promo code on this rule")
    key = await _stripe_key(user)
    try:
        await asyncio.to_thread(lambda: stripe.StripeClient(key).v1.promotion_codes.update(
            promo["promotion_code_id"], params={"active": False}))
    except stripe.StripeError as e:
        raise HTTPException(status_code=422, detail=f"Stripe error: {e.user_message or str(e)[:160]}")
    await db.storefront_rules.update_one({"rule_id": rule_id}, {"$set": {"stripe.active": False, "stripe.deactivated_at": now_iso()}})
    return {"deactivated": True}


# ------------------------------------------------------------------ hosted quote links + requests
@router.post("/storefronts/{rule_id}/link")
async def create_link(rule_id: str, body: LinkReq, request: Request, user: User = Depends(require_paid_owner)):
    await _rule(rule_id, user)
    lead = await db.intent_leads.find_one({"lead_id": body.lead_id, **org_filter(user)}, {"_id": 0, "activity": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Profile not found")
    token = (lead.get("storefront_links") or {}).get(rule_id)
    if not token:
        token = f"rc_{secrets.token_urlsafe(16)}"
        await db.storefront_links.insert_one({"token": token, "org_id": user.org_id, "rule_id": rule_id,
                                              "lead_id": body.lead_id, "views": 0, "created_at": now_iso()})
        await db.intent_leads.update_one({"lead_id": body.lead_id}, {"$set": {f"storefront_links.{rule_id}": token}})
        await log_activity(body.lead_id, "storefront", "Red-carpet quote page created", user.name or user.email)
    origin = request.headers.get("origin") or ""
    return {"token": token, "path": f"/rc/{token}", "url": f"{origin}/rc/{token}" if origin else f"/rc/{token}"}


@router.get("/storefronts/quote-requests")
async def quote_requests(user: User = Depends(require_paid)):
    return await db.storefront_quote_requests.find(org_filter(user), {"_id": 0}).sort("created_at", -1).to_list(200)


async def _link_ctx(token: str) -> tuple[dict, dict, dict, Optional[dict]]:
    link = await db.storefront_links.find_one({"token": token}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="This offer link is invalid or has expired.")
    rule = await db.storefront_rules.find_one({"rule_id": link["rule_id"], "org_id": link["org_id"]}, {"_id": 0})
    lead = await db.intent_leads.find_one({"lead_id": link["lead_id"], "org_id": link["org_id"]}, {"_id": 0, "activity": 0})
    if not rule or not rule.get("enabled") or not lead:
        raise HTTPException(status_code=404, detail="This offer is no longer available.")
    org = await db.organizations.find_one({"org_id": link["org_id"]}, {"_id": 0, "name": 1})
    return link, rule, lead, org


@public_router.get("/public/storefront/{token}")
@limiter.limit("60/minute")
async def public_storefront(token: str, request: Request):
    link, rule, lead, org = await _link_ctx(token)
    expires = (datetime.fromisoformat(link["created_at"]) + timedelta(days=int(rule.get("expires_days", 14)))).isoformat()
    first_view = not link.get("views")
    await db.storefront_links.update_one({"token": token}, {"$inc": {"views": 1}, "$set": {"last_viewed_at": now_iso()}})
    await db.storefront_rules.update_one({"rule_id": rule["rule_id"]}, {"$inc": {"impressions": 1}})
    if first_view:
        await ingest_events(link["org_id"], [{"type": "pricing_view", "company": lead["account"],
                                              "url": f"/rc/{token}", "title": "Red-carpet quote page"}], "storefront")
    promo = rule.get("stripe") or {}
    return {"seller": (org or {}).get("name") or "Your vendor", "account": lead["account"],
            "headline": rule["headline"], "message": rule.get("message", ""), "discount_pct": rule.get("discount_pct", 0),
            "contract_terms": rule.get("contract_terms", ""), "cta_label": rule.get("cta_label"), "cta_url": rule.get("cta_url", ""),
            "promo_code": promo.get("code", "") if promo.get("active") else "", "expires_at": expires,
            "ae": {"name": (lead.get("assignment") or {}).get("ae_name", "")}}


@public_router.post("/public/storefront/{token}/quote")
@limiter.limit("10/minute")
async def public_quote(token: str, body: QuoteReq, request: Request):
    link, rule, lead, org = await _link_ctx(token)
    if not body.name.strip() or "@" not in body.email:
        raise HTTPException(status_code=400, detail="Your name and a valid work email are required")
    doc = {"request_id": f"qr_{uuid.uuid4().hex[:10]}", "org_id": link["org_id"], "lead_id": lead["lead_id"],
           "account": lead["account"], "rule_id": rule["rule_id"], "rule_name": rule["name"],
           "name": body.name.strip()[:100], "email": body.email.strip().lower()[:200], "seats": body.seats,
           "message": (body.message or "").strip()[:1000], "discount_pct": rule.get("discount_pct", 0),
           "promo_code": (rule.get("stripe") or {}).get("code", ""), "created_at": now_iso()}
    await db.storefront_quote_requests.insert_one(dict(doc))
    await db.storefront_rules.update_one({"rule_id": rule["rule_id"]}, {"$inc": {"quote_requests": 1}})
    await ingest_events(link["org_id"], [{"type": "quote_request", "company": lead["account"], "email": doc["email"],
                                          "url": f"/rc/{token}", "title": "Red-carpet quote request"}], "storefront")
    owner = await db.users.find_one({"org_id": link["org_id"], "role": "owner"}, {"_id": 0, "email": 1})
    to = (lead.get("assignment") or {}).get("ae_email") or (owner or {}).get("email")
    if to:
        txt = (f"{doc['name']} ({doc['email']}) from {lead['account']} requested a quote via the red-carpet storefront "
               f"'{rule['name']}'.\nSeats: {doc['seats'] or 'n/a'}\nPre-approved discount: {doc['discount_pct']}%\n"
               f"Message: {doc['message'] or '—'}")
        await send_email(to=to, subject=f"Quote request from {lead['account']} — reply fast", html=txt.replace("\n", "<br/>"), text=txt)
    doc.pop("_id", None)
    return {"ok": True, "request_id": doc["request_id"]}
