# Vector - Product Requirements Document

## Product Overview
**Vector** is a subscription-based SaaS for pricing optimization, sales pipeline management, and revenue intelligence. Built for B2B SaaS revenue teams.

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
- **Sales Pipeline**: Kanban board, deal CRUD, drag-and-drop stages
- **Sales Performance**: Win rate, deal velocity, cycle days, stage velocity, top deals
- **Sales Revenue**: MRR/ARR, revenue vs target, growth rate, top accounts
- **Revenue Intelligence**: Unified overview of pipeline + performance + revenue with recommendations
- **Pricing Optimizer** (Upgraded):
  - **Analyze tab**: Enhanced form with product name, current price, cost of goods, monthly volume, discount %, competitor prices, market segment, target margin → Claude AI returns optimal price, margin analysis, competitive positioning, volume impact, discount strategy, risk assessment, implementation roadmap
  - **Dashboard tab**: KPIs (total analyses, price gap, competitor avg, revenue uplift), margin analysis chart, competitor positioning chart, price elasticity simulator, segment breakdown, recent analyses history
- **CRO**: Conversion funnel, stage conversions, A/B tests, bottleneck detection
- **Churn & Retention**: Health scores, retention/churn trends, at-risk deals, cohort analysis

## All Completed (as of March 6, 2026)
- Full app scaffolding, all core features
- Multi-provider auth (Google, Email/Password, Shopify w/ real logo)
- Stripe checkout wired (Landing + Settings)
- Claude AI integration for insights
- Onboarding flow, Integrations page
- Tier-gated personalized dashboard + access controls
- Pricing: $59/$149/$249 monthly, $599/$1490/$2490 yearly
- 3 new feature pages: Sales Performance, Sales Revenue, Revenue Intelligence overhaul
- **Pricing Optimizer upgraded** with dashboard metrics + enhanced AI analysis
- Landing page text updates ("Everything you need to scale")
- 100% test pass rates across all iterations

## Backlog
- **P1:** Configure Shopify OAuth credentials
- **P2:** UI/UX refinements per user feedback
- **P3:** Admin dashboard, email notifications, team collaboration, deeper integrations
