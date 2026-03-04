# Vector - Product Requirements Document

## Product Overview
**Vector** is a subscription-based SaaS application for pricing optimization, sales pipeline management, and revenue intelligence. It's built for B2B SaaS revenue teams.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, Recharts, Framer Motion
- **Backend:** FastAPI, Pydantic, Motor (async MongoDB driver)
- **Database:** MongoDB
- **Authentication:** Emergent-managed Google Auth
- **Payments:** Stripe (test keys)
- **AI:** Anthropic Claude Sonnet 4.5 (via Emergent LLM Key)

## Core Features (Implemented)
- **Dashboard** — Central hub with KPIs: pipeline, revenue, win rate, deal count, charts, AI insights
- **Sales Pipeline** — Kanban-style drag-and-drop deal management (CRUD)
- **Pricing Optimizer** — AI-powered pricing analysis with competitor comparisons
- **Revenue Intelligence** — Revenue forecasting, win/loss analysis, pipeline breakdowns
- **Churn & Retention** — Health scores, retention/churn trends, cohort analysis, AI predictions
- **CRO (Conversion Rate Optimization)** — Funnel visualization, bottleneck detection, A/B tests, AI recommendations
- **Notification System** — At-risk client alerts via NotificationBell component
- **Integrations Page** — Generic integrations page with 9 recommended tools (Slack, HubSpot, Salesforce, Google Sheets, Zapier, Stripe, Gmail, Microsoft Teams, Jira). Connect/disconnect functionality with search and category filtering.
- **Settings** — Profile, subscription management, Stripe checkout

## UI/UX Specifications
- Full-screen glassmorphism hamburger menu (Features, Pricing, Contact, Sign In)
- Pill-shaped buttons globally (rounded-full on all Button components)
- Font: Inter (global), Outfit (headings)
- Dark theme with indigo accent (#6366F1)
- No "Most Popular" badge on Pro tier

## Pricing Tiers
| Plan | Monthly | Yearly | Deals |
|------|---------|--------|-------|
| Basic | $49/mo | $490/yr | 1K-2.5K |
| Pro | $99/mo | $990/yr | 5K-12K |
| Enterprise | $179/mo | $1,799/yr | 12K-30K |
- Yearly plans: 17% off first year only

## Architecture
```
/app/
├── backend/
│   ├── server.py          # Monolithic FastAPI app (all routes + models)
│   ├── tests/             # Pytest test files
│   └── .env               # MONGO_URL, DB_NAME, Stripe keys, etc.
├── frontend/
│   ├── src/
│   │   ├── App.js         # Router
│   │   ├── components/
│   │   │   ├── DashboardLayout.js  # Sidebar nav
│   │   │   ├── NotificationBell.js
│   │   │   ├── ProtectedRoute.js
│   │   │   └── ui/        # Shadcn components
│   │   ├── contexts/AuthContext.js
│   │   └── pages/
│   │       ├── Landing.js, Dashboard.js, Pipeline.js
│   │       ├── PricingOptimizer.js, RevenueIntelligence.js
│   │       ├── ChurnRetention.js, ConversionOptimization.js
│   │       ├── Integrations.js, Settings.js, AuthCallback.js
│   └── .env               # REACT_APP_BACKEND_URL
└── memory/PRD.md
```

## Key API Endpoints
- `/api/auth/google`, `/api/auth/callback` — Google auth
- `/api/deals` — CRUD for deals
- `/api/analytics/revenue`, `/api/analytics/pipeline`, `/api/analytics/churn`, `/api/analytics/cro`
- `/api/ai/insights`, `/api/ai/pricing-analysis`, `/api/ai/churn-prediction`, `/api/ai/cro-recommendations`
- `/api/integrations` — List integrations
- `/api/integrations/{id}/connect`, `/api/integrations/{id}/disconnect`
- `/api/notifications`, `/api/subscription/plans`, `/api/payments/*`

## DB Collections
- `users`, `deals`, `notifications`, `integrations`, `user_sessions`, `payment_transactions`

## Completed (as of March 4, 2026)
- Full app scaffolding and core features
- Google Auth, Stripe payments, Claude AI integration
- Glassmorphism hamburger menu
- Removed "Most Popular" from Pro tier
- All buttons made pill-shaped globally
- Integrations page with 9 recommended tools + connect/disconnect
- All tests passing (100% backend, 100% frontend)

## Backlog / Future Tasks
- **P1:** Refactor `backend/server.py` into modular routers (deals.py, users.py, analytics.py, etc.)
- **P1:** Break down `Landing.js` into smaller sub-components
- **P2:** Real third-party integration OAuth flows (Slack, HubSpot, etc.)
- **P2:** Integration webhook handling and data sync
- **P3:** Admin dashboard for managing users
- **P3:** Email notifications for at-risk clients
