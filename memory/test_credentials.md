# Test Credentials

## Main Test Account (Org owner — Pro Monthly)
- Email: testpro@test.com
- Password: password
- user_id: user_393ea5f333cb
- org_id: org_15337f4cefc9 (name: "Test Pro User's Team")
- Role: owner
- Subscription: pro_monthly (org + user)

## Demo Account
- Email: testdemo@inflow.com
- Password: password

## Org / Team Management Notes (Feb 2026)
- Invite emails require RESEND_API_KEY in /app/backend/.env. If empty, the /api/org/invite endpoint still works — it returns the `accept_url` in the JSON response so the flow is testable without Resend. User needs to set the key for production email sending.
- To temporarily upgrade testpro's org to Enterprise for testing: run `cd /app/backend && PYTHONPATH=/app/backend python3 /tmp/make_enterprise.py` (script lives in /tmp — recreate if missing).
- Member test account: created dynamically by the org_team tests (TEST_MEMBER_* prefixes). No static member account currently seeded.
