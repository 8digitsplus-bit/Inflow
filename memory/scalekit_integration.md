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
- GET  /api/integrations/scalekit/{connector}/start (owner) -> {url}  (create-account + magic_link)
- GET  /api/integrations/scalekit/verify?auth_request_id&state   (Scalekit redirect target)
- POST /api/integrations/scalekit/{connector}/sync  (owner)

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

## Data mapping (UNVERIFIED — needs live data)
tool names guessed: quickbooks_invoices_list / salesforce_query(SOQL) / intercom_list_companies -> deals.
Verify real Scalekit tool names + payload shapes once a connection is live, then fix _import_and_store/_map_records.

## Beta vs live
- Development (.scalekit.dev) creds => sandbox/beta only. Production is a SEPARATE environment (.scalekit.com)
  with its own URL + client id/secret. Swap env vars + deploy to go live; redirect switches automatically via APP_BASE_URL.
