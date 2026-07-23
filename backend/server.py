from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
import logging
import re

import os
import sentry_sdk

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from utils.rate_limit import limiter
from database import client
from routes.auth import router as auth_router
from routes.deals import router as deals_router
from routes.notifications import router as notifications_router
from routes.analytics import router as analytics_router
from routes.ai import router as ai_router
from routes.payments import router as payments_router
from routes.integrations import router as integrations_router
from routes.business import router as business_router
from routes.support import router as support_router
from routes.agent import router as agent_router
from routes.custom_integration import router as custom_integration_router
from routes.organizations import router as organizations_router
from routes.contact import router as contact_router
from routes.legal import router as legal_router
from routes.telemetry import router as telemetry_router
from routes.competitors import router as competitors_router
from routes.upsell import router as upsell_router
from routes.intent import router as intent_router
from migrations.orgs import migrate_users_to_orgs
from utils.sentry_config import init_sentry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Sentry (no-op if SENTRY_DSN unset) — before app creation for auto-instrumentation
init_sentry()

# Create the main app
app = FastAPI()

# Register the rate limiter (used via decorators on auth routes)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Friendly 429 response for IP-throttled requests."""
    retry_after = getattr(exc, "retry_after", 60)
    return JSONResponse(
        status_code=429,
        content={
            "detail": (
                "Too many requests from your network. "
                "Please wait a few minutes and try again."
            )
        },
        headers={"Retry-After": str(retry_after)},
    )


# Origins allowed to receive credentialed responses. Mirrors the CORSMiddleware
# config below so that error responses can carry the SAME CORS headers.
_cors_env_origins = (os.environ.get("CORS_ORIGINS") or os.environ.get("ALLOWED_ORIGINS") or "").strip()
_EXPLICIT_ORIGINS = (
    {o.strip() for o in _cors_env_origins.split(",") if o.strip()}
    if (_cors_env_origins and _cors_env_origins != "*") else set()
)
_ALLOWED_ORIGIN_RE = re.compile(
    r"https?://(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|.*\.preview\.emergentagent\.com|"
    r".*\.emergent\.host|.*\.emergentagent\.com|(.*\.)?inflowft\.com)$"
)


def _cors_headers_for(request: Request) -> dict:
    """CORS headers for an allowed Origin, so error responses aren't browser-blocked."""
    origin = request.headers.get("origin")
    if not origin:
        return {}
    allowed = origin in _EXPLICIT_ORIGINS if _EXPLICIT_ORIGINS else bool(_ALLOWED_ORIGIN_RE.match(origin))
    if not allowed:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    """Return a truthful JSON 500 WITH CORS headers.

    Starlette emits unhandled-exception 500s above the CORS middleware, so the
    browser would otherwise block the response and the client would misreport it
    as a network/"couldn't reach server" error. We attach CORS headers manually
    and report the exception to Sentry."""
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc!r}")
    try:
        sentry_sdk.capture_exception(exc)
    except Exception:
        pass
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on our end. Please try again in a moment."},
        headers=_cors_headers_for(request),
    )


# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Include all route modules
api_router.include_router(auth_router)
api_router.include_router(deals_router)
api_router.include_router(notifications_router)
api_router.include_router(analytics_router)
api_router.include_router(ai_router)
api_router.include_router(payments_router)
api_router.include_router(integrations_router)
api_router.include_router(business_router)
api_router.include_router(support_router)
api_router.include_router(agent_router)
api_router.include_router(custom_integration_router)
api_router.include_router(organizations_router)
api_router.include_router(contact_router)
api_router.include_router(legal_router)
api_router.include_router(telemetry_router)
api_router.include_router(competitors_router)
api_router.include_router(upsell_router)
api_router.include_router(intent_router)


# Basic routes
@api_router.get("/")
async def root():
    return {"message": "InFlow API", "version": "1.0.0"}


@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}


# Include the router in the main app
app.include_router(api_router)

# Read allowed origins from env. Accept either CORS_ORIGINS (the canonical name)
# or ALLOWED_ORIGINS for backwards compatibility. allow_credentials=True is
# incompatible with allow_origins=["*"] under the CORS spec, so when no explicit
# origins are configured we fall back to a credential-safe regex that matches
# localhost plus any Emergent preview/production domain (works regardless of the
# deployed app name — no hardcoded URLs).
_cors_env = (os.environ.get("CORS_ORIGINS") or os.environ.get("ALLOWED_ORIGINS") or "").strip()
if _cors_env and _cors_env != "*":
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=[o.strip() for o in _cors_env.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origin_regex=r"https?://(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|.*\.preview\.emergentagent\.com|.*\.emergent\.host|.*\.emergentagent\.com|(.*\.)?inflowft\.com)",
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
async def startup_migrations():
    try:
        await migrate_users_to_orgs()
    except Exception as e:
        logging.error("Org migration failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
