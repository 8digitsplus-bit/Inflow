"""Idempotent deal-sync reconciliation shared by native + Scalekit imports.

Guards two data-integrity issues:
  1. Multi-system collision: native and Scalekit both import into db.deals under the same
     `source` (e.g. "stripe"). We namespace deletes by `provider` so a re-sync from one
     system never wipes the other's deals.
  2. Local-edit loss: a user edit to a synced deal (PUT /deals sets locally_modified=True)
     must survive re-sync. We never delete locally_modified deals, and skip re-inserting an
     incoming record whose identity matches a preserved one (by external_id).
"""
import hashlib
from typing import List
from database import db


def external_id(d: dict) -> str:
    """Stable identity for an imported record: the source record id if present, else a
    deterministic hash of (source, name, value, close date)."""
    eid = d.get("external_id")
    if eid:
        return str(eid)
    key = f"{d.get('source')}|{d.get('name')}|{d.get('value')}|{d.get('expected_close_date')}"
    return "h_" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]


def _provider_scope(provider: str) -> dict:
    # Scalekit rows are tagged provider="scalekit"; everything else (native/manual-synced)
    # is matched by "not scalekit" ($ne also matches a missing field in Mongo).
    return {"provider": "scalekit"} if provider == "scalekit" else {"provider": {"$ne": "scalekit"}}


async def apply_sync(org_id: str, source: str, incoming: List[dict], provider: str) -> dict:
    """Reconcile the incoming synced deals for (org, source, provider). Returns counts."""
    for d in incoming:
        d["org_id"] = org_id
        d["source"] = source
        d["synced"] = True
        d["provider"] = provider
        d["external_id"] = external_id(d)

    scope = {"org_id": org_id, "source": source, "synced": True, **_provider_scope(provider)}

    # Preserve locally-edited deals: keep them, and don't re-insert their matching incoming record.
    preserved = await db.deals.find(
        {**scope, "locally_modified": True}, {"_id": 0}
    ).to_list(2000)
    preserved_ids = {external_id(p) for p in preserved}

    await db.deals.delete_many({**scope, "locally_modified": {"$ne": True}})

    to_insert = [d for d in incoming if d["external_id"] not in preserved_ids]
    if to_insert:
        await db.deals.insert_many(to_insert)

    return {"synced": len(incoming), "inserted": len(to_insert), "preserved": len(preserved_ids)}
