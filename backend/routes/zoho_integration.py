"""Zoho CRM deal mapping (API v8 shapes). Connection + OAuth live in Scalekit
(routes/scalekit_integration.py); this module only maps Zoho Deals into InFlow deals."""
import uuid
from datetime import datetime, timezone

STAGE_MAP = {
    "qualification": "qualified",
    "needs analysis": "qualified",
    "value proposition": "proposal",
    "identify decision makers": "qualified",
    "id. decision makers": "qualified",
    "perception analysis": "proposal",
    "proposal/price quote": "proposal",
    "negotiation/review": "negotiation",
    "closed won": "closed_won",
    "closed lost": "closed_lost",
    "closed-lost to competition": "closed_lost",
}
DEAL_FIELDS = "id,Deal_Name,Amount,Stage,Probability,Closing_Date,Account_Name,Description"


def map_deals(records: list, user_id: str) -> list:
    now = datetime.now(timezone.utc).isoformat()
    deals = []
    for d in records or []:
        if not isinstance(d, dict):
            continue
        try:
            amount = float(d.get("Amount") or 0)
        except (ValueError, TypeError):
            amount = 0.0
        stage = STAGE_MAP.get((d.get("Stage") or "Qualification").lower(), "qualified")
        account = d.get("Account_Name") or {}
        company = account.get("name") if isinstance(account, dict) else str(account or "")
        zid = str(d.get("id") or "")
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": (d.get("Deal_Name") or "Zoho Deal")[:200],
            "company": (company or "Unknown")[:200],
            "value": round(amount, 2),
            "stage": stage,
            "probability": int(d.get("Probability") or (100 if stage == "closed_won" else 50)),
            "expected_close_date": d.get("Closing_Date") or None,
            "notes": (d.get("Description") or "")[:500] or f"Zoho deal {zid}",
            "zoho_deal_id": zid,
            "external_id": zid or None,
            "source": "zoho",
            "synced": True,
            "created_at": now, "updated_at": now,
        })
    return deals
