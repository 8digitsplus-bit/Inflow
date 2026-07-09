"""monday.com Live Integration — reads board items via the GraphQL API v2.

Auth: Authorization header = raw API token (no Bearer). Base: https://api.monday.com/v2.
monday is a Work OS (no native "deal" object), so deal value is inferred from the
best-matching numeric column on the board — this is best-effort and may need a Board ID.
"""
import httpx
import json
import re
import uuid
from datetime import datetime, timezone

API = "https://api.monday.com/v2"


async def _graphql(api_key: str, query: str):
    async with httpx.AsyncClient(timeout=30.0) as client:
        return await client.post(
            API,
            headers={"Authorization": api_key, "Content-Type": "application/json"},
            json={"query": query},
        )


async def validate_monday_key(api_key: str) -> dict:
    try:
        r = await _graphql(api_key, "query { me { name } }")
        body = r.json() if r.status_code == 200 else {}
        me = (body.get("data") or {}).get("me") if isinstance(body, dict) else None
        if me:
            return {"valid": True, "account_name": me.get("name") or "monday.com"}
        return {"valid": False, "error": f"monday.com auth failed: {r.text[:120]}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _num_from_column(cv: dict) -> float:
    for candidate in (cv.get("value"), cv.get("text")):
        if candidate is None:
            continue
        if isinstance(candidate, str) and candidate.strip().startswith("{"):
            try:
                obj = json.loads(candidate)
                for k in ("value", "amount", "number"):
                    if k in obj:
                        return float(obj[k])
            except Exception:
                pass
        m = re.findall(r"[-\d.]+", str(candidate).replace(",", ""))
        if m:
            try:
                return float(m[0])
            except (ValueError, TypeError):
                pass
    return 0.0


async def fetch_monday_data(api_key: str, board_id: str, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"items": 0, "open_value": 0.0, "currency": "USD"}

    board_clause = f"(ids: {board_id})" if board_id else "(limit: 1)"
    query = f'''query {{
      boards {board_clause} {{
        name
        items_page(limit: 100) {{
          items {{
            id
            name
            created_at
            column_values {{ id title text value }}
          }}
        }}
      }}
    }}'''
    r = await _graphql(api_key, query)
    if r.status_code != 200:
        return {"deals": [], "total_records": 0, "stats": stats}
    boards = ((r.json() or {}).get("data") or {}).get("boards", []) or []

    for b in boards:
        items = ((b.get("items_page") or {}).get("items")) or []
        for it in items:
            best = 0.0
            for cv in it.get("column_values", []) or []:
                title = (cv.get("title") or "").lower()
                val = _num_from_column(cv)
                if val and any(x in title for x in ("deal", "value", "amount", "price", "revenue", "budget")):
                    best = val
                    break
                if val and best == 0.0:
                    best = val
            stats["items"] += 1
            stats["open_value"] += best

            iid = it.get("id") or uuid.uuid4().hex[:12]
            created = str(it.get("created_at") or "")
            deals.append({
                "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "name": (it.get("name") or f"Item {iid}")[:200],
                "company": (b.get("name") or "monday.com")[:200],
                "value": round(best, 2), "stage": "negotiation", "probability": 50,
                "source": "monday", "notes": f"monday.com item {iid}",
                "expected_close_date": created[:10] or None,
                "synced": True,
                "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
            })

    stats["open_value"] = round(stats["open_value"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
