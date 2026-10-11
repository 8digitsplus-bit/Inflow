# Test Credentials

## Main Test Account (Org owner — NOW Enterprise Monthly)
- Email: testpro@test.com
- Password: password
- user_id: user_393ea5f333cb
- org_id: org_15337f4cefc9 (name: "Test Pro User's Team")
- Role: owner
- Subscription: enterprise_monthly (org + user) — upgraded from pro_monthly by /app/backend/seed_telemetry.py so the Enterprise-gated Multi-Platform Telemetry Sync (Revenue Leaks) feature is reachable.

## Scalekit SAMPLE data (Jun 2026)
- `cd /app/backend && python3 seed_scalekit_sample.py` seeds 16 sample synced deals into testpro's org
  (org_15337f4cefc9): QuickBooks 6, Salesforce 5, Stripe 5. Every doc tagged `sample:True` (and `synced:True`).
- Visible on the Deals page filtered by source; feeds revenue metrics. Remove with `python3 seed_scalekit_sample.py --clean`.
- Seeded because live Scalekit DEV QuickBooks OAuth fails on Scalekit's side (managed dev creds; "Error executing post auth hooks").

## Multi-Platform Telemetry Sync / Revenue Leaks (Jun 2026)
- Page: /revenue-leaks (Enterprise-tier + owner only). Sidebar: Tools → "Revenue Leaks".
- Seed: `cd /app/backend && PYTHONPATH=/app/backend python3 seed_telemetry.py` then POST /api/telemetry/scan.
  Seeds contract "Acme Corp" (100 seats @ $139, usage_source=mixpanel, am_email=8digitsplus@gmail.com) + a telemetry_usage reading (140 seats) → 40-seat leak (~$5,560/mo).
- The AM email is set to 8digitsplus@gmail.com because Resend free-tier only delivers to that verified address in this env.
- Live Stripe draft invoice creation WORKS at runtime (platform injects a real sk_test key; the .env sentinel `sk_test_emergent` is swapped at runtime). Approve auto-creates a Stripe customer if none set.


## Upsell Engine / Revenue Execution (Jul 2026)
- **NEW — Upgrade Outreach Workspace (Jun 2026):** `/upsell` candidates list is now a cohort-style TABLE; the "Upgrade email" row action navigates to `/upsell/outreach?candidate={id}` (`OutreachWorkspace.js`, Enterprise+owner). Flows: intent tabs (Priority/Sales/Marketing), AI draft, behavioral + keyword labels, @ assignee routing, paste-links, Slack-webhook alert, push to HubSpot/Salesforce, and user-configurable Undo-Send (10/30/60s) via backend queue `upsell_outbound_queue` dispatched by a `server.py` startup worker. Backend: `routes/outreach.py`. testpro's org has 15 candidates after a scan + demo HubSpot/Salesforce connections. Verified: testing_agent iteration_67.json (100%).
- Pages: /discover (High-Intent Buyers, any paid tier), /upsell (Upsell Engine, enterprise), and /workspace (Action Workspace, any paid tier) under the "Revenue Execution" sidebar group.
- **Action Workspace (/workspace)** — MULTI-PROVIDER as of Jun 2026: per-action destination selector to push to HubSpot, Salesforce, or Pipedrive. Action kinds: note, task, call, email, deal, and NEW **offer** (offer → HubSpot/Salesforce Quote object; Pipedrive has no Quotes API so offer is saved as a structured note on the deal; offer REQUIRES a deal target). Human-in-the-loop confirm dialog before any write.
  - testpro is owner + paid so full access. testpro's org now has DEMO connections for all three: HubSpot ("Demo Hubspot"), Salesforce ("Demo Salesforce", instance demo.my.salesforce.com), Pipedrive ("Demo Pipedrive", domain democompany) — all with INVALID tokens, so targets lists are empty and execute returns a graceful HTTP 422 ("reconnect / authentication failed") per provider. Real writes need valid write-scoped tokens.
  - Backend write clients: routes/hubspot_write.py (add create_quote), routes/salesforce_write.py (NEW), routes/pipedrive_write.py (NEW). Route dispatch: routes/workspace.py. Backend tests: /app/backend/tests/test_workspace.py (29/29 pass).
- Page: /upsell (Enterprise-tier + owner only). Sidebar: "Revenue Execution" → "Upsell Engine".
- testpro@test.com is Enterprise + owner, so it has full access. Candidates come from `db.deals` + `db.telemetry_usage`; run `POST /api/upsell/scan` to populate.
- Email send + notify-sales use Resend; the preview RESEND_API_KEY is INVALID, so those return HTTP 422 with a readable detail (drafts still generate). Real sends need a valid key + verified sender.
- Backend tests: /app/backend/tests/test_upsell_engine.py (18/18 pass).

## Demo Account
- Email: testdemo@inflow.com
- Password: password
- **Note (Jul 2026):** Downgraded from `enterprise_monthly` to `trial` by testing agent (iteration 44) to properly exercise the Competitor Intelligence Enterprise tier gate. Trial has expired, so this account also exercises the trial-expired gate.

## Org / Team Management Notes (Feb 2026)
- Invite emails require RESEND_API_KEY in /app/backend/.env. If empty, the /api/org/invite endpoint still works — it returns the `accept_url` in the JSON response so the flow is testable without Resend. User needs to set the key for production email sending.
- To temporarily upgrade testpro's org to Enterprise for testing: run `cd /app/backend && PYTHONPATH=/app/backend python3 /tmp/make_enterprise.py` (script lives in /tmp — recreate if missing).
- Member test account: created dynamically by the org_team tests (TEST_MEMBER_* prefixes). No static member account currently seeded.

## High-Intent Buyers hub (/discover) — Feature 2 (Oct 2026)
- Seed/reset: `cd /app/backend && PYTHONPATH=/app/backend python3 seed_intent_cloud.py` (RESETS testpro intent data; loads SAMPLE events, 3 AEs, rule `rr_seed_hot`, storefront `sf_seed_enterprise`; points testpro's "Demo Stripe" connection at the .env Stripe TEST key so promo codes are real test-mode objects).
- AEs: Jordan Lee (NA, ≤$100k) / Priya Shah (EMEA, APAC) / Marco Silva (≥$100k) — emails 8digitsplus+jordan|priya|marco@gmail.com.
- Public hosted quote page example: /rc/rc_HcZRBxI3prOr5NtLARz2iw (Nakatomi Trading). Active Stripe promo on sf_seed_enterprise: RCDF0E1A.
- testpro's HubSpot token is REAL (pushes create real notes/tasks); Salesforce/Pipedrive are demo tokens (422 by design); Slack not configured.
- Scalekit (Dev env) for testpro: QuickBooks ACTIVE + live (34 sandbox invoices synced via POST /api/integrations/scalekit/quickbooks/sync), Stripe ACTIVE, Salesforce PENDING_AUTH.

## Direct CRM connections (Oct 2026) — Zoho CRM 2-way + Salesforce client-credentials
- testpro now has a **Demo Zoho CRM** connection (fake client id/secret/refresh token, data center com) and the **Demo Salesforce** connection was converted to client-credentials (fake Consumer Key/Secret, My Domain demo.my.salesforce.com). Both are DEMO → every Zoho/Salesforce read/write returns a clear 400/422 error by design until the user supplies real credentials.
- Scalekit now lists only QuickBooks + Stripe.
