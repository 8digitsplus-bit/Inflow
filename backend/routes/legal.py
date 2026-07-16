"""Legal pages proxy + update notification system.

Termly serves policies inside a cross-origin iframe whose own CSS forces a black
background, making the dark policy text unreadable — and a cross-origin iframe
cannot be restyled from the parent. So we fetch the policy content from Termly's
public consumer API server-side, strip its hardcoded colours/backgrounds, and
return it for the frontend to render directly (themed to match our dark site).

We also track a version per legal document (detected via a content hash). When a
document changes (e.g. the operator republishes in Termly), its version is
bumped. Logged-in users who haven't acknowledged the latest version are shown an
in-app notification banner (see GET /legal/updates + POST /legal/ack).
"""
import re
import time
import logging
import hashlib
import asyncio
from typing import Optional, List
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from models import User
from dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

# Termly's public consumer content API (discovered from hosted.min.js).
TERMLY_CONTENT_URL = (
    "https://app.termly.io/api/v1/consumer/policies/{policy_id}/content?lang=en"
)

# The legal documents we publish, keyed by an internal doc_type.
LEGAL_DOCS = {
    "privacy": {
        "policy_id": "b2bacd1c-c041-49b6-ae03-a0e8c57fea3e",
        "name": "Privacy Policy",
        "path": "/privacy",
    },
    "terms": {
        "policy_id": "d418110f-9ff8-4583-9d40-2cde4be2cfe0",
        "name": "Terms of Service",
        "path": "/terms",
    },
    "cookies": {
        "policy_id": "9d85a543-e935-413d-b946-0dfab9170b2a",
        "name": "Cookie Policy",
        "path": "/cookies",
    },
}
ALLOWED_POLICY_IDS = {d["policy_id"] for d in LEGAL_DOCS.values()}
_POLICY_TO_TYPE = {d["policy_id"]: t for t, d in LEGAL_DOCS.items()}

# How long a version record is trusted before we re-check Termly (background).
STALE_SECONDS = 12 * 3600

# In-memory cache of sanitised policy HTML so we don't hit Termly on every page
# view (fast + resilient to Termly slowness/downtime). Keyed by policy_id.
_CONTENT_CACHE: dict = {}
_CONTENT_TTL = 6 * 3600  # serve cached HTML for up to 6h before refetching

_UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")
# Termly hardcodes a black brand background + near-black text (meant for a white
# page). Strip ALL colour/background declarations so the frontend can theme it.
_BG_RE = re.compile(r"(?<![-\w])background(?:-color)?\s*:\s*[^;\"}]+;?", re.IGNORECASE)
_COLOR_RE = re.compile(r"(?<![-\w])color\s*:\s*[^;\"}]+;?", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")


def _sanitise(content: str) -> str:
    """Strip Termly's forced colours/backgrounds and any scripts."""
    content = _BG_RE.sub("", content)
    content = _COLOR_RE.sub("", content)
    content = re.sub(
        r"<script\b[^>]*>.*?</script>", "", content, flags=re.DOTALL | re.IGNORECASE
    )
    return content.strip()


def _text_hash(html: str) -> str:
    """Hash the visible text (tags stripped) so cosmetic markup noise doesn't
    cause spurious version bumps, but real wording/date changes do."""
    text = _TAG_RE.sub(" ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def _fetch_sanitised(policy_id: str) -> str:
    url = TERMLY_CONTENT_URL.format(policy_id=policy_id)
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as http:
        resp = await http.get(
            url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
        )
        resp.raise_for_status()
        data = resp.json()
    return _sanitise(data.get("content") or "")


async def _apply_version(doc_type: str, html: str):
    """Update the stored version record for a doc given freshly-fetched html.
    Bumps the version (and effective_date) only when the content hash changes."""
    now = datetime.now(timezone.utc).isoformat()
    new_hash = _text_hash(html)
    existing = await db.legal_documents.find_one({"doc_type": doc_type}, {"_id": 0})
    if not existing:
        await db.legal_documents.insert_one({
            "doc_type": doc_type,
            "version": 1,
            "content_hash": new_hash,
            "effective_date": now,
            "last_checked_at": now,
        })
    elif existing.get("content_hash") != new_hash:
        await db.legal_documents.update_one(
            {"doc_type": doc_type},
            {
                "$set": {"content_hash": new_hash, "effective_date": now, "last_checked_at": now},
                "$inc": {"version": 1},
            },
        )
    else:
        await db.legal_documents.update_one(
            {"doc_type": doc_type}, {"$set": {"last_checked_at": now}}
        )


async def _refresh_doc(doc_type: str):
    """Fetch a doc from Termly and update its version record (best-effort)."""
    try:
        info = LEGAL_DOCS[doc_type]
        html = await _fetch_sanitised(info["policy_id"])
        if html:
            await _apply_version(doc_type, html)
    except Exception as e:
        logger.warning("Legal doc refresh failed for %s: %s", doc_type, e)


async def _ensure_seeded():
    """Guarantee every legal doc has a version record (one-time fetch each)."""
    for doc_type in LEGAL_DOCS:
        existing = await db.legal_documents.find_one({"doc_type": doc_type}, {"_id": 0})
        if not existing:
            await _refresh_doc(doc_type)


def _is_stale(doc: dict) -> bool:
    try:
        last = datetime.fromisoformat(doc["last_checked_at"])
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - last).total_seconds() > STALE_SECONDS
    except Exception:
        return True


async def _get_policy_html(policy_id: str):
    """Return sanitised policy HTML, served from an in-memory cache (6h TTL) with
    stale-fallback so a Termly hiccup never breaks the page. Returns None only if
    we have nothing at all to show."""
    now = time.time()
    cached = _CONTENT_CACHE.get(policy_id)
    if cached and (now - cached["ts"] < _CONTENT_TTL):
        return cached["html"]

    try:
        html = await _fetch_sanitised(policy_id)
    except Exception as e:
        logger.error("Failed to fetch Termly policy %s: %s", policy_id, e)
        return cached["html"] if cached else None

    if not html:
        return cached["html"] if cached else None

    _CONTENT_CACHE[policy_id] = {"html": html, "ts": now}

    # Viewing a document keeps its version record current.
    try:
        await _apply_version(_POLICY_TO_TYPE[policy_id], html)
    except Exception as e:
        logger.warning("Version tracking failed for %s: %s", policy_id, e)

    return html


@router.get("/legal/content/{doc_type}")
async def get_legal_content(doc_type: str):
    """Ad-blocker-friendly legal content endpoint.

    Some browser tracker-blockers (e.g. Opera's built-in blocker, uBlock lists)
    match on URLs containing 'policy' and/or a bare tracking-style UUID and
    silently block them — which broke our legal pages in those browsers. This
    endpoint is keyed by a plain slug (privacy/terms/cookies) with no UUID and no
    'policy' keyword, so blockers leave it alone.
    """
    info = LEGAL_DOCS.get(doc_type)
    if not info:
        raise HTTPException(status_code=404, detail="Document not found")

    html = await _get_policy_html(info["policy_id"])
    if not html:
        raise HTTPException(status_code=502, detail="Could not load document content")
    return {"html": html}


@router.get("/legal/policy/{policy_id}")
async def get_policy(policy_id: str):
    """Legacy endpoint (kept for compatibility). Prefer /legal/content/{doc_type}."""
    if not _UUID_RE.match(policy_id) or policy_id not in ALLOWED_POLICY_IDS:
        raise HTTPException(status_code=404, detail="Policy not found")

    html = await _get_policy_html(policy_id)
    if not html:
        raise HTTPException(status_code=502, detail="Could not load policy content")
    return {"html": html}


@router.get("/legal/updates")
async def legal_updates(user: User = Depends(get_current_user)):
    """Return legal documents the user hasn't acknowledged the latest version of."""
    await _ensure_seeded()

    docs = {d["doc_type"]: d async for d in db.legal_documents.find({}, {"_id": 0})}
    current = {t: docs.get(t, {}).get("version", 1) for t in LEGAL_DOCS}

    # Kick off a background refresh for any stale doc (never blocks the response).
    for t, d in docs.items():
        if _is_stale(d):
            asyncio.create_task(_refresh_doc(t))

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "legal_ack": 1})
    ack = (user_doc or {}).get("legal_ack")

    # First-time users accept the current terms at signup, so bring them up to
    # the current versions silently — no spurious "updated" banner on day one.
    if not ack:
        await db.users.update_one(
            {"user_id": user.user_id}, {"$set": {"legal_ack": current}}
        )
        return {"updates": []}

    updates = []
    for t, info in LEGAL_DOCS.items():
        if current.get(t, 1) > ack.get(t, 0):
            d = docs.get(t, {})
            updates.append({
                "doc_type": t,
                "name": info["name"],
                "path": info["path"],
                "version": current.get(t, 1),
                "effective_date": d.get("effective_date"),
            })

    return {"updates": updates}


class AckRequest(BaseModel):
    doc_types: Optional[List[str]] = None


@router.post("/legal/ack")
async def legal_ack(req: AckRequest, user: User = Depends(get_current_user)):
    """Record that the user has acknowledged the current version of the docs."""
    docs = {d["doc_type"]: d async for d in db.legal_documents.find({}, {"_id": 0})}
    current = {t: docs.get(t, {}).get("version", 1) for t in LEGAL_DOCS}

    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "legal_ack": 1})
    ack = (user_doc or {}).get("legal_ack") or {}

    targets = req.doc_types or list(LEGAL_DOCS.keys())
    for t in targets:
        if t in current:
            ack[t] = current[t]

    await db.users.update_one({"user_id": user.user_id}, {"$set": {"legal_ack": ack}})
    return {"ok": True, "legal_ack": ack}
