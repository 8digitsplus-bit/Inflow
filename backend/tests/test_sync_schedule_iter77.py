# Retest of iteration_76 minor fixes: off-mode scheduler skip, lock heartbeat, realtime run-now reschedule
import os
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ORG = "org_15337f4cefc9"
db = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "test_database")]


def _now():
    return datetime.now(timezone.utc)


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
    db.organizations.update_one({"org_id": ORG}, {"$set": {"subscription_tier": "enterprise_monthly"}})
    s.put(f"{BASE_URL}/api/sync/settings", json={"enabled": True})


def _wait_idle(timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        d = db.sync_schedules.find_one({"org_id": ORG})
        if d.get("last_status") != "running":
            return d
        time.sleep(2)
    return db.sync_schedules.find_one({"org_id": ORG})


# (a) scheduler skips due schedule for an org now 'off'
def test_scheduler_skips_off_org(client):
    _wait_idle()
    db.organizations.update_one({"org_id": ORG}, {"$set": {"subscription_tier": "expired"}})
    past = (_now() - timedelta(minutes=2)).isoformat()
    db.sync_schedules.update_one({"org_id": ORG}, {"$set": {"enabled": True, "mode": "realtime", "next_run_at": past, "locked_until": None}})
    before = db.sync_runs.count_documents({"org_id": ORG})
    start = _now().isoformat()
    time.sleep(72)
    new_runs = db.sync_runs.count_documents({"org_id": ORG, "started_at": {"$gte": start}})
    d = db.sync_schedules.find_one({"org_id": ORG})
    db.organizations.update_one({"org_id": ORG}, {"$set": {"subscription_tier": "enterprise_monthly"}})
    assert new_runs == 0, f"runs created while off: {new_runs} (before {before})"
    assert d["next_run_at"] is None
    assert d["mode"] == "off"


# (b) heartbeat + (c) realtime run-now pushes next_run_at
def test_realtime_run_now_reschedules_and_heartbeat(client):
    db.organizations.update_one({"org_id": ORG}, {"$set": {"subscription_tier": "enterprise_monthly"}})
    r = client.get(f"{BASE_URL}/api/sync/settings")
    assert r.status_code == 200 and r.json()["schedule"]["mode"] == "realtime"
    client.put(f"{BASE_URL}/api/sync/settings", json={"enabled": True})
    _wait_idle()
    t0 = _now()
    r = client.post(f"{BASE_URL}/api/sync/run-now")
    assert r.status_code == 200, r.text
    run_id = r.json()["run_id"]
    lock_values = set()
    end = time.time() + 90
    while time.time() < end:
        d = db.sync_schedules.find_one({"org_id": ORG})
        if d.get("locked_until"):
            lock_values.add(d["locked_until"])
        run = db.sync_runs.find_one({"run_id": run_id})
        if run["status"] != "running":
            break
        time.sleep(0.3)
    run = db.sync_runs.find_one({"run_id": run_id})
    assert run["status"] != "running"
    print("lock values seen:", lock_values, "results", len(run["results"]))
    assert len(lock_values) >= 2, f"heartbeat not observed: {lock_values}"
    time.sleep(1)
    d = db.sync_schedules.find_one({"org_id": ORG})
    assert d["locked_until"] is None
    nxt = datetime.fromisoformat(d["next_run_at"])
    delta = (nxt - t0).total_seconds() / 60
    assert 14 <= delta <= 17, f"next_run_at delta {delta} min"
