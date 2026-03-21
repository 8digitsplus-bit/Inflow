# InFlow - Product Requirements Document

## Product Overview
**InFlow** is a subscription-based SaaS for pricing optimization, sales pipeline management, and revenue intelligence.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, Recharts, Framer Motion, PapaParse
- **Backend:** FastAPI, Pydantic, Motor (async MongoDB), bcrypt, httpx
- **Database:** MongoDB
- **Auth:** Emergent Google Auth, Email/Password
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
- **Live Integration:** 5 platforms (Stripe LIVE, Shopify/HubSpot/Salesforce/QuickBooks MOCKED), Stripe uses real API key
- **CSV Import:** Upload CSV files with business data, map columns to InFlow fields, up to 5,000 records per import
- **Custom API Integration:** Connect any REST API endpoint, test connection, map response fields, auto-sync
- **Platform Auto-Detection:** After CSV or API import, detects patterns from known platforms (Stripe, Shopify, HubSpot, Salesforce, QuickBooks) and suggests direct integration
- **Sales Pipeline, Performance, Revenue, Intelligence** — all tier-gated
- **Pricing Optimizer, CRO, Churn & Retention** — all tier-gated with AI insights
- **Smart Assist** — Live Claude AI chat + ticket system + actionable AI buttons
- **Custom Embedded Stripe Checkout** — Payment Intents with on-site card entry
- **Collapsible Sidebar** — Persistent state via localStorage, minimal design

## Completed (as of March 21, 2026)
- Full app: auth (Google + Email), payments, AI, onboarding, dashboard, analytics
- InFlow branding with wordmark logo
- 14-Day Free Trial with countdown badge and expiry notifications
- **CSV Import** — File upload, column mapping, stage mapping, preview, auto-detection
- **Custom API Integration** — REST API connection with test, field mapping, data sync, re-sync
- **Platform Auto-Detection** — Signature-based detection for Stripe/Shopify/HubSpot/Salesforce/QuickBooks
- **Your Data Sources section** — Shows connected CSV imports and Custom APIs with sync/disconnect
- Live Stripe Integration (API key-based data sync)
- Custom embedded Stripe checkout (Payment Intents)
- Minimal collapsible sidebar with persistent state
- All chart tooltip/hover fixes for dark theme
- Responsive optimization across all pages
- Smart Assist (Claude AI chat + tickets)
- Pricing Optimizer with AI analysis

## Backlog
- **P1:** Support Operations (human handoff, admin panel, email notifications)
- **P1:** Make Shopify/HubSpot/Salesforce/QuickBooks integrations functional (currently mocked)
- **P2:** AI Insights for Sales Pipeline/Performance/CRO pages
- **P2:** Revenue Forecasting page with scenario modeling
- **P2:** Team/Collaboration features
- **P2:** API Access for Enterprise tier
- **P3:** Admin dashboard, email notifications for support tickets
