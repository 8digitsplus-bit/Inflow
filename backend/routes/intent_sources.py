"""Analytics pull for the intent data cloud — page-level events with buyer identity
from connected PostHog / Mixpanel / Amplitude / GA4. Each fetcher returns
(events, error) and never raises; events use the engine's raw event shape.
"""
import io
import gzip
import json
import base64
import asyncio
import zipfile
from datetime import datetime, timezone, timedelta

import httpx

from routes.intent_common import EVENT_TYPES, conn_creds
from routes.posthog_integration import _host as ph_host

LOOKBACK_DAYS = 14
MAX_EVENTS = 3000


def _ev(etype: str, url: str, email: str, company: str, ts, source_id: str = "") -> dict:
    return {"type": etype if etype in EVENT_TYPES else "", "url": url or "", "email": email or "",
            "company": company or "", "ts": ts, "vid": source_id}


async def fetch_posthog(conn: dict) -> tuple[list, str]:
    key = conn_creds(conn)["token"]
    q = ("SELECT event, timestamp, properties.$current_url, person.properties.email, person.properties.company, distinct_id "
         f"FROM events WHERE timestamp >= now() - INTERVAL {LOOKBACK_DAYS} DAY AND person.properties.email IS NOT NULL "
         f"ORDER BY timestamp DESC LIMIT {MAX_EVENTS}")
    try:
        async with httpx.AsyncClient(timeout=45.0) as c:
            r = await c.post(f"{ph_host(conn.get('instance_url', ''))}/api/projects/{conn.get('company_id')}/query/",
                             headers={"Authorization": f"Bearer {key}"}, json={"query": {"kind": "HogQLQuery", "query": q}})
    except Exception as e:
        return [], f"Could not reach PostHog: {e}"
    if r.status_code != 200:
        return [], f"PostHog returned {r.status_code}"
    rows = (r.json() or {}).get("results") or []
    return [_ev(str(x[0]).lstrip("$"), x[2], x[3], x[4], x[1], f"ph_{x[5]}") for x in rows if len(x) >= 6], ""


async def fetch_mixpanel(conn: dict) -> tuple[list, str]:
    secret = conn_creds(conn)["token"]
    eu = (conn.get("instance_url") or "").lower() == "eu"
    today = datetime.now(timezone.utc).date()
    params = {"from_date": (today - timedelta(days=LOOKBACK_DAYS)).isoformat(), "to_date": today.isoformat(),
              "project_id": conn.get("company_id"), "limit": MAX_EVENTS}
    auth = base64.b64encode(f"{secret}:".encode()).decode()
    try:
        async with httpx.AsyncClient(timeout=60.0) as c:
            r = await c.get(f"https://data{'-eu' if eu else ''}.mixpanel.com/api/2.0/export",
                            headers={"Authorization": f"Basic {auth}"}, params=params)
    except Exception as e:
        return [], f"Could not reach Mixpanel: {e}"
    if r.status_code != 200:
        return [], f"Mixpanel returned {r.status_code}"
    out = []
    for line in r.text.splitlines()[:MAX_EVENTS]:
        try:
            d = json.loads(line)
        except Exception:
            continue
        p = d.get("properties") or {}
        email = p.get("$email") or p.get("email") or (p.get("distinct_id") if "@" in str(p.get("distinct_id", "")) else "")
        if email or p.get("company"):
            out.append(_ev(str(d.get("event", "")).lower().replace(" ", "_"), p.get("$current_url"), email,
                           p.get("company"), p.get("time"), f"mp_{p.get('distinct_id', '')}"))
    return out, ""


def _unzip_amplitude(raw: bytes) -> list:
    rows = []
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        for name in z.namelist():
            with z.open(name) as f:
                for line in gzip.GzipFile(fileobj=io.BytesIO(f.read())).read().decode().splitlines():
                    if len(rows) >= MAX_EVENTS:
                        return rows
                    try:
                        rows.append(json.loads(line))
                    except Exception:
                        continue
    return rows


async def fetch_amplitude(conn: dict) -> tuple[list, str]:
    secret = conn_creds(conn)["token"]
    base = "https://analytics.eu.amplitude.com" if (conn.get("instance_url") or "").lower() == "eu" else "https://amplitude.com"
    now = datetime.now(timezone.utc)
    auth = base64.b64encode(f"{conn.get('client_id')}:{secret}".encode()).decode()
    try:
        async with httpx.AsyncClient(timeout=90.0) as c:
            r = await c.get(f"{base}/api/2/export", headers={"Authorization": f"Basic {auth}"},
                            params={"start": (now - timedelta(days=LOOKBACK_DAYS)).strftime("%Y%m%dT%H"), "end": now.strftime("%Y%m%dT%H")})
    except Exception as e:
        return [], f"Could not reach Amplitude: {e}"
    if r.status_code == 404:
        return [], ""
    if r.status_code != 200:
        return [], f"Amplitude returned {r.status_code}"
    try:
        rows = await asyncio.to_thread(_unzip_amplitude, r.content)
    except Exception as e:
        return [], f"Could not read Amplitude export: {e}"
    out = []
    for d in rows:
        up, ep = d.get("user_properties") or {}, d.get("event_properties") or {}
        email = up.get("email") or (d.get("user_id") if "@" in str(d.get("user_id", "")) else "")
        if email or up.get("company"):
            out.append(_ev(str(d.get("event_type", "")).lower().replace(" ", "_"), ep.get("page_url") or ep.get("url"),
                           email, up.get("company"), d.get("event_time"), f"amp_{d.get('user_id', '')}"))
    return out, ""


async def fetch_ga4(conn: dict) -> tuple[list, str]:
    from routes.ga4_integration import _token_from_sa
    try:
        token = await asyncio.to_thread(_token_from_sa, conn_creds(conn)["token"])
    except Exception as e:
        return [], f"GA4 service account invalid: {str(e)[:80]}"
    body = {"dateRanges": [{"startDate": f"{LOOKBACK_DAYS}daysAgo", "endDate": "today"}],
            "dimensions": [{"name": "customUser:inflow_account"}, {"name": "pagePath"}, {"name": "date"}],
            "metrics": [{"name": "screenPageViews"}], "limit": 1000}
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(f"https://analyticsdata.googleapis.com/v1beta/properties/{conn.get('company_id')}:runReport",
                             headers={"Authorization": f"Bearer {token}"}, json=body)
    except Exception as e:
        return [], f"Could not reach GA4: {e}"
    if r.status_code == 400:
        return [], "GA4 needs a user-scoped custom dimension named 'inflow_account' (the visitor's company) to attribute visits to accounts."
    if r.status_code != 200:
        return [], f"GA4 returned {r.status_code}"
    out = []
    for row in (r.json() or {}).get("rows", []) or []:
        dims = [d.get("value", "") for d in row.get("dimensionValues", [])]
        views = int(float((row.get("metricValues") or [{}])[0].get("value", 0) or 0))
        if len(dims) == 3 and dims[0] and dims[0] != "(not set)":
            ts = f"{dims[2][:4]}-{dims[2][4:6]}-{dims[2][6:8]}T12:00:00+00:00"
            out.extend(_ev("", dims[1], "", dims[0], ts) for _ in range(min(views, 5)))
    return out, ""


FETCHERS = {"posthog": fetch_posthog, "mixpanel": fetch_mixpanel, "amplitude": fetch_amplitude, "ga4": fetch_ga4}
