# Scalekit AgentKit integration (QuickBooks, Salesforce, Intercom) — REST only

## CRITICAL LEARNING
- DO NOT install `scalekit-sdk-python`. It upgrades starlette/pydantic/protobuf/uvicorn and breaks the
  app's pins (fastapi 0.110.1 / starlette 0.37.2 / pydantic 2.12.5). Use the REST API + httpx only.
- The prior REST implementation was written against an ASSUMED API and was broken. The VERIFIED live
  API (docs.scalekit.com/agentkit/apis) is below. Base = SCALEKIT_ENVIRONMENT_URL.

## VERIFIED REST flow (what routes/scalekit_integration.py now does)
1. Token: `POST /oauth/token` (form: client_id, client_secret, grant_type=client_credentials) -> access_token.
2. Create connected account (REQUIRED before magic link):
   `POST /api/v1/connected_accounts`
   body: {"connected_account": {}, "connector": <conn_name>, "identifier": <org_id>}
   - 201 created / 409 already-exists are both OK.
   - "connection not found for the given key" (code 5) => the connector is NOT set up in the dashboard.
3. Magic link (authorization link):
   `POST /api/v1/connected_accounts/magic_link`
   body: {connector, identifier, state, user_verify_url} -> {link, expire_time}
4. Redirect user to link -> provider OAuth -> Scalekit redirects to user_verify_url with ?auth_request_id&state.
5. Verify (Custom user-verifier mode):
   `POST /api/v1/connected_accounts/user/verify` body: {auth_request_id, identifier} -> activates account.
6. Read account metadata:
   `GET /api/v1/connected_accounts/details?connector=<name>&identifier=<org_id>`
   -> {connected_account: {id, status, ...}}
7. Execute tool: `POST /api/v1/execute_tool` {connected_account_id, tool_name, params} -> {data}.

## Our routes (all prefixed /api)
- GET  /api/integrations/scalekit/status         -> {configured, connectors, connected:{platform:{...}}}
                                                    (only status=="ACTIVE" rows are reported as connected)
- GET  /api/integrations/scalekit/{connector}/start (owner) -> {url}  (create-account + magic_link)
- GET  /api/integrations/scalekit/verify?auth_request_id&state   (Scalekit redirect target; Custom-mode)
- POST /api/integrations/scalekit/{connector}/sync  (owner)  (re-import for an already-connected connector)
- POST /api/integrations/scalekit/{connector}/finalize (owner)  FALLBACK: reconcile status via /details and
        import if ACTIVE. Used when the connection is NOT in Custom user-verification mode (no redirect callback).

## Connected-account statuses (observed live)
- Not yet authorized: status == "PENDING_AUTH" (account exists after create, no OAuth done).
- Authorized/ready:    status == "ACTIVE"  -> only then do we store the mapping + import.
- _store_and_import() allowlists ACTIVE only; verify() and finalize() both call it.
- details response confirms individual mode: is_org_wide_credential:false. provider:"QUICKBOOKS", id starts "ca_".
- verify() calls user/verify best-effort (ignore failure) then _store_and_import (mode-independent).

## Naming
- `connector` value sent to Scalekit = the dashboard connection's key_id (usually quickbooks/salesforce/intercom).
- Override per connector via env: SCALEKIT_CONNECTION_QUICKBOOKS / _SALESFORCE / _INTERCOM.
- identifier = org_id (opaque, per-org). state = single-use CSRF token mapped to org_id in db.scalekit_oauth_states.

## Env (backend/.env) — DEV/sandbox
- SCALEKIT_ENVIRONMENT_URL=https://mdu4yj7kei4ac.scalekit.dev  (.dev = Development/sandbox; .com = Production)
- SCALEKIT_CLIENT_ID=skc_...   SCALEKIT_CLIENT_SECRET=test_...
- APP_BASE_URL = preview URL now; becomes live URL when deployed (redirect follows this automatically).
- Verified: token exchange works, /status returns configured:true.

## BLOCKER (user-side, dashboard) — required before ANY connect works
This environment has NO AgentKit connectors (only SSO Passwordless/WebAuthn/Google via /api/v1/connections).
1. Scalekit dashboard -> AgentKit -> Connections -> Create Connection: add QuickBooks, Salesforce, Intercom.
   (Use Scalekit managed dev credentials if offered; else supply each provider's OAuth app client id/secret.)
2. Note the exact Connection name for each (paste to agent if != quickbooks/salesforce/intercom -> set env override).
3. AgentKit -> Settings -> User Verification = **Custom user verifier** (our /verify callback needs it;
   "None" / "Scalekit users only" won't record the connection back into InFlow).
4. Provider sandbox accounts for beta data: QuickBooks sandbox company, Salesforce Developer org, Intercom test workspace.

## Data mapping (VERIFIED tool names against live catalog Jun 2026)
- Execute endpoint: `POST /api/v1/execute_tool` body {connected_account_id, tool_name, params} -> {data}. CONFIRMED path.
- Tool names (confirmed present in /api/v1/tools catalog):
  - quickbooks -> `quickbooks_invoices_list`  (also available: quickbooks_payments_list, quickbooks_customers_list, quickbooks_report_profit_and_loss)
  - salesforce -> `salesforce_opportunities_list`  (NOT salesforce_query; also salesforce_query_soql / salesforce_soql_execute exist)
  - xero       -> `xero_invoices_list`  (also xero_contacts_list, xero_payments_list, xero_reports_list)  [replaced Intercom]
- Params: currently sent as {} (empty) to avoid INVALID_ARGUMENT on unverified param names; list tools return a default page.
  Once a connection is authorized, inspect real output shape and add paging/limit params + refine _map_records if needed.
- _map_records reads: QB invoice {DocNumber, CustomerRef.name, TotalAmt, TxnDate}; SF opp {Name, Amount, StageName, CloseDate};
  Xero invoice {InvoiceNumber, Contact.Name, Total, DateString/Date, Status PAID/AUTHORISED=closed_won, Type ACCREC only}. Verify field names on first live sync.
- QuickBooks connection (Individual/per-user mode) name = `quickbooks-TijdKCMK` -> env SCALEKIT_CONNECTION_QUICKBOOKS.
  User chose INDIVIDUAL credentials (per-workspace isolation), NOT org-wide. identifier=org_id gives per-org sharing.

## Beta vs live
- Development (.scalekit.dev) creds => sandbox/beta only. Production is a SEPARATE environment (.scalekit.com)
  with its own URL + client id/secret. Swap env vars + deploy to go live; redirect switches automatically via APP_BASE_URL.
