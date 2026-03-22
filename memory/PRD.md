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

## Live Integrations (ALL REAL — No Mocks)
| Platform | Auth Type | Fields Required | Token Expires |
|----------|-----------|-----------------|---------------|
| **Stripe** | Secret API Key | api_key (sk_...) | No |
| **Shopify** | Admin Access Token | store_url + api_key (shpat_...) | No |
| **HubSpot** | Private App Token | api_key (pat-...) | No |
| **Salesforce** | Access Token | instance_url + api_key | Yes (~2 hrs) |
| **QuickBooks** | Access Token | company_id + api_key | Yes (~1 hr) |

Each platform: validates credentials via real API call, fetches live data, transforms to InFlow deals.

## Data Import Options
- **CSV Import** — Upload CSV, map columns, stage mapping, up to 5,000 records
- **Custom API** — Connect any REST API endpoint, test + map + sync
- **Platform Auto-Detection** — Detects Stripe/Shopify/HubSpot/Salesforce/QuickBooks patterns in imported data

## Key Features
- Sales Pipeline, Performance, Revenue, Intelligence (tier-gated)
- Pricing Optimizer, CRO, Churn & Retention (tier-gated with AI insights)
- Smart Assist — Claude AI chat + ticket system
- Custom embedded Stripe Checkout (Payment Intents)
- Collapsible sidebar with persistent state
- Checkout accepts: Visa, Mastercard, Amex, PayPal, Apple Pay, Google Pay, Samsung Pay, Monzo, Revolut, Tide, Wise

## Completed (as of March 22, 2026)
- Full app: auth, payments, AI, onboarding, dashboard, analytics
- **All 5 Live Integrations functional** (Stripe, Shopify, HubSpot, Salesforce, QuickBooks)
- CSV Import + Custom API Integration + Platform Auto-Detection
- InFlow branding, 14-day free trial, checkout with Monzo/Revolut/Tide/Wise badges
- Smart Assist, Pricing Optimizer, all chart fixes, responsive design

## Backlog
- **P1:** Support Operations (human handoff, admin panel, email notifications)
- **P2:** AI Insights for Sales Pipeline/Performance/CRO pages
- **P2:** Revenue Forecasting page with scenario modeling
- **P2:** Team/Collaboration features
- **P2:** API Access for Enterprise tier
