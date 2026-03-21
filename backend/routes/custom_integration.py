from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any
import uuid
import httpx
import re

from database import db
from models import User
from dependencies import get_current_user

router = APIRouter()

STAGES = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"]
PROB_MAP = {"lead": 15, "qualified": 35, "proposal": 55, "negotiation": 75, "closed_won": 100, "closed_lost": 0}

PLATFORM_SIGNATURES = {
    "stripe": {
        "value_patterns": [r"^ch_", r"^cus_", r"^sub_", r"^pi_", r"^in_", r"^pm_", r"^txn_"],
        "column_patterns": ["stripe", "charge_id", "customer_id", "payment_intent", "stripe_id"],
    },
    "shopify": {
        "value_patterns": [r"^#\d{4,}", r"^gid://shopify/"],
        "column_patterns": ["shopify", "fulfillment", "order_number", "product_type", "variant_id", "shopify_id"],
    },
    "hubspot": {
        "value_patterns": [r"^hs_"],
        "column_patterns": ["hubspot", "hs_object_id", "lifecycle_stage", "deal_stage", "hubspot_id"],
    },
    "salesforce": {
        "value_patterns": [r"^00[0-9A-Za-z]{13}$", r"^00[0-9A-Za-z]{16}$"],
        "column_patterns": ["salesforce", "sf_id", "opportunity_id", "sf_account_id", "sobject"],
    },
    "quickbooks": {
        "value_patterns": [r"^qb_"],
        "column_patterns": ["quickbooks", "qb_id", "invoice_number", "tax_code"],
    },
}


def detect_platforms_in_data(data: List[Dict[str, Any]]) -> List[Dict]:
    if not data:
        return []
    columns = set()
    sample_values = []
    for row in data[:50]:
        columns.update(k.lower().strip() for k in row.keys())
        sample_values.extend(str(v).strip() for v in row.values() if v)

    detections = []
    for platform_id, sigs in PLATFORM_SIGNATURES.items():
        score = 0
        reasons = []
        for pattern in sigs["column_patterns"]:
            matches = [c for c in columns if pattern.lower() in c]
            if matches:
                score += 0.3
                reasons.append(f"Column names match '{pattern}'")
        for pattern in sigs["value_patterns"]:
            hits = sum(1 for v in sample_values[:300] if re.match(pattern, v))
            if hits > 0:
                score += min(0.5, hits * 0.1)
                reasons.append(f"Found {hits} values matching {platform_id.title()} ID patterns")
        if score > 0.2:
            detections.append({
                "platform_id": platform_id,
                "confidence": round(min(score, 1.0), 2),
                "reasons": reasons,
            })
    return sorted(detections, key=lambda x: x["confidence"], reverse=True)


def _parse_value(raw):
    try:
        return float(str(raw).replace(",", "").replace("$", "").replace("€", "").replace("£", "").strip())
    except (ValueError, TypeError):
        return 0


def _build_deal(row, mapping, stage_map, user_id, source, source_name, now):
    name = str(row.get(mapping.get("name", ""), "")) if mapping.get("name") else ""
    name = name or "Imported Record"
    company = str(row.get(mapping.get("company", ""), "Unknown")) if mapping.get("company") else "Unknown"
    value = _parse_value(row.get(mapping.get("value", ""), 0)) if mapping.get("value") else 0

    raw_stage = str(row.get(mapping.get("stage", ""), "lead")).lower().strip() if mapping.get("stage") else "lead"
    stage = stage_map.get(raw_stage, raw_stage)
    if stage not in STAGES:
        stage = "lead"

    prob = PROB_MAP.get(stage, 50)
    if mapping.get("probability") and row.get(mapping["probability"]):
        try:
            prob = int(float(str(row[mapping["probability"]])))
        except (ValueError, TypeError):
            pass

    notes_val = str(row.get(mapping.get("notes", ""), "")) if mapping.get("notes") else ""
    notes = notes_val or f"Imported from {source_name}"
    close_date = str(row.get(mapping.get("expected_close_date", ""), "")) if mapping.get("expected_close_date") else None

    return {
        "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "name": name[:200],
        "company": company[:200],
        "value": round(value, 2),
        "stage": stage,
        "probability": max(0, min(100, prob)),
        "expected_close_date": close_date or None,
        "notes": notes[:500],
        "source": source,
        "source_name": source_name,
        "synced": True,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }


def _resolve_path(data, path):
    if not path:
        return data
    current = data
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            current = current[int(part)]
        else:
            return None
        if current is None:
            return None
    return current


# --- Models ---

class CsvImportRequest(BaseModel):
    source_name: str = "CSV Import"
    mapping: Dict[str, Optional[str]]
    stage_mapping: Optional[Dict[str, str]] = None
    data: List[Dict[str, Any]]


class CustomApiTestRequest(BaseModel):
    endpoint: str
    method: str = "GET"
    auth_type: str = "bearer"
    api_key: Optional[str] = None
    auth_key_name: Optional[str] = None
    headers: Optional[Dict[str, str]] = None


