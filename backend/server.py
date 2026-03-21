from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import logging

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
from routes.custom_integration import router as custom_integration_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Create the main app
app = FastAPI()

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
api_router.include_router(custom_integration_router)


# Basic routes
@api_router.get("/")
async def root():
    return {"message": "InFlow API", "version": "1.0.0"}


@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
