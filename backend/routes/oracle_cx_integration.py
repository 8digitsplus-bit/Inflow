"""Oracle CX Sales (Fusion) Live Integration — reads opportunities via crmRestApi.

Auth: HTTP Basic (Oracle Cloud username:password).
Base: https://{instance}.fa.<region>.oraclecloud.com/crmRestApi/resources/11.13.18.05.
"""
import httpx
import uuid
from datetime import datetime, timezone

RES = "/crmRestApi/resources/11.13.18.05"


def _base(instance_url: str) -> str:
    u = (instance_url or "").strip().rstrip("/")
    if not u.startswith("http"):
        u = "https://" + u
    return u


async def validate_oracle_cx_credentials(instance_url: str, username: str, password: str) -> dict:
    base = _base(instance_url)
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{base}{RES}/opportunities", auth=(username, password), params={"limit": 1})
        if r.status_code == 200:
            return {"valid": True, "account_name": "Oracle CX Sales"}
        return {"valid": False, "error": f"Oracle CX auth failed (HTTP {r.status_code}): {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e) or f"Could not reach the Oracle CX instance ({e.__class__.__name__}). Check the Instance URL."}


def _stage(status: str):
    s = (status or "").upper()
    if "WON" in s:
        return "closed_won", 100
    if "LOST" in s or "LOSS" in s:
        return "closed_lost", 0
    return "negotiation", 50


async def fetch_oracle_cx_data(instance_url: str, username: str, password: str, user_id: str) -> dict:
    base = _base(instance_url)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"opportunities": 0, "open_value": 0.0, "currency": "USD"}

    async with httpx.AsyncClient(timeout=40.0) as client:
        r = await client.get(
            f"{base}{RES}/opportunities",
            auth=(username, password),
            params={"limit": 100, "orderBy": "CreationDate:desc"},
        )
        if r.status_code != 200:
            return {"deals": [], "total_records": 0, "stats": stats}
        rows = (r.json() or {}).get("items", []) or []

    for o in rows:
        try:
            amount = float(o.get("Revenue", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0
        currency = o.get("CurrencyCode") or "USD"
        stage, prob = _stage(o.get("StatusCode") or o.get("SalesStage") or o.get("StatusCategoryCode"))
        stats["opportunities"] += 1
        if stage != "closed_lost":
            stats["open_value"] += amount
        stats["currency"] = currency

        oid = o.get("OptyNumber") or o.get("OptyId") or uuid.uuid4().hex[:12]
        created = str(o.get("CreationDate") or "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (o.get("Name") or f"Opportunity {oid}")[:200],
            "company": (o.get("TargetPartyName") or "Oracle CX")[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "oracle_cx", "notes": f"Oracle CX opportunity {oid}",
            "expected_close_date": created[:10] or None,
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["open_value"] = round(stats["open_value"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