class CustomApiConnectRequest(BaseModel):
    name: str
    endpoint: str
    method: str = "GET"
    auth_type: str = "bearer"
    api_key: Optional[str] = None
    auth_key_name: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    data_path: Optional[str] = None
    mapping: Dict[str, Optional[str]]
    stage_mapping: Optional[Dict[str, str]] = None


# --- Endpoints ---

@router.post("/business/import-csv")
async def import_csv(body: CsvImportRequest, current_user: User = Depends(get_current_user)):
    if not body.data:
        raise HTTPException(status_code=400, detail="No data provided")
    if len(body.data) > 5000:
        raise HTTPException(status_code=400, detail="Maximum 5000 rows per import")

    now = datetime.now(timezone.utc)
    stage_map = body.stage_mapping or {}
    deals = []
    errors = 0

    for row in body.data:
        try:
            deal = _build_deal(row, body.mapping, stage_map, current_user.user_id, "csv_import", body.source_name, now)
            if deal["value"] > 0 or deal["name"] != "Imported Record":
                deals.append(deal)
            else:
                errors += 1
        except Exception:
            errors += 1

    if not deals:
        raise HTTPException(status_code=400, detail="No valid records could be parsed")

    await db.deals.insert_many(deals)

    detected = detect_platforms_in_data(body.data)

    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": current_user.user_id,
        "platform": "csv_import",
        "source_name": body.source_name,
        "connected_at": now.isoformat(),
        "last_synced": now.isoformat(),
        "records_synced": len(deals),
        "sync_status": "synced",
        "is_live": False,
        "detected_platforms": detected,
    }
    await db.business_connections.insert_one(connection)
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"has_business_connected": True}}
    )

    return {
        "status": "imported",
        "records_imported": len(deals),
        "errors": errors,
        "source_name": body.source_name,
        "detected_platforms": detected,
        "message": f"Imported {len(deals)} records from {body.source_name}."
                   + (f" {errors} rows skipped." if errors else ""),
    }


@router.post("/business/custom-api/test")
async def test_custom_api(body: CustomApiTestRequest, current_user: User = Depends(get_current_user)):
    headers = dict(body.headers or {})
    params = {}
    if body.api_key:
        if body.auth_type == "bearer":
            headers["Authorization"] = f"Bearer {body.api_key}"
        elif body.auth_type == "header":
            headers[body.auth_key_name or "X-API-Key"] = body.api_key
        elif body.auth_type == "query":
            params[body.auth_key_name or "api_key"] = body.api_key

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(body.method.upper(), body.endpoint, headers=headers, params=params)

        if resp.status_code >= 400:
            return {"success": False, "error": f"API returned status {resp.status_code}", "fields": []}

        try:
            data = resp.json()
        except Exception:
            return {"success": False, "error": "Response is not valid JSON", "fields": []}

        fields = []
        sample = data
        if isinstance(data, dict):
            for key in data:
                if isinstance(data[key], list) and data[key] and isinstance(data[key][0], dict):
                    fields = list(data[key][0].keys())[:30]
                    sample = data[key][:3]
                    break
            if not fields:
                fields = list(data.keys())[:30]
        elif isinstance(data, list) and data and isinstance(data[0], dict):
            fields = list(data[0].keys())[:30]
            sample = data[:3]

        return {"success": True, "status_code": resp.status_code, "sample_data": sample, "fields": fields}

    except httpx.TimeoutException:
        return {"success": False, "error": "Connection timed out", "fields": []}
    except httpx.ConnectError:
        return {"success": False, "error": "Could not connect to the endpoint", "fields": []}
    except Exception as e:
        return {"success": False, "error": str(e), "fields": []}


async def _fetch_custom_api_data(config, user_id):
    headers = dict(config.get("headers") or {})
    params = {}
    api_key = config.get("api_key_encrypted") or config.get("api_key")
    auth_type = config.get("auth_type", "bearer")
    auth_key_name = config.get("auth_key_name")

    if api_key:
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {api_key}"
        elif auth_type == "header":
            headers[auth_key_name or "X-API-Key"] = api_key
        elif auth_type == "query":
            params[auth_key_name or "api_key"] = api_key

    method = config.get("method", "GET")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(method.upper(), config["endpoint"], headers=headers, params=params)
    data = resp.json()

    items = data
    if config.get("data_path"):
        items = _resolve_path(data, config["data_path"])
    if isinstance(items, dict):
        for key in items:
            if isinstance(items[key], list):
                items = items[key]
                break
    if not isinstance(items, list):
        items = [items] if items else []

    mapping = config.get("mapping", {})
    stage_map = config.get("stage_mapping") or {}
    now = datetime.now(timezone.utc)
    source_name = config.get("name", "Custom API")
    deals = []
    for item in items[:5000]:
        if not isinstance(item, dict):
            continue
        deals.append(_build_deal(item, mapping, stage_map, user_id, "custom_api", source_name, now))
    return deals, items


