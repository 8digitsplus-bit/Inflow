# Vector - Product Requirements Document

## Product Overview
**Vector** is a subscription-based SaaS application for pricing optimization, sales pipeline management, and revenue intelligence. Built for B2B SaaS revenue teams.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, Recharts, Framer Motion
- **Backend:** FastAPI, Pydantic, Motor (async MongoDB), bcrypt
- **Database:** MongoDB
- **Authentication:** Emergent Google Auth, Email/Password, Microsoft OAuth (backend ready)
- **Payments:** Stripe (test keys)
- **AI:** Anthropic Claude Sonnet 4.5 (via Emergent LLM Key)

## Core Features (Implemented)
- **Dashboard** — KPIs: pipeline, revenue, win rate, deal count, charts, AI insights
- **Sales Pipeline** — Kanban-style deal management (CRUD)
- **Pricing Optimizer** — AI-powered pricing analysis
- **Revenue Intelligence** — Revenue forecasting, win/loss analysis
- **Churn & Retention** — Health scores, retention trends, cohort analysis
- **CRO** — Funnel visualization, bottleneck detection, A/B tests
- **Notification System** — At-risk client alerts
- **Integrations Page** — 9 recommended tools with connect/disconnect
- **Settings** — Profile, subscription management, Stripe checkout
- **Multi-Provider Auth** — Google, Microsoft, Email/Password with dedicated /auth page
- **Onboarding Flow** — 3-step wizard for new sign-ups (Company → Team/Industry → Goals)

## Auth Providers
| Provider | Status | Notes |
|----------|--------|-------|
| Google | Working | Via Emergent-managed Google Auth |
| Email/Password | Working | Full register + login with bcrypt |
| Microsoft | UI Ready | Backend OAuth flow ready, needs Azure AD credentials |

## Onboarding Flow
- **Step 1:** Company name
- **Step 2:** Team size (1-5, 6-20, 21-50, 51-200, 200+) + Industry selection
- **Step 3:** Goals (Pipeline, Pricing, Churn, CRO, Revenue)
- New email registrations → /onboarding → /dashboard
- Google auth checks onboarding-status → /onboarding or /dashboard
- Skip option available on step 1

## UI/UX Specifications
- Full-screen glassmorphism hamburger menu (Features, Pricing, Contact, Sign In)
- Pill-shaped buttons globally (rounded-full)
- Glow streak effect — animated light streak across buttons on hover
- Font: Inter (global), Outfit (headings)
- Dark theme with indigo accent (#6366F1)
- Hero image: Actual Vector dashboard screenshot (from /public/dashboard-preview.png)
- Hero subtitle: "Streamline workflows with AI-powered pricing optimization & revenue intelligence. Predict growth with data-driven insights."

## Pricing Tiers
| Plan | Monthly | Yearly | Deals | CTA |
|------|---------|--------|-------|-----|
| Essential | $49/mo | $490/yr | 1K-2.5K | Unlock Access |
| Pro | $99/mo | $990/yr | 5K-12K | Unlock Access |
| Enterprise | $179/mo | $1,799/yr | 12K-30K | Contact Sales |
- Yearly: 17% off first year only
- No "Most Popular" badge on any tier

## Key API Endpoints
- `/api/auth/google`, `/api/auth/callback` — Google auth
- `/api/auth/register`, `/api/auth/login` — Email/password auth
- `/api/auth/microsoft`, `/api/auth/microsoft/callback` — Microsoft OAuth
- `/api/auth/onboarding`, `/api/auth/onboarding-status` — Onboarding flow
- `/api/deals` — CRUD
- `/api/analytics/*`, `/api/ai/*`
- `/api/integrations`, `/api/integrations/{id}/connect|disconnect`
- `/api/notifications`, `/api/subscription/plans`, `/api/payments/*`

## DB Collections
- `users` (includes onboarded, company_name, team_size, industry, goals)
- `deals`, `notifications`, `integrations`, `user_sessions`, `payment_transactions`

## Completed (as of March 4, 2026)
- Full app scaffolding and core features
- Google Auth, Stripe payments, Claude AI integration
- Email/password auth (register + login with bcrypt)
- Microsoft OAuth backend structure
- Glassmorphism hamburger menu
- Renamed Basic → Essential tier
- Updated CTAs to "Unlock Access"
- Updated hero subtitle text
- Dashboard screenshot as hero image
- Glow streak animation on button hover
- All buttons pill-shaped globally
- Integrations page with 9 tools
- 3-step onboarding flow for new sign-ups
- No testimonials on landing page
- All tests passing

## Backlog / Future Tasks
- **P1:** Refactor `backend/server.py` into modular routers
- **P1:** Break down `Landing.js` into smaller sub-components
- **P2:** Configure Microsoft OAuth with Azure AD credentials
- **P2:** Real third-party integration OAuth flows (Slack, HubSpot, etc.)
- **P3:** Admin dashboard for managing users
- **P3:** Email notifications for at-risk clients
