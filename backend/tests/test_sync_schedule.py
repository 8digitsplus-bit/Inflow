# Sync scheduler (iter78 redesign): daily / hourly grid (1,2,4,8) / realtime / off; run-now removed
import os
import time
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ORG = "org_15337f4cefc9"
db = MongoClient(os.environ.get("MONGO_URL"))[os.environ.get("DB_NAME")]


def _now():
    return datetime.now(timezone.utc)


def _tier(t):
    db.organizations.update_one({"org_id": ORG}, {"$set": {"subscription_tier": t}})


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "testpro@test.com", "password": "password"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("token") or r.json().get("session_token") or r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    yield s
    _tier("enterprise_monthly")
    db.sync_schedules.update_one({"org_id": ORG}, {"$set": {"interval_hours": 4}})
    s.get(f"{BASE_URL}/api/sync/settings")
    s.put(f"{BASE_URL}/api/sync/settings", json={"enabled": True, "time": "07:00", "timezone": "Europe/London"})


# mode_for_tier mapping + labels
@pytest.mark.parametrize("tier,mode,label", [
    ("essential_monthly", "daily", "Daily"),
    ("essential_annual", "daily", "Daily"),
    ("pro_monthly", "hourly", "Every 4 hours"),
    ("trial", "hourly", "Every 4 hours"),
    ("enterprise_monthly", "realtime", "Real-time (every 15 min)"),
    ("expired", "off", "Off"),
    ("cancelled", "off", "Off"),
])
def test_mode_mapping(client, tier, mode, label):
    db.sync_schedules.update_one({"org_id": ORG}, {"$set": {"interval_hours": 4, "enabled": True}})
    _tier(tier)
    r = client.get(f"{BASE_URL}/api/sync/settings")
    assert r.status_code == 200
    d = r.json()
    assert d["schedule"]["mode"] == mode
    assert d["mode_label"] == label
    if mode == "off":
        assert d["schedule"]["next_run_at"] is None


def test_settings_shape_and_backfill(client):
    _tier("pro_monthly")
    db.sync_schedules.update_one({"org_id": ORG}, {"$unset": {"interval_hours": ""}})
    d = client.get(f"{BASE_URL}/api/sync/settings").json()
    assert d["schedule"]["interval_hours"] == 4
    assert d["intervals"] == [1, 2, 4, 8]
    assert "weekday" not in d["schedule"]
    assert db.sync_schedules.find_one({"org_id": ORG})["interval_hours"] == 4


@pytest.mark.parametrize("n", [1, 2, 4, 8])
@pytest.mark.parametrize("tzname", ["Europe/London", "Asia/Kolkata", "America/New_York"])
def test_hourly_grid(client, n, tzname):
    _tier("pro_monthly")
    client.get(f"{BASE_URL}/api/sync/settings")
    r = client.put(f"{BASE_URL}/api/sync/settings", json={"interval_hours": n, "timezone": tzname})
    assert r.status_code == 200, r.text
    s = r.json()["schedule"]
    assert s["interval_hours"] == n
    nxt = datetime.fromisoformat(s["next_run_at"])
    now = _now()
    assert nxt > now
    assert nxt - now <= timedelta(hours=n)
    local = nxt.astimezone(ZoneInfo(tzname))
    assert local.minute == 0 and local.second == 0
    assert local.hour % n == 0
    g = client.get(f"{BASE_URL}/api/sync/settings").json()
    assert g["mode_label"] == ("Every hour" if n == 1 else f"Every {n} hours")
    assert g["schedule"]["next_run_at"] == s["next_run_at"]


@pytest.mark.parametrize("bad", [3, 5, 0, 24])
def test_hourly_invalid_interval(client, bad):
    _tier("pro_monthly")
    r = client.put(f"{BASE_URL}/api/sync/settings", json={"interval_hours": bad})
    assert r.status_code == 422


def test_daily_next_run(client):
    _tier("essential_monthly")
    client.get(f"{BASE_URL}/api/sync/settings")
    for t in ["07:00", "23:30", "00:15"]:
        r = client.put(f"{BASE_URL}/api/sync/settings", json={"time": t, "timezone": "Asia/Kolkata"})
        assert r.status_code == 200
        nxt = datetime.fromisoformat(r.json()["schedule"]["next_run_at"])
        assert _now() < nxt <= _now() + timedelta(hours=24)
        assert nxt.astimezone(ZoneInfo("Asia/Kolkata")).strftime("%H:%M") == t


def test_bad_timezone_and_time(client):
    _tier("pro_monthly")
    assert client.put(f"{BASE_URL}/api/sync/settings", json={"timezone": "Mars/Base"}).status_code == 400
    assert client.put(f"{BASE_URL}/api/sync/settings", json={"time": "25:00"}).status_code == 422


def test_run_now_removed(client):
    r = client.post(f"{BASE_URL}/api/sync/run-now")
    assert r.status_code in (404, 405)


def test_off_mode_403(client):
    _tier("expired")
    client.get(f"{BASE_URL}/api/sync/settings")
    assert client.put(f"{BASE_URL}/api/sync/settings", json={"enabled": False}).status_code == 403
    assert client.put(f"{BASE_URL}/api/sync/settings", json={"interval_hours": 2}).status_code == 403
    assert client.put(f"{BASE_URL}/api/sync/settings", json={"time": "08:00"}).status_code == 403
    r = client.put(f"{BASE_URL}/api/sync/settings", json={"timezone": "Europe/Paris"})
    assert r.status_code == 200
    assert r.json()["schedule"]["next_run_at"] is None


def test_scheduler_fires_hourly(client):
    _tier("pro_monthly")
    client.get(f"{BASE_URL}/api/sync/settings")
    client.put(f"{BASE_URL}/api/sync/settings", json={"interval_hours": 2, "timezone": "Asia/Kolkata", "enabled": True})
    # wait for any running job
    for _ in range(45):
        if db.sync_schedules.find_one({"org_id": ORG}).get("last_status") != "running":
            break
        time.sleep(2)
    past = (_now() - timedelta(minutes=1)).isoformat()
    db.sync_schedules.update_one({"org_id": ORG}, {"$set": {"next_run_at": past, "locked_until": None}})
    start = _now().isoformat()
    run = None
    end = time.time() + 150
    while time.time() < end:
        run = db.sync_runs.find_one({"org_id": ORG, "trigger": "schedule", "started_at": {"$gte": start}})
        if run:
            d = db.sync_schedules.find_one({"org_id": ORG})
            if d.get("last_status") != "running" and d.get("next_run_at") and d["next_run_at"] > _now().isoformat():
                break
        time.sleep(3)
    assert run, "no scheduled run created"
    d = db.sync_schedules.find_one({"org_id": ORG})
    nxt = datetime.fromisoformat(d["next_run_at"])
    assert nxt > _now()
    local = nxt.astimezone(ZoneInfo("Asia/Kolkata"))
    assert local.minute == 0 and local.hour % 2 == 0, local
    run = db.sync_runs.find_one({"run_id": run["run_id"]})
    print("run status", run["status"], "next", local)