@router.post("/business/custom-api/connect")
async def connect_custom_api(body: CustomApiConnectRequest, current_user: User = Depends(get_current_user)):
    config = {
        "name": body.name,
        "endpoint": body.endpoint,
        "method": body.method,
        "auth_type": body.auth_type,
        "api_key_encrypted": body.api_key,
        "api_key_last4": body.api_key[-4:] if body.api_key else None,
        "auth_key_name": body.auth_key_name,
        "headers": body.headers,
        "data_path": body.data_path,
        "mapping": {k: v for k, v in body.mapping.items() if v},
        "stage_mapping": body.stage_mapping,
    }

    try:
        deals, raw_items = await _fetch_custom_api_data(config, current_user.user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch data: {str(e)}")

    now = datetime.now(timezone.utc)
    if deals:
        await db.deals.insert_many(deals)

    detected = detect_platforms_in_data(raw_items[:50])

    conn_id = f"conn_{uuid.uuid4().hex[:12]}"
    connection = {
        "connection_id": conn_id,
        "user_id": current_user.user_id,
        "platform": "custom_api",
        "source_name": body.name,
        "connected_at": now.isoformat(),
        "last_synced": now.isoformat(),
        "records_synced": len(deals),
        "sync_status": "synced",
        "is_live": True,
        "config": config,
        "detected_platforms": detected,
    }
    await db.business_connections.insert_one(connection)
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"has_business_connected": True}}
    )

    return {
        "status": "connected",
        "connection_id": conn_id,
        "name": body.name,
        "records_synced": len(deals),
        "detected_platforms": detected,
        "message": f"Connected {body.name}. {len(deals)} records synced.",
    }


@router.get("/business/custom-sources")
async def get_custom_sources(current_user: User = Depends(get_current_user)):
    connections = await db.business_connections.find(
        {"user_id": current_user.user_id, "platform": {"$in": ["csv_import", "custom_api"]}},
        {"_id": 0}
    ).to_list(50)

    result = []
    for c in connections:
        result.append({
            "connection_id": c["connection_id"],
            "platform": c["platform"],
            "source_name": c.get("source_name", "Unknown"),
            "connected_at": c.get("connected_at"),
            "last_synced": c.get("last_synced"),
            "records_synced": c.get("records_synced", 0),
            "is_live": c.get("is_live", False),
            "can_sync": c["platform"] == "custom_api",
        })
    return result


@router.post("/business/custom-sources/{connection_id}/sync")
async def sync_custom_source(connection_id: str, current_user: User = Depends(get_current_user)):
    connection = await db.business_connections.find_one(
        {"user_id": current_user.user_id, "connection_id": connection_id, "platform": "custom_api"},
        {"_id": 0}
    )
    if not connection:
        raise HTTPException(status_code=404, detail="Custom API connection not found")

    config = connection.get("config", {})
    source_name = config.get("name", connection.get("source_name", "Custom API"))

    await db.deals.delete_many({
        "user_id": current_user.user_id,
        "source": "custom_api",
        "source_name": source_name,
        "synced": True,
    })

    try:
        deals, _ = await _fetch_custom_api_data(config, current_user.user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {str(e)}")

    now = datetime.now(timezone.utc)
    if deals:
        await db.deals.insert_many(deals)

    await db.business_connections.update_one(
        {"user_id": current_user.user_id, "connection_id": connection_id},
        {"$set": {"last_synced": now.isoformat(), "records_synced": len(deals), "sync_status": "synced"}}
    )
    return {"status": "synced", "records_synced": len(deals), "message": f"Synced {len(deals)} records."}


@router.post("/business/custom-sources/{connection_id}/disconnect")
async def disconnect_custom_source(connection_id: str, current_user: User = Depends(get_current_user)):
    connection = await db.business_connections.find_one(
        {"user_id": current_user.user_id, "connection_id": connection_id},
        {"_id": 0}
    )
    if not connection:
        raise HTTPException(status_code=404, detail="Connection not found")

    source_name = connection.get("source_name")
    platform = connection["platform"]

    await db.business_connections.delete_one(
        {"user_id": current_user.user_id, "connection_id": connection_id}
    )
    delete_result = await db.deals.delete_many({
        "user_id": current_user.user_id,
        "source": platform,
        "source_name": source_name,
        "synced": True,
    })

    remaining = await db.business_connections.count_documents({"user_id": current_user.user_id})
    if remaining == 0:
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"has_business_connected": False}}
        )

    return {"status": "disconnected", "records_removed": delete_result.deleted_count}


@router.get("/business/detect-platforms")
async def get_detected_platforms(current_user: User = Depends(get_current_user)):
    # Aggregate stored detections from all connections
    connections = await db.business_connections.find(
        {"user_id": current_user.user_id},
        {"_id": 0, "platform": 1, "detected_platforms": 1}
    ).to_list(50)

    connected_platforms = {c["platform"] for c in connections}

    # Merge detections, keeping highest confidence per platform
    best = {}
    for conn in connections:
        for d in conn.get("detected_platforms") or []:
            pid = d["platform_id"]
            if pid not in connected_platforms and (pid not in best or d["confidence"] > best[pid]["confidence"]):
                best[pid] = d

    return {"detected_platforms": sorted(best.values(), key=lambda x: x["confidence"], reverse=True)}
