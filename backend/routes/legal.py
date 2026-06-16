"""Legal pages proxy.

The Termly policy embed renders inside a cross-origin iframe whose own CSS
forces `[data-custom-class='body'] { background: #000000 !important }` (the
document's brand background colour is set to black in the Termly dashboard).
Combined with near-black heading colours, the policy is unreadable, and a
cross-origin iframe cannot be restyled from the parent page.

This route fetches the policy content from Termly's public consumer API
server-side (no CORS limits, fully rendered HTML), neutralises the forced dark
background, and returns it so the frontend can render it directly in our own
DOM as a normal, readable light document. Content stays live: every request
re-fetches the latest published version from Termly.
"""
import re
import logging

import httpx
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

router = APIRouter()

# Termly's public consumer content API (discovered from hosted.min.js).
TERMLY_CONTENT_URL = (
    "https://app.termly.io/api/v1/consumer/policies/{policy_id}/content?lang=en"
)

# Only allow known UUIDs to be proxied (prevents this becoming an open proxy).
ALLOWED_POLICY_IDS = {
    "b2bacd1c-c041-49b6-ae03-a0e8c57fea3e",  # Privacy Policy
    "d418110f-9ff8-4583-9d40-2cde4be2cfe0",  # Terms of Service
}

_UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")

# Termly forces a black brand background on the document body and hardcodes
# near-black text colours (meant for a white page). We strip ALL colour and
# background declarations so the frontend can theme the policy to match our
# dark site (light text on the dark background).
_BG_RE = re.compile(r"(?<![-\w])background(?:-color)?\s*:\s*[^;\"}]+;?", re.IGNORECASE)
_COLOR_RE = re.compile(r"(?<![-\w])color\s*:\s*[^;\"}]+;?", re.IGNORECASE)


def _sanitise(content: str) -> str:
    """Strip Termly's forced colours/backgrounds and any scripts so the policy
    can be themed by the frontend to match our dark site."""
    content = _BG_RE.sub("", content)
    content = _COLOR_RE.sub("", content)
    content = re.sub(
        r"<script\b[^>]*>.*?</script>", "", content, flags=re.DOTALL | re.IGNORECASE
    )
    return content.strip()


@router.get("/legal/policy/{policy_id}")
async def get_policy(policy_id: str):
    """Return the rendered HTML of a Termly policy for in-page display."""
    if not _UUID_RE.match(policy_id) or policy_id not in ALLOWED_POLICY_IDS:
        raise HTTPException(status_code=404, detail="Policy not found")

    url = TERMLY_CONTENT_URL.format(policy_id=policy_id)
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as http:
            resp = await http.get(
                url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error("Failed to fetch Termly policy %s: %s", policy_id, e)
        raise HTTPException(status_code=502, detail="Could not load policy content")

    raw = data.get("content") or ""
    html = _sanitise(raw)
    if not html:
        raise HTTPException(status_code=502, detail="Policy content was empty")

    return {"html": html}
