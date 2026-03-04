# Vector - Product Requirements Document

## Product Overview
**Vector** is a subscription-based SaaS application for pricing optimization, sales pipeline management, and revenue intelligence. Built for B2B SaaS revenue teams.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, Recharts, Framer Motion
- **Backend:** FastAPI, Pydantic, Motor (async MongoDB), bcrypt
- **Database:** MongoDB
- **Authentication:** Emergent Google Auth, Email/Password, Microsoft OAuth (backend ready)
- **Payments:** Stripe (test keys)
- **AI:** Anthropic Claude Sonnet 4.5 (via Emergent LLM Key)

## Architecture (Refactored March 4, 2026)

### Backend — Modular Routers
```
/app/backend/
├── server.py          # Slim entry: CORS, router includes, startup/shutdown
├── database.py        # MongoDB connection (db, client)
├── models.py          # All Pydantic models
├── dependencies.py    # get_current_user, get_optional_user
├── routes/
│   ├── auth.py        # Google session, email/password, Microsoft, onboarding
│   ├── deals.py       # CRUD deals
│   ├── analytics.py   # Revenue, pipeline, churn, CRO analytics
│   ├── ai.py          # AI pricing, insights, churn prediction, CRO
│   ├── payments.py    # Stripe checkout, payment status, webhook, plans
│   ├── notifications.py # Notification CRUD + at-risk auto-generation
│   └── integrations.py  # Available integrations, connect/disconnect
├── tests/
│   └── test_refactored_apis.py
└── .env
```

### Frontend — Component Composition
```
/app/frontend/src/
├── App.js
├── contexts/AuthContext.js
├── components/
│   ├── DashboardLayout.js
│   ├── NotificationBell.js
│   ├── ProtectedRoute.js
│   ├── landing/
│   │   ├── HeaderMenu.js      # FullScreenMenu + Header
│   │   ├── HeroSection.js     # Hero with dashboard screenshot
│   │   ├── FeaturesSection.js  # 4 feature cards
│   │   ├── HowItWorks.js      # 3-step flow + pipeline widget
│   │   ├── PricingSection.js   # Plans + billing toggle
│   │   └── CTAFooter.js       # CTA + Footer
│   └── ui/                    # Shadcn components
└── pages/
    ├── Landing.js             # Slim composition
    ├── AuthPage.js            # Google, Microsoft, Email auth
    ├── Onboarding.js          # 3-step wizard
    ├── Dashboard.js, Pipeline.js, Settings.js
    ├── PricingOptimizer.js, RevenueIntelligence.js
    ├── ChurnRetention.js, ConversionOptimization.js
    ├── Integrations.js
    └── AuthCallback.js
```

## Core Features
- Dashboard, Sales Pipeline, Pricing Optimizer, Revenue Intelligence
- Churn & Retention, CRO, Notification System, Integrations (9 tools)
- Settings, Multi-Provider Auth, 3-Step Onboarding

## Pricing Tiers
| Plan | Monthly | Yearly | CTA |
|------|---------|--------|-----|
| Essential | $49/mo | $490/yr | Unlock Access |
| Pro | $99/mo | $990/yr | Unlock Access |
| Enterprise | $179/mo | $1,799/yr | Contact Sales |

## Completed (as of March 4, 2026)
- Full app scaffolding and all core features
- All auth providers (Google, Email/Password, Microsoft structure)
- Stripe payments, Claude AI integration
- Onboarding flow, Integrations page
- UI: Pill buttons, glow streak effect, glassmorphism menu, dashboard screenshot hero
- **Backend refactored** from 1 monolithic file → 8 modular files
- **Landing page refactored** from 1 large component → 7 sub-components
- All tests passing (100% backend, 100% frontend)

## Backlog / Future Tasks
- **P2:** Configure Microsoft OAuth with Azure AD credentials
- **P2:** Real third-party integration OAuth flows (Slack, HubSpot, etc.)
- **P2:** Personalized dashboard based on onboarding goals
- **P3:** Admin dashboard for managing users
- **P3:** Email notifications for at-risk clients
