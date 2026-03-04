# Vector - Product Requirements Document

## Product Overview
**Vector** is a subscription-based SaaS for pricing optimization, sales pipeline management, and revenue intelligence. Built for B2B SaaS revenue teams.

## Tech Stack
- **Frontend:** React, Tailwind CSS, Shadcn/UI, Recharts
- **Backend:** FastAPI, Pydantic, Motor (async MongoDB), bcrypt
- **Database:** MongoDB
- **Auth:** Emergent Google Auth, Email/Password, Microsoft OAuth (backend ready)
- **Payments:** Stripe (test keys)
- **AI:** Claude Sonnet 4.5 (via Emergent LLM Key)

## Architecture (Refactored)
### Backend — Modular Routers
```
/app/backend/
├── server.py, database.py, models.py, dependencies.py
└── routes/ (auth, deals, analytics, ai, payments, notifications, integrations)
```
### Frontend — Component Composition
```
/app/frontend/src/
├── pages/ (Landing, AuthPage, Onboarding, Dashboard, Pipeline, Settings, etc.)
├── components/landing/ (HeaderMenu, HeroSection, FeaturesSection, HowItWorks, PricingSection, CTAFooter)
└── components/ (DashboardLayout, NotificationBell, ProtectedRoute, ui/)
```

## Dashboard — Tier-Gated & Personalized
| Section | Free | Essential | Pro | Enterprise |
|---------|------|-----------|-----|------------|
| Key Metrics | Yes | Yes | Yes | Yes |
| Revenue Chart | Yes | Yes | Yes | Yes |
| Pipeline Distribution | Yes | Yes | Yes | Yes |
| Churn Widget | Locked | Yes | Yes | Yes |
| CRO Widget | Locked | Locked | Yes | Yes |
| AI Insights | Locked | Locked | Yes | Yes |
| Quick Actions (full) | Partial | Partial | Full | Full |

- Locked sections show upgrade overlay with tier requirement
- Onboarding goals create "Priority" badges on relevant sections
- Subtitle shows "Focused on [goals]" when goals are set

## Pricing Tiers
| Plan | Monthly | Yearly | CTA |
|------|---------|--------|-----|
| Essential | $49/mo | $490/yr | Unlock Access |
| Pro | $99/mo | $990/yr | Unlock Access |
| Enterprise | $179/mo | $1,799/yr | Contact Sales |

## All Completed (as of March 4, 2026)
- Full app scaffolding, all core features
- Multi-provider auth (Google, Email/Password, Microsoft structure)
- Stripe payments, Claude AI integration
- Onboarding flow, Integrations page (9 tools)
- Tier-gated personalized dashboard with goal-based ordering
- Backend refactored into modular routers (8 files)
- Landing page refactored into 7 sub-components
- Pill buttons, glow streak effect, glassmorphism menu
- Microsoft auth error handling fixed
- All tests passing (100% backend, 100% frontend)

## Backlog
- **P2:** Configure Microsoft OAuth with Azure AD credentials
- **P2:** Real third-party integration OAuth flows
- **P3:** Admin dashboard for user management
- **P3:** Email notifications for at-risk clients
- **P3:** Team collaboration (invite members, share pipeline, assign deals)
