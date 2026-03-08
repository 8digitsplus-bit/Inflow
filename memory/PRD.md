# InFlow - Product Requirements Document

## Product Overview
**InFlow** is a subscription-based SaaS for pricing optimization, sales pipeline management, and revenue intelligence. Built for B2B SaaS revenue teams.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, Recharts, Framer Motion
- **Backend:** FastAPI, Pydantic, Motor (async MongoDB), bcrypt
- **Database:** MongoDB
- **Auth:** Emergent Google Auth, Email/Password, Shopify OAuth (backend ready, awaiting credentials)
- **Payments:** Stripe (test keys, fully wired)
- **AI:** Claude Sonnet 4.5 (via Emergent LLM Key)

## Branding
- **Name:** InFlow (previously Vector → Zelta → InFlow)
- **Logo:** InFlow wordmark in indigo (#6366F1), bold geometric with flowing n-to-F connection
- **Logo file:** /app/frontend/public/inflow-logo.png

## Pricing Model
- **14-Day Free Trial** for all new users (can explore dashboard + connect business, no tier features)
- **Essential:** $59/mo, $599/yr — Sales Pipeline, Basic Analytics, Churn Monitoring, 1,500 actions/mo
- **Pro:** $149/mo, $1,490/yr — + Performance, AI Insights, Pricing Optimization, CRO, 7,500 actions/mo
- **Enterprise:** $249/mo, $2,490/yr — + Revenue Analytics, Revenue Intelligence, Priority Support, 20,000 actions/mo

## Trial System
- New users (email or Google) get `subscription_tier: "trial"` with `trial_start` and `trial_end` (14 days)
- `/api/auth/me` returns `trial_days_left` field
- Trial users can access: Dashboard, Connect Business, Settings
- Trial users CANNOT access tier-gated features (Pipeline, Performance, Revenue, etc.)
- Tier-gated pages show upgrade card with 3 plans
- After 14 days, trial expires and user must upgrade

## Key Features
- **Connect Your Business:** Integration hub (Stripe, Shopify, HubSpot, Salesforce, QuickBooks). Auto data sync. Onboarding step 4 + sidebar nav. Landing page section.
- **Sales Pipeline**: Kanban board, deal CRUD (Essential+)
- **Sales Performance**: Win rate, deal velocity (Pro+)
- **Sales Revenue**: MRR/ARR, revenue vs target (Enterprise)
- **Revenue Intelligence**: Unified overview + recommendations (Enterprise)
- **Pricing Optimizer**: AI analysis, margin charts (Pro+)
- **CRO**: Conversion funnel, A/B tests (Pro+)
- **Churn & Retention**: Health scores, at-risk deals (Pro+)

## Completed (as of March 8, 2026)
- Full app scaffolding, all core features
- Multi-provider auth (Google, Email/Password)
- Stripe checkout, Claude AI integration
- 4-step onboarding (step 4 = Connect Your Business, optional)
- Tier-gated dashboard with upgrade cards
- Connect Your Business: 5 platforms, auto data sync
- InFlow branding: logo, wordmark, all references
- **14-Day Free Trial system** with countdown badge, upgrade page with 3 tiers
- Landing page: "Start 14-Day Free Trial" CTAs, Connect Your Business section
- 100% test pass rates (iteration_14, iteration_15)

## Backlog
- **P0 (Blocked):** Shopify OAuth credentials (user waiting for production domain)
- **P1:** Real OAuth for each Connect Your Business platform
- **P2:** Team/Collaboration features
- **P3:** Admin dashboard, email notifications
