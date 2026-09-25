# Scalekit AgentKit integration (QuickBooks, Salesforce, Intercom)

## CRITICAL LEARNING
- DO NOT install `scalekit-sdk-python`. It upgrades starlette→1.7, pydantic→2.13, protobuf→7,
  uvicorn→0.54 which are INCOMPATIBLE with the app's pins (fastapi 0.110.1 / starlette 0.37.2 /
  pydantic 2.12.5 / protobuf 5.29.6). It broke the env; restored via
  `pip uninstall -y scalekit-sdk-python mcp mcp-types sse-starlette protoc-gen-openapiv2 httpx2 httpcore2`
  then `pip install -r /app/backend/requirements.txt`.
- Use the Scalekit REST API + httpx (already installed) instead of the SDK.

## Implementation (done, dormant until env set)
- `backend/routes/scalekit_integration.py` — REST flow, registered in server.py (api_router).
- Env keys in backend/.env (currently EMPTY → feature disabled cleanly):
  SCALEKIT_ENVIRONMENT_URL, SCALEKIT_CLIENT_ID, SCALEKIT_CLIENT_SECRET, APP_BASE_URL(set to preview URL).
- REST endpoints used (base = SCALEKIT_ENVIRONMENT_URL):
  - POST /oauth/token (form: client_id, client_secret, grant_type=client_credentials)
  - POST /api/v1/connected_accounts/magic_link {connector, identifier, organization_id, state, user_verify_url} -> {link}
  - POST /api/v1/connected_accounts/user/verify {auth_request_id, identifier} -> ACTIVE
  - GET  /api/v1/connected_accounts/details?connector=&identifier= -> {connected_account:{id,status}}
  - POST /api/v1/execute_tool {connected_account_id, tool_name, params}
- Our routes (prefixed /api): 
  GET /api/integrations/scalekit/status
  GET /api/integrations/scalekit/{connector}/start   (owner) -> {url}
  GET /api/integrations/scalekit/verify?auth_request_id=&state=  (Scalekit redirect target)
  POST /api/integrations/scalekit/{connector}/sync   (owner)
- identifier = org_id. Mapping: quickbooks_invoices_list / salesforce_query(SOQL) / intercom_list_companies
  -> deals (source=connector, provider=scalekit). Mapping is UNVERIFIED (needs live data).

## STILL NEEDED from user (blockers)
1. Scalekit creds: SCALEKIT_ENVIRONMENT_URL (dev .scalekit.dev), CLIENT_ID (skc_...), CLIENT_SECRET.
2. In Scalekit dashboard -> AgentKit -> Connections: create connections named exactly
   `quickbooks`, `salesforce`, `intercom` (use Scalekit shared dev creds for beta, or own OAuth apps).
3. User Verification mode = Custom, verify URL = {APP_BASE_URL}/api/integrations/scalekit/verify.
4. Provider sandbox accounts (QuickBooks sandbox, SF dev org, Intercom dev) for beta data.

## TODO after creds
- Fill .env, restart backend, add frontend "Connect (via Scalekit)" buttons on Integration page
  (QuickBooks/Salesforce/Intercom cards), then live-test OAuth round-trip + import, verify mapping.
