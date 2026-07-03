"""Per-account usage telemetry pull from product-analytics sources.

Cross-references product usage against billing contracts. For each customer
account we derive:
  - seats_used     = distinct active users for that account over the window
  - usage_volume   = total event volume for that account over the window

Data is grouped by an account/company identifier property that the customer's
events carry (e.g. "company", "account_id", "$group_id"). These fetchers are
best-effort: they depend on that property existing in the source, so they return
an empty list on any error and never raise into the sync flow.
"""
import base64
import httpx
from datetime import datetime, timezone, timedelta

MIXPANEL_BASE = "https://mixpanel.com"
MIXPANEL_EU = "https://eu.mixpanel.com"
AMP_US = "https://amplitude.com"
AMP_EU = "https://analytics.eu.amplitude.com"


def _mp_base(region: str) -> str:
    return MIXPANEL_EU if (region or "").lower() == "eu" else MIXPANEL_BASE


def _amp_base(region: str) -> str:
    return AMP_EU if (region or "").lower() == "eu" else AMP_US


async def fetch_mixpanel_usage(project_id: str, api_secret: str, region: str,
                               account_property: str, usage_event: str) -> list:
    """Return [{account_key, seats_used, usage_volume}] grouped by account_property.

    Uses the Mixpanel Segmentation API with `on=properties["<account_property>"]`.
    type=unique -> distinct users (seats); type=general -> event volume.
    """
    base = _mp_base(region)
    auth = base64.b64encode(f"{api_secret}:".encode()).decode()
    headers = {"Authorization": f"Basic {auth}"}
    today = datetime.now(timezone.utc).date()
    frm = (today - timedelta(days=30)).isoformat()
    to = today.isoformat()
    on_expr = f'properties["{account_property}"]'
    event = usage_event or "$any_event"

    seats: dict = {}
    volume: dict = {}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for typ, bucket in (("unique", seats), ("general", volume)):
                r = await client.get(
                    f"{base}/api/2.0/segmentation",
                    headers=headers,
                    params={
                        "project_id": project_id,
                        "event": event,
                        "from_date": frm,
                        "to_date": to,
                        "on": on_expr,
                        "type": typ,
                        "unit": "month",
                    },
                )
                if r.status_code != 200:
                    continue
                values = (r.json().get("data") or {}).get("values") or {}
                for group_key, series in values.items():
                    if not group_key or group_key in ("$overall", "undefined", "null"):
                        continue
                    total = sum(v for v in series.values()) if isinstance(series, dict) else 0
                    if typ == "unique":
                        bucket[group_key] = max(bucket.get(group_key, 0), int(total))
                    else:
                        bucket[group_key] = int(total)
    except Exception:
        return []

    out = []
    for key in set(list(seats.keys()) + list(volume.keys())):
        out.append({
            "account_key": key,
            "seats_used": int(seats.get(key, 0)),
            "usage_volume": int(volume.get(key, 0)),
        })
    return out


async def fetch_amplitude_usage(api_key: str, secret_key: str, region: str,
                                account_property: str, usage_event: str) -> list:
    """Return [{account_key, seats_used, usage_volume}] grouped by account_property.

    Uses the Amplitude Event Segmentation API with the group-by (`g`) parameter.
    m=uniques -> distinct users (seats); m=totals -> event volume.
    """
    base = _amp_base(region)
    auth = base64.b64encode(f"{api_key}:{secret_key}".encode()).decode()
    headers = {"Authorization": f"Basic {auth}"}
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=30)).strftime("%Y%m%dT%H")
    end = now.strftime("%Y%m%dT%H")
    event = usage_event or "_active"
    e = '{"event_type":"' + event + '"}'

    seats: dict = {}
    volume: dict = {}

    def _parse(data: dict, bucket: dict):
        labels = data.get("seriesLabels") or []
        series = data.get("series") or []
        # Grouped segmentation returns one label + one value-array per group.
        for idx, lab in enumerate(labels):
            key = lab[-1] if isinstance(lab, list) and lab else str(lab)
            vals = series[idx] if idx < len(series) else []
            total = int(sum(vals)) if isinstance(vals, list) else 0
            if key and key not in ("undefined", "null"):
                bucket[key] = total

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for metric, bucket in (("uniques", seats), ("totals", volume)):
                r = await client.get(
                    f"{base}/api/2/events/segmentation",
                    headers=headers,
                    params={"e": e, "start": start, "end": end, "m": metric,
                            "i": 30, "g": account_property},
                )
                if r.status_code != 200:
                    continue
                _parse(r.json().get("data") or {}, bucket)
    except Exception:
        return []

    out = []
    for key in set(list(seats.keys()) + list(volume.keys())):
        out.append({
            "account_key": key,
            "seats_used": int(seats.get(key, 0)),
            "usage_volume": int(volume.get(key, 0)),
        })
    return out
