"""ProdFix error reporting for the FastAPI backend (no-op if PRODFIX_KEY unset).

ProdFix has no Python SDK, so ERROR-level log records are forwarded to its events API
from a background thread. Emails are masked and each error location is throttled to
one report per minute (ProdFix allows ~30 events/min per project).
"""
import json
import logging
import os
import re
import time
import traceback
import urllib.request
from logging.handlers import QueueHandler, QueueListener
from queue import Queue

logger = logging.getLogger(__name__)

EVENTS_URL = "https://prodfixai.com/v1/events"
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
THROTTLE_SECONDS = 60
_listener = None


def _mask(text: str) -> str:
    return EMAIL_RE.sub("[email]", text or "")


class _KeepRecordQueueHandler(QueueHandler):
    # The default prepare() drops exc_info; keep the record intact for the sender thread.
    def prepare(self, record):
        return record


class _ProdfixSender(logging.Handler):
    def __init__(self, key: str, environment: str):
        super().__init__(logging.ERROR)
        self.key = key
        self.environment = environment
        self._last_sent = {}

    def emit(self, record):
        exc = record.exc_info if record.exc_info and record.exc_info[0] else None
        error_type = exc[0].__name__ if exc else "LoggedError"
        sig = f"{record.pathname}:{record.lineno}:{error_type}"
        now = time.time()
        if now - self._last_sent.get(sig, 0) < THROTTLE_SECONDS:
            return
        self._last_sent[sig] = now
        stack = "".join(traceback.format_exception(*exc)) if exc else f'File "{record.pathname}", line {record.lineno}, in {record.funcName}'
        payload = {
            "type": "error",
            "errorType": error_type,
            "message": _mask(record.getMessage())[:2000],
            "stack": _mask(stack)[-8000:],
            "route": getattr(record, "route", "") or record.name,
            "environment": self.environment,
            "source": "backend",
            "logger": record.name,
        }
        body = json.dumps({"events": [{"category": "bug", "payload": payload, "timestamp": int(now * 1000), "priority": "high"}]}).encode()
        req = urllib.request.Request(EVENTS_URL, data=body, method="POST",
                                     headers={"Content-Type": "application/json", "X-ProdFix-Key": self.key})
        try:
            urllib.request.urlopen(req, timeout=5).close()
        except Exception:
            pass  # monitoring must never break the app


def init_prodfix():
    global _listener
    key = os.environ.get("PRODFIX_KEY")
    if not key or _listener:
        return
    queue = Queue(-1)
    _listener = QueueListener(queue, _ProdfixSender(key, os.environ.get("PRODFIX_ENVIRONMENT", "production")))
    _listener.start()
    handler = _KeepRecordQueueHandler(queue)
    handler.setLevel(logging.ERROR)
    logging.getLogger().addHandler(handler)
    logger.info("ProdFix error reporting enabled (backend)")
