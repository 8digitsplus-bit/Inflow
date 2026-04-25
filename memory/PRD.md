# InFlow - Revenue Intelligence SaaS Platform

## Original Problem Statement
Build "InFlow", a top-tier, full-stack SaaS application for pricing optimization, sales pipeline management, and revenue intelligence. Core features include tier-gated analytics, integrations (Stripe, HubSpot, Salesforce, etc.), and AI tools.

## Tech Stack
- Frontend: React + Tailwind CSS + Shadcn UI + Recharts
- Backend: FastAPI (Python)
- Database: MongoDB
- Auth: Session cookies (httpOnly) + Google OAuth
- Encryption: AES-256 (Fernet) for API keys at rest
- AI: Claude Sonnet 4.5 via Emergent LLM Key (emergentintegrations library)

## What's Been Implemented

### Source Roles + Dashboard Filtering (Feb 2026)
- Each integration tagged with a `revenue_role`: **Revenue** (counted in revenue KPIs), **Pipeline** (open opportunities), or **Signal** (analytics-only, never in totals).
- Smart defaults: Stripe/PayPal/Xero/Shopify/QuickBooks → Revenue. HubSpot/Salesforce/Zoho → Pipeline. Mixpanel/Amplitude → Signal. Owner can override per-connection via dropdown on the integration card.
- Backend: new `PUT /api/business/connection/{platform}/role` endpoint. `GET /api/business/platforms` exposes role per connected platform.
- Analytics endpoints accept `?sources=stripe,hubspot,manual` query param — multi-select source filtering with `manual` as a sentinel for user-created deals.
- Frontend: Dashboard top has a filter **dropdown** (Filter icon + "All sources" trigger) — opens a menu with checkbox-style multi-select per connected platform (color-coded role dots), an "All sources" reset row, and a "Manual deals only" toggle. A "Clear" link appears when a filter is active. Replaced the previous pill bar (Feb 2026). Connected sources only shown.
- Backfill script applied to all existing connections.

### Integration Tier Gating + Color Consistency (Feb 2026)
- **Integration count limits**: Essential=2, Pro=4, Enterprise=unlimited. Users pick any integrations they want (no per-platform restrictions). Custom API remains Enterprise-only.
- Backend: `get_integration_limit(tier)` helper + `/api/business/integration-usage` endpoint + 403 with upgrade message on connect at limit.
- Frontend: Usage bar (e.g. "2/4 integrations"), Upgrade button when at limit, Connect buttons disabled with "Limit reached" state.
- **UI color cleanup**: Replaced all `bg-blue-*`/`from-blue-*`/`text-blue-*` with `bg-indigo-*` sitewide for brand consistency.
- Tests: `/app/backend/tests/test_tier_gating.py` (9 tests). **Full suite: 59/59 passing.**

### 5 New Live Integrations (Feb 2026)
- **PayPal** (Payments) — client_credentials OAuth2 → Orders/Transactions API → synced as deals
- **Amplitude** (Analytics) — API Key + Secret Key (Basic auth) → /api/2/users + /api/2/events/segmentation → conversion events as deals (US + EU regions). Replaced Square (Feb 2026 swap).
- **Mixpanel** (Analytics) — API Secret basic auth → events + conversion events (Purchase/Order Completed/Subscription Started) summarised as deals
- **Zoho CRM** (CRM) — refresh_token OAuth2 flow (supports all data centers: com/eu/in/com.au/jp) → /crm/v6/Deals
- **Xero** (Finance) — refresh_token OAuth2 flow → /api.xro/2.0/Invoices (ACCREC only) → invoices as deals
- Total of 10 live integrations. Frontend generic modal renders dynamic fields (text/password/checkbox) based on backend `key_fields` — no platform-specific UI code needed.
- Owner-only writes (members blocked from connecting/disconnecting/syncing).
- Tests: `/app/backend/tests/test_new_integrations.py` (7 tests). **Full suite: 50/50 passing.**

### Stripe Seat-Sync on Member Changes (Feb 2026)
- New helper `sync_stripe_seat_count(org_id)` in `/app/backend/routes/payments.py` aligns the org's Stripe subscription quantity to its current member count.
- `proration_behavior='none'` — changes apply at next renewal so owners keep paid seats through the current billing period.
- Wired into: `DELETE /api/org/members/{user_id}` (member removal), `POST /api/org/accept-invite/{token}` (new member joins), `POST /api/org/signup-and-accept/{token}` (invited signup).
- Graceful sandbox mode: detects `sk_test_emergent` key and returns `{synced: false, reason: "sandbox_mode"}` without erroring.
- Tests: `/app/backend/tests/test_stripe_seat_sync.py` (6 tests). Total suite now **43/43 passing**.

### Email 2FA via Resend (Feb 2026)
- Real email delivery replaces the previous mocked toast.
- Enable flow: toggle in Settings → dialog requests 6-digit code → user enters code → `/api/auth/2fa/enable/confirm` enables. Disabling is instant.
- Login flow: when `two_fa_enabled=True`, `/api/auth/login` returns `requires_2fa` and emails the code (never leaks it in the response). Verify screen has 6-box OTP input + "Re-send code" button.
- Backend helper `_send_2fa_code` in `/app/backend/routes/auth.py` centralises OTP generation + email.
- **Tests**: `/app/backend/tests/test_2fa_email.py` (14 tests passing). No code-leak in any response body verified.

