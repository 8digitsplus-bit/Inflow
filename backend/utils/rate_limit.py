"""Rate limiting utilities for auth endpoints.

Provides:
  - `limiter`: a slowapi Limiter keyed by remote IP (works across all endpoints).
  - `check_email_rate_limit()`: in-memory per-email throttling for login flows
    where an attacker may rotate IPs but pound a single email.

In-memory storage is sufficient for a single backend instance. When scaling
horizontally, swap to Redis via `storage_uri="redis://..."` and persist the
email counters in a shared store.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Deque, Dict

from fastapi import HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _ip_key(request: Request) -> str:
    """Return real client IP, honouring X-Forwarded-For from Cloudflare/Railway/k8s ingress."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return get_remote_address(request)


# IP-based limiter for slowapi decorators
limiter = Limiter(key_func=_ip_key, default_limits=[])


# ============== EMAIL-BASED THROTTLING ==============
# Tracks recent failed login timestamps per email address.
EMAIL_WINDOW_SECONDS = 15 * 60  # 15 minutes
EMAIL_MAX_ATTEMPTS = 5  # max failed attempts before lockout

_email_attempts: Dict[str, Deque[float]] = {}


def _prune(email: str, now: float) -> Deque[float]:
    """Drop attempts older than the rolling window."""
    attempts = _email_attempts.setdefault(email, deque())
    cutoff = now - EMAIL_WINDOW_SECONDS
    while attempts and attempts[0] < cutoff:
        attempts.popleft()
    return attempts


def check_email_rate_limit(email: str) -> None:
    """Raise 429 if too many recent failed attempts exist for this email."""
    email = (email or "").strip().lower()
    if not email:
        return
    now = time.time()
    attempts = _prune(email, now)
    if len(attempts) >= EMAIL_MAX_ATTEMPTS:
        retry_after = int(EMAIL_WINDOW_SECONDS - (now - attempts[0]))
        raise HTTPException(
            status_code=429,
            detail=(
                "Too many failed login attempts for this account. "
                f"Please try again in {max(retry_after // 60, 1)} minute(s)."
            ),
            headers={"Retry-After": str(max(retry_after, 1))},
        )


def record_email_failure(email: str) -> None:
    """Record a failed login attempt for the given email."""
    email = (email or "").strip().lower()
    if not email:
        return
    now = time.time()
    attempts = _prune(email, now)
    attempts.append(now)


def reset_email_attempts(email: str) -> None:
    """Clear failed-attempt history (call on successful login)."""
    email = (email or "").strip().lower()
    _email_attempts.pop(email, None)


# ============== CLIENT-IP HELPER ==============
def client_ip(request: Request) -> str:
    """Return the client's real IP, honouring X-Forwarded-For from Railway/Cloudflare."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return get_remote_address(request)
