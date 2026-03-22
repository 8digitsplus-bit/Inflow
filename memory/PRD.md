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

## Pricing & Trial
- **14-Day Free Trial** for all new signups
- **Essential:** $59/mo, $599/yr
- **Pro:** $149/mo, $1,490/yr
- **Enterprise:** $249/mo, $2,490/yr

## Live Integrations (ALL REAL)
| Platform | Auth Type | Fields Required | Token Expires |
|----------|-----------|-----------------|---------------|
| Stripe | Secret API Key | api_key | No |
| Shopify | Admin Access Token | store_url + api_key | No |
| HubSpot | Private App Token | api_key | No |
| Salesforce | Access Token | instance_url + api_key | Yes (~2 hrs) |
| QuickBooks | Access Token | company_id + api_key | Yes (~1 hr) |

## Data Import Options
- **CSV Import** — Open to all users
- **Custom API** — Enterprise-only, connect any REST API
- **Platform Auto-Detection** — Detects known platform patterns in imported data

## All Completed Features
- Authentication (Google + Email/Password)
- Dashboard with personalized metrics
- Sales Pipeline (deal management, stages, analytics)
- Sales Performance (win rates, team metrics)
- Revenue Analytics (breakdown, trends)
- Revenue Intelligence (advanced insights)
- **Revenue Forecast** (weighted pipeline, 3 scenarios, velocity, top deals) — Pro+ tier-gated
- Churn & Retention (CLV, churn rate, AI predictions, cohort analysis)
- CRO (funnel analysis, AI recommendations)
- Pricing Optimizer (AI pricing strategy)
- Smart Assist (Claude AI chat + tickets)
- All 5 Live Integrations functional (Stripe, Shopify, HubSpot, Salesforce, QuickBooks)
- CSV Import + Custom API (Enterprise) + Platform Auto-Detection
- Custom Stripe Checkout (Payment Intents) with Monzo/Revolut/Tide/Wise badges
- 14-Day Free Trial with countdown
- Onboarding flow
- Tier-Gating across all features
- Collapsible sidebar with persistent state

## Bug Fixes
- **2026-03-22:** Fixed Recharts tooltip white background on Revenue Forecast page. Changed tooltip `content` prop from React element to render function, added `contentStyle` and `wrapperStyle` overrides.

## Backlog
- **P1:** Support Operations (human handoff, admin panel, email notifications)
- **P1:** Integration Health Dashboard (sync status, data freshness, token expiry)
- **P1:** Email-Scheduled Forecast Reports (weekly summaries)
- **P2:** Team/Collaboration features
- **P2:** Public API Access for Enterprise tier
- **P2:** Drag-and-Drop CSV Mapping interface
