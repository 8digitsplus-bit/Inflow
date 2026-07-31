"""Pipedrive REST write-back client for the Action Workspace.

Auth: `x-api-token` header against https://{company-domain}.pipedrive.com.
Notes use API v1; activities/deals/persons/pipelines/stages use API v2.

All functions return a structured dict ({"ok": bool, ...}) instead of raising.

Mapping to the workspace action kinds:
  note  -> POST /v1/notes (deal_id | person_id)
  task  -> POST /v2/activities  type=task,  done=0
  call  -> POST /v2/activities  type=call,  done=1
  email -> POST /v2/activities  type=email, done=1
  deal  -> POST /v2/deals (title, value, currency, stage_id, pipeline_id)
  offer -> POST /v1/notes titled "Offer" attached to the deal (Pipedrive has no
           public Quotes object, so an offer is captured as a structured note)
"""
import html as _html
import httpx


def _base(domain: str) -> str:
    d = (domain or "").strip().rstrip("/").replace("https://", "").replace("http://", "")
    if d.endswith(".pipedrive.com"):
        d = d[:-len(".pipedrive.com")]
    if not d:
        return "https://api.pipedrive.com"
    return f"https://{d}.pipedrive.com"


def _headers(token: str) -> dict:
    return {"x-api-token": token, "Content-Type": "application/json"}


def _err(status: int, msg: str = "") -> dict:
    if status == 401:
        return {"ok": False, "code": 401,
                "error": "Pipedrive authentication failed. Reconnect Pipedrive with a valid API token."}
    if status == 403:
        return {"ok": False, "code": 403,
                "error": "Your Pipedrive token lacks permission for this action."}
    return {"ok": False, "code": status, "error": msg or f"Pipedrive returned status {status}"}


def _esc(s) -> str:
    return _html.escape(str(s if s is not None else ""))


def _to_html(text: str) -> str:
    paras = [p for p in str(text or "").split("\n") if p.strip()]
    return "".join(f"<p>{_esc(p)}</p>" for p in paras) or _esc(text)


def _tid_kw(ttype: str, tid) -> dict:
    try:
        val = int(tid)
    except (TypeError, ValueError):
        return {}
    return {"deal_id": val} if ttype == "deal" else {"person_id": val}


async def _get(creds: dict, path: str, params: dict = None) -> dict:
    token, base = creds.get("token"), _base(creds.get("instance_url"))
    if not token:
        return {"ok": False, "code": 401, "data": [], "error": "Pipedrive isn't authenticated. Reconnect Pipedrive."}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(f"{base}{path}", headers=_headers(token), params=params or {})
    except Exception as e:
        return {"ok": False, "data": [], "error": f"Could not reach Pipedrive: {e}"}
    if r.status_code == 200:
        return {"ok": True, "data": (r.json() or {}).get("data") or []}
    e = _err(r.status_code)
    e["data"] = []
    return e


async def _post(creds: dict, path: str, body: dict) -> dict:
    token, base = creds.get("token"), _base(creds.get("instance_url"))
    if not token:
        return {"ok": False, "code": 401,
                "error": "Pipedrive isn't authenticated. Reconnect Pipedrive with a valid API token."}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(f"{base}{path}", headers=_headers(token), json=body)
    except Exception as e:
        return {"ok": False, "error": f"Could not reach Pipedrive: {e}"}
    if r.status_code in (200, 201):
        d = (r.json() or {}).get("data") or {}
        rid = d.get("id")
        return {"ok": True, "id": str(rid) if rid is not None else None}
    msg = ""
    try:
        msg = (r.json() or {}).get("error") or ""
    except Exception:
        pass
    return _err(r.status_code, msg)


