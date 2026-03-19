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
- **Connect Your Business → Live Integration:** 5 platforms (Stripe LIVE, Shopify/HubSpot/Salesforce/QuickBooks MOCKED), Stripe uses real API key to fetch live customers/charges/subscriptions, modal with API key input, Live/Demo badges, sync/disconnect/re-sync, summary cards
- **Sales Pipeline, Performance, Revenue, Intelligence** — all tier-gated
- **Pricing Optimizer, CRO, Churn & Retention** — all tier-gated with AI insights
- **TierGate upgrade page** — shows 3 plan cards when users access restricted features
- **Cancel subscription/trial** — Settings page with confirmation dialog

## Completed (as of March 19, 2026)
- Full app: auth (Google + Email), payments, AI, onboarding, dashboard, analytics
- InFlow branding with wordmark logo
- 14-Day Free Trial with countdown badge
- **Trial expiry notifications** — Pop-up modals at 7, 3, 1, 0 days. Expired trial = undismissable lockout forcing upgrade. Progress bar shows days used. "Remind me later" per-milestone dismiss via sessionStorage
- Connect Your Business: 5 platforms, auto data sync (mock)
- Landing page: "Start 14-Day Free Trial" CTAs, Connect Your Business section
- Cancel subscription/trial from Settings
- Sales Pipeline redesigned — Pipeline by Stage chart, Weighted Pipeline card, Kanban
- Full responsive optimization — All pages for mobile/tablet/desktop
- **Smart Assist** (formerly Priority Support) — Live Claude chat + ticket system + actionable AI (upgrade, cancel, connect via chat buttons)
- Pricing Optimizer — AI-powered pricing analysis + dashboard
- **Shopify OAuth removed** — Auth page now only Google + Email
- Settings: pill-shaped billing toggle, no "Recommended" badge
- "Closed Won" → "Closed Win", "Won Deals" → "Win Deals"
- **Chart fixes:** Revenue by Stage labels truncated to fit, Win/Loss chart uses ComposedChart with Line for Win Rate data, removed white hover cursors from ALL chart tooltips site-wide, improved pie chart tooltip readability, improved churn health tooltip with customer counts and percentages
- **Minimal sidebar** — Grouped navigation (Sales, Analytics, Tools), compact 200px width with section labels, 48px when collapsed
- **Collapsible sidebar** — Desktop hamburger toggle to collapse/expand sidebar, state persists via localStorage across navigation
- **Button hover consistency** — All outline/ghost buttons use neutral hover (fixed accent color from cyan to neutral)
- **Trial tier gating** — Trial users can access: Dashboard, Sales Pipeline, Revenue Intelligence, CRO, Live Integration, Smart Assist, Settings. Locked: Sales Performance (Pro+), Sales Revenue (Enterprise), Churn & Retention (Essential+), Pricing Optimizer (Pro+). Locked items shown dimmed with lock icon.
- **Renamed "Connect Business" → "Live Integration"** — Updated sidebar, page title, landing page, FAQ, TierGate, backend AI prompt
- **Stripe Payment Checkout:** Dedicated /choose-plan page with all 3 tiers (Essential $59/mo, Pro $149/mo, Enterprise $249/mo), monthly/yearly toggle with 30% savings, Stripe checkout session creation, payment status polling, subscription tier upgrade on success. Accessible from trial notifications and settings.

## Backlog
- **P1:** Real OAuth for Connect Your Business platforms (start with Stripe)
- **P1:** API Access feature for Enterprise tier
- **P1:** Support Operations (human handoff, admin panel, email notifications)
- **P2:** Team/Collaboration features, Revenue Forecasting page
- **P2:** AI Insights for Sales Pipeline/Performance/CRO pages
- **P3:** Admin dashboard, email notifications for support tickets
