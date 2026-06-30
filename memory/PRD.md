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

### Landing Ambient Glows → Glass (Jun 2026) — UI
- Converted all large soft ambient background glows on the landing page from indigo/cyan to neutral glass-white to match the glass aesthetic: `HeroSection.js` (3 corner glows + dashboard-preview halo + shadow), `CTAFooter.js` (CTA radial + 2 footer glows; swapped the shared `hero-glow` class for an inline white radial so non-landing pages using `.hero-glow` are unaffected), `HowItWorks.js` integrations-panel glow. Neutralized the landing-only `@keyframes pulse-glow` to white. Brand text gradient & buttons intentionally left as-is. Hero verified visually; compiles clean.

### Cards — Features & Custom Integration (Jun 2026) — UI
- Shared `/app/frontend/src/components/ui/gradient-card.jsx` now renders a centered animated glass card (21st.dev port): dark `from-[#010101] via-[#090909]` gradient glass, animated white ambient blobs (`animate-bounce`/`animate-ping`), pinging icon rings, hover scale + slight rotate + shine sweep, gradient title, divider + 3 bouncing dots, corner accents on hover. Made responsive (`w-full` instead of fixed 350px). Same prop API (`icon` component, `title`, `description` string|array, `badge`, `className`) so `FeaturesSection.js` (6 cards) and `HowItWorks.js`→`CustomIntegrationSection` (4 + wide Custom API card) update automatically. Verified via temp preview route (removed); compiles clean.


