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
- Dashboard with personalized, tier-gated overview metrics
- Sales Pipeline (deal management, stages, velocity, bottleneck detection, kanban board)
- Sales Performance (win/loss rates, avg sales cycle, deal aging, close rate by size, activity-to-close)
- Revenue Analytics (MRR, ARR, ARPU, NRR, concentration risk, expansion vs new revenue, top accounts)
- Revenue Intelligence (unified overview with recommendations, stage health, monthly trends, quick navigation)
- **Revenue Forecast** (weighted pipeline, 3 scenarios, velocity, top deals) — Pro+ tier-gated
- Churn & Retention (health score, CLV, ARPA, churn/retention rates, NRR, revenue at risk, cohort analysis, churn reasons, risk by segment, at-risk deals, AI predictions)
- CRO (overall conversion, funnel analysis, stage-to-stage conversion, active A/B tests, worst drop-off detection, bottlenecks, AI recommendations)
- Pricing Optimizer (AI pricing strategy)
- Smart Assist (Claude AI chat + tickets)
- **Agentic AI** — Multi-step investigation agent with 12 tools (query_deals, analytics, integrations, forecast, churn, deal updates, search, **remember**, **recall_memory**, **escalate_to_ticket**). Agent mode toggle, investigation step display, markdown rendering, cross-conversation memory, auto-escalation to tickets.
- All 5 Live Integrations functional (Stripe, Shopify, HubSpot, Salesforce, QuickBooks)
- CSV Import + Custom API (Enterprise) + Platform Auto-Detection
- Custom Stripe Checkout (Payment Intents) with Monzo/Revolut/Tide/Wise badges
- 14-Day Free Trial with countdown
- Onboarding flow
- Tier-Gating across all features
- Collapsible sidebar with persistent state

## Differentiated Analytics Pages (Completed 2026-03-23)
Each analytics page now provides unique, non-redundant metrics:
| Page | Unique Focus | Key Metrics |
|------|-------------|-------------|
| Dashboard | High-level overview | Total Pipeline, Closed Revenue, Win Rate, Active Deals |
| Pipeline | Deal flow & velocity | Weighted Pipeline, Bottleneck Stage, Stage Velocity, Conversion Rates |
| Sales Performance | Closing efficiency | Win/Loss Rate, Avg Sales Cycle, Deal Aging, Close Rate by Size |
| Sales Revenue | Revenue health | MRR/ARR, ARPU, NRR, Concentration Risk, Expansion vs New Revenue |
| Churn & Retention | Customer health | Health Score, CLV, ARPA, Churn Reasons, Cohort Retention, At-Risk Deals |
| CRO | Conversion optimization | Funnel Rates, Active A/B Tests, Worst Drop-off, Bottlenecks |
| Revenue Intelligence | Unified insights | Pipeline Health, Performance Trend, Recommendations, Stage Health |
| Revenue Forecast | Future projections | Scenario Modeling, Revenue Velocity, Pipeline Confidence |

## Bug Fixes
- **2026-03-22:** Fixed Recharts tooltip white background on Revenue Forecast page Pipeline chart.
- **2026-03-22:** Built Agentic AI system with 12 autonomous tools, multi-step reasoning, cross-conversation memory, auto-escalation.
- **2026-03-23:** Fixed tooltip white background across ALL analytics pages (inline styles prevent CSS conflicts).
- **2026-03-23:** Completed differentiated metrics refactor — replaced redundant CRO KPIs (Won Deals → Active A/B Tests, Avg Sales Cycle → Worst Drop-off).

## Backlog
- **P1:** Integration Health Dashboard (sync status, data freshness, token expiry)
- **P1:** Email-Scheduled Forecast Reports (weekly summaries)
- **P1:** Daily AI Briefing (proactive pipeline analysis via email)
- **P1:** Admin panel for support ticket management
- **P2:** Team/Collaboration features
- **P2:** Public API Access for Enterprise tier
- **P2:** Drag-and-Drop CSV Mapping interface
