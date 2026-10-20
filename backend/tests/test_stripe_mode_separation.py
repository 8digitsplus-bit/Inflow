# Stripe TEST vs LIVE mode separation: checkout price/coupon caching, subscription details, live-mode simulation
import os
import sys
import asyncio
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"email": "testpro@test.com", "password": "password"}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return sess


# --- Checkout (test mode) ---
class TestCheckoutTestMode:
    def test_pro_monthly_checkout_and_price_reuse(self, s):
        payload = {"plan": "pro_monthly", "origin_url": BASE_URL, "trial": False}
        r1 = s.post(f"{BASE_URL}/api/payments/create-checkout", json=payload, timeout=60)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get("client_secret"), d1
        n1 = mdb.stripe_prices.count_documents({"plan_key": "pro_monthly"})
        ids1 = sorted(x["price_id"] for x in mdb.stripe_prices.find({"plan_key": "pro_monthly"}))
        r2 = s.post(f"{BASE_URL}/api/payments/create-checkout", json=payload, timeout=60)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("client_secret")
        n2 = mdb.stripe_prices.count_documents({"plan_key": "pro_monthly"})
        ids2 = sorted(x["price_id"] for x in mdb.stripe_prices.find({"plan_key": "pro_monthly"}))
        assert n1 == n2 and ids1 == ids2, f"price duplicated {ids1} -> {ids2}"
        live = mdb.stripe_prices.count_documents({"plan_key": "pro_monthly", "mode": "live"})
        assert live == 0

    def test_essential_yearly_checkout_coupon_mode(self, s):
        r = s.post(f"{BASE_URL}/api/payments/create-checkout",
                   json={"plan": "essential_yearly", "origin_url": BASE_URL, "trial": False}, timeout=60)
        assert r.status_code == 200, r.text
        assert r.json().get("client_secret")
        amount_off = int(round((747.0 - 597.0) * 100))
        doc = mdb.stripe_coupons.find_one({"name": f"first_year_essential_yearly_{amount_off}"})
        assert doc is not None
        assert doc.get("mode", "test") != "live"
        print("coupon doc mode:", doc.get("mode"), "coupon:", doc.get("coupon_id"))


# --- Subscription details ---
class TestSubscriptionDetails:
    def test_details_no_500(self, s):
        r = s.get(f"{BASE_URL}/api/subscription/details", timeout=30)
        assert r.status_code == 200, r.text
        print("details:", r.json())


# --- Live-mode simulation (direct import, stubs) ---
class _Obj:
    def __init__(self, id):
        self.id = id


