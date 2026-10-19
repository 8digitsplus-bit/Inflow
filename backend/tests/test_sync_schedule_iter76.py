# Scheduled data sync (plan-based automatic sync) — /api/sync/settings, /api/sync/run-now, scheduler
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")


def _env(key):
    for line in open("/app/backend/.env"):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


mdb = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]
TESTPRO_ORG = "org_15337f4cefc9"


def _mk_user(org_id, role, tier):
    uid = f"TEST_user_{uuid.uuid4().hex[:8]}"
    tok = f"TEST_tok_{uuid.uuid4().hex}"
    mdb.users.insert_one({"user_id": uid, "email": f"{uid}@test.com", "name": uid, "org_id": org_id, "role": role,
                          "subscription_tier": tier, "created_at": datetime.now(timezone.utc)})
    mdb.user_sessions.insert_one({"session_token": tok, "user_id": uid,
                                  "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
                                  "created_at": datetime.now(timezone.utc)})
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_org():
    org_id = f"TEST_org_{uuid.uuid4().hex[:8]}"
    mdb.organizations.insert_one({"org_id": org_id, "name": "TEST sync org", "owner_user_id": "x",
                                  "subscription_tier": "essential_monthly", "subscription_status": "active"})
    owner = _mk_user(org_id, "owner", "essential_monthly")
    member = _mk_user(org_id, "member", "essential_monthly")
    yield {"org_id": org_id, "owner": owner, "member": member}
    mdb.organizations.delete_many({"org_id": org_id})
    mdb.sync_schedules.delete_many({"org_id": org_id})
    mdb.sync_runs.delete_many({"org_id": org_id})
    uids = [u["user_id"] for u in mdb.users.find({"org_id": org_id})]
    mdb.user_sessions.delete_many({"user_id": {"$in": uids}})
    mdb.users.delete_many({"org_id": org_id})


def _set_tier(org_id, tier):
    mdb.organizations.update_one({"org_id": org_id}, {"$set": {"subscription_tier": tier}})


