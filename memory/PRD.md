# Zelta - Product Requirements Document

## Product Overview
**Zelta** is a subscription-based SaaS for pricing optimization, sales pipeline management, and revenue intelligence. Built for B2B SaaS revenue teams.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, Recharts, Framer Motion
- **Backend:** FastAPI, Pydantic, Motor (async MongoDB), bcrypt
- **Database:** MongoDB
- **Auth:** Emergent Google Auth, Email/Password, Shopify OAuth (backend ready, awaiting credentials)
- **Payments:** Stripe (test keys, fully wired)
- **AI:** Claude Sonnet 4.5 (via Emergent LLM Key)

## Pricing Tiers
| Plan | Monthly | Yearly | Usages (mo/yr) | CTA |
|------|---------|--------|----------------|-----|
| Essential | $59/mo | $599/yr | 1,500 / 3,000 | Unlock Access |
| Pro | $149/mo | $1,490/yr | 7,500 / 15,000 | Scale Up |
| Enterprise | $249/mo | $2,490/yr | 20,000 / 40,000 | Maximise |

## Feature Tier Gating (TierGate component)
| Feature Page | Required Tier |
|-------------|---------------|
| Dashboard | Free |
| Sales Pipeline | Essential+ |
| Sales Performance | Pro+ |
| Sales Revenue | Enterprise |
| Revenue Intelligence | Enterprise |
| Pricing Optimizer | Pro+ (AI analysis) |
| CRO | Pro+ (AI recs) |
| Churn & Retention | Pro+ (AI predictions) |

## Key Features
- **Connect Your Business (NEW):** Integration hub to connect external business platforms (Stripe, Shopify, HubSpot, Salesforce, QuickBooks). Syncs business data automatically to power all analytics. Available as optional onboarding step 4 and as sidebar navigation item. Replaces old Integrations page.
- **Sales Pipeline**: Kanban board, deal CRUD, drag-and-drop stages
- **Sales Performance**: Win rate, deal velocity, cycle days, stage velocity, top deals
- **Sales Revenue**: MRR/ARR, revenue vs target, growth rate, top accounts
- **Revenue Intelligence**: Unified overview of pipeline + performance + revenue with recommendations
- **Pricing Optimizer**: Enhanced form with AI analysis, dashboard with KPIs, margin charts, elasticity simulator
- **CRO**: Conversion funnel, stage conversions, A/B tests, bottleneck detection
- **Churn & Retention**: Health scores, retention/churn trends, at-risk deals, cohort analysis

## All Completed (as of March 7, 2026)
- Full app scaffolding, all core features
- Multi-provider auth (Google, Email/Password, Shopify w/ real logo)
- Stripe checkout wired (Landing + Settings)
- Claude AI integration for insights
- Onboarding flow (4 steps including optional Connect Your Business)
- Tier-gated personalized dashboard + access controls
- Pricing: $59/$149/$249 monthly, $599/$1490/$2490 yearly
- 3 feature pages: Sales Performance, Sales Revenue, Revenue Intelligence
- Pricing Optimizer upgraded with dashboard metrics + enhanced AI analysis
- **Connect Your Business** feature: 5 platforms, auto data sync, sidebar nav, onboarding step 4
- 100% test pass rates across all iterations (latest: iteration_14)

## Backlog
- **P0 (Blocked):** Configure Shopify OAuth credentials (user waiting for production domain)
- **P1:** Live data integrations - replace simulated data with real OAuth for each platform
- **P2:** Team/Collaboration features - multi-user workspace, role-based permissions
- **P3:** Admin dashboard, email notifications, deeper integrations