def test_live_mode_simulation(monkeypatch):
    import routes.payments as p
    from database import client as motor_client  # noqa

    created = {"product": 0, "price": 0, "coupon": 0}

    def fake_product(**kw):
        created["product"] += 1
        return _Obj("prod_FAKE_LIVE_TEST")

    def fake_price(**kw):
        created["price"] += 1
        return _Obj("price_FAKE_LIVE_TEST")

    def fake_coupon(**kw):
        created["coupon"] += 1
        return _Obj("coupon_FAKE_LIVE_TEST")

    test_doc_before = mdb.stripe_prices.find_one({"plan_key": "pro_monthly", "mode": {"$ne": "live"}}, {"_id": 0})

    # test-mode checks
    assert p.stripe_mode() == "test"
    assert p._same_mode({}) is True
    assert p._same_mode({"stripe_livemode": False}) is True
    assert p._same_mode({"stripe_livemode": True}) is False

    monkeypatch.setenv("STRIPE_API_KEY", "sk_live_fake")
    monkeypatch.setattr(p.stripe_sdk.Product, "create", fake_product)
    monkeypatch.setattr(p.stripe_sdk.Price, "create", fake_price)
    monkeypatch.setattr(p.stripe_sdk.Coupon, "create", fake_coupon)
    p._stripe_price_cache.clear()
    try:
        assert p.stripe_mode() == "live"
        assert p._same_mode({}) is False
        assert p._same_mode(None) is False
        assert p._same_mode({"stripe_livemode": True}) is True

        loop = asyncio.new_event_loop()
        try:
            pid = loop.run_until_complete(p.get_or_create_stripe_price("pro_monthly", p.SUBSCRIPTION_PLANS["pro_monthly"]))
            assert pid == "price_FAKE_LIVE_TEST"
            assert created["price"] == 1
            live_doc = mdb.stripe_prices.find_one({"plan_key": "pro_monthly", "mode": "live"}, {"_id": 0})
            assert live_doc and live_doc["price_id"] == "price_FAKE_LIVE_TEST"
            # test doc not overwritten
            test_doc_after = mdb.stripe_prices.find_one({"plan_key": "pro_monthly", "mode": {"$ne": "live"}}, {"_id": 0})
            if test_doc_before:
                assert test_doc_after["price_id"] == test_doc_before["price_id"]
            # second call reuses live doc
            p._stripe_price_cache.clear()
            pid2 = loop.run_until_complete(p.get_or_create_stripe_price("pro_monthly", p.SUBSCRIPTION_PLANS["pro_monthly"]))
            assert pid2 == "price_FAKE_LIVE_TEST" and created["price"] == 1
            # coupon live
            cid = loop.run_until_complete(p.get_or_create_amount_coupon("essential_yearly", 15000))
            assert cid == "coupon_FAKE_LIVE_TEST"
            assert mdb.stripe_coupons.find_one({"name": "first_year_essential_yearly_15000", "mode": "live"})
        finally:
            loop.close()
    finally:
        mdb.stripe_prices.delete_many({"mode": "live", "price_id": "price_FAKE_LIVE_TEST"})
        mdb.stripe_coupons.delete_many({"mode": "live", "coupon_id": "coupon_FAKE_LIVE_TEST"})
        p._stripe_price_cache.clear()
    assert mdb.stripe_prices.count_documents({"mode": "live"}) == 0
    assert mdb.stripe_coupons.count_documents({"mode": "live"}) == 0


# --- Mode-mismatched IDs are ignored; legacy (no stripe_livemode) IDs count as test ---
class TestModeMismatchIgnored:
    def test_legacy_and_live_subscription_ids(self, s):
        uid = mdb.users.find_one({"email": "testpro@test.com"})["user_id"]
        try:
            mdb.users.update_one({"user_id": uid}, {"$set": {"stripe_subscription_id": "sub_TESTFAKE_legacy"}, "$unset": {"stripe_livemode": ""}})
            r = s.get(f"{BASE_URL}/api/subscription/details", timeout=30)
            assert r.status_code == 200 and r.json()["has_subscription"] is False
            mdb.users.update_one({"user_id": uid}, {"$set": {"stripe_subscription_id": "sub_TESTFAKE_live", "stripe_livemode": True}})
            r = s.get(f"{BASE_URL}/api/subscription/details", timeout=30)
            assert r.status_code == 200 and r.json()["has_subscription"] is False
            # cancel with a live-mode sub id must not hit Stripe
            r = s.post(f"{BASE_URL}/api/subscription/auto-renew", json={"enabled": True}, timeout=30)
            print("auto-renew (live id, test key):", r.status_code, r.text[:200])
            assert r.status_code != 500
        finally:
            mdb.users.update_one({"user_id": uid}, {"$unset": {"stripe_subscription_id": "", "stripe_livemode": ""}})

    def test_billing_portal_legacy_vs_live_customer(self, s):
        uid = mdb.users.find_one({"email": "testpro@test.com"})["user_id"]
        orig = mdb.users.find_one({"user_id": uid}, {"_id": 0, "stripe_customer_id": 1, "stripe_livemode": 1})
        try:
            r1 = s.post(f"{BASE_URL}/api/billing/portal-session", json={"return_url": BASE_URL + "/settings"}, timeout=30)
            print("portal legacy:", r1.status_code, r1.text[:150])
            mdb.users.update_one({"user_id": uid}, {"$set": {"stripe_livemode": True}})
            r2 = s.post(f"{BASE_URL}/api/billing/portal-session", json={"return_url": BASE_URL + "/settings"}, timeout=30)
            print("portal live-tagged:", r2.status_code, r2.text[:150])
            assert r2.status_code != 500
            if r1.status_code == 200:
                assert r2.status_code != 200 or r2.json().get("url") != r1.json().get("url")
        finally:
            if orig.get("stripe_livemode") is None:
                mdb.users.update_one({"user_id": uid}, {"$unset": {"stripe_livemode": ""}})
