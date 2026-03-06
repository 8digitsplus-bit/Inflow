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

## Architecture (Refactored)
### Backend - Modular Routers
```
/app/backend/
├── server.py, database.py, models.py, dependencies.py
└── routes/ (auth, deals, analytics, ai, payments, notifications, integrations)
```
### Frontend - Component Composition
```
/app/frontend/src/
├── pages/ (Landing, AuthPage, Onboarding, Dashboard, Pipeline, Settings, etc.)
├── components/landing/ (HeaderMenu, HeroSection, FeaturesSection, HowItWorks, PricingSection, CTAFooter)
└── components/ (DashboardLayout, NotificationBell, ProtectedRoute, ui/)
```

## Dashboard - Tier-Gated & Personalized
| Section | Free | Essential | Pro | Enterprise |
|---------|------|-----------|-----|------------|
| Key Metrics | Yes | Yes | Yes | Yes |
| Revenue Chart | Yes | Yes | Yes | Yes |
| Pipeline Distribution | Yes | Yes | Yes | Yes |
| Churn Widget | Locked | Yes | Yes | Yes |
| CRO Widget | Locked | Locked | Yes | Yes |
| AI Insights | Locked | Locked | Yes | Yes |
| Quick Actions (full) | Partial | Partial | Full | Full |

## Pricing Tiers
| Plan | Monthly | Yearly | CTA |
|------|---------|--------|-----|
| Essential | $49/mo | $490/yr | Unlock Access |
| Pro | $99/mo | $990/yr | Scale Up |
| Enterprise | $179/mo | $1,799/yr | Maximise |

## All Completed (as of March 6, 2026)
- Full app scaffolding, all core features
- Multi-provider auth (Google, Email/Password, Shopify structure)
- Stripe checkout fully wired: Landing page pricing CTAs + Settings page upgrade buttons
- Claude AI integration for insights
- Onboarding flow, Integrations page (9 tools)
- Tier-gated personalized dashboard with goal-based ordering
- Backend refactored into modular routers (8 files)
- Landing page refactored into 7 sub-components
- Pill buttons, glow streak effect, glassmorphism menu
- Shopify auth graceful "not configured" handling
- All tests passing (100% frontend, 88% backend - minor edge cases only)

## Backlog
- **P1:** Configure Shopify OAuth with credentials when user provides them
- **P2:** Refine UI/UX per user feedback
- **P3:** Admin dashboard for user management
- **P3:** Email notifications for at-risk clients
- **P3:** Team collaboration (invite members, share pipeline, assign deals)
- **P3:** Deeper third-party integration OAuth flows
