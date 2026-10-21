# InFlow — ROADMAP

## P0
- REDEPLOY production (live site still runs an old build with Useberry; cancel-at-period-end and the legal fallback refresh aren't live)
- Make ProdFix wait for cookie consent (__pf_did/__pf_session localStorage is written before consent; PECR)
- Cookie Policy: add session_token, inflow_authed/inflow_last_account, __pf_did/__pf_session manually; rescan Termly after redeploy (csrf_token 'Django' / s7 'Adobe' likely Useberry)
- Closed beta launch checks: live sign-up end to end, Resend delivery to real inboxes
- User: enable MongoDB Atlas Flex backups

## P1
- Upsell Engine rework, Feature 3 (WAIT for user requirements)
- Publish the finished DPA (user is drafting it in an external generator), e.g. at /dpa, and link it in Terms §27, the footer and the Settings Privacy & legal card

## P2
- "Disable AI features" toggle in Settings → Privacy
- Integration Health Dashboard
- Email-scheduled forecast reports / daily AI briefing

## P3
- "Export my data" (CSV/JSON) in Settings → Privacy
- Termly cookie banner re-injects on SPA navigation
- Landing hero mockup still shows the old "Active Deals" KPI
- Test suite speed-up
- Supabase Auth migration (post-beta)
- Abandoned-checkout recovery email (Resend)
- Customer Success integration (e.g. Gainsight)