### Checkout Page Glass UI Revamp (Jun 2026) — P0 conversion funnel
- Rebuilt `/app/frontend/src/pages/Checkout.js` to match the sitewide white-on-glass aesthetic (Hero/Pricing/Auth): translucent `bg-white/[0.04]` backdrop-blur order-summary card, glass halos, white circle ticks (replacing emerald), dropped indigo accents, Framer Motion blur-in reveals, ambient glows. Columns aligned with `items-start`.
- LIVE Stripe Embedded Checkout fully preserved: `fetchClientSecret()` → `POST /api/payments/create-checkout` {plan, origin_url, users}; `EmbeddedCheckoutProvider`/`EmbeddedCheckout` kept on a clean light card (Stripe's embedded UI is light-themed and not controllable). Trial/seat math and all `data-testid`s unchanged.
- Verified (testing_agent iteration_38, 100% frontend): glass UI renders, Stripe iframe mounts (js.stripe.com), pro_yearly+3 / essential_monthly+1 scenarios, back-btn → /choose-plan, no layout overlap at 1920x800. Backend verified via curl (login → /api/auth/me → create-checkout returns client_secret).


### In-App Legal Update Notifications (Jun 2026) — P0 compliance
- Logged-in users are notified in-app when a legal document (Terms, Privacy, Cookie Policy) changes.
- Backend (`/app/backend/routes/legal.py`): versions tracked per doc in `db.legal_documents` via a content-hash of the visible text fetched from Termly (auto-bumps `version` + `effective_date` when wording/date changes). Per-user acknowledgement stored in `users.legal_ack` (`{doc_type: version}`).
  - `GET /api/legal/updates` (auth) → returns docs whose current version is ahead of the user's ack. First-ever call silently brings the user current (no day-one banner).
  - `POST /api/legal/ack` (auth) → records ack for given `doc_types` (or all).
  - `GET /api/legal/policy/{id}` → sanitised Termly HTML for in-page dark-theme rendering.
- Frontend: dismissible banner `/app/frontend/src/components/LegalBanner.js`, mounted in `DashboardLayout` (below `TrialBanner`). Shows "We've updated our …" with per-doc Review links (open in new tab) + "Got it" (acks via API, removes banner) + X (session-dismiss only). Scope per user choice = simple banner (no email blast, no blocking re-acceptance modal).
- Tests: `/app/backend/tests/test_legal_notifications.py` (6 pass). Verified E2E in UI (banner appears, Review links, "Got it" clears).


### Login Rate Limiting (Feb 2026) — P0 security
- Two-layer brute-force protection on all auth endpoints using slowapi (in-memory).
  - **IP throttle** (slowapi decorators, honours `X-Forwarded-For` from Cloudflare/Railway):
    - `/api/auth/login`, `/api/auth/2fa/verify`: 10 / 15 minutes
    - `/api/auth/session`: 10 / minute (Google OAuth)
    - `/api/auth/register`: 5 / hour
    - `/api/auth/2fa/resend`: 3 / 5 minutes
  - **Email throttle** (`utils/rate_limit.check_email_rate_limit`, in-memory rolling window):
    - 5 failed login attempts per email per 15 minutes → 429 with `Retry-After`
    - Counter resets on a successful credential check (`reset_email_attempts`)
- Friendly 429 response bodies surfaced to the UI via existing `AuthContext.safeJson` flow.
- New module: `/app/backend/utils/rate_limit.py`. Storage is in-process — swap `Limiter(storage_uri="redis://...")` when scaling to multiple Railway replicas.
- Verified via curl: 6th failed attempt for same email → 429; 11th attempt from same IP → 429 (persistent across emails).



### Authenticated Customer Centre Agent (Feb 2026)
- New protected page at `/customer-centre` powered by Claude Sonnet 4.5: logged-in customers chat with **Flow AI** to manage their account.
- Endpoints (auth required): `POST /api/customer/agent/{start,chat,approve,cancel}` — multi-step with explicit Approve/Cancel before any action executes.
- 5 action types wired to existing APIs:
  - `cancel_subscription` → flips both `users.subscription_tier` and `organizations.subscription_tier` to cancelled, calls Stripe Subscription.cancel
  - `open_billing_portal` → returns one-shot Stripe Customer Portal URL (owner-only)
  - `invite_member` → delegates to existing `routes.organizations.invite_member` (Enterprise-only)
  - `escalate` → forwards typed `{subject, body}` to `hello@inflow.io`
  - `navigate` → soft action; agent recommends an existing app page (e.g. `/connect-business`)
- Account context (tier, seats used, pending invites, integrations connected, owner role) is computed each turn and injected into Claude's system prompt, so the agent answers factually without hallucinating.
- Frontend: `/app/frontend/src/pages/CustomerCenter.js` (chat UI inside `DashboardLayout`), sidebar entry "Customer Centre" added to Tools group.
- `/contact` (visitor agent) is unchanged. `/settings` UI remains as the canonical clickable interface.
- Tests: `/app/backend/tests/test_customer_agent.py` (13 tests pass — incl. real cancel mutation w/ restore, 401 unauth, 403 non-owner cancel, escalate persistence).


### Agentic Contact Assistant on /contact (Feb 2026)
- Replaced the static contact form with a chat-first agentic AI on `/contact`. Visitor chats with Claude Sonnet 4.5; the agent classifies intent (`sales` / `support` / `refund` / `billing` / `other`), holds multi-turn memory, drafts replies, and proposes one of two actions: `send_reply` (Resend email reply) or `escalate` (forward to `hello@inflow.io`).
- **Human-in-the-loop**: agent NEVER auto-executes. Every action is proposed to the visitor inline; visitor clicks Approve / Edit / Cancel. Composer is disabled while a pending action exists.
- Endpoints: `POST /api/contact/agent/{start,chat,approve,cancel}` (public, rate-limited 30 user messages/IP/hour).
- Persistence: `db.contact_chat_sessions` (session metadata + pending_action + completed_actions[]), `db.contact_chat_messages` (full chat log).
- Graceful Resend fallback: if email send fails (e.g., free-tier domain restriction), the backend auto-forwards the draft to the escalation inbox so no message is lost.
- Frontend: Tailwind chat UI with bot avatar, typing dots, ActionCard with editable To/Subject/Body, success/cancel chips. Hamburger menu + footer link both route to `/contact`.
- Tests: `/app/backend/tests/test_contact_agent.py` (8 tests pass).


### No-Card Free Trial Model (Feb 2026)
- 14-day free trial = email signup only, **no credit card required**. User lands on `/dashboard` immediately after signup with `subscription_tier='trial'` and `trial_ends_at = now + 14 days`.
- When trial expires, `subscription_tier` auto-flips to `'expired'` on next `/api/auth/me` call. Blocking upgrade popup appears (non-dismissible, forces plan selection or logout).
- **Stripe paid trial removed**: `trial_period_days=14` stripped from `create_subscription_checkout` in `payments.py`. Paid plans now charge immediately on checkout.
- Landing page CTAs (Hero, Header, Pricing cards) no longer pre-select a plan for unauthenticated visitors — they all route to `/auth` for a free-trial signup. Paid-plan selection happens from inside the app.
- `TrialNotification` popup shows at 7/3/1/0 day milestones with progress bar and "View Plans & Upgrade" CTA.
- Copy updated: FAQ, ChoosePlan header, CheckoutReturn success page.
- Tests: `/app/backend/tests/test_no_card_trial.py` (3 tests pass).


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
