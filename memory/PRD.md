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

### Plan-based scheduled sync — Sync page (Oct 2026) — verified iteration_76/77
- Modes by org tier (`organizations.subscription_tier`): essential → weekly (user day + time + timezone), pro + trial → daily (user time + timezone), enterprise → "real-time" = every 15 min (true webhooks = later phase per user), expired/cancelled/free → off. Manual "Sync now" kept on every plan.
- `routes/sync_schedule.py`: `sync_schedules` (org_id unique; enabled, weekday 0=Mon, time HH:MM, timezone IANA, mode, next_run_at, locked_until, last_*), `sync_runs` (run_id, trigger schedule|manual, status ok|partial|failed|nothing|running|interrupted, per-integration results). `_target()` maps each connection to the EXISTING sync fn (sync_platform / sync_custom_source / scalekit_sync / zoho_sync / qbo_sync) called with the org owner User. Atomic claim on next_run_at + lock (30 min, heartbeat per connection); due loop re-checks plan (off → skip). Realtime manual runs push next_run +15m. Stale 'running' healed to 'interrupted'.
- API: `GET /api/sync/settings`, `PUT /api/sync/settings` (owner; validates time/weekday/timezone; off-mode 403), `POST /api/sync/run-now` (owner; 409 if running).
- Scheduler: in-server loop `_sync_scheduler` (server.py, every 60s) — chosen because prod backend is on Railway (Emergent crons don't run there). `_ensure_schedules` every 10 min creates schedules for orgs with connections + syncs mode with plan.
- Frontend: sidebar "Sync" (/sync, `pages/Sync.js` + `components/sync/*`), Settings "Data sync" card → /sync. Realtime toggle saves instantly; weekly/daily use Save; timezone pre-filled from browser with note.

### Featurebase support + Priority Support removed (Oct 2026) — verified iteration_74/75
- User decision: NO Priority Support for closed beta (1-person team). "Priority support" removed from payments.py plan features, ChoosePlan, PricingSection, TierGate, and from AI prompts (support.py rule 6: same support on every plan; contact.py SUPPORT section; agent.py never mention it). Smart Assist "Priority" badge removed.
- Support model: Smart Assist (InFlow AI) first + "Talk to a human" → Featurebase Messenger (default launcher hidden). Old ticket UI (Create Ticket / Tickets tab / modal) removed from Support.js; backend ticket endpoints + agent escalate_to_ticket kept (internal record) — escalation card now has "Talk to a human" (pre-filled message).
- Backend `GET /api/support/featurebase-token` (auth) → HS256 JWT {userId, email, name, plan, companies:[{id: org_id, name}], iat, exp 24h} signed with `FEATUREBASE_JWT_SECRET`. NOTE Featurebase requires companies[].id (companyId → 401 Invalid featurebaseJwt).
- Frontend: `components/FeaturebaseBoot.js` (in App.js) mounts FeaturebaseProvider (appId `REACT_APP_FEATUREBASE_APP_ID`, hideDefaultLauncher, dark) + useFeedbackWidget(placement 'right') only for logged-in users once they hit a non-public route; keyed by user_id; unmounts on logout. `lib/featurebase.js talkToHuman()` → show()/showNewMessage() if window.Featurebase is the real dispatcher (no `.q`) or a featurebase iframe exists, else toast + mailto:hello@inflowft.com.
- Gotcha: Termly autoBlock blocks https://do.featurebase.app/js/sdk.js until cookie Accept → user must classify featurebase.app as Essential in Termly. Featurebase org slug "inflow"; user still to add custom attribute "plan" + enable Feedback module/boards.
- Prod: Railway `FEATUREBASE_JWT_SECRET`; Vercel `REACT_APP_FEATUREBASE_APP_ID` + redeploy.

### Removals (Oct 2026) — verified iteration_73 (backend 12/12, frontend 100%)
- Integrations removed: Microsoft Dynamics 365, Google Sheets, Intercom (PLATFORMS entries, connect handlers, sync/test branches in business.py; modules dynamics/sheets/intercom_integration.py deleted; revenue role map + /api/integrations google_sheets entry removed). No connections existed.
- Revenue Execution → standalone "Workspace" (Action Workspace page /workspace, pages/Workspace.js) removed from sidebar + routes. KEPT: per-account deal room /workspace/account/:leadId (High-Intent "Manage account") and all backend /api/workspace/* endpoints (deal room + CRM push use them).

### QuickBooks — InFlow's own one-click Intuit OAuth (Oct 2026) — verified iteration_72 (backend 23/23, frontend 100%)
- Replaces Scalekit QuickBooks AND the old paste-access-token form (removed from business.py PLATFORMS). Scalekit now ONLY serves Stripe (user chose to keep Stripe on Scalekit; CONNECTORS={"stripe"}).
- `routes/quickbooks_integration.py` (router): `GET /api/integrations/quickbooks/status|start|callback`, `POST /sync|/disconnect`. State in `qbo_oauth_states` (single-use, 10 min). Tokens via Basic auth at oauth.platform.intuit.com; rotating refresh token persisted on EVERY refresh under per-connection asyncio.Lock; access token cached encrypted on the row (`access_expires_at`); invalid_grant → status REAUTH_REQUIRED. Import: `SELECT * FROM Invoice STARTPOSITION n MAXRESULTS 1000` (10 pages, minorversion 75) → paid=closed_won, overdue=negotiation, due=proposal. Connection: platform=quickbooks, provider=`qbo_oauth`, realm_id, sandbox. Callback replaces older quickbooks rows (scalekit/native) + scalekit deals.
- Env: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` (Intuit DEVELOPMENT keys → sandbox companies only), `QBO_SANDBOX=true`. Redirect `{APP_BASE_URL}/api/integrations/quickbooks/callback` (preview registered by user).
- Go-live: complete Intuit app assessment questionnaire → production keys; set QBO_SANDBOX=false + production keys; add `https://www.inflowft.com/api/integrations/quickbooks/callback` in Intuit Production settings.
- Frontend: QuickBooks + Zoho are `direct:true` cards (DIRECT_IDS, per-connector status map, `<id>` / `<id>_error` return params).

### Zoho CRM — InFlow's own one-click OAuth, Multi-DC (Oct 2026) — verified iteration_71 (backend 22/22, frontend 100%)
- Why: Scalekit's Zoho connector failed for UK-DC accounts (user's org is crm.zoho.uk) — both Scalekit test portal and InFlow stuck at PENDING_AUTH. Scalekit Zoho removed (CONNECTORS = quickbooks, stripe).
- `routes/zoho_integration.py` (router): `GET /api/integrations/zoho/status|start`, `GET /callback` (state in `zoho_oauth_states`, single-use, 10 min; code exchanged at the callback's `accounts-server` (allowlisted hosts incl. accounts.zoho.uk); refresh token encrypted; API calls to returned `api_domain`), `POST /sync`, `POST /disconnect` (revokes token). Connection row: platform=zoho, provider=`zoho_oauth`, accounts_server, instance_url=api_domain, location. Callback replaces any old zoho rows; imports deals (`/crm/v8/Deals`, 200/page, 10 pages) via apply_sync(provider zoho_oauth).
- `utils/crm_auth.py`: zoho → `refresh_access` at stored accounts_server (50-min cache, `remember`/`forget`). `zoho_write.py` restored to direct REST v8 (notes/tasks/calls/deals/offers, targets, stage picklist).
- Env: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` (user's Zoho API Console server-based client "Inflow", Multi-DC enabled, all regions). Redirect URI = `{APP_BASE_URL}/api/integrations/zoho/callback`.
- Frontend `ConnectBusiness.js`: Zoho card in One-Click OAuth ("Direct sign-in · all Zoho regions", "Connect Zoho CRM", no finalize link), `oauthBase()` routes zoho → /api/integrations/zoho; return params `zoho` / `zoho_error`.
- PENDING USER: add preview redirect `https://revenue-exec.preview.emergentagent.com/api/integrations/zoho/callback` in Zoho console (only live `https://www.inflowft.com/api/integrations/zoho/callback` added so far), then real sign-in test. Production needs APP_BASE_URL=https://www.inflowft.com + ZOHO_* env + redeploy. User can delete the unused Scalekit `zohocrm-S0Y2ARN4` connection.

### QuickBooks via Scalekit — LIVE (Oct 2026)
- Fixed import: QuickBooks query API requires paging; `_quickbooks_invoices` in `routes/scalekit_integration.py` now pages `quickbooks_invoices_list` with `start_position`/`max_results` (1000/page, max 10 pages). testpro synced 34 real sandbox invoices ($12,024.14). The 6 SAMPLE QuickBooks deals were removed (backup: `/app/memory/backup_testpro_sample_quickbooks_deals.json`).
- Scalekit status (Dev env): Stripe ACTIVE (synced), QuickBooks ACTIVE (synced), Salesforce PENDING_AUTH (needs own Connected App creds). None configured in a Scalekit Production environment yet.

### Upsell Engine rework — Feature 2: High-Intent Buyers hub (Oct 2026) — verified iteration_68 (backend 32/32, frontend 100%)
- `/discover` (`pages/HighIntent.js`) REPLACED the old 6-step guided flow with a **4-tab hub**: Intent Profiles · Speed-to-Lead · Agent Briefings · Red-Carpet Storefronts (`?tab=` deep-link). Components in `frontend/src/components/intent/`. Per-account "Manage" deal room (`/workspace/account/:leadId`) kept (profiles still live in `db.intent_leads`).
- **Intent data cloud** (`routes/intent_engine.py`): `ingest_events` unifies signals from (a) embeddable snippet (`/api/public/intent/{ingest_key}/snippet.js` — page views classified by org URL patterns, PDF/whitepaper clicks, form submits capture email, `inflow.identify/track`), (b) Events API (`POST /api/public/intent/events`, header `X-InFlow-Key`), (c) analytics pull (`POST /api/intent/sync-analytics` — PostHog HogQL, Mixpanel export, Amplitude export, GA4 runReport w/ `customUser:inflow_account`; `routes/intent_sources.py`), (d) hosted storefront page, (e) test signals (`/intent/events/simulate`). Identity resolution: company → known profile by email domain → domain; anonymous visitor ids stitched on identify. Score = decayed digital weights (7-day half-life, cap 70) + CRM stage/probability (cap 30) + product usage (10); tiers hot ≥70 / warm ≥40; `surge` flag.
- **Speed-to-Lead** (`routes/intent_routing.py`): AE roster (territories, deal band, CRM owner ids), trigger rules (event types within window + min score/value, AE pool), round-robin by oldest `last_assigned_at` with eligibility filter. Routing fires immediately on ingest (asyncio task) + 3s safety worker (`process_intent_routing_once` in `server.py`). Deliveries: Resend email to AE, Slack webhook (shared `outreach_settings`), CRM HIGH task w/ owner (HubSpot/Salesforce/Pipedrive). `intent_routing_log` with latency (trigger received → assigned) + median/SLA stats. Manual assign + re-route.
- **Agent Briefings**: Claude (`routes.ai._ai_cards`, claude-sonnet-5-5) briefing — headline, summary narrating the exact intent sequence, buying stage, call script (opener, discovery Qs, value points, objections, close), recommended offer; deterministic `sequence` from events; template fallback. Auto-generated after routing.
- **Red-Carpet Storefronts** (`routes/storefront.py`): rules (audience: min score / events / named accounts → headline, message, pre-approved discount %, custom contract terms, CTA, validity). Snippet personalizes the owner's pricing page (`data-inflow-*` slots, discounted `data-inflow-price`, `inflow_promo` input, or injected glass banner) via public `/personalize` (ACAO *). Hosted per-account quote page `/rc/:token` (`pages/RedCarpetQuote.js`) with quote form → stored request + `quote_request` event + AE email. Discounts pushed to the org's connected Stripe as **real Coupon + Promotion Code** (`promotion: {type: coupon}`; StripeClient v1).
- **Push to integration**: `POST /api/intent/profiles/{id}/push {destination: hubspot|salesforce|pipedrive|slack, kind: assignment|briefing|offer}`.
- New collections: `intent_events`, `intent_visitors`, `intent_tracking` (ingest key, patterns, app_origin), `intent_aes`, `intent_routing_rules`, `intent_routing_log`, `storefront_rules`, `storefront_links`, `storefront_quote_requests`. Seed: `backend/seed_intent_cloud.py` (SAMPLE events for testpro). Tests: `backend/tests/test_intent_cloud.py` (32). Old guided-flow endpoints + `test_high_intent*.py` removed.

### Dashboard shell + Settings redesign (Jun 2026)
- **Main Dashboard** (`Dashboard.js`): redesigned to the "Layro" ChartCard system — new reusable chart library `components/charts/LayroCharts.js` (ChartCard, AreaTrend, BarCompare, DonutBreakdown, Sparkline, KpiCard) themed to our shadcn tokens (dark, `--chart-1…5` electric-blue/emerald/cyan/violet/amber; colors resolved to literal HSL for reliable Recharts rendering). KPI cards (Closed Revenue shows real MoM delta + sparkline), Revenue trend = AreaTrend (revenue+forecast), Pipeline by stage = DonutBreakdown. Recent deals / Customer health / Conversion / AI insights / Quick actions wrapped in ChartCards; tier-gating, source filter, and AI insights all preserved. Verified via screenshot.
- **Sales Revenue** (`SalesRevenue.js`): redesigned to a clean shadcn dashboard (4 stat cards, full-width Revenue-vs-Target area chart, Top-accounts progress list + Revenue-mix donut) using theme tokens; flat per-workspace pricing. Verified via screenshot.
- **Sidebar** (`DashboardLayout.js`): rebuilt as an Aceternity-style hover-expand rail (64px icon rail → 280px overlay on hover, framer-motion), dark #0052ff glass theme; groups always-expanded when open, tier-lock icons, active blue bar; full-screen slide-in drawer on mobile. Favicon mark removed from the header; InFlow wordmark moved to the footer.
- **User profile menu** (`UserMenu.js`): account menu now lives at the **top (header)** of the sidebar. Popover auto-flips (opens downward from the header), bottom sheet < 640px, sliding highlight + keyboard nav. Items: **Settings** + Sign out (Sign out routes through the existing confirm dialog). "Manage Plan"/"Integrations" items removed per user; the Tools nav group's "Settings" item removed (now only in the profile menu).
- **Settings page** (`Settings.js`): redesigned to a two-column glass card (GlassAccountSettingsCard reference) — Left: Security (email + 2FA toggle) & Renewal (auto-renew); Right: Current plan (real flat per-workspace price, feature list, Cancel + **Manage plan → /choose-plan**) & Billing (invoices/payment via Stripe portal). Inline 3-plan grid removed (use /choose-plan). Product-update-email toggle intentionally omitted. All wiring preserved (2FA, auto-renew, cancel, Stripe portal, checkout-return polling). Standalone Sign out removed (in profile menu). Verified via screenshots.

### Upsell Engine rework — Upgrade Outreach Workspace (Jun 2026)
- `/upsell` (`UpsellEngine.js`): the "Upsell candidates" list is now a **cohort-style table** (mirrors the Churn page's Cohort Retention table) with columns Account / Expansion signals / Score / Expansion-per-yr / Actions, keeping the 3 row actions (Upgrade email / Create offer / Notify sales) + Dismiss + campaign-select checkbox.
- "Upgrade email" now **navigates to a dedicated in-app Outreach Workspace** at `/upsell/outreach?candidate={id}` (new page `OutreachWorkspace.js`) instead of opening a dialog. "Create offer" and "Notify sales" still use their dialogs.
- Outreach Workspace features: **Intent-driven category tabs** (Priority Pipeline / Sales / Marketing, derived from expansion score, with per-tab counts + manual move); **behavioral labels** (built-in: Upgrade Potential, Hot Lead, High Value, Nearing Limit, Churn Risk — derived deterministically from signals + real deal health; plus org-configurable **keyword→label triggers**); **AI-drafted upgrade email** (Claude, human-in-the-loop edit) with a **paste-links** section; **@ assignee routing** (teammate datalist + free external email); **integration hover actions** (Slack alert via Incoming Webhook + push to HubSpot/Salesforce as a task/note); **Strategic Undo-Send delay** (user-configurable 10/30/60s) implemented as a **backend queued send** dispatched by a startup background worker (`process_outbound_queue_once` every 3s) so it fires even if the page is closed, with an in-UI countdown + Undo (cancel) banner.
- Backend: new `routes/outreach.py` (board, draft, patch, schedule-send, cancel-send, slack-config, slack-alert, push-crm, label-rules). New collections: `upsell_outbound_queue`, `outreach_settings` (encrypted Slack webhook), `outreach_label_rules`. Candidate docs gained `category`, `assignee`, `links`, `manual_labels`, `removed_labels`, `draft_subject`, `draft_body`. Worker registered in `server.py` startup; cancelled on shutdown.
- Integrations: Slack via **Incoming Webhook URL** (encrypted at rest); CRM push reuses `hubspot_write`/`salesforce_write`. Emails via existing Resend util.
- Verified: backend via curl (draft/patch/labels/undo-send queue + real worker dispatch/slack validation/CRM push all pass); frontend via testing_agent `iteration_67.json` — 100% (13/13 scenarios), no functional bugs.

### Revenue Execution "Action Workspace" redesign (Jun 2026)
- Redesigned `/workspace` (`Workspace.js`) blending two user-provided references — Taskey (dark List/Kanban/Timeline view-switcher + execution progress bar) and Neue AI (KPI stat-card row + activity area/line chart) — kept fully in InFlow's dark electric-blue (#0052ff) glassmorphism.
- KPI cards (Pipeline Influenced, Revenue Pushed, Actions Executed, Offer Win-Rate) and the 14-day Execution Activity chart are DERIVED FROM REAL `/api/workspace/actions` data (created_at, payload.amount, status) — no fabricated numbers.
- Action queue now renders in 3 views (List / Kanban-by-status / Timeline-by-day) via a framer-motion view switcher. ALL prior functionality preserved: 6-type composer (note/task/call/email/deal/offer), AI draft, save-as-draft, review-&-push human-in-the-loop confirm modal, owner write-gating, empty state.
- Verified by testing_agent `iteration_64.json` — 100% frontend pass, no UI/integration/design bugs. Minor: 2 console hydration warnings from Emergent visual-editor span wrappers around native `<select>` (instrumentation, not an app bug).
- Design blueprint saved at `/app/design_guidelines.json`. Libs: recharts 3.6, framer-motion 12.34 (already installed).


### Scalekit AgentKit one-click OAuth (QuickBooks/Salesforce/Intercom) — REST, corrected API (Jun 2026)
- Prior REST plumbing was written against an ASSUMED Scalekit API and did not work. Rewrote key parts of `routes/scalekit_integration.py` against the VERIFIED live REST API:
  1. Create connected account FIRST: `POST /api/v1/connected_accounts` body `{"connected_account":{}, "connector":<name>, "identifier":<org_id>}` — the `connected_account` wrapper is REQUIRED (409 = already exists = fine).
  2. Magic link: `POST /api/v1/connected_accounts/magic_link` `{connector, identifier, state, user_verify_url}` → `{link}`.
  3. Custom user-verification callback `/api/integrations/scalekit/verify?auth_request_id&state`: `POST /api/v1/connected_accounts/user/verify {auth_request_id, identifier}`, then `GET /api/v1/connected_accounts/details?connector&identifier` for {id,status}, store + import.
- Connection `connector` = the dashboard connection key_id (usually `quickbooks`/`salesforce`/`intercom`). Overridable via env `SCALEKIT_CONNECTION_{QUICKBOOKS,SALESFORCE,INTERCOM}`.
- `/api/integrations/scalekit/status` returns `{configured, connectors, connected:{...}}`. `start` returns a friendly "create the connection in AgentKit → Connections" message when a connector isn't provisioned.
- Frontend `ConnectBusiness.js`: new "One-Click OAuth (Beta)" section — "Connect (via Scalekit)" + Re-sync per connector; handles `?scalekit=`/`?scalekit_error=` return params.
- Env: DEV/sandbox creds live in backend/.env (`SCALEKIT_ENVIRONMENT_URL` ends in `.scalekit.dev`). Client-credentials token exchange verified working; `status` returns configured:true.
- BLOCKER (user-side): the Scalekit env has NO AgentKit connectors yet (only SSO Passwordless/WebAuthn/Google exist). User must create QuickBooks/Salesforce/Intercom connections in **AgentKit → Connections** and set **User Verification = Custom user verifier**. Live OAuth round-trip is UNTESTED until then.


### Beta onboarding polish — HubSpot connect UX (Jun 2026)
Also validated the full HubSpot 2-way flow live with a real (EU sandbox) Private App token: import worked, and a real note write-back succeeded (`/workspace/actions` → execute → HubSpot note id created). Confirmed the beta model = each org connects its own non-expiring Private App token (no shared key, no OAuth build needed for a ≤10-user closed beta).
Three connect-UX fixes (all self-tested via curl + screenshots):
1. **Fixed broken HubSpot "instructions" link** — `business.py` HubSpot `key_help_url` pointed at `https://app.hubspot.com/private-apps/` (no portal ID → HubSpot 404). Repointed to the one confirmed-live official page (`developers.hubspot.com/docs/apps/developer-platform/build-apps/create-an-app`) and updated `key_help_text` to include the required CRM read+write scopes. (Note: HubSpot sunset legacy private-app UI creation Sept 2026 and reorganized docs — most other candidate URLs are dead.)
2. **In-app setup walkthrough** — `ConnectBusiness.js` connect modal now has an expandable "How to get your HubSpot token" (`SETUP_GUIDES` map, `setup-guide-toggle`): numbered steps for the Settings→Private Apps path + a CLI/Projects alt path with exact `hs` commands.
3. **Honest connect-modal copy** — replaced the blanket "We never modify your account" with a write-capable-aware message (`WRITE_CAPABLE = hubspot/salesforce/pipedrive`): "…used to read your data. Any changes back to {platform} only happen when you explicitly confirm them in Workspace."
4. **"Test connection" button** — new read-only backend `GET /api/business/test/{platform}` (owner-only; live `validate_hubspot_key` check for HubSpot, no re-import) + green **Test** button (`test-{platform}`) on connected cards → toast "✅ {platform} connection is healthy — N records synced."

### Audit batch — routing/security/UX fixes (Jun 2026) — forked job, verified iteration_63
Actioned a 13-item system audit. IMPORTANT: 4 "critical" items were ALREADY implemented by prior round-3 work and only needed regression confirmation — #4 Stripe webhook now rejects unsigned payloads (500 if secret unset / 400 on bad sig, no unsigned fallback), #5 telemetry leak guards (approve = terminal-state block + atomic `find_one_and_update` claim; dismiss = `status:"open"` filter guard), #6 subscription single-source-of-truth (both webhook branches sync `db.organizations`; `require_paid` reads the org), #9 RevenueForecast `Number(x.trim())` + `isFinite && >0` (rejects `-5000`, parses `1e9`). All confirmed PASS.
New code changes this session:
1. **#1 Reverted the High-Intent/Upsell label swap** so heading = nav = route = code. `DashboardLayout.js`: `/discover`→"High-Intent Buyers" (Telescope, minTier1), `/upsell`→"Upsell Engine" (Rocket, minTier3). `HighIntent.js` (buyer-detection code, route /discover) H1/eyebrow/section → "High-Intent Buyer Detection" / "· High-Intent" / "High-intent opportunities". `UpsellEngine.js` (upsell code, route /upsell) → "Upsell Engine" / "· Upsell" / "Upsell candidates". (This overrides the earlier deliberate swap, per user request 'option a'.)
2. **#2 Source maps hard-killed** — `craco.config.js` webpack.configure now sets `webpackConfig.devtool = false` when `NODE_ENV==='production'` (authoritative kill-switch independent of the `GENERATE_SOURCEMAP` env flag). Verified: `yarn build` emits **0 `.js.map` files**. NOTE: the LIVE site must be redeployed for this to take effect on production.
3. **#3 Auth bootstrap cookie fix** — `AuthContext.js` `checkAuth()` no longer short-circuits on a missing `inflow_authed` localStorage flag; it ALWAYS calls `/api/auth/me` so a valid 7-day httpOnly session authenticates even after localStorage is evicted/cleared (Safari ITP, privacy mode). The flag is now a UX hint only. Verified: `localStorage.clear()` + reload keeps the user logged in.
4. **#7 Real churn/retention deltas** — removed hardcoded `+2.3%` / `-1.2%` JSX literals. `analytics.py get_churn_analytics` computes `retention_delta`/`churn_delta` from real closed-deal activity (last 30d vs prev 30d), returning `null` when either window has no data. `ChurnRetention.js` `DeltaChip` renders the signed delta (green/red by direction, "vs prev 30d") or nothing — a zero-customer account never shows a fabricated trend.
5. **#10 Empty-state CTAs** — new `components/ConnectDataCTA.js` ("Connect a data source" glass banner → `/connect-business`) wired into Dashboard (`dashboard-empty-cta` when 0 deals), Pipeline (`pipeline-empty-cta`), CRO (`cro-empty-cta` when 0 opportunities), Churn (`churn-empty-cta` when 0 customers), Revenue Leaks (`leaks-empty-cta` when 0 contracts+leaks). Distinguishes a new account from a broken sync. (Churn CTA only reachable by paid tiers since /churn is tier-gated — acceptable.)
6. **#11 Deal write access broadened** — `deals.py`: create allowed for ANY org member (becomes assigned owner = `deal.user_id`); update/delete allowed for the workspace owner OR the deal's assigned owner via `_can_write_deal`, else 403. Owner CRUD regression PASS.
7. **#12 Unambiguous support dates** — `Support.js` conversation/ticket dates now `toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})` → "18 Jun 2026" (no more `04/09/2026`).
- **#8 (cookie consent SPA reset)**: no code change — Termly loads once via a static `<script>` in `index.html`; there is NO per-route re-injection anywhere in our code (grep-confirmed). The banner persists across SPA navigation rather than re-rendering. (Repeated appearances in the preview iframe are third-party-storage partitioning, not a code defect.)
- **#13 (slow test suite)**: DEFERRED per user (option b) — dev-only, not user-facing.



### State-machine, auth-2FA & multi-tenancy hardening — round 3 (Jun 2026) — P0
Across `dependencies.py`, `auth.py`, `telemetry.py`, `deals.py`, `models.py`, `server.py`, `AuthContext.js`, `AuthPage.js`:
1. **Org = single source of truth** (`dependencies.py` `require_paid`): removed the `user.subscription_tier` fallback; strict org lookup, `HTTPException(500)` if org missing. (Sandbox webhook already syncs org tier from a prior round.)
2. **Trial rounding in the login path** (`auth.py` `_create_session_and_respond`): replaced the last `(end - now).days` truncation + duplicated block with the shared `apply_trial_status()` (ceil rounding). All three session paths now share one helper.
3. **Secure 2FA** (`auth.py` + frontend): `/auth/login` now mints a short-TTL, single-use, server-side `challenge_id` (new `two_factor_challenges` collection, unique index) and returns it INSTEAD of `user_id`. `/auth/2fa/verify` takes `{challenge_id, code}`, resolves identity server-side, allows wrong-code retries (challenge not consumed), and atomically consumes the challenge on success (replay-safe). `/auth/2fa/resend` keyed by `challenge_id`. Frontend `verify2FA(challengeId, code)` + AuthPage updated. Verified: no user_id leak, wrong code retryable, replay/bogus → 401.
4. **Atomic leak claim** (`telemetry.py` `approve_recovery`): `find_one_and_update({status:"open"} → "recovering")` BEFORE any Stripe/email I/O; `409` if not claimable (idempotent double-click protection).
5. **Terminal-state block**: approve rejects `{"recovered","dismissed","resolved"}` with `400`.
6. **Dismiss state-guard**: `dismiss_leak` filter now requires `status:"open"` → `409` otherwise.
7. **Period-scoped rescan**: a recovered leak re-opens only if a NEW overage appears in a new billing cycle (`recovered_at < period_start_iso`, start-of-month). All leak writes now include `org_filter(user)`.
8. **Deal validation** (`models.py`): `DealCreate`/`DealUpdate` use `Stage = Literal[6 stages]` + `probability = Field(ge=0, le=100)`. (`Deal` response model left as `str` to avoid breaking legacy/server-created rows.) Verified: bad stage/probability → 422.
9. **update_deal scope leak fixed** (`deals.py`): write + read-back filters now include `org_filter(user)`.
10. **Optional clears**: `deal_data.model_dump(exclude_unset=True)` so clients can explicitly null out notes/close date.
11. **Deal stage audit**: new append-only `deal_stage_events` collection records `{deal_id, org_id, from_stage, to_stage, changed_at}` on transitions. Verified.
- Verified live: deals 422/200/clear/audit; 2FA challenge flow; leak terminal/claim/dismiss guards. Not e2e-tested (static only): period-scoped rescan full scan, and the org-missing 500 path.

### Auth network gating + webhook idempotency index (Jun 2026) — P1
- **Skip `/api/auth/me` for anonymous visitors** (`frontend/src/contexts/AuthContext.js`): the session cookie is httpOnly (JS can't read it), so a `inflow_authed` localStorage flag (set on login/register/verify2FA/exchangeSession, cleared on logout and on a 401 from `/auth/me`) now gates `checkAuth`. If the flag is absent, the app goes straight to anonymous state without any network call. Verified via Playwright: anonymous load = 0 `/auth/me` calls; flagged load = ≥1.
- **Webhook idempotency hardened** (`backend/server.py`): the Stripe dedupe (`processed_webhook_events`, already added in the prior round — check at top by `event.id`, marker written only after success) is now backed by a unique index on `processed_webhook_events.event_id` created at startup (race-safe). Verified: `event_id_1` index present.
- Git/deploy note: git remote + committing are handled by Emergent's "Save to GitHub" UI (not manual git commands); this pod is already Node 20 with an existing yarn.lock.

### Multi-file security/concurrency/perf hardening — round 2 (Jun 2026) — P0
Eight fixes across 6 files:
1. **Registration TOCTOU** (`auth.py`, `server.py`): startup now creates a unique index on `users.email`; `register_with_email` inserts the user FIRST inside `try/except DuplicateKeyError → 400` (kept the `find_one` fast-path), and creates the org only after (no orphan org). Verified: unique `email_1` index present; duplicate → 400; valid → 200.
2. **CORS regex tightened** (`server.py`): fallback `allow_origin_regex` no longer trusts `*.emergentagent.com` / `*.emergent.host` (anyone could host a preview there and ride a victim's cookies). Now `https://(localhost|127.0.0.1|(\..*\.)?inflowft\.com)`. NOTE: production should keep `CORS_ORIGINS` env set (takes precedence); the provided fallback regex matches the `inflowft.com` apex — set the env for `www.` etc.
3. **Server-side register validation** (`models.py`): `RegisterRequest` → `email: EmailStr`, `password: Field(min_length=8, max_length=72)` (bcrypt-safe), `name: Field(1..100)`. Verified: bad email/short password → 422.
4. **Webhook plan validation + idempotency** (`payments.py`): both the real-Stripe and sandbox branches now reject `plan not in SUBSCRIPTION_PLANS` with a logged 400 (no silent Pro fallback). Idempotency guard checks `processed_webhook_events` by `event["id"]` at the top and writes the marker only AFTER successful handling (so a failed+retried event still processes, while true duplicates skip). NOTE: real-Stripe path is static-verified only (preview uses the sandbox key).
5. **Safe numeric coercion** (`analytics.py`): added `_num(v, default=0.0)` and routed raw deal-value floats through it so a non-numeric CSV/integration value yields 0 instead of a 500.
6. **Removed silent `to_list` caps** (`analytics.py`): per-deal reads changed `to_list(1000/2000)` → `to_list(length=None)` (no silent truncation of totals). The dashboard **`/analytics/revenue`** endpoint rewritten to a stage-grouped **aggregation pipeline** (≤6 rows, `$convert`-guarded) — accurate + memory-light at any scale. Verified: returns identical numbers to the old loop (projected_revenue 846,550).
7. **Deduped trial logic** (`auth.py`): single async `apply_trial_status(user_doc)` helper (ceil-rounded days, persists expiry) now called by both `create_session` and `get_me`.
8. **Client financial parse fix** (`RevenueForecast.js`): `Number(targetInput.trim())` + finiteness/`>0` check, so `-5000`/scientific notation no longer parse to a bogus positive target.

### Security/logic hardening — webhook, session & trial fixes (Jun 2026) — P0
Six targeted fixes across `routes/payments.py`, `routes/auth.py`, `dependencies.py`:
1. **Stripe webhook signature gate** (`payments.py`): removed the permissive unsigned-fallback branch. If `STRIPE_WEBHOOK_SECRET` is unset/empty → `logger.critical` + `HTTPException(500, "Webhook not configured")`. No webhook is ever processed unsigned.
2. **Webhook exception no longer swallowed** (`payments.py`): the catch-all now logs `exc_info=True` and `raise HTTPException(500, "Webhook processing failed")` instead of returning 200, so Stripe retries on transient DB/processing failures.
3. **Org state sync on sandbox checkout** (`payments.py`): the sandbox/test-key branch now, after setting the user's tier/status active, looks up `org_id` and syncs `db.organizations` tier/status — so `require_paid` (which reads the org) doesn't instantly deny a valid paying user.
4. **Session token decoupled from upstream** (`auth.py` `create_session`): mints our own `session_token = f"session_{secrets.token_urlsafe(32)}"` instead of reusing the Emergent auth host's token. Added `import secrets`.
5. **Session parse guard** (`dependencies.py` `get_current_user`): missing `expires_at` → `HTTPException(401, "Invalid session")`; string parse wrapped in `try/except ValueError` → 401 (was an unhandled crash → 500). Verified: malformed + missing both return 401.
6. **Trial day rounding** (`auth.py` `get_me` + `create_session`): `days_left = max(0, math.ceil(delta.total_seconds()/86400))` instead of `.days` truncation, so 18h left shows 1 day (not 0 → premature expiry). Added `import math`.
- Verified: backend restarts clean; login→/auth/me 200; no-auth & bogus token → 401; injected malformed/missing `expires_at` → 401 (not 500); ceil math confirmed (18h→1, 13.5d→14, expired→0).

### Route code-splitting + hero image AVIF/WebP (Jun 2026) — P1 mobile perf
Follow-up to the perf hardening, targeting Vercel (frontend host):
- **Route-level code splitting**: converted ALL authenticated dashboard/analytics/tools pages + secondary public pages (legal, contact, choose-plan, support, onboarding) in `App.js` to `React.lazy` under the existing `<Suspense>` boundary. Kept eager only: `Landing`, `AuthPage`, `AuthCallback` (needed for first paint / session-id render path). Removed the dead unused `GlowPreview` import. Result: **main bundle 487.67 kB → 235.32 kB gzip (~52% smaller)**; 40 route chunks; **Recharts (103 kB gzip) fully out of the main bundle** (now an on-demand chunk loaded only on chart pages). Verified via `yarn build`.
- **Hero image compression**: converted `public/dashboard-preview.png` (489 KB) to **WebP (108 KB)** and **AVIF (59 KB)** via Pillow + pillow-avif-plugin (one-off; NOT added to requirements — the outputs are static files). `HeroSection.js` now uses a `<picture>` with AVIF → WebP → PNG fallback (`?v=7`, added `width/height` to kill CLS). Fixed the preload in `index.html` to `href="/dashboard-preview.avif?v=7" type="image/avif"` so it MATCHES the picture's AVIF source (the old preload pointed at `.png` with no `?v=6`, so it was never used); non-AVIF browsers skip the typed preload and fall back via `<picture>`. All three variants serve 200 on preview; landing renders with no regression.

### Frontend performance + secure-build hardening (Jun 2026) — P1
Four structural changes to cut mobile LCP and secure production builds (all verified via a real `yarn build`):
1. **Hero preload** — `public/index.html` now has `<link rel="preload" as="image" href="/dashboard-preview.png" fetchpriority="high">` in `<head>` (confirmed in built output).
2. **Stripe code-split** — `Checkout` converted to `React.lazy(() => import('./pages/Checkout'))` with a `<Suspense>` boundary in `App.js` (the only file importing `@stripe/*`). Stripe.js now loads ONLY on `/checkout` — it lives in a dedicated `~7.4kB` chunk and the main landing bundle is verified Stripe-free (`grep js.stripe.com` → chunk only).
3. **Source maps disabled** — `GENERATE_SOURCEMAP=false` baked into the `frontend/package.json` build script (`"build": "GENERATE_SOURCEMAP=false craco build"`) AND `vercel.json` buildCommand, so it holds on every deploy path (Emergent/Vercel/local). Build produces 0 `.js.map` files. (Note: a `.env.production` was tried first but the repo's `.env*` gitignore excludes it from deploys, so the authoritative fix is the build script.)
4. **Immutable asset caching** — `vercel.json` `headers` serve `Cache-Control: public, max-age=31536000, immutable` for `/static/*` and image/font extensions (png/jpg/jpeg/gif/svg/webp/avif/ico/mp4/woff/woff2).
- Verified: `find build/static -name '*.map'` → 0; Stripe strings only in `636.chunk.js`; preload tag in built `index.html`; landing page renders with no regression from lazy/Suspense.

### Email sending fixed — valid Resend key + verified domain sender (Jun 2026) — P0
- Root cause of "didn't receive email": the env `RESEND_API_KEY` was invalid ("API key is invalid"), the sender was the shared sandbox `onboarding@resend.dev` (delivers only to the Resend account owner), and the app's support/escalation address was the wrong domain (`hello@inflow.io`).
- Fixes: (1) set a valid `RESEND_API_KEY` (Sending-access key, restricted to the verified `inflowft.com` domain); (2) set `SENDER_EMAIL=hello@inflowft.com` (on the verified domain, so it delivers to ANY recipient, not just the owner); (3) standardized the escalation + Contact-page fallback address from `hello@inflow.io` → `hello@inflowft.com` in `backend/routes/contact.py` (default for `CONTACT_ESCALATION_EMAIL`) and `frontend/src/pages/Contact.js`.
- Verified LIVE: `resend.Emails.send` from `hello@inflowft.com` to both an external Gmail and `hello@inflowft.com` returned delivery IDs (accepted) — proving the verified-domain "send to anyone" works. Note: the key is Sending-access only, so status-read via API is (intentionally) blocked.
- STILL ON USER'S SIDE: RECEIVING mail at `hello@inflowft.com` requires a real mailbox + MX records for `inflowft.com` (Resend is send-only). App legal pages also reference `support@inflowft.com` / `privacy@inflowft.com` (unchanged).

### Sign-in UI redesigned to glass-card layout (Jun 2026) — UI
- Rebuilt `frontend/src/pages/AuthPage.js` to the user-provided 21st.dev "SignIn1" aesthetic: a centered `rounded-3xl` glass card (`bg-gradient-to-r from-[#ffffff10] to-[#121212] backdrop-blur-sm`) on a dark radial background, pill inputs (`rounded-xl bg-white/10`), a `rounded-full` "Sign in" button, a dark-gradient "Continue with Google" pill, a "Sign up, it's free!" toggle link, and a social-proof block (avatars + "Join thousands of revenue teams already using InFlow").
- FLATTENED the old two-step (options → email form) into a single view showing email + password directly (register adds a Full name field). Password has an eye toggle; client validation now shows an inline red error (`data-testid="auth-error"`) instead of a toast.
- ALL functionality preserved: Google OAuth, email login/register, 2FA verify view (restyled), Google-style account chooser (restyled), corrupt-localStorage guard, post-auth checkout-intent redirect, rate-limit toasts, Terms/Privacy footer. All existing data-testids kept (`auth-email-input`, `auth-password-input`, `auth-name-input`, `auth-submit-btn`, `auth-google-btn`, `auth-toggle-mode`, `back-to-home`, `account-chooser`, `saved-account-card`, `use-another-account-btn`, `2fa-verify-form`, `otp-input-0..5`, `verify-2fa-btn`, `resend-2fa-btn`, `back-to-login-btn`). Removed the intermediate `auth-email-btn` step. Dropped unused imports (Button, Input, CanvasRevealEffect, Mail).
- Verified: renders correctly (screenshot — logo, welcome/register states, social proof); backend login curl 200 with session cookie; frontend compiles clean.

### Option A — revenue attribution for CRO & Competitor Intelligence (Jun 2026)
Re-focused the two "drifting" features so each resolves to its OWN distinct $ number (attribution, not aggregation — no reprinting of dashboard totals):
- **CRO** now shows **revenue impact**: each A/B test takes `monthly_visitors` + `value_per_conversion` (prefilled with the org avg deal value from `/api/cro/summary`) and computes a **Projected annual impact** = `(variant_rate−control_rate) × monthly_visitors × value_per_conversion × 12`. Implementing a winner stores `revenue_impact`, and Stage 5's hero metric **"Revenue lift shipped $/yr"** rolls up all implementations (`GET /cro/summary`). Backend: test fields + `_decorate_test.projected_impact`, implementation `revenue_impact`, new `/cro/summary`.
- **Competitor Intelligence** now shows a **Pricing opportunity vs market** number in the Analyze benchmark: `_compute_benchmark` returns `pricing_gap`, `pricing_annual` (|gap| × paying accounts × 12), `pricing_kind` (upside/exposure/aligned). Displayed as green "upside" or amber "exposure" with an **"Open Pricing Optimizer"** handoff, and every pricing-category action in the Act stage links to `/pricing` (Competitor Intel triggers the pricing move; Pricing Optimizer owns the recommendation).
- Verified: curl (projected $480k; testpro exposure $10,899/yr across 7 accounts) + testing_agent iteration_62 (frontend 100%, distinctness confirmed, no crashes). Known: dev-only visual-edits hydration warning around `<select>` — not app code.



### CRO → guided 5-stage cycle (Jun 2026) — major rework
- Reworked `/cro` (`ConversionOptimization.js`) from a static dashboard into a guided **Analyze Data → Identify Friction → Formulate Hypotheses → Run Tests → Implement & Iterate** cycle with a clickable stepper.
- Removed the fabricated metrics (the hardcoded "+4.2% vs last month" delta and the 3 mocked A/B tests). Stage 1 now shows only REAL pipeline-funnel numbers (from `/api/analytics/cro`); an honest note explains heatmaps/session-recordings are external tools to connect. (User will supply additional accurate metrics later.)
- **New backend `routes/cro.py`** (registered in `server.py`, all `require_paid`): friction CRUD + `/cro/friction/suggest` (AI); hypotheses CRUD + `/cro/hypotheses/suggest` (AI); A/B tests CRUD where PUT returns a real two-proportion **z-test** (`control_rate/variant_rate/improvement/confidence/winner`); implementations CRUD. Creating a test linked to a hypothesis sets it `testing`; implementing sets it `validated`. Collections: `cro_friction`, `cro_hypotheses`, `cro_tests`, `cro_implementations` (org-scoped).
- Frontend computes A/B significance live client-side (erf approximation mirroring the backend) for instant feedback; optimistic deletes re-fetch on failure.
- Verified: all endpoints curl-tested (AI suggest returned 5+5; A/B 8%→12% = +50% lift, 99.7% conf, winner variant); testing_agent iteration_61 — frontend 100% across all 5 stages + full cycle wiring, no console errors.



### Competitor Intelligence → guided 5-stage cycle (Jun 2026) — major rework
- Reworked `/competitor-intel` (Enterprise + owner only) from a single tool into a guided **Plan → Gather → Analyze → Share → Act** cycle with a clickable stepper.
- **Backend (`competitors.py`)** new endpoints (all `require_enterprise`): `GET/PUT /competitors/plan` (objectives, focus areas, key questions, notes); `POST /competitors/analyze` (Claude → summary, patterns, per-competitor strengths/weaknesses, your strengths/weaknesses, opportunities, threats; caches to `competitor_intel_analysis` with benchmark snapshot; rule-based fallback); `GET /competitors/analysis`; `GET /competitors/actions`, `POST /competitors/actions/generate` (Claude), `POST/PUT/DELETE /competitors/actions*` (status todo/in_progress/done); `GET /competitors/report` (compiled markdown); `GET/POST /competitors/shares` (team distribution log). Refactored `benchmark` into reusable `_compute_benchmark`; added `_claude_json` helper. Reuses existing competitor CRUD/rescan/my-pricing extraction.
- **Frontend (`CompetitorIntel.js`)** fully rewritten: Plan (tag inputs + focus chips), Gather (public-source guidance + existing competitor tool + Your Pricing), Analyze (benchmark strip + AI SWOT/patterns/opps/threats + "stale, re-run" hint when competitor set changed), Share (copy/download markdown report + team distribution + history), Act (AI-generated + manual actions with cycling status).
- Verified: all endpoints curl-tested (analyze/actions used real Claude); testing_agent iteration_60 — frontend 100% across all 5 stages, persistence confirmed, no console errors.



### Dashboard: "Active Deals" → "Total Revenue" (Jun 2026)
- Replaced the dashboard "Active Deals" count KPI with a **"Total Revenue"** currency KPI = projected total (closed revenue + probability-weighted open pipeline). Backend: added `projected_revenue` to `GET /api/analytics/revenue` (`analytics.py`), using the same stage/deal probability logic as the forecast (lead 10 / qualified 25 / proposal 50 / negotiation 75, or the deal's own `probability`). Frontend: `Dashboard.js` KPI now shows `analytics.projected_revenue` via `formatCurrency`, Wallet icon, testid `metric-total-revenue`, sub "closed + weighted pipeline". Curl-verified (closed $422.5k → projected $846.6k).



### Forecast chart → stacked area (Jun 2026)
- Converted the /forecast monthly chart from a shaded fan/band (`ComposedChart` + range Area + Lines) to a **stacked AreaChart** with 3 probability layers: Conservative floor (green `#5A7D66`, 0→P10), Realistic increment (platinum `#B8B2AA`, P10→P50), Potential increment (deep blue `#354278`, P50→P90). Stack top = P90; each layer's top stroke marks P10/P50/P90. `chartData` maps `l_conservative/l_realistic/l_potential` deltas (guarded with `Math.max(0,…)`). Tooltip shows Potential/Realistic/Conservative cumulative values (dropped the recurring row). Verified: testing_agent iteration_59 — 100% pass, no regressions.



### Site-wide font color unified + Forecast band recolor (Jun 2026)
- **One readable font color across app pages only:** added a CSS rule in `frontend/src/App.css` scoped to `.dashboard-layout` that forces `color:#E4E4E7 !important` on all neutral text utilities (`text-white` + `text-zinc/slate/gray/neutral/stone-50…600`). Semantic status colors (emerald/green/red/amber/yellow/orange) and all chart colors are intentionally left untouched. Public landing/marketing/auth pages are OUTSIDE `.dashboard-layout`, so they are unaffected (verified — landing hero still white).
- **Forecast bands recolored to 3 distinct colors** (were near-identical blues) in `RevenueForecast.js`: Conservative `#5A7D66` (muted forest green), Realistic `#B8B2AA` (soft platinum), Potential `#354278` (muted deep blue). Applied to the `BANDS` constant, the fan-chart gradient (deep-blue top → forest-green bottom), the platinum P50 line + dots, the hero confidence-bar gradient, band-label dots, and the hover tooltip.
- Verified: testing_agent iteration_58 (frontend visual) — 100% pass; `#E4E4E7` dominant, semantic colors + charts preserved, band colors distinct, landing untouched, no crashes.



### Probabilistic Revenue Forecast — frontend rebuilt for Monte Carlo (Jun 2026) — P0
- Backend (`backend/routes/analytics.py`) runs a numpy **Monte Carlo** forecast (`_compute_forecast`, 10,000 sims, 6-month horizon) blending CRM deals (calibrated win rates + real close timing), a Finance recurring baseline (from closed-won history), and Customer Success retention/NRR. Returns P10/P50/P90 bands (total + monthly + quarterly), probability-to-hit-target, weighted pipeline, recurring/mo, NRR, revenue-at-risk, velocity, stage forecast, top deals and a `data_sources` panel. `GET /api/analytics/forecasting?target=` (numbers, fast) + `GET /api/analytics/forecast-narrative?target=` (Claude narrative, loaded separately, templated fallback).
- **Bug fixed**: `_parse_dt` returned naive datetimes for date-only strings → `TypeError: can't subtract offset-naive and offset-aware datetimes` (the endpoint 500'd; the backend had never been tested). Now always returns tz-aware (UTC assumed when naive).
- **Frontend `RevenueForecast.js` (route `/forecast`) fully rebuilt** from the old broken deterministic scenario chart to a probabilistic UI: headline Expected (P50) + 80% confidence range (P10–P90); a Monte Carlo fan chart (recharts range `Area` band [p10,p90] + P50 line + dashed recurring baseline, custom tooltip); a **probability-to-target** input with a ring gauge; the AI narrative card (Claude/Rule-based badge); a **Data Sources** panel (CRM/Finance/Customer Success/Marketing, connected vs "connect to improve"); quarterly outlook; risk metric cards; stage pie; velocity; top-deals table. New testids: `forecast-p50`, `forecast-range`, `monte-carlo-chart`, `forecast-target-input/apply`, `forecast-goal-result`, `forecast-narrative(-card)`, `data-sources-panel`.
- Verified: testing_agent iteration_57 — backend 7/7 pytest (`tests/test_revenue_forecast.py`), frontend 100% of the flow (real $866k/$975k/$1.077M P10/P50/P90, fan chart, narrative, target 800000→97.6% / 1000→100%). Added `disabled={loading}` guard on the target Check button to avoid a stale-result race on rapid clicks.
- **Plain-language relabel (Jun 2026):** P10/P50/P90 renamed everywhere in the UI to **Conservative / Realistic / Potential** with hover info-tooltips (shadcn Tooltip) explaining each (e.g. Conservative = "90% chance you make at least this much"). Also removed the "Probabilistic" title badge and the "Claude/Rule-based" narrative badge, and changed the subtitle to "Probability forecasting that predicts revenue".

### PostHog tracking script removed from index.html (Jun 2026) — P0 privacy/DPA
- Per user request, deleted ONLY the PostHog `<script>` init block from `frontend/public/index.html`. **Useberry** live-testing snippet and the **Termly** cookie-consent script are intentionally KEPT. Resolves a recurring data-privacy liability (flagged across 4 sessions).


### Main Dashboard restyled to "Efferd Dashboard 2" layout (Jun 2026)
- `/app/frontend/src/pages/Dashboard.js` fully restyled to the Efferd dense-KPI layout while keeping ALL real InFlow data, tier-gating (TIER_ACCESS), source filter and data-testids: 4 KPI stat cards (delta chip on Revenue = real MoM, removed the old hardcoded fake "+12.5%" deltas) → Revenue bar chart + Pipeline-by-stage chart → Recent Deals invoice-style table (div rows, not `<table>`, to avoid the visual-edits plugin's invalid-`<tbody>` hydration warning) → Customer Health + Conversion widgets → AI Insights + Quick Actions.
- Verified by testing_agent (iteration_56) — 100% frontend pass with real data (e.g. $1.49M pipeline, $422.5k revenue +8.7%, 26.9% win, 26 deals), tier unlocks correct for enterprise, no crashes. Fixed 2 minor items (empty-state Y-axis tick labels; table→div rows).
- NOTE: user asked for "both" dashboards — only the MAIN /dashboard is done. The second target ("analytics/other views") spans several pages (SalesPerformance, SalesRevenue, RevenueForecast, RevenueIntelligence, RevenueLeaks) and needs the user to pick which to restyle next.
- Known env quirk: the Emergent visual-edits babel plugin intermittently throws a transient compile-error overlay on `timeline-animation.jsx` (not app code); a `supervisorctl restart frontend` clears it.

### 20% first-year discount on annual plans + stale Stripe-price bug fixed (Jun 2026)
- Yearly plans keep full/renewal prices **$747 / $1,695 / $2,499** and now apply a real **20% first-year discount** via a Stripe coupon (`percent_off=20, duration="once"`) enabled by `first_year_discount: True` on the three yearly plans. First-year charged: **$597.60 / $1,356 / $1,999.20**; renews at full price after year one. Monthly plans unchanged (no discount).
- **Bug fixed**: `get_or_create_stripe_price` cached the Stripe Price by `plan_key` only and never refreshed on price changes — so the earlier price updates ($99→$75, $149→$179, $830→$747, etc.) never reached checkout (users would've been charged the OLD amounts). Cache is now amount+interval-aware and creates a fresh immutable Stripe Price whenever the plan amount changes.
- Display updated across ChoosePlan, landing PricingSection, Checkout (order summary: discounted price, struck-through full price, "First-year discount (20%)", "Renews at $X/year after your first year"), Settings, and FAQ/contact/support AI copy.
- Verified via curl (actual Stripe charge per plan): monthly $75/$179/$327; yearly first-year $597.60/$1,356/$1,999.20. Checkout order summary visually confirmed for pro_yearly.

### Workspace multi-provider push — "push to the CRM you select" (Jun 2026)
- The Action Workspace (`/workspace`) can now push every action to the **connected CRM the user selects per action** — HubSpot, Salesforce, or Pipedrive — via a destination dropdown (`workspace-provider-select`). Previously it was hardcoded to HubSpot only.
- Action kinds expanded to six: note, task, call, email, deal, and the **new `offer`**. Offer → creates a **Quote object** in HubSpot (`create_quote`) and Salesforce (`Quote` + standard Pricebook); Pipedrive has no Quotes API so an offer is saved as a **structured note on the deal**. Offer requires a deal target (enforced backend + UI locks target type to Deal).
- New backend write clients: `routes/salesforce_write.py` (ContentNote+ContentDocumentLink, Task w/ TaskSubtype for call/email, Opportunity, Quote; 401→reconnect) and `routes/pipedrive_write.py` (`/v1/notes`, `/v2/activities`, `/v2/deals`, `x-api-token`). `routes/hubspot_write.py` gained `create_quote`. `routes/workspace.py` now dispatches `targets`/`execute` per provider and stores `provider` on each action.
- Human-in-the-loop preserved: nothing writes until the user hits "Confirm & push"; the dialog title + preview show the chosen destination. All external writes fail gracefully with readable messages (no 500s).
- Verified: 29/29 `tests/test_workspace.py` pass; curl-confirmed graceful 422 per provider + offer-requires-deal 400; testing agent frontend run **100%** (selector lists 3 providers, provider switching, offer form + deal-locked target, draft/confirm/push, failed-status handling). NOTE: testpro has DEMO connections for all three CRMs (invalid tokens) — real writes need valid write-scoped tokens.

### Pricing + integration limits updated to new 3-tier values (Jun 2026)
- Per user request, applied new prices to the 3-tier model: **Essential** $75/mo · $747/yr, **Pro** $179/mo · $1,695/yr, **Enterprise** $327/mo · $2,499/yr. Yearly savings are now per-plan (Essential 17%, Pro 21%, Enterprise 36%) — no longer a flat "30%".
- **Integration slot limits raised**: Essential **5**, Pro **15**, Enterprise **unlimited** (trial stays 2). Backend `INTEGRATION_LIMITS` in `routes/business.py`; feature bullets read "5 / 15 / Unlimited live integrations" everywhere.
- Files touched: `backend/routes/payments.py` (SUBSCRIPTION_PLANS prices + feature bullets), `backend/routes/business.py` (INTEGRATION_LIMITS), `backend/routes/contact.py` + `backend/routes/support.py` (AI knowledge text), `frontend/src/pages/ChoosePlan.js` (dynamic per-plan savings badge), `frontend/src/pages/Checkout.js`, `frontend/src/pages/Settings.js`, `frontend/src/components/landing/PricingSection.js`, `frontend/src/components/landing/FAQSection.js`.
- Verified: `GET /api/subscription/plans` returns the new prices + integration labels; `POST /api/payments/create-checkout` (pro_monthly) returns a valid Stripe client_secret; `GET /api/business/integration-usage` returns unlimited for Enterprise; ChoosePlan screenshot shows $179 / "15 live integrations" / dynamic "-21%" yearly badge. grep confirms zero stale $99/$149/$400/$830/$1,250/$3,360 or "2/4 integration" references remain.

### Pricing REVERTED to 3-tier fixed cards (Jun 2026) — removed volume/usage model
- Per user request, reverted from the volume/usage-based pricing model back to the original **3 fixed tiers with cards**: **Essential** ($99/mo, $830/yr), **Pro** ($149/mo, $1,250/yr), **Enterprise** ($400/mo, $3,360/yr). Yearly billing shows a ~30% saving.
- Implementation: `git checkout`-restored the 6 pricing files to their pre-volume state (commit `1561b8f^`): `backend/routes/payments.py`, `backend/routes/business.py`, `frontend/src/{pages/ChoosePlan.js, pages/Checkout.js, pages/Settings.js, components/landing/PricingSection.js}`. Deleted volume-only files: `frontend/src/lib/pricing.js`, `frontend/src/components/VolumeSlider.jsx`, `backend/tests/test_usage_tier_pricing.py`. Fixed `components/TierGate.js` to inline its feature list (no longer imports the deleted `lib/pricing`).
- The revert was clean/self-contained — the ONLY commits that had touched those files since the 3-tier era were the 3 volume commits (`1561b8f`, `a12ec3b`, `95a0002`), so no unrelated work was lost. `ConnectBusiness.js` uses `/business/integration-usage` (tier-based integration quota, present in both versions) and is unaffected. User model `volume_units`/`deal_limit` are no longer set/enforced.
- Verified (self-test): `GET /api/subscription/plans` returns the 3 tiers with correct prices; all 6 plan variants create valid Stripe test checkout sessions via `POST /api/payments/create-checkout`; landing PricingSection + ChoosePlan render the 3 cards with Monthly/Yearly toggle and no slider; frontend compiles with no orphan imports.
- NOTE: `TierGate` gating still uses tier levels essential(1) < pro(3) < enterprise(higher). Feature pages gate by these tiers as before.


### Sidebar cleanup — collapsible group dropdowns (Jun 2026)
- Each labeled sidebar group (Sales, Analytics, Revenue Execution, Tools) in `components/DashboardLayout.js` is now a **collapsible dropdown** (clickable header + rotating ChevronDown). Dashboard (unlabeled) stays always visible.
- Open/closed state persists in `localStorage.sidebar_groups`; the group containing the active route auto-opens. In icon-collapsed sidebar mode all items still show (dropdowns only apply in expanded mode). Group header testids: `nav-group-{label}`. Verified via screenshot + compile.


### Individual Account Workspace — per-account "deal room" with 2-way sync (Jun 2026) — P0 Revenue Execution
- From the guided-flow dialog on `/discover` (labeled "Upsell Engine", `HighIntent.js`), a **"Manage"** button (`flow-manage-btn`) opens a dedicated per-account page at **`/workspace/account/:leadId`** (`pages/AccountWorkspace.js`) — a focused deal room for that one buyer with on-demand 2-way HubSpot sync.
- Shows: account header (name, intent score, value/stage/probability, linked/unlinked badge); **editable HubSpot fields** (deal name, amount, stage) with a confirm dialog → push back to HubSpot; a **link selector** to bind the account to a live HubSpot deal (auto-matches by name when a real token is present); an **action composer** (note/task/call/email/deal, AI-draft, human-in-the-loop confirm) scoped to this account via `account_ref`; and a **merged activity timeline** (InFlow AI intent activity + pushed InFlow actions + best-effort HubSpot engagements), newest first.
- Backend (`routes/workspace.py`): `GET /workspace/account/{lead_id}` (assembles lead + hubspot record/deals + scoped actions + merged timeline), `POST /workspace/account/{lead_id}/link`, `POST /workspace/account/{lead_id}/fields` (validates link + graceful 422). `ActionCreate` gained optional `account_ref`. HubSpot client (`hubspot_write.py`) gained `get_deal`, `update_deal` (PATCH), `list_deal_activity` (v4 associations + batch read).
- Tested: iteration_53 — backend **27/27 pytest** (`tests/test_workspace.py`), frontend **100%** (Manage nav, render, badges, timeline, link, field-push confirm+validation, compose→save→review&push→failed, account_ref scoping, delete, back). ⚠️ LIVE HUBSPOT 2-WAY SYNC IS UNVERIFIED IN PREVIEW (testpro's HubSpot token is DEMO/invalid → empty deals dropdown, field/action pushes return graceful 422 "reconnect HubSpot"). Real sync needs the user's write-scoped HubSpot Private App token.


### Label swap — "High-Intent Buyers" ↔ "Upsell Engine" (Jun 2026)
- Per user request, the two Revenue Execution features SWAPPED DISPLAY NAMES only; routes/code/functionality unchanged ("content stays under the hood").
- **IMPORTANT mapping for future agents** (label ≠ file/route):
  - Route `/discover` → file `pages/HighIntent.js` → now LABELED **"Upsell Engine"** (Rocket icon, minTier 1). Still runs high-intent buyer-detection code (`/api/intent/*`, "Scan for buyers", "Hot buyers"). Section header relabeled "Upsell opportunities".
  - Route `/upsell` → file `pages/UpsellEngine.js` → now LABELED **"High-Intent Buyer Detection"** (Telescope icon, minTier 3, enterprise). Still runs upsell/expansion code (`/api/upsell/*`, "Your upgrade plans", "Expansion potential"). "Upsell candidates" relabeled "High-intent accounts".
- Swapped: sidebar labels+icons (`DashboardLayout.js`), page H1s, gate titles/descriptions, eyebrows, and top taglines. data-testids (`high-intent-page`, `upsell-engine-page`, etc.) unchanged. Verified via screenshot + compile.


### Action Workspace — Two-way "System of Action" write-backs (Jul 2026) — P0 Revenue Execution
- NEW page `/workspace` (`frontend/src/pages/Workspace.js`) under the **Revenue Execution** sidebar group (now: High-Intent Buyers + Upsell Engine + Workspace). Turns InFlow's read-only integrations into a two-way system where users push changes back into their connected tools. HubSpot first; architecture is provider-generic (`WRITE_PROVIDERS`) so other integrations plug in later.
- **4 write actions (HubSpot)**: add a note, create a task, log an activity (call/email), create a new deal — each associated to a live HubSpot record (deal/contact). NO stage/value edits this phase (per user). Upload calls/files deferred to next phase.
- **Human-in-the-loop**: compose (optional AI draft via Claude) → Save as DRAFT → Review & push opens a confirm dialog with a preview → Confirm & push executes the real HubSpot write. Nothing writes without explicit confirm.
- Backend `routes/workspace.py` (registered in `server.py`): `GET /workspace/status`, `GET /workspace/targets` (live deals/contacts/pipelines with real HubSpot ids), `POST /workspace/ai-draft`, `POST /workspace/actions` (draft), `GET /workspace/actions`, `DELETE /workspace/actions/{id}`, `POST /workspace/actions/{id}/execute`. Reads = `require_paid`; create/execute/delete = `require_paid_owner`. Actions persisted in `db.workspace_actions` (status draft→executed/failed, activity log).
- HubSpot write client `routes/hubspot_write.py` — CRM v3 endpoints (notes/tasks/calls/emails/deals) with correct HUBSPOT_DEFINED association typeIds; returns structured {ok,id,error,code,missing_scopes}. On write failure the action is saved as `failed` with a readable reason (retryable) and the endpoint returns HTTP 422. 401→"reconnect HubSpot"; 403→"missing write scopes" (lists missing scopes).
- Tested: iteration_52 — backend 21/21 pytest (`tests/test_workspace.py`), frontend 100% of flows (render, gating, kind switching, AI draft, draft create, confirm gating, graceful 422 + failed status, delete, history). ⚠️ LIVE HUBSPOT WRITES ARE UNTESTED IN PREVIEW: testpro's HubSpot connection uses a DEMO/invalid token, so execute returns 422 "reconnect HubSpot" and the target picker returns 0 deals/0 contacts. REAL writes + target picking require the user's real HubSpot Private App token with write scopes (crm.objects.deals.write + crm.objects.contacts.write + CRM read).


### FIX — Login lockout via app-wide crash from corrupt localStorage (Jul 2026) — P0
- Symptom: user saw the Sentry ErrorBoundary fallback ("Something went wrong — An unexpected error occurred and our team has been notified. [Reload]") when logging in; Reload re-hit the same crash → permanent lockout.
- Root cause: `frontend/src/pages/AuthPage.js` parsed `localStorage['inflow_last_account']` with an UNGUARDED `JSON.parse` during render. A corrupt/non-JSON value (e.g. `[object Object]`, `undefined`, truncated JSON) threw synchronously → the app-wide `<Sentry.ErrorBoundary>` replaced the whole UI.
- Fix: wrapped the parse in try/catch; on failure it `localStorage.removeItem('inflow_last_account')` and returns null, so the app never crashes and the user recovers automatically. Backend login was never at fault (session_token cookie issues correctly).
- Verified by bug_testing_agent (iteration_51, verdict FIXED): corrupt values no longer show the ErrorBoundary + auto-clear + login reaches /dashboard; clean login and valid saved-account chooser also reach /dashboard.


### High-Intent Buyer Detection "Discover" — Revenue Execution (REWRITTEN to Guided AI Flow, Jul 2026) — P0 pipeline acceleration
- Page `/discover` (`frontend/src/pages/HighIntent.js`) under the "Revenue Execution" sidebar group. REWRITTEN from the old 4-action model into a single sequential 6-step **Guided AI selling loop**: Opportunity detected → AI analyzes everything → AI explains WHY this buyer matters → AI predicts the outcome → AI recommends ONE action → user executes → AI measures impact.
- **Integration-driven intent scoring**: `POST /api/intent/scan` analyzes OPEN opportunities (`db.deals`, won/lost excluded) + product usage (`db.telemetry_usage`), grouped by account, scored 0-100 from transparent signals across Marketing / Sales / Product categories (`_build_signals`). Leads persisted in `db.intent_leads` (idempotent by `account_key`; scan now normalizes any legacy/unknown status back to `new`).
- **Guided-flow endpoints** (`backend/routes/intent.py`, registered in `server.py`): `GET /intent/status`, `POST /intent/scan`, `GET /intent/leads`, `PATCH /intent/leads/{id}` (status new|analyzed|executed|won|lost|dismissed), `POST /intent/leads/{id}/analyze` (owner-only — returns AI briefing {why, prediction{close_probability,expected_value,timeline,confidence,summary}, recommended_action{type,title,rationale,artifact}}), `POST /intent/leads/{id}/execute` (mark done / send email), `POST /intent/leads/{id}/impact` (log outcome → value_influenced). Every lead carries an activity log.
- AI drafting uses Claude (`claude-sonnet-4-5-20250929`) via Emergent LLM key with a deterministic template fallback (`_fallback_briefing`), so `analyze` ALWAYS returns a valid briefing. Paid-tier gated (`require_paid`); analyze/execute/impact are owner-only (`require_paid_owner`). Email send via Resend returns HTTP 422 gracefully in preview (invalid key).
- Tested: iteration_50 — backend 15/15 pytest (`tests/test_high_intent_v2.py`), frontend 100% of guided-flow scenarios (scan → open flow → AI analyze → Why/Prediction/Recommendation → execute → impact, plus activity log + dismiss). Fixed post-test: (1) HIGH bug — `copyArtifact()` clipboard rejection now wrapped in try/catch + toast fallback (was surfacing a blocking React error overlay); (2) scan now normalizes stale/unknown lead statuses to `new`. NOTE: the old `tests/test_high_intent.py` is STALE (targets removed endpoints) — superseded by `test_high_intent_v2.py`.

### Gating model aligned to value-based pricing (Jul 2026)
- Pricing is value-based ("one plan, everything included" — price scales by volume; every paying checkout maps to `enterprise_*` internally). So gating now means **paid vs. trial**, not feature tiers. Added `require_paid` / `require_paid_owner` deps (`dependencies.py`). Premium features unlock on any active subscription; send/route actions are owner-only.
- Rewrote the stale `TierGate.js` upgrade wall (was old $99/$149/$400 cards) into a single value-based "everything included" panel linking to the volume-slider `/choose-plan`.

### Upsell Engine — "Revenue Execution" section (Jul 2026) — P0 expansion revenue
- New sidebar group **"Revenue Execution"** (between Analytics and Tools) with an **Upsell Engine** page at `/upsell` (`frontend/src/pages/UpsellEngine.js`). Enterprise-tier + org-owner only (backend `require_enterprise` dep + frontend `TierGate` L3 + status gate).
- **Integration-driven candidate detection**: `POST /api/upsell/scan` aggregates customer accounts from connected-integration data — revenue/accounts in `db.deals` + product-usage in `db.telemetry_usage` (Mixpanel/Amplitude) — grouped by company, and scores each for expansion potential. Detected signals: heavy product usage, team growth, frequent engagement, nearing plan limit, high-value, multi-product, long tenure. Returns `expansion_score` (0-100) + estimated annual `est_expansion_value`.
- **Your own plans**: owner configures their product's upgrade plans (name, price, period, upgrade URL, description) via `GET/POST/DELETE /api/upsell/plans`. Generated emails/offers reference the recommended plan and link to the owner's OWN upgrade URL.
- **4 actions per candidate**: (1) AI-drafted **upgrade email** w/ plan + link (`/candidates/{id}/email`), (2) AI-drafted **discount offer** (`/candidates/{id}/offer`), (3) **notify sales team** to owner/typed email (`/candidates/{id}/notify-sales`), (4) **launch upgrade campaign** across selected candidates with an AI brief + lifecycle draft→launched→completed (`/campaigns` CRUD). Sends via Resend (`/send-email`); candidate status transitions persist (open→emailed/offered/notified/dismissed).
- AI drafting reuses Claude (`claude-sonnet-4-5-20250929`) via Emergent LLM key with template fallbacks + 40s timeout. Backend `routes/upsell.py` registered in `server.py`.
- Tested: iteration_48 — backend 18/18 pytest (`test_upsell_engine.py`), frontend 100% of flows (scan, plan CRUD, all 4 actions, campaign lifecycle, dismiss). Email send/notify surface a readable error (HTTP 422 with detail) when Resend is unconfigured/invalid — preview's Resend key is invalid, so real sends need a valid `RESEND_API_KEY` + verified sender in production. Fixed post-test: switched 5xx→4xx so error detail passes the ingress instead of showing generic "Request failed".

### Retention / "System of Action" REMOVED (Jul 2026) — reverted per user request
- Per user request, the Churn "System of Action" work was fully rolled back and the Churn & Retention page returned to its original view-only analytics state.
- Removed: the per-deal Retention Workspace page + route (`/retention/:dealId`, `frontend/src/pages/RetentionWorkspace.js`), the "Protect" button on at-risk deals, the "Retention Plays" card (Revenue Protected / In Play), and the backend `routes/retention.py` router (unregistered from `server.py`). Deleted `backend/tests/test_retention_plays.py` and `test_retention_workspace.py`. The Structured Offer Builder (added and removed earlier this session) is also gone.
- Churn page now shows only: KPIs, Retention/Churn trend, Customer Health, Revenue Lost, Churn Reasons, Risk by Segment, At-Risk Deals (with AI-prediction only), AI Churn Prediction, and the Cohort table. The `db.retention_plays` collection is left untouched (orphaned data, harmless).

### Discrete-Tier Volume Pricing + Ruler Slider (Jun 2026) — P0 billing overhaul
- Migrated the self-serve plan from a linear "$50 base + $21 / additional 1k, 1k-20k" model to a **discrete 10-tier** value-metric model (deals & revenue tracked / month). Tiers (index → volume → monthly → yearly): 0=1K/$50/$500, 1=10K/$259/$2,590, 2=25K/$500/$5,000, 3=100K/$1,345/$13,450, 4=250K/$2,590/$25,900, 5=500K/$4,250/$42,500, 6=1M/$7,000/$70,000, 7=5M/$22,100/$221,000, 8=10M/$35,400/$354,000, 9=15M/$46,800/$468,000. Yearly = exactly 10x monthly (2 months free). Above tier 9 → Contact sales.
- The slider position is a **TIER INDEX (0-9)** passed via URL param `units` and checkout body `quantity` (previously a count of 1k blocks). Each tier is billed in Stripe as its own FLAT recurring price (line-item quantity=1). update-volume swaps the subscription item's price to the new tier (prorated). The subscription.updated webhook reads the tier index from subscription metadata `quantity`.
- New ruler-style slider component `/app/frontend/src/components/VolumeSlider.jsx` (dense tick marks fill up to the handle, floating value pill "25K per month", `<>` drag handle, tier labels below) — backed by a hidden native range input for drag + keyboard + a11y. Used on ChoosePlan, landing PricingSection, and Settings.
- ChoosePlan redesigned to a centered layout: "Scale with flexible pricing" hero → slider → billing pill → price + Get started → all-features grid below.
- Backend `/app/backend/routes/payments.py`: `USAGE_TIERS`, `_clamp_tier`, `compute_usage_amount(tier_index, period)`, `_volume_fields(tier_index)→{volume_units, deal_limit}`, `get_or_create_stripe_price(plan_key, plan, tier_index)`, `/subscription/usage-pricing` returns the 10-tier table. Frontend mirror in `/app/frontend/src/lib/pricing.js`.
- Tested: iteration_45 (backend 10/10 pytest `test_usage_tier_pricing.py`, frontend 7/7 flows). Amounts verified exactly against the tier table incl. out-of-range clamping; real Stripe test key returns client_secret + embedded iframe mounts.


### Choose Your Plan page redesign (Jul 2026)
- Rebuilt `/app/frontend/src/pages/ChoosePlan.js` to the user-provided design's actual layout (PricingSection2): hero with `Zap` eyebrow + cut-reveal "Let's get started" heading + subtitle on a blue radial gradient, then a two-column "What's inside" section — LEFT = selected plan's feature list (glass ticks); RIGHT = sliding pill switches (`Choose your plan` Essential/Pro/Enterprise + `Billing period` Monthly/Yearly -30%), seat stepper + quick presets, big `NumberFlow` price with yearly strikethrough, and a single Purchase button.
- Components: `components/ui/vertical-cut-reveal.jsx`, `components/ui/timeline-animation.jsx`, `@number-flow/react`, and an inline `PricingSwitch` (framer-motion `layoutId` electric-blue capsule, supports 2–3 options).
- Glass ticks match landing cards; features in parity with landing `PricingSection.js`. State drives one dynamic price; Purchase → `/checkout?plan={planKey}_{period}&users={seats}` (checkout wiring unchanged). data-testids: plan-select-{key}, toggle-{monthly|yearly}, seats-*, purchase-btn, back-btn, feature-list. Verified via screenshots (plan/billing switches update features + price; current-plan disables Purchase).


### Sentry Error Monitoring — Frontend + Backend (Jul 2026)
- Frontend: `@sentry/react@10.63.0` (EU). Init `/app/frontend/src/lib/sentry.js` → called in `index.js`; app wrapped in `<Sentry.ErrorBoundary>`. Env: `REACT_APP_SENTRY_DSN` + `REACT_APP_SENTRY_ENVIRONMENT`. Verified live (envelope delivered).
- Backend: `sentry-sdk==2.64.0` (EU). Init `/app/backend/utils/sentry_config.py` → `init_sentry()` called in `server.py` before `app = FastAPI()` (FastAPI/Starlette integrations auto-enable, unhandled 500s captured). Env: `SENTRY_DSN` + `SENTRY_ENVIRONMENT` in backend/.env. Verified live (envelope delivered to project 4511682844360794, host o4511682676785152.ingest.de.sentry.io).
- PII scrubbing on BOTH: `send_default_pii=False` + a `before_send` redactor — strips cookies + Authorization/Cookie/X-Api-Key headers, masks emails, filters keys containing password/token/session_token/api_key/secret/stripe_customer_id/encryption_key/etc., drops user email/ip/username. `traces_sample_rate=0.1`.
- Structured LOGS enabled on both (Jul 2026): backend `enable_logs=True` + `before_send_log` scrubber; frontend `enableLogs: true` + `Sentry.consoleLoggingIntegration(['warn','error'])` + `beforeSendLog` scrubber. Verified `log_item` envelopes deliver to both EU projects. (Using Sentry Logs instead of BetterStack Logs to avoid tool overlap.)
- BetterStack: to be used for Uptime monitoring + Status page only (Sentry covers errors + logs). Not yet wired into code.
- Two separate EU projects (frontend "Browser JavaScript" + backend "FastAPI"). GitHub repo authorized in Sentry for suspect-commit/source linking. DSNs from env only (frontend DSN is public by design).


### Multi-Platform Telemetry Sync — Revenue Leak Detection (Jun 2026) — P1, Enterprise-tier + owner
- Cross-references product usage (Mixpanel / Amplitude) against billing contracts (Stripe) to catch unbilled overage revenue, then recovers it via a HUMAN-IN-THE-LOOP one-click flow (nothing auto-executes).
- Backend `/app/backend/routes/telemetry.py` (gated by `require_enterprise` = owner + tier contains 'enterprise'):
  - Contracts CRUD: `GET/POST/PUT/DELETE /api/telemetry/contracts` (customer, account_key, stripe_customer_id, contracted_seats, contracted_api_calls, unit_price_per_seat, currency, usage_source, am_email). Delete cascades to leaks.
  - `POST /api/telemetry/sync` — pulls per-account usage (seats = distinct users, volume = events) from connected Mixpanel/Amplitude via segmentation grouped by an account property (`/app/backend/routes/telemetry_sources.py`, best-effort, returns [] on error). 400 if no usage source connected.
  - `POST /api/telemetry/scan` — reconciles telemetry_usage vs contracts; flags `leaks` where used_seats > contracted_seats. est_unbilled = overage × unit_price/seat (monthly).
  - `GET /api/telemetry/leaks`; `POST /leaks/{id}/draft` (preview only: Stripe invoice + CRM deal + AI-drafted AM email via Claude); `POST /leaks/{id}/approve` (executes all three); `POST /leaks/{id}/dismiss`.
  - Approve creates a REAL Stripe DRAFT invoice (`Invoice.create(auto_advance=False, currency=..)` + `InvoiceItem.create(unit_amount_decimal, quantity)`; auto-creates a Stripe customer if none set, persists it back; falls back to a simulated draft when the key is the `sk_test_emergent` sentinel). Creates a CRM 'Expansion' deal (stage=qualified, source=expansion) on the pipeline. Emails the AM via Resend (utils/email.py).
- Frontend `/app/frontend/src/pages/RevenueLeaks.js` at `/revenue-leaks` (App.js TierGate level 3; sidebar Tools → "Revenue Leaks", minTier 3). Glass UI: Sync/Scan buttons, 3 stat cards (unbilled $/mo, open leaks, contracts), Detected Leaks list with Review&Recover/Dismiss, Contracts list + Add Contract dialog, Review modal (draft invoice + CRM preview + editable email + Approve/Dismiss).
- Added `source: Optional[str]` to the `Deal` model so expansion deals surface in GET /api/deals + dashboard source filter.
- Tested: iteration_43 (backend 9/9 pytest, frontend 100%). Verified LIVE Stripe draft invoice + CRM deal + real Resend email end-to-end. Seed: `python3 /app/backend/seed_telemetry.py` (Acme Corp: 100 contracted / 140 used = 40-seat leak ≈ $5,560/mo; upgrades testpro org to enterprise_monthly).
- NOTE: Per-account usage sync is real production code but untested live in this env (no real Mixpanel/Amplitude connected). Resend free-tier only delivers to the verified address (am_email seeded to 8digitsplus@gmail.com).


### Brand Accent Color (Jun 2026) — UI
- Accent evolved indigo → slate → **electric blue `#0052ff`**. Implemented by OVERRIDING the Tailwind `slate` palette in `tailwind.config.js` to a #0052ff-centered blue scale (50-900; slate-500=#0052ff, slate-400=#4d8bff) — so all `slate-*` utilities (all originally indigo, ~308 usages) render electric blue with ZERO component edits (fully reversible: change the config values). Also updated hardcoded values: index.css/App.css `--primary`/`--ring`/`--chart-1` HSL → `221 100% 50%`, `rgba(0,82,255,·)`, `.gradient-text`/`.pipeline-lead` `#0052FF`; JS hex scale (`#64748B→#0052FF`, `#94A3B8→#4D8BFF`, `#CBD5E1→#80ACFF`, `#475569→#0044D6`, `#334155→#0036A8`) incl. `constants/colors.js` lead stage. Violet `#8B5CF6` (Qualified chart stage) left intact. Restart required after config change. Compiles clean; landing verified.
- Logo fixed (Jul 2026): the recolor had botched `inflow-logo.png` into a 357×240 near-square export with heavy asymmetric padding (rendered tiny + "box" look under `h-* w-auto object-contain`). Restored from the good historical wide wordmark (commit `2c66a2c`, 908×263, fully transparent) and hue-recolored to pure electric blue via numpy brightness-modulated tint (R=0, B ramp 158→255 anchored on #0052ff), preserving the gradient + alpha edges. Cache-buster bumped `?v=4` → `?v=5` across all 9 frontend logo usages. Verified in navbar + dashboard sidebar.

### Floating Glass Pill Navbar (Jun 2026) — UI
- Bug fix (verified iteration_42, 100%): the Get Started CTA overflowed the pill at 1024-1200px because a `fixed left-1/2 -translate-x-1/2` element with `w-auto` is capped at 50vw. Fixed by centering via a full-width wrapper (`fixed inset-x-0 flex justify-center pointer-events-none`) + pill `pointer-events-auto w-full lg:w-auto max-w-full`; CTA now sits 25px inside the pill at all widths 1024-1920, click-through to hero preserved. Inline nav/CTAs are `lg:flex`, hamburger `lg:hidden`.
- Scroll behavior: shrinks + stronger blur (`bg-white/[0.08]`, `backdrop-blur-2xl`) past 20px, hides on scroll-down / reveals on scroll-up (translate-y), stays visible when mobile menu open.

### Sitewide Liquid-Glass Buttons (Jun 2026) — UI
- Rewrote shared `/app/frontend/src/components/ui/button.jsx` into a frosted liquid-glass button: translucent white bg + layered inset box-shadow "glass lens" (`GLASS_LENS`) + `backdrop-blur` + hover scale, `rounded-full`. Kept the full shadcn API (variants default/destructive/outline/secondary = glass; ghost/link = minimal text; sizes default/sm/lg/icon; `asChild`). The SVG displacement filter from the source was omitted (Firefox-only; no visible effect in Chrome/Safari/Edge). Verified clickable + non-blocking (testing_agent iteration_39, 5/5 flows pass).
- Neutralized explicit non-glass overrides site-wide so every button matches: `bg-indigo-600 hover:bg-indigo-500` (35 spots) + `bg-violet-600`/`bg-purple-600 hover:bg-purple-500` (AI/action buttons) + white pills `bg-white text-zinc-950 hover:bg-zinc-200` (auth submit, featured pricing CTA) → `bg-white/10 hover:bg-white/20 text-white`. Gutted `.btn-glow` in `index.css` (removed its box-shadow/transform overrides that hid the lens; kept the shine-streak). Google OAuth button kept white (brand).

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

## Recently Shipped (Jul 2026)
- **DIAGNOSED live-site failure = deployment/custom-domain misconfig (NOT code)**: user's legal pages (and in fact ALL API calls) fail on the custom-domain live site. Probing the live site proved: (1) the live frontend build targets `REACT_APP_BACKEND_URL="https://api.inflowft.com\n"` (trailing newline, set in the deploy env config), (2) `api.inflowft.com/` `/docs` `/api/auth/me` `/api/legal/content/privacy` ALL return the Emergent edge error `{"code":404,"message":"Application not found"}` — no backend is mapped to that hostname, (3) `www.inflowft.com/api/*` returns the SPA index.html (frontend domain doesn't proxy /api). Fix is on the user's side (via support_agent guidance): link `api.inflowft.com` to the backend deployment (Link Domain → Entri + DNS), remove the trailing newline in `REACT_APP_BACKEND_URL`, set backend `CORS_ORIGINS=https://www.inflowft.com,https://inflowft.com`, redeploy both. Code-side hardening done to support this: added `inflowft.com` (+ subdomains) to the credential-safe CORS `allow_origin_regex` in `server.py` so cross-origin calls work out-of-the-box once the backend is reachable (verified: `access-control-allow-origin: https://www.inflowft.com` echoed, 200).

- **Legal pages PRODUCTION fix — bundled static fallback + Mongo persistence** (`backend/routes/legal.py`, `backend/legal_content/{privacy,terms,cookies}.html`): live site showed "couldn't load / try again" on Privacy/Terms/Cookies while preview worked. Root cause: the backend fetches policy HTML from Termly (`app.termly.io`) at request time; the production egress couldn't reach Termly reliably and the only cache was in-memory (empty on cold start → 502). Fix: `_get_policy_html()` now falls back through a chain — fresh in-memory cache → live Termly (8s timeout, refreshes cache+Mongo+version) → stale in-memory → **Mongo-persisted last-known-good** (`legal_documents.content_html`) → **committed static copy** bundled with the backend. So the pages ALWAYS render regardless of Termly connectivity, and still auto-refresh when reachable. Verified: normal path 200; Termly-down + Mongo present → serves Mongo copy; Termly-down + Mongo empty → serves committed static file (no 502). **Requires redeploy to take effect on live.**
- **`.gitignore` deployment blocker fixed**: the file had been corrupted by a broken `echo -e` loop into ~30 duplicated `*.env`/`.env`/`.credentials` blocks + stray `-e` lines (lines 99-357), which blocked the required `.env` files from the repo. Rewrote it clean — `.env` files are no longer ignored (Emergent deploy needs them); real secrets (`*token.json*`, `*credentials.json*`, `*.pem`, `*.key`, `memory/test_credentials.md`) still ignored. deployment_agent now returns deployment-ready (WARN, no blockers).

- **Ad-blocker fix for legal pages (Opera/uBlock)** (`legal.py`, `LegalDocument.js`, 3 page wrappers): user couldn't view Privacy/Terms/Cookies in Opera (built-in tracker blocker on by default) — the blocker was silently killing the request to `/api/legal/policy/<uuid>` ("policy" keyword + bare tracking-style UUID matches common blocklist rules). Added a new slug-based endpoint `GET /api/legal/content/{privacy|terms|cookies}` (no UUID, no "policy" in URL) that blockers ignore; frontend now calls it (prop `slug` instead of `policyId`). Extracted `_get_policy_html()` helper (shared cache + stale-fallback). Legacy `/legal/policy/{id}` kept for compat. Verified: new endpoints 200, invalid slug 404, all pages render.
- **Legal pages reliability fix + refactor** (`LegalDocument.js` NEW, `PrivacyPolicy.js`/`Terms.js`/`CookiePolicy.js` → thin wrappers, `backend/routes/legal.py`): Root cause of intermittent blank/"couldn't load" legal pages was a fragile fetch (React StrictMode could drop the resolved response → stuck on "Loading" forever; no timeout, no retry) plus the backend re-fetching Termly on every view (cold-starts/hiccups broke it). Fix: backend now has an in-memory cache (6h TTL) with **stale-fallback** (serves last-known-good copy if Termly errors/empties); the 3 pages now share one hardened `LegalDocument` component with AbortController, a **12s client-side timeout → error state**, and a **"Try again" retry** button. All 3 pages verified rendering (Privacy/Terms/Cookies) via screenshot. Preserves existing testids (`privacy-content`, `terms-content`, `cookie-content`, etc.) + adds `*-retry-btn`.
- **Auth network-error hardening** (`AuthContext.js`): `loginWithEmail`/`registerWithEmail`/`verify2FA` fetches wrapped in try/catch so a genuinely unreachable backend surfaces a friendly "We couldn't reach the server…" toast instead of a raw browser "Failed to execute…" DOMException. Wrong password still returns clean "Invalid email or password" (backend 401). (The user's original "failed to execute" was the fork env still booting → backend momentarily unreachable.)
- **CORS production-safe fix** (`server.py`): removed hardcoded preview-URL fallback that broke prod. Now uses explicit `CORS_ORIGINS` when set, else a credential-safe `allow_origin_regex` matching localhost + `*.preview.emergentagent.com` + `*.emergent.host` + `*.emergentagent.com` (echoes specific Origin with `allow-credentials: true`, rejects unknown origins). Verified locally + deployment_agent PASS.

- **FAQ refresh** (`FAQSection.js`): corrected 3 outdated entries — sign-up/trial (now checkout-first, optional 14-day trial with card captured/$0 today, not "no card required"), data sources (now "35+ integrations across 5 categories" with examples per category + connect limits), and AI (broadened to the full suite incl. Competitor Intelligence). Verified via screenshot.
- **5 new integrations — Sage Accounting, Amazon Seller Central, Chargebee, Ramp, Brex** (`*_integration.py`): Sage (Finance/revenue, OAuth2 Bearer — short-lived token, best-effort), Amazon Seller (E-Commerce/revenue, SP-API via LWA refresh token → access token, no SigV4), Chargebee (Payments/revenue, Basic auth invoices), Ramp (Finance/**signal**, OAuth client-credentials card spend), Brex (Finance/**signal**, Bearer card spend). Ramp/Brex are spend/expense → signal role with value-0 summary records so they never inflate revenue. Catalog now **35 platforms** (Payments 8 · E-Commerce 7 · CRM 8 · Finance 5 · Analytics 7). Verified: backend imports clean, `/api/business/platforms` returns 35, connect endpoints reach real APIs (Sage token, Amazon LWA invalid_client, Chargebee, Ramp err 5006, Brex), all render under correct category filters.
- **5 new analytics integrations** (PostHog, Google Analytics 4, Adobe Analytics, Tableau, LogRocket): live read-only SIGNAL connectors (`*_integration.py`), category Analytics, `default_revenue_role: signal` (value-0 summary records, never touch revenue — mirrors Amplitude/Mixpanel pattern). PostHog (Bearer personal key + HogQL query), GA4 (service-account JSON via `google-auth` → Data API runReport), Adobe Analytics (OAuth S2S → IMS token → reports, best-effort), Tableau (PAT sign-in → workbook/view counts, uses `google-auth`? no), LogRocket (Highlights API validation only — no metrics REST API, connection-signal only). Catalog now 30 platforms. Verified: backend imports clean, `/api/business/platforms` returns 30, connect endpoints reach real APIs (PostHog 401, Adobe IMS invalid_client, GA4 JSON validation, LogRocket 401, Tableau DNS), all 5 render under Analytics filter.
- **5 new CRM integrations** (Pipedrive, monday.com, Insightly, Oracle CX Sales, Freshsales): live read-only deal/pipeline connectors (`*_integration.py`), category CRM, `default_revenue_role: pipeline`. Pipedrive (REST v2, `x-api-token`), Insightly (v3.1 Opportunities, Basic auth, pod), Freshsales (deals via view_id, Token auth), Oracle CX (Fusion crmRestApi opportunities, Basic auth, instance URL), monday.com (GraphQL board items — best-effort deal-value inference from columns, optional Board ID). Catalog now 25 platforms. Verified: backend imports clean, `/api/business/platforms` returns 25, connect endpoints reach real APIs (Pipedrive 401, monday "Not authenticated"), all 5 render under CRM filter. Oracle CX error message hardened for empty httpx timeout reprs.
- **Removed per-connection role dropdown** (`ConnectBusiness.js`): the Revenue/Pipeline/Signal `<select>` on connected cards was removed for a cleaner UI. Classification is now fully automatic — the backend still assigns `default_revenue_role` per platform on connect (Stripe→Revenue, HubSpot→Pipeline, Analytics→Signal), so analytics bucketing is unchanged. Backend `PUT /business/connection/{platform}/role` endpoint left intact (unused by UI). Verified: 0 role dropdowns rendered.
- **Integrations page: category filter + search** (`ConnectBusiness.js`): category pills (All · Payments · E-Commerce · CRM · Finance · Analytics, derived dynamically from platform catalog) + a live search box (matches name/description/category) filter the "Available Platforms" stack. Empty state when no match. Verified: Payments → 7 cards, search "woo" → 1 card. Testids: `category-filter`, `category-pill-*`, `integration-search-input`.
- **5 new e-commerce integrations** (WooCommerce, Squarespace, Square Online, OpenCart, Volusion): live read-only order/revenue connectors (`*_integration.py`), category E-Commerce, `default_revenue_role: revenue`. WooCommerce (REST v3 Basic auth, JSON), Squarespace (Commerce API Bearer+User-Agent, JSON), Square Online (Square Orders API `POST /v2/orders/search`, reuses Square token), OpenCart (native REST `api/order/list`, Basic auth, defensive JSON parse), Volusion (Generic XML export `WebService.aspx`, ElementTree parse). Catalog now 20 platforms. Verified: backend imports clean, `/api/business/platforms` returns 20, connect endpoints return clean 400s (Squarespace + Square Online reach real APIs; Woo/OpenCart/Volusion reach the given store URL), all 5 cards render. Note: OpenCart/Volusion are legacy — response shapes vary per store, so parsing is best-effort and may need per-store tuning.
- **5 new payment integrations** (Square, Paddle, Checkout.com, SumUp, Airwallex): live read-only data-source adapters following the existing connector pattern (`{square,paddle,checkout,sumup,airwallex}_integration.py`, each with `validate_*` + `fetch_*_data` normalizing to `{deals, total_records, stats}`). Wired into `business.py` PLATFORMS catalog, CONNECT_HANDLERS, and the `sync_platform` branch. All classified `default_revenue_role: revenue`, category Payments. Verified: backend imports clean, connect endpoints reach real provider APIs (clean 400s on bad keys), frontend renders. Note: Airwallex API is edge/WAF-blocked (403) from the preview container IP — code matches docs, validate with real creds post-deploy. ⚠️ Double-counting guardrail NOT yet added — stacking overlapping revenue sources can inflate totals (use the per-source Revenue/Pipeline/Signal role dropdown to mitigate).
- **Landing footer redesign**: Replaced `Footer` in `CTAFooter.js` with a 21st.dev-style animated footer (framer-motion staggered blur-in via `AnimatedContainer`, respects `prefers-reduced-motion`). Rounded-top glassmorphism panel with brand column (logo/tagline/copyright) + Product (#features/#pricing/#integrations/#faq), Company (Contact/Support/Sign In), Legal (Privacy/Terms/Cookies/Consent Preferences → Termly modal), Social (Twitter/LinkedIn/GitHub) columns. Added `id="integrations"` to ConnectBusinessSection for the anchor. Brand tagline updated to the "Integrate your business data…" copy. Verified via screenshot.
- **Checkout-first onboarding**: Choose Plan → Checkout → create account inline → pay. Made `/choose-plan`, `/checkout`, `/checkout/return` public; added a "Create your account" step (name/email/password) on the checkout screen that registers the user (session cookie) then swaps to Stripe Embedded Checkout. New signups get the 14-day trial (card captured, $0 today, charged after trial). Existing email → error + "Log in instead". Landing CTAs ("Get Started", "Start Trial", pricing buttons) now route into this flow; `/auth` kept for returning-user login. Fixed a `userCount` ReferenceError in Checkout. Verified end-to-end via screenshots (logged-out choose-plan/checkout, account creation → Stripe trial checkout, existing-email path).
- **Removed per-user pricing + team feature entirely** (single-user workspaces): deleted seat-sync, `users`/`quantity`/seat multiplication, `seat_count`, `/api/org/seats` + invite/member routes (organizations.py → only `/org/me`), `TeamSection`, `AcceptInvite`, and all "unlimited team" copy.
- **Flat per-workspace pricing**: Essential $99/mo ($830/yr), Pro $149/mo ($1,250/yr), Enterprise $400/mo ($3,360/yr); yearly ≈30% below monthly-annualized.
- **Landing/pricing polish**: Refreshed hero dashboard preview; added "Competitor Intelligence" to Enterprise; removed "Most Popular" badge; ChoosePlan "Back" → landing; glass toggles; landing features card → Competitor Intelligence.
- **Integrations page layout**: Converted the "Live Integration" (/connect-business) "Available Platforms" and "Your Data Sources" from a jagged 3-column grid into a clean single-column vertical stack of uniform horizontal rows (identity/description left, actions right).
- **Competitor Intelligence** (Enterprise, owner-only): add competitor + pricing-page URL → BS4 scrape + Claude AI extraction of structured plans + positioning summary. Editable, rescannable with price-change history, benchmarked vs org's own reference pricing. Route `/competitor-intel` (sidebar 'Competitors' under Analytics, minTier 3). Backend `/api/competitors/*`. Tested end-to-end (iteration_44: backend 16/16, frontend 100%).

## Key API Endpoints
- `/api/competitors` (+ /status, /benchmark, /my-pricing, POST create+extract, /{id}/rescan, PUT, DELETE) - Competitor Intelligence
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

## Jun 2026 — Scalekit live-connect blocked (3rd-party) + sample-data unblock
- User (testpro@test.com, org_15337f4cefc9) attempted live Scalekit DEV connect for QuickBooks and hit
  Scalekit-side errors: `failed_to_exchange_token / Error executing post auth hooks`, then a generic
  "Failed to load page" on Scalekit's auth window. Confirmed: using Scalekit MANAGED dev credentials,
  User Verification still "Custom user verifier". No request reached InFlow — failure is inside Scalekit infra.
- Added debug logging (tag `[scalekit-sync]`) in routes/scalekit_integration.py `_import_and_store` to print
  the raw tool payload + first mapped deal on any real sync, for live mapping verification.
- Created `/app/backend/seed_scalekit_sample.py` — seeds 16 SAMPLE synced deals (QB 6 / SF 5 / Stripe 5,
  every doc tagged `sample:True`) mirroring `_map_records` output, so the InFlow side (Deals page + revenue
  metrics) is testable now. Verified live via GET /api/deals. Clean with `--clean`.
- KNOWN MAPPING LIMITATION surfaced: Salesforce opportunities map company→hardcoded "Salesforce" (not the
  Account name). Candidate improvement when a real SF sync lands.

## Jun 2026 — Stripe (Scalekit) VERIFIED LIVE
- Stripe connector now proven end-to-end with REAL data: 10 real charges imported into testpro's org
  ($22,088.60 collected), mapping verified correct (amount/100, succeeded→closed_won, unix→date, desc→name,
  billing name→company). Status endpoint reports stripe ACTIVE / records_synced=10.
- Root cause of earlier "connected but empty": identifier mismatch — user authorized Stripe under personal
  email (8digitsplus@gmail.com) outside InFlow's button; InFlow keys by org_id. Added `_active_account`
  owner-email fallback; one-off linked the active account_id to the org (scalekit_integration.md has details).
- QuickBooks + Salesforce live OAuth still blocked on Scalekit managed-dev creds (QB portal won't open; SF
  OAUTH_APPROVAL_ERROR_GENERIC). Their sample data remains for InFlow-side testing. Need BYO OAuth apps to go live.

## Jun 2026 — Data-integrity hardening (loops & multi-source conflicts) — DONE
- **Fix 1 — Revenue double-count (primary-source model):** collected revenue now = closed-won from the org's ONE primary revenue source + manual deals. Pipeline-role (SF/HubSpot/Pipedrive) & non-primary revenue sources no longer inflate revenue. New `utils/revenue.py` (get_revenue_context / counts_as_revenue / revenue_source_match). Applied to /analytics/revenue, churn, sales-revenue, revenue-intelligence, forecasting. New API: GET/PUT /api/business/revenue-settings (owner-only, validates primary must be a connected revenue-role source). Verified: testpro headline $555,038.60 (naive all-source) → $444,588.60 (correct).
- **Fix 2 — Scalekit↔native collision guard:** both systems import into db.deals under the same `source`; reconcile is now provider-scoped (scalekit rows tagged provider="scalekit"; native = "native"/absent) so one system's sync never wipes the other's. GET /api/integrations/scalekit/{c}/start returns 400 if a native connection for that platform exists (native connect already blocked the reverse).
- **Fix 3 — Preserve local edits on re-sync:** PUT /api/deals/{id} on a synced deal sets locally_modified=True; shared `utils/deal_sync.py apply_sync()` never deletes locally_modified deals and dedupes incoming by external_id (real source id: Stripe charge id / QB Invoice Id / SF Opp Id; else deterministic hash). No duplicates on re-sync. Used by BOTH scalekit (_import_and_store) and native (connect_platform + sync_platform).
- Tests: /app/backend/tests/test_revenue_integrity.py (17/17 pass, iteration_65.json). NOTE: Deal response_model strips synced/external_id/locally_modified/provider from API responses (DB has them) — expose on the Deal model later only if the UI needs a "locally edited" badge.

## Jun 2026 — AI feature specialization (pass 1: Churn, Pricing, CRO, Insights) — DONE
- Goal: stop AI features feeling "loopy"/overlapping. Each AI feature is now TRUE TO ITS FEATURE: distinct persona + explicit "stay in your lane" guardrail, grounded on the deterministic analytics numbers (single source of truth), and returns STRUCTURED JSON rendered as per-feature CARDS.
- Model upgraded: claude-sonnet-4-5-20250929 -> **claude-sonnet-5-5** (via integration_expert) in routes/ai.py.
- Endpoints reworked (routes/ai.py): /ai/insights (exec revenue-health signals), /ai/churn-prediction (risk score + save-plays, grounded on /analytics/churn), /ai/pricing-analysis (price moves + upside, grounded on /analytics/pricing), /ai/cro-recommendations (funnel experiments, grounded on /analytics/cro). Shared helper `_ai_cards` + `_parse_ai_json` with deterministic structured fallback (ai_used flag).
- Frontend: new `components/AiInsightCards.js` (InsightCards/ChurnCards/PricingCards/CroCards). Wired into Dashboard, ChurnRetention, PricingOptimizer, and a NEW "AI experiments" card on ConversionOptimization (Analyze step). Tested iteration_66.json (4/4 pass).
- PENDING (pass 2, user said "do the rest after"): specialize remaining AI — upsell email, workspace drafts, lead intent, competitor analysis/actions, telemetry recovery email, forecast narrative (several still use the old `_ai_text` generic helper + claude-sonnet-4-5).
- KNOWN non-blocking: ChurnRetention page has pre-existing invalid DOM nesting (<span> inside table) causing console hydration warnings — not from this change.

## Jun 2026 — $ prefix on currency inputs (UI polish) — DONE
- New reusable components/MoneyInput.js ($-prefixed field). Applied to all money inputs: RevenueForecast target, Pipeline deal value, AccountWorkspace amount x2, Workspace deal/offer amount, UpsellEngine price, CompetitorIntel price, RevenueLeaks price-per-seat, ConversionOptimization value/conversion. Non-money fields (%, counts, OTP) intentionally left as plain inputs. Removed now-redundant "($)" from those labels. Frontend compiles clean.

## Jun 2026 — Sync scheduler rework (tier frequencies) — DONE
- Essential: DAILY at a user-picked time + timezone (was weekly; weekday field removed and $unset from old docs).
- Pro + Trial: every 1/2/4/8 hours (dropdown, default 4) on a CLOCK-ALIGNED grid in the org's timezone (e.g. 4h -> 00:00, 04:00, 08:00…). compute_next steps 15-min in UTC so :30/:45 offsets + DST are handled.
- Enterprise: unchanged real-time every 15 min. Expired: off.
- "Sync now" button REMOVED on every plan; POST /api/sync/run-now endpoint removed.
- GET /api/sync/settings now returns schedule.interval_hours, intervals [1,2,4,8], dynamic mode_label ("Every 4 hours"). Next-sync time is shown in the schedule's timezone with a tz suffix. Timezone list always includes UTC + current value (Chromium omits UTC/Asia/Kolkata).
- Files: backend/routes/sync_schedule.py, frontend/src/pages/Sync.js, components/sync/{SyncScheduleCard,syncUtils,SyncActivity,SyncSettingsCard}.js. Tests: backend/tests/test_sync_schedule.py (29/29), iteration_78.json.

## Jun 2026 — Featurebase feedback widget check
- Blank Feedback panel on preview (no text box) reproduced: the Featurebase Feedback module has no boards yet, so the widget shell renders with no form. This is a Featurebase dashboard setting, not a code bug.
- Termly Auto-Blocker holds back do.featurebase.app/js/sdk.js until cookies are accepted (iframe tagged data-categories="unclassified"). Suggested to the user: a Termly Domain Rule to mark Featurebase as Essential.
- JWT companies key MUST stay `id`. Changing it to `companyId` (one help article says so) made Featurebase reject the whole JWT ("Invalid featurebaseJwt"), which broke Messenger and Feedback. Reverted and verified: identify 200, company attached. The JWT spec article (5257986) confirms `id`. `plan` is sent in the JWT (raw subscription_tier).
- Feedback panel still blank: /api/v1/feedback/widget/config returns `postCategories: []` (feedbackModuleEnabled true, access granted). Featurebase wasn't exposing any category to the widget. RESOLVED after the user fixed the category settings: the widget now lists Bug Report / Integration requests / Feature Request, opens a form (title, description, screenshot, Send) and accepts typing. Verified on preview, nothing submitted.

## Jun 2026 — Sentry -> ProdFix switch (code done, KEY PENDING)
- Sentry removed completely: @sentry/react, sentry-sdk, lib/sentry.js, utils/sentry_config.py, SENTRY_* env.
- Frontend: @prodfix/sdk 0.9.0, frontend/src/lib/prodfix.js (no-op without REACT_APP_PRODFIX_KEY). On: errors, web vitals/long tasks, rage/dead clicks, slow interactions, page views. Off: response bodies/headers, form fields/abandonment, heatmaps, scroll depth, copy tracking, security, apiHealth, runtime hooks. identifyUser(user_id, {plan}) only, no email; reset on logout. A custom AppErrorBoundary in index.js reports React render errors.
- Backend: utils/prodfix.py. There's no Python SDK, so ERROR log records go through a QueueHandler -> background thread -> POST https://prodfixai.com/v1/events with header X-ProdFix-Key, body {events:[{category:"bug", payload:{type:"error", errorType, message, stack, route, environment, source:"backend"}, timestamp, priority:"high"}]}. This format was taken from the SDK's own code. Emails masked; each error location sends at most once per 60s. The unhandled-exception handler logs with exc_info + route.
- Env: REACT_APP_PRODFIX_KEY / REACT_APP_PRODFIX_ENVIRONMENT (Vercel), PRODFIX_KEY / PRODFIX_ENVIRONMENT (Railway). Preview env = "preview".
- ProdFix key set on preview (project key pf_fbb9…, in .env only). Backend: Cloudflare blocks Python-urllib's default UA (error 1010), so utils/prodfix.py sends User-Agent "InFlow-Backend/1.0". Verified: real pipeline -> 200 {"accepted":1}. Browser: 403 "Origin not allowed for this project"; the preview URL has to be added to the ProdFix project's allowed URLs.
- Preview URL allowed in ProdFix. Browser events now accepted (200, about 67 events over 23s on the dashboard in dev mode). Backend events accepted. ProdFix switch DONE on preview. For production the user must set Vercel REACT_APP_PRODFIX_KEY + REACT_APP_PRODFIX_ENVIRONMENT=production and Railway PRODFIX_KEY + PRODFIX_ENVIRONMENT=production BEFORE pushing, remove the SENTRY_* vars, and replace Sentry with ProdFix in the Termly privacy policy subprocessor list.
- PRODUCTION VERIFIED (pushed by user): the live site is https://www.inflowft.com (the apex domain redirects to www). The bundle has the ProdFix key and environment "production", with 0 Sentry references. /api/health is healthy. ProdFix accepted browser events from the www origin (27 events over 2 public pages). Backend ProdFix can only be confirmed from the Railway logs ("ProdFix error reporting enabled (backend)").

## Jun 2026 — Stripe live-mode readiness + update notifications — DONE (iteration_79: backend 16/16, frontend 100%)
- The live site was found to be on Stripe TEST mode (pk_test in the www.inflowft.com bundle). User chose option B: switch to LIVE, no promo codes.
- payments.py: stripe_mode() (sk_live_ -> live), _mode_filter, _same_mode. stripe_prices and stripe_coupons are cached per mode (legacy docs with no mode count as test; the in-memory key is "mode:plan"). Users, orgs and transactions store stripe_livemode (from session.livemode or the webhook data). Billing portal, subscription details, cancel and auto-renew ignore Stripe IDs from the other mode. Test: backend/tests/test_stripe_mode_separation.py.
- Revenue Leaks approve no longer creates a Stripe customer or invoice in InFlow's platform account. It returns actions.invoice.mode="manual" and the UI says "Create this invoice in your Stripe" with an Open Stripe link. If the CRM deal insert fails, the leak is released back to open. telemetry status no longer returns stripe_live.
- Update notifications: components/UpdatePrompt.js (checks the main.[hash].js in index.html every 5 min and on focus; shows a top-center "InFlow has been updated — Refresh" pill above the Termly banner). index.js AppErrorBoundary reloads once on ChunkLoadError (sessionStorage guard of 30s). FeaturebaseBoot has useChangelogWidget popup (autoOpenForNewUpdates); the user publishes entries in Featurebase Changelog.
- Known benign: the Featurebase SDK logs "identify ... Either organization or appId must be provided" twice (its widget hooks fire before the slug resolves). The real identify returns 200.
- Production: api.inflowft.com/api/health is healthy; the webhook rejects unsigned POSTs (400), so the secret is configured. PENDING ON THE USER: live keys in Vercel/Railway, a live webhook + whsec, activating the live Customer portal, and a $0 trial checkout test.
- FIX (Jun 2026): stripe-python 14.4.0 is pinned to API 2026-02-25.clover. Since basil (2025-03-31), subscription.current_period_end lives on items.data[].current_period_end and invoice.subscription moved to invoice.parent.subscription_details.subscription. Added _period_end() and _invoice_subscription_id(), which handle both shapes. They're used by /subscription/details, /subscription/auto-renew and the invoice.paid / invoice.payment_failed webhooks. Verified: real test sub gives a renewal date; signed clover-shaped webhooks flip past_due -> active; test_stripe_mode_separation 6/6.
- Live webhook settings for the user: Your account, Snapshot payload, API version 2026-02-25.clover (or the newest clover), endpoint https://api.inflowft.com/api/webhook/stripe, 5 events.
