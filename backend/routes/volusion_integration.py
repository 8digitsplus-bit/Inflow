"""Volusion Live Integration — reads orders via the Generic XML export API.

Auth: Login (admin email) + EncryptedPassword as query params.
Base: {store_url}/net/WebService.aspx?EDI_Name=Generic\\Orders.
Response is XML (repeating <Orders> elements) — parsed with ElementTree.
"""
import httpx
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone


def _normalize_base(store_url: str) -> str:
    u = (store_url or "").strip().rstrip("/")
    if not u.startswith("http"):
        u = "https://" + u
    return u


def _parse_amount(v) -> float:
    try:
        return float(str(v).replace(",", "").replace("$", "").strip() or 0)
    except (ValueError, TypeError):
        return 0.0


async def _request_orders(base: str, login: str, enc_pwd: str):
    params = {
        "Login": login,
        "EncryptedPassword": enc_pwd,
        "EDI_Name": "Generic\\Orders",
        "SELECT_Columns": "*",
    }
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        return await client.get(f"{base}/net/WebService.aspx", params=params)


async def validate_volusion_credentials(store_url: str, login: str, enc_pwd: str) -> dict:
    base = _normalize_base(store_url)
    try:
        r = await _request_orders(base, login, enc_pwd)
        if r.status_code != 200:
            return {"valid": False, "error": f"Volusion API HTTP {r.status_code}"}
        txt = (r.text or "").strip()
        try:
            ET.fromstring(txt)
        except Exception:
            return {"valid": False, "error": "Volusion did not return valid XML — verify the Login and Encrypted Password."}
        name = base.replace("https://", "").replace("http://", "")
        return {"valid": True, "account_name": name, "store_url": base}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def _find(el, names):
    for n in names:
        child = el.find(n)
        if child is not None and child.text:
            return child.text
    return None


def _stage(status: str):
    s = (status or "").lower()
    if any(x in s for x in ("shipped", "complete", "processed")):
        return "closed_won", 100
    if any(x in s for x in ("cancel", "refund", "declined")):
        return "closed_lost", 0
    return "negotiation", 60


async def fetch_volusion_data(store_url: str, login: str, enc_pwd: str, user_id: str) -> dict:
    base = _normalize_base(store_url)
    now = datetime.now(timezone.utc)
    deals = []
    stats = {"orders": 0, "revenue": 0.0, "currency": "USD"}

    r = await _request_orders(base, login, enc_pwd)
    if r.status_code != 200:
        return {"deals": [], "total_records": 0, "stats": stats}
    try:
        root = ET.fromstring(r.text)
    except Exception:
        return {"deals": [], "total_records": 0, "stats": stats}

    for el in root.findall(".//Orders"):
        amount = _parse_amount(_find(el, ["TotalOrderAmount", "PaymentAmount", "OrderSubtotal", "Total"]))
        status = _find(el, ["OrderStatus", "Order_Status", "Status"])
        stage, prob = _stage(status)
        if amount > 0 and stage == "closed_won":
            stats["orders"] += 1
            stats["revenue"] += amount

        oid = _find(el, ["OrderID", "OrderId"]) or uuid.uuid4().hex[:12]
        created = _find(el, ["OrderDate", "DateOrdered"]) or ""
        company = _find(el, ["BillingCompany", "CustomerName", "BillingFirstName"]) or "Volusion Customer"
        deals.append({
            "deal_id": f"deal_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "name": f"Order #{oid}",
            "company": str(company)[:200],
            "value": round(amount, 2), "stage": stage, "probability": prob,
            "source": "volusion", "notes": f"Volusion order {oid}",
            "expected_close_date": (created[:10] or None),
            "synced": True,
            "created_at": created or now.isoformat(), "updated_at": now.isoformat(),
        })

    stats["revenue"] = round(stats["revenue"], 2)
    return {"deals": deals, "total_records": len(deals), "stats": stats}