# ------------------------------------------------------------------ reads (pickers)
async def list_targets(creds: dict, limit: int = 100) -> dict:
    out = {"deals": [], "contacts": [], "error": None}
    rd = await _get(creds, "/api/v2/deals", {"limit": limit})
    if not rd.get("ok"):
        out["error"] = rd.get("error")
        return out
    for d in rd["data"]:
        out["deals"].append({"id": str(d.get("id")), "label": d.get("title") or f"Deal {d.get('id')}",
                             "amount": d.get("value"), "stage": d.get("stage_id")})
    rc = await _get(creds, "/api/v2/persons", {"limit": limit})
    if rc.get("ok"):
        for c in rc["data"]:
            out["contacts"].append({"id": str(c.get("id")), "label": c.get("name") or f"Person {c.get('id')}"})
    return out


async def list_pipelines(creds: dict) -> dict:
    rp = await _get(creds, "/api/v2/pipelines", {"limit": 100})
    if not rp.get("ok"):
        return {"pipelines": [], "error": None}
    rs = await _get(creds, "/api/v2/stages", {"limit": 500})
    all_stages = rs.get("data") if rs.get("ok") else []
    out = []
    for p in rp["data"]:
        pid = p.get("id")
        stages = [{"id": str(s.get("id")), "label": s.get("name")} for s in all_stages if s.get("pipeline_id") == pid]
        out.append({"id": str(pid), "label": p.get("name"), "stages": stages})
    return {"pipelines": out, "error": None}


# ------------------------------------------------------------------ writes
async def write(kind: str, creds: dict, payload: dict, target: dict) -> dict:
    p = payload or {}
    tgt = target or {}
    ttype, tid = tgt.get("type"), tgt.get("id")
    tk = _tid_kw(ttype, tid)

    if kind == "note":
        return await _post(creds, "/api/v1/notes", {"content": _to_html(p.get("body")), **tk})

    if kind == "task":
        body = {"subject": (p.get("title") or "Follow up"), "type": "task", "done": 0, **tk}
        if p.get("body"):
            body["note"] = _to_html(p["body"])
        if p.get("due_date"):
            body["due_date"] = str(p["due_date"])[:10]
        return await _post(creds, "/api/v2/activities", body)

    if kind == "call":
        body = {"subject": (p.get("title") or "Call"), "type": "call", "done": 1, **tk}
        if p.get("notes"):
            body["note"] = _to_html(p["notes"])
        if p.get("when"):
            body["due_date"] = str(p["when"])[:10]
        return await _post(creds, "/api/v2/activities", body)

    if kind == "email":
        body = {"subject": (p.get("subject") or "Email"), "type": "email", "done": 1, **tk}
        if p.get("text"):
            body["note"] = _to_html(p["text"])
        if p.get("when"):
            body["due_date"] = str(p["when"])[:10]
        return await _post(creds, "/api/v2/activities", body)

    if kind == "deal":
        body = {"title": (p.get("dealname") or "New deal"), "currency": "USD"}
        if p.get("amount") not in (None, ""):
            try:
                body["value"] = float(p["amount"])
            except (ValueError, TypeError):
                pass
        for src, dst in (("pipeline", "pipeline_id"), ("dealstage", "stage_id")):
            if p.get(src):
                try:
                    body[dst] = int(p[src])
                except (ValueError, TypeError):
                    pass
        return await _post(creds, "/api/v2/deals", body)

    if kind == "offer":
        if ttype != "deal" or not tid:
            return {"ok": False, "error": "Pipedrive offers attach to a deal — pick a deal as the target."}
        lines = ["<p><strong>Offer</strong></p>"]
        if p.get("title"):
            lines.append(f"<p>{_esc(p['title'])}</p>")
        if p.get("amount") not in (None, ""):
            lines.append(f"<p>Amount: ${_esc(p['amount'])}</p>")
        if p.get("discount") not in (None, ""):
            lines.append(f"<p>Discount: {_esc(p['discount'])}%</p>")
        if p.get("expiration"):
            lines.append(f"<p>Valid until: {_esc(p['expiration'])}</p>")
        if p.get("notes"):
            lines.append(f"<p>{_esc(p['notes'])}</p>")
        return await _post(creds, "/api/v1/notes", {"content": "".join(lines), "deal_id": int(tid)})

    return {"ok": False, "error": "This action isn't supported for Pipedrive."}
