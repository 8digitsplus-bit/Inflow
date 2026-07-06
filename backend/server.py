from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
import logging

import os

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
from migrations.orgs import migrate_users_to_orgs
from utils.sentry_config import init_sentry

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

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
# or ALLOWED_ORIGINS for backwards compatibility. In production this MUST be a
# comma-separated list of explicit origins because allow_credentials=True is
# incompatible with allow_origins=["*"] under the CORS spec.
_cors_env = os.environ.get("CORS_ORIGINS") or os.environ.get("ALLOWED_ORIGINS") or ""
if _cors_env.strip() in ("", "*"):
    # Local-dev fallback — preview + localhost so credentialed cookie flows still work.
    origins = [
        "http://localhost:3000",
        "http://localhost:8001",
        "https://inflow-preview-1.preview.emergentagent.com",
    ]
else:
    origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=origins,
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
