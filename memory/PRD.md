# InFlow - Revenue Intelligence SaaS Platform

## Original Problem Statement
Build "InFlow", a top-tier, full-stack SaaS application for pricing optimization, sales pipeline management, and revenue intelligence. Core features include tier-gated analytics, integrations (Stripe, HubSpot, Salesforce, etc.), and AI tools.

## Tech Stack
- Frontend: React + Tailwind CSS + Shadcn UI + Recharts
- Backend: FastAPI (Python)
- Database: MongoDB
- Auth: Session cookies (httpOnly) + Google OAuth
- Encryption: AES-256 (Fernet) for API keys at rest
- AI: Claude Sonnet 4.5 via Emergent LLM Key (emergentintegrations library)


## Docs
- CHANGELOG.md: everything implemented, with dates
- ROADMAP.md: prioritized backlog

## Key API Endpoints
- `/api/competitors` (+ /status, /benchmark, /my-pricing, POST create+extract, /{id}/rescan, PUT, DELETE) - Competitor Intelligence
- `/api/ai/pricing-analysis` - AI pricing strategy
- `/api/ai/insights` - AI business insights
- `/api/ai/churn-prediction` - AI churn risk scoring
- `/api/ai/cro-recommendations` - AI CRO recommendations
- `/api/business/connect/{platform}` - Connect integration
- `/api/deals` - CRUD for deals
- `/api/analytics/*` - Analytics endpoints

## Key Files
- `/app/backend/routes/ai.py` - All 4 AI endpoints
- `/app/frontend/src/components/AIResponseRenderer.js` - Shared markdown renderer
- `/app/frontend/src/constants/colors.js` - Global chart colors
- `/app/backend/utils/crypto.py` - AES-256 encryption

## Test Credentials
- Email: testpro@test.com / Password: password (Pro plan)
- Email: testdemo@inflow.com / Password: password (Demo account)


## Product rules
- Revenue-first focus; 3-tier subscription (no per-seat); glassmorphism + Electric Blue (#0052ff)
- Stripe LIVE in production (preview uses a sentinel key, so Stripe calls must be mocked in tests)
- Cancellation = end of billing period (ToS-aligned); no-card trial cancel is immediate
