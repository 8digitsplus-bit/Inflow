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

## Branding History
- **Vector** (original) -> **Zelta** -> **InFlow** (current)
- Logo: InFlow wordmark in indigo (#6366F1), bold geometric with flowing n-to-F connection

## Pricing Tiers
| Plan | Monthly | Yearly |
|------|---------|--------|
| Essential | $59/mo | $599/yr |
| Pro | $149/mo | $1,490/yr |
| Enterprise | $249/mo | $2,490/yr |

## Key Features
- **Connect Your Business:** Integration hub (Stripe, Shopify, HubSpot, Salesforce, QuickBooks). Auto data sync into analytics. Available as onboarding step 4 + sidebar nav.
- **Sales Pipeline**: Kanban board, deal CRUD
- **Sales Performance**: Win rate, deal velocity, cycle days
- **Sales Revenue**: MRR/ARR, revenue vs target
- **Revenue Intelligence**: Unified overview + recommendations
- **Pricing Optimizer**: AI analysis, margin charts, elasticity simulator
- **CRO**: Conversion funnel, A/B tests, bottleneck detection
- **Churn & Retention**: Health scores, retention trends, at-risk deals

## All Completed (as of March 7, 2026)
- Full app scaffolding, all core features
- Multi-provider auth (Google, Email/Password)
- Stripe checkout wired (Landing + Settings)
- Claude AI integration for insights
- Onboarding flow (4 steps, step 4 = Connect Your Business, optional)
- Tier-gated personalized dashboard
- 3 feature pages: Sales Performance, Sales Revenue, Revenue Intelligence
- Pricing Optimizer with AI analysis
- **Connect Your Business** feature: 5 platforms, auto data sync
- **Rebrand from Zelta to InFlow**: Logo, wordmark, all references updated sitewide
- Hero image updated with InFlow-branded dashboard screenshot

## Backlog
- **P0 (Blocked):** Shopify OAuth credentials (user waiting for production domain)
- **P1:** Real OAuth for each Connect Your Business platform
- **P2:** Team/Collaboration features
- **P3:** Admin dashboard, email notifications
