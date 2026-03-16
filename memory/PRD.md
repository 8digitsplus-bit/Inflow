# InFlow - Product Requirements Document

## Product Overview
**InFlow** is a subscription-based SaaS for pricing optimization, sales pipeline management, and revenue intelligence.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, Recharts, Framer Motion
- **Backend:** FastAPI, Pydantic, Motor (async MongoDB), bcrypt
- **Database:** MongoDB
- **Auth:** Emergent Google Auth, Email/Password, Shopify OAuth (awaiting credentials)
- **Payments:** Stripe (test keys)
- **AI:** Claude Sonnet 4.5 (via Emergent LLM Key)

## Branding
- **Name:** InFlow
- **Logo:** Wordmark in indigo (#6366F1), bold geometric with flowing n-to-F connection
- **Logo file:** /app/frontend/public/inflow-logo.png

## Pricing & Trial
- **14-Day Free Trial** for all new signups — Dashboard + Connect Business access, no tier features
- **Essential:** $59/mo, $599/yr — Sales Pipeline, Basic Analytics, 1,500 actions/mo
- **Pro:** $149/mo, $1,490/yr — + Performance, AI, Pricing, CRO, 7,500 actions/mo
- **Enterprise:** $249/mo, $2,490/yr — + Revenue Analytics, Intelligence, 20,000 actions/mo
- **Cancel:** Users can cancel trial/subscription from Settings with confirmation dialog

## Key Features
- **Connect Your Business:** 5 platforms (Stripe, Shopify, HubSpot, Salesforce, QuickBooks), auto data sync, onboarding step 4 + sidebar nav, landing page section
- **Sales Pipeline, Performance, Revenue, Intelligence** — all tier-gated
- **Pricing Optimizer, CRO, Churn & Retention** — all tier-gated with AI insights
- **TierGate upgrade page** — shows 3 plan cards when users access restricted features
- **Cancel subscription/trial** — Settings page with confirmation dialog

## Completed (as of March 16, 2026)
- Full app: auth, payments, AI, onboarding, dashboard, analytics
- InFlow branding with wordmark logo
- 14-Day Free Trial with countdown badge
- Connect Your Business: 5 platforms, auto data sync
- Landing page: "Start 14-Day Free Trial" CTAs, Connect Your Business section
- Cancel subscription/trial from Settings
- All CTAs navigate to auth signup page
- Sales Pipeline page redesigned — Pipeline by Stage bar chart, Weighted Pipeline card, enhanced Kanban layout
- Full responsive optimization — All pages for mobile (375px), tablet (768px), desktop (1440px+)
- "Closed Won" → "Closed Win" across Pipeline page, "Won Deals" → "Win Deals" in CRO
- Sales Revenue pie chart: labeled slices + legend
- Settings billing toggle: pill-shaped buttons matching landing page, removed "Recommended" badge
- **AI Priority Support** — Live conversational AI chat (Claude) with InFlow knowledge base + user account context, multi-turn conversations, ticket system (open/in-progress/resolved), Priority badge for Pro/Enterprise, sidebar integration. 100% pass (iteration_19)

## Backlog
- **P0 (Blocked):** Shopify OAuth credentials
- **P1:** Real OAuth for Connect Your Business platforms, API Access feature for Enterprise tier
- **P2:** Team/Collaboration features, AI Insights for Sales features, Revenue Forecasting page
- **P3:** Admin dashboard, email notifications for support tickets
