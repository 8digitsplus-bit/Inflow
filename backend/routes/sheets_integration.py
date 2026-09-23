"""
Google Sheets live integration (read-only import via API key).
The sheet must be shared as "Anyone with the link -> Viewer".
Credentials: api_key (Google API key), spreadsheet_id, range (e.g. "Sheet1!A1:Z1000").
Maps spreadsheet rows into InFlow deals using a flexible header match.
"""
import httpx
import uuid
from datetime import datetime, timezone

SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets"

_HEADER_ALIASES = {
    "name": {"name", "deal", "deal name", "dealname", "opportunity", "title", "account name"},
    "company": {"company", "account", "customer", "organization", "organisation", "org", "client"},
    "value": {"value", "amount", "revenue", "deal value", "arr", "mrr", "price", "deal size"},
    "stage": {"stage", "status", "phase", "pipeline stage"},
    "probability": {"probability", "prob", "likelihood", "confidence", "win %", "win probability"},
    "close": {"close date", "close", "expected close", "close_date", "closedate", "expected_close_date", "expected close date"},
}

_STAGE_ALIASES = {
    "lead": "lead", "new": "lead", "prospect": "lead",
    "qualified": "qualified", "qualify": "qualified", "discovery": "qualified",
    "proposal": "proposal", "propose": "proposal", "quote": "proposal",
    "negotiation": "negotiation", "negotiate": "negotiation", "contract": "negotiation",
    "closed won": "closed_won", "won": "closed_won", "closed_won": "closed_won",
    "closed lost": "closed_lost", "lost": "closed_lost", "closed_lost": "closed_lost",
}
_PROB_MAP = {"lead": 15, "qualified": 35, "proposal": 55, "negotiation": 75, "closed_won": 100, "closed_lost": 0}


def _parse_number(raw) -> float:
    if raw is None:
        return 0.0
    s = str(raw).strip().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


async def validate_sheets_credentials(api_key: str, spreadsheet_id: str, range_: str) -> dict:
    """Validate by reading the spreadsheet metadata (title)."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"{SHEETS_BASE}/{spreadsheet_id}",
                params={"fields": "properties.title", "key": api_key},
            )
        if resp.status_code == 403:
            return {"valid": False, "error": "Access denied — enable the Sheets API and share the sheet as 'Anyone with the link -> Viewer'."}
        if resp.status_code == 404:
            return {"valid": False, "error": "Spreadsheet not found — check the Spreadsheet ID."}
        if resp.status_code >= 400:
            return {"valid": False, "error": f"Google Sheets returned status {resp.status_code}"}
        title = resp.json().get("properties", {}).get("title", "Google Sheet")
        return {"valid": True, "account_name": title}
    except httpx.TimeoutException:
        return {"valid": False, "error": "Connection to Google Sheets timed out"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def fetch_sheets_data(api_key: str, spreadsheet_id: str, range_: str, user_id: str) -> dict:
    """Read rows from the sheet range and transform into InFlow deals."""
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"rows": 0, "revenue": 0}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SHEETS_BASE}/{spreadsheet_id}/values/{range_}",
            params={"key": api_key, "majorDimension": "ROWS"},
        )
    values = resp.json().get("values", []) if resp.status_code == 200 else []
    if not values:
        return {"deals": deals, "stats": stats, "total_records": 0}

    headers = [str(h).strip().lower() for h in values[0]]
    col = {}
    for idx, h in enumerate(headers):
        for field, aliases in _HEADER_ALIASES.items():
            if h in aliases and field not in col:
                col[field] = idx

    data_rows = values[1:]
    stats["rows"] = len(data_rows)

    for r in data_rows:
        def cell(field, default=None):
            i = col.get(field)
            return r[i] if i is not None and i < len(r) else default

        name = cell("name") or (r[0] if r else None)
        if not name:
            continue

        value = _parse_number(cell("value"))
        stats["revenue"] += value

        raw_stage = str(cell("stage") or "").strip().lower()
        stage = _STAGE_ALIASES.get(raw_stage, "qualified")

        prob_raw = cell("probability")
        try:
            probability = int(float(str(prob_raw))) if prob_raw not in (None, "") else _PROB_MAP.get(stage, 30)
        except (ValueError, TypeError):
            probability = _PROB_MAP.get(stage, 30)

        close_date = cell("close")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": str(name),
            "company": str(cell("company") or "Google Sheet"),
            "value": round(value, 2),
            "stage": stage,
            "probability": probability,
            "expected_close_date": str(close_date)[:10] if close_date else None,
            "notes": "Imported from Google Sheets",
            "source": "google_sheets",
            "synced": True,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        })

    return {"deals": deals, "stats": stats, "total_records": len(deals)}
