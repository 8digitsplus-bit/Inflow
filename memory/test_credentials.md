# Test Credentials

## Main Test Account (Org owner — NOW Enterprise Monthly)
- Email: testpro@test.com
- Password: password
- user_id: user_393ea5f333cb
- org_id: org_15337f4cefc9 (name: "Test Pro User's Team")
- Role: owner
- Subscription: enterprise_monthly (org + user) — upgraded from pro_monthly by /app/backend/seed_telemetry.py so the Enterprise-gated Multi-Platform Telemetry Sync (Revenue Leaks) feature is reachable.

## Multi-Platform Telemetry Sync / Revenue Leaks (Jun 2026)
- Page: /revenue-leaks (Enterprise-tier + owner only). Sidebar: Tools → "Revenue Leaks".
- Seed: `cd /app/backend && PYTHONPATH=/app/backend python3 seed_telemetry.py` then POST /api/telemetry/scan.
  Seeds contract "Acme Corp" (100 seats @ $139, usage_source=mixpanel, am_email=8digitsplus@gmail.com) + a telemetry_usage reading (140 seats) → 40-seat leak (~$5,560/mo).
- The AM email is set to 8digitsplus@gmail.com because Resend free-tier only delivers to that verified address in this env.
- Live Stripe draft invoice creation WORKS at runtime (platform injects a real sk_test key; the .env sentinel `sk_test_emergent` is swapped at runtime). Approve auto-creates a Stripe customer if none set.


## Demo Account
- Email: testdemo@inflow.com
- Password: password

## Org / Team Management Notes (Feb 2026)
- Invite emails require RESEND_API_KEY in /app/backend/.env. If empty, the /api/org/invite endpoint still works — it returns the `accept_url` in the JSON response so the flow is testable without Resend. User needs to set the key for production email sending.
- To temporarily upgrade testpro's org to Enterprise for testing: run `cd /app/backend && PYTHONPATH=/app/backend python3 /tmp/make_enterprise.py` (script lives in /tmp — recreate if missing).
- Member test account: created dynamically by the org_team tests (TEST_MEMBER_* prefixes). No static member account currently seeded.
