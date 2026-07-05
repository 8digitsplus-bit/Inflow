"""Sentry error monitoring for the FastAPI backend.

Reads SENTRY_DSN from env (no-op if unset). Scrubs PII before events are sent:
strips cookies / auth headers, masks emails, filters sensitive keys
(tokens, secrets, API keys, session tokens, Stripe IDs), and drops user
email / ip / username. FastAPI + Starlette integrations auto-enable.
"""
import os
import re
import logging
import sentry_sdk

logger = logging.getLogger(__name__)

SENSITIVE_KEYS = (
    "password", "passwd", "token", "access_token", "refresh_token", "session_token",
    "authorization", "api_key", "apikey", "secret", "client_secret",
    "stripe_customer_id", "stripe_subscription_id", "card", "cvc", "cvv",
    "api_key_encrypted", "client_secret_encrypted", "encryption_key",
)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _redact(value, depth=0):
    if depth > 6 or value is None:
        return value
    if isinstance(value, dict):
        return {
            k: ("[Filtered]" if any(s in str(k).lower() for s in SENSITIVE_KEYS) else _redact(v, depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_redact(v, depth + 1) for v in value]
    if isinstance(value, str):
        return EMAIL_RE.sub("[email]", value)
    return value


def _before_send(event, hint):
    req = event.get("request")
    if isinstance(req, dict):
        req.pop("cookies", None)
        headers = req.get("headers")
        if isinstance(headers, dict):
            for h in list(headers.keys()):
                if h.lower() in ("authorization", "cookie", "x-api-key"):
                    headers.pop(h, None)
        if "data" in req:
            req["data"] = _redact(req["data"])
    for key in ("extra", "contexts"):
        if key in event:
            event[key] = _redact(event[key])
    user = event.get("user")
    if isinstance(user, dict):
        user.pop("email", None)
        user.pop("ip_address", None)
        user.pop("username", None)
    return event


def _before_send_log(log, hint):
    # Scrub PII from structured logs before they leave the server
    if isinstance(log, dict):
        body = log.get("body")
        if isinstance(body, str):
            log["body"] = EMAIL_RE.sub("[email]", body)
        attrs = log.get("attributes")
        if isinstance(attrs, dict):
            log["attributes"] = _redact(attrs)
    return log


def init_sentry():
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        send_default_pii=False,
        traces_sample_rate=0.1,
        enable_logs=True,
        before_send=_before_send,
        before_send_log=_before_send_log,
    )
    logger.info("Sentry initialized (backend, logs enabled)")
