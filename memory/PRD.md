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

## Architecture
### Backend - Modular Routers
```
/app/backend/
├── server.py, database.py, models.py, dependencies.py
└── routes/ (auth, deals, analytics, ai, payments, notifications, integrations)
```
### Frontend - Component Composition
```
/app/frontend/src/
├── pages/ (Landing, AuthPage, Onboarding, Dashboard, Pipeline, SalesPerformance, SalesRevenue, RevenueIntelligence, Settings, etc.)
├── components/ (DashboardLayout, NotificationBell, ProtectedRoute, TierGate, ui/)
├── components/landing/ (HeaderMenu, HeroSection, FeaturesSection, HowItWorks, PricingSection, CTAFooter)
└── contexts/ (AuthContext)
```

## Pricing Tiers (Updated March 6, 2026)
| Plan | Monthly | Yearly | Usages (mo/yr) | CTA |
|------|---------|--------|----------------|-----|
| Essential | $59/mo | $599/yr | 1,500 / 3,000 | Unlock Access |
| Pro | $149/mo | $1,490/yr | 7,500 / 15,000 | Scale Up |
| Enterprise | $249/mo | $2,490/yr | 20,000 / 40,000 | Maximise |

## Feature Tier Gating (Enforced via TierGate component)
| Feature Page | Required Tier | Level |
|-------------|---------------|-------|
| Dashboard | Free | 0 |
| Sales Pipeline | Essential+ | 1 |
| Sales Performance | Pro+ | 2 |
| Sales Revenue | Enterprise | 3 |
| Revenue Intelligence | Enterprise | 3 |
| Churn & Retention | Free | 0 |
| CRO | Free | 0 |
| Settings | Free | 0 |

## Key Features
- **Sales Pipeline**: Kanban board, deal CRUD, drag-and-drop stages, stage totals
- **Sales Performance**: Win rate, deal velocity, avg cycle days, stage velocity, top deals, performance trends
- **Sales Revenue**: MRR/ARR, revenue vs target, revenue by stage, growth rate, top accounts
- **Revenue Intelligence**: Unified overview of all 3 features with pipeline health, performance trend, cross-feature recommendations & actions
- **Churn & Retention**: Health scores, retention rates, cohort analysis, at-risk alerts
- **CRO**: Conversion funnel, stage conversions, A/B tests, bottleneck detection

## All Completed (as of March 6, 2026)
- Full app scaffolding, all core features
- Multi-provider auth (Google, Email/Password, Shopify w/ real logo)
- Stripe checkout wired on Landing page + Settings page
- Claude AI integration for insights
- Onboarding flow, Integrations page
- Tier-gated personalized dashboard
- Pricing: $59/$149/$249 monthly, $599/$1490/$2490 yearly
- 3 new feature pages: Sales Performance, Sales Revenue, Revenue Intelligence overhaul
- Tier-gated access controls with upgrade prompts (TierGate component)
- Real Shopify SVG logo on auth page
- 100% test pass rate across all iterations

## Backlog
- **P1:** Configure Shopify OAuth with credentials when user provides them
- **P2:** Refine UI/UX per user feedback
- **P3:** Admin dashboard for user management
- **P3:** Email notifications for at-risk clients
- **P3:** Team collaboration (invite members, share pipeline, assign deals)
- **P3:** Deeper third-party integration OAuth flows