@pytest.fixture(scope="module")
def testpro():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "testpro@test.com", "password": "password"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("session_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# --- GET defaults + mode mapping
class TestSettingsAndModes:
    def test_defaults_created(self, test_org):
        r = test_org["owner"].get(f"{BASE_URL}/api/sync/settings")
        assert r.status_code == 200, r.text
        d = r.json()
        s = d["schedule"]
        assert s["enabled"] is True and s["weekday"] == 0 and s["time"] == "07:00" and s["timezone"] == "UTC"
        assert s["mode"] == "weekly" and d["mode_label"] == "Weekly"
        assert d["tier"] == "essential_monthly" and d["can_edit"] is True and d["realtime_minutes"] == 15
        assert isinstance(d["connections"], list) and isinstance(d["runs"], list)
        nxt = datetime.fromisoformat(s["next_run_at"])
        assert nxt.weekday() == 0 and nxt.hour == 7 and nxt > datetime.now(timezone.utc)
        assert "_id" not in d["schedule"]

    def test_member_can_read_not_edit(self, test_org):
        r = test_org["member"].get(f"{BASE_URL}/api/sync/settings")
        assert r.status_code == 200 and r.json()["can_edit"] is False
        assert test_org["member"].put(f"{BASE_URL}/api/sync/settings", json={"time": "08:00"}).status_code == 403
        assert test_org["member"].post(f"{BASE_URL}/api/sync/run-now").status_code == 403

    @pytest.mark.parametrize("tier,mode", [("enterprise_monthly", "realtime"), ("pro_annual", "daily"),
                                           ("trial", "daily"), ("expired", "off"), ("cancelled", "off"),
                                           ("free", "off"), ("essential_annual", "weekly")])
    def test_mode_by_tier(self, test_org, tier, mode):
        _set_tier(test_org["org_id"], tier)
        d = test_org["owner"].get(f"{BASE_URL}/api/sync/settings").json()
        assert d["schedule"]["mode"] == mode, d
        nxt = d["schedule"]["next_run_at"]
        if mode == "off":
            assert nxt is None
        else:
            assert nxt is not None
        if mode == "realtime":
            delta = datetime.fromisoformat(nxt) - datetime.now(timezone.utc)
            assert timedelta(minutes=13) < delta <= timedelta(minutes=15, seconds=5)

    def test_off_put_forbidden(self, test_org):
        _set_tier(test_org["org_id"], "expired")
        for body in ({"enabled": False}, {"weekday": 3}, {"time": "09:00"}):
            r = test_org["owner"].put(f"{BASE_URL}/api/sync/settings", json=body)
            assert r.status_code == 403 and r.json()["detail"] == "Automatic sync needs an active plan."
        r = test_org["owner"].put(f"{BASE_URL}/api/sync/settings", json={"timezone": "Europe/Paris"})
        assert r.status_code == 200


# --- PUT validation + next_run computation
class TestPut:
    def test_validation(self, test_org):
        _set_tier(test_org["org_id"], "pro_monthly")
        o = test_org["owner"]
        assert o.put(f"{BASE_URL}/api/sync/settings", json={"time": "25:00"}).status_code == 422
        assert o.put(f"{BASE_URL}/api/sync/settings", json={"weekday": 7}).status_code == 422
        assert o.put(f"{BASE_URL}/api/sync/settings", json={"weekday": -1}).status_code == 422
        r = o.put(f"{BASE_URL}/api/sync/settings", json={"timezone": "Mars/Base"})
        assert r.status_code == 400 and r.json()["detail"] == "Unknown timezone"

    def test_daily_london(self, test_org):
        _set_tier(test_org["org_id"], "pro_monthly")
        r = test_org["owner"].put(f"{BASE_URL}/api/sync/settings",
                                  json={"enabled": True, "time": "18:00", "timezone": "Europe/London"})
        assert r.status_code == 200, r.text
        nxt = datetime.fromisoformat(r.json()["schedule"]["next_run_at"])
        loc = nxt.astimezone(ZoneInfo("Europe/London"))
        now = datetime.now(timezone.utc)
        assert loc.hour == 18 and loc.minute == 0 and now < nxt <= now + timedelta(days=1)
        g = test_org["owner"].get(f"{BASE_URL}/api/sync/settings").json()["schedule"]
        assert g["time"] == "18:00" and g["timezone"] == "Europe/London" and g["next_run_at"] == r.json()["schedule"]["next_run_at"]

    def test_weekly_ny(self, test_org):
        _set_tier(test_org["org_id"], "essential_monthly")
        test_org["owner"].get(f"{BASE_URL}/api/sync/settings")
        r = test_org["owner"].put(f"{BASE_URL}/api/sync/settings",
                                  json={"weekday": 2, "time": "09:30", "timezone": "America/New_York"})
        assert r.status_code == 200, r.text
        nxt = datetime.fromisoformat(r.json()["schedule"]["next_run_at"])
        loc = nxt.astimezone(ZoneInfo("America/New_York"))
        now = datetime.now(timezone.utc)
        assert loc.weekday() == 2 and (loc.hour, loc.minute) == (9, 30) and now < nxt <= now + timedelta(days=7)

    def test_disable(self, test_org):
        r = test_org["owner"].put(f"{BASE_URL}/api/sync/settings", json={"enabled": False})
        assert r.status_code == 200 and r.json()["schedule"]["next_run_at"] is None
        g = test_org["owner"].get(f"{BASE_URL}/api/sync/settings").json()["schedule"]
        assert g["enabled"] is False and g["next_run_at"] is None
        r = test_org["owner"].put(f"{BASE_URL}/api/sync/settings", json={"enabled": True})
        assert r.json()["schedule"]["next_run_at"] is not None


# --- run-now on testpro (real integrations) + 409
class TestRunNow:
    def test_run_now_and_conflict(self, testpro):
        d = testpro.get(f"{BASE_URL}/api/sync/settings").json()
        assert d["schedule"]["mode"] == "realtime" and d["mode_label"] == "Real-time (every 15 min)"
        labels = [c["label"] for c in d["connections"]]
        print("connections:", labels)
        r = testpro.post(f"{BASE_URL}/api/sync/run-now")
        if r.status_code == 409:
            time.sleep(30)
            r = testpro.post(f"{BASE_URL}/api/sync/run-now")
        assert r.status_code == 200, r.text
        run_id = r.json()["run_id"]
        r2 = testpro.post(f"{BASE_URL}/api/sync/run-now")
        assert r2.status_code == 409 and r2.json()["detail"] == "A sync is already running."
        for _ in range(40):
            time.sleep(2)
            d = testpro.get(f"{BASE_URL}/api/sync/settings").json()
            if d["schedule"]["last_status"] != "running":
                break
        s = d["schedule"]
        print("status:", s["last_status"], "results:", d["runs"][0]["results"])
        assert s["last_run_id"] == run_id and s["last_status"] in ("ok", "partial", "failed")
        run = d["runs"][0]
        assert run["run_id"] == run_id and run["trigger"] == "manual"
        assert len(run["results"]) >= 4
        assert s["last_status"] == "ok", run["results"]


# --- scheduler path
class TestScheduler:
    def test_scheduled_run(self, testpro):
        past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        mdb.sync_schedules.update_one({"org_id": TESTPRO_ORG}, {"$set": {"next_run_at": past, "locked_until": None}})
        before = mdb.sync_runs.count_documents({"org_id": TESTPRO_ORG, "trigger": "schedule"})
        found = None
        for _ in range(50):
            time.sleep(3)
            d = testpro.get(f"{BASE_URL}/api/sync/settings").json()
            if d["runs"] and d["runs"][0]["trigger"] == "schedule" and d["runs"][0]["status"] != "running" \
                    and d["schedule"]["next_run_at"] != past:
                found = d
                break
        assert found, "scheduler did not run in time"
        after = mdb.sync_runs.count_documents({"org_id": TESTPRO_ORG, "trigger": "schedule"})
        assert after - before == 1, f"expected exactly one scheduled run, got {after - before}"
        nxt = datetime.fromisoformat(found["schedule"]["next_run_at"])
        assert nxt > datetime.now(timezone.utc) + timedelta(minutes=13)
        print("scheduled run:", found["runs"][0]["status"], found["runs"][0]["results"])