### Team / Organization Management (Phase 1 — Feb 2026)
- Every user belongs to an **organization** (solo org by default; shared org for Enterprise teams).
- Roles: **owner** (full CRUD + billing + member management) and **member** (read access to deals/pipeline/integrations + can run AI; cannot edit or manage billing).
- Email invite flow via **Resend** (gracefully no-ops if RESEND_API_KEY not set — invite link returned in API response).
- Invite page at `/accept-invite/:token` — signup flow for new users, accept flow for logged-in matching-email users.
- Org-shared data: deals, business_connections, integrations, pricing_analyses.
- Personal per-user data: auth, agent_memory, support, notifications.
- Startup migration creates solo orgs for existing users and stamps their records with org_id.
- Enterprise Stripe checkout updates org.subscription_tier + org.seat_count.
- Endpoints: `/api/org/me`, `/members`, `/seats`, `/invites`, `/invite`, `/invite/{token}`, `/accept-invite/{token}`, `/signup-and-accept/{token}`, `/members/{user_id}` (DELETE), `/invites/{invite_id}/revoke`.
- **Tests**: `/app/backend/tests/test_org_team.py` (12 tests, all passing) + `/app/backend/tests/test_enterprise_pricing.py` (11 tests, still passing).

### Core Features
- Landing page with glassmorphism cards, dark theme
- Authentication: Email/password + Google OAuth + account chooser
- Subscription tiers: Essential ($299/mo), Pro ($699/mo), Enterprise ($260/user/month, min 1 user) with Monthly/Yearly toggle (yearly = 30% off first year)
- Stripe native SDK for recurring subscriptions with 14-day trial (falls back to one-time checkout for sk_test_emergent sandbox key)
- Enterprise per-user checkout: dynamic stepper (Minus/Plus) → ?users=N → backend multiplies plan.price × quantity (verified 11/11 pytest tests — Feb 2026)
- Privacy Policy page (/privacy)
- Favicon setup (32x32, 180x180, 192x192)

### Dashboard & Analytics
- Main Dashboard with KPI cards
- Sales Pipeline with Kanban board + drag-and-drop
- Sales Performance with radial progress rings
- Revenue Forecast with area charts, scenario modeling, radial bar chart
- Conversion Rate Optimization (CRO) with funnel visualization
- Churn Analytics
- Pricing Optimizer (automated sync from integrations)

### 4 AI Features (Claude Sonnet 4.5)
1. **AI Pricing Analysis** (`/api/ai/pricing-analysis`) — pricing strategy, margin analysis, competitive positioning
2. **AI Insights** (`/api/ai/insights`) — business intelligence insights
3. **AI Churn Prediction** (`/api/ai/churn-prediction`) — churn risk scoring and retention strategies
4. **AI CRO Recommendations** (`/api/ai/cro-recommendations`) — conversion funnel optimization

All AI responses: no emojis, clean plain-text formatting, rendered via shared AIResponseRenderer component.

### Data Visualizations
- Area Charts, Line Charts, Radial Progress Rings, CSS Trapezoid Funnels, Donut/Pie Charts, Conversion Funnel Bars
- Global color consistency via `/app/frontend/src/constants/colors.js`

### Security
- AES-256 encryption at rest for all integration API keys

### Integrations
- Stripe, Shopify, HubSpot, Salesforce, QuickBooks (encrypted user API keys)
- Google Auth (functional)
- OpenAI Sora-2 (marketing videos via Emergent LLM Key)
- Claude Sonnet 4.5 (via Emergent LLM Key)

## Prioritized Backlog

### P0 - Critical
- Implement Functional Email 2FA (currently MOCKED via toast notification)

### P1 - High Priority
- Terms of Service page (/terms)
- Further develop the 4 existing AI features (user planning)
- AI Deal Scorer, AI Revenue Copilot, AI Email Draft Generator

### P2 - Medium Priority
- Integration Health Dashboard
- Email-Scheduled Forecast Reports / Daily AI Briefing

## Key API Endpoints
- `/api/ai/pricing-analysis` - AI pricing strategy
- `/api/ai/insights` - AI business insights
- `/api/ai/churn-prediction` - AI churn risk scoring
- `/api/ai/cro-recommendations` - AI CRO recommendations
- `/api/business/connect/{platform}` - Connect integration
- `/api/deals` - CRUD for deals
- `/api/analytics/*` - Analytics endpoints

## Key Files
- `/app/backend/routes/ai.py` - All 4 AI endpoints
- `/app/frontend/src/components/AIResponseRenderer.js` - Shared markdown renderer
- `/app/frontend/src/constants/colors.js` - Global chart colors
- `/app/backend/utils/crypto.py` - AES-256 encryption

## Test Credentials
- Email: testpro@test.com / Password: password (Pro plan)
- Email: testdemo@inflow.com / Password: password (Demo account)
