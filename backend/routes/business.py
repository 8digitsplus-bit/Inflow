from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional
import uuid

from database import db
from models import User
from dependencies import get_current_user, require_owner, org_filter
from utils.crypto import encrypt, decrypt
from routes.stripe_integration import validate_stripe_key, fetch_stripe_data
from routes.shopify_integration import validate_shopify_key, fetch_shopify_data
from routes.hubspot_integration import validate_hubspot_key, fetch_hubspot_data
from routes.salesforce_integration import validate_salesforce_key, fetch_salesforce_data
from routes.quickbooks_integration import validate_quickbooks_key, fetch_quickbooks_data
from routes.paypal_integration import validate_paypal_credentials, fetch_paypal_data
from routes.amplitude_integration import validate_amplitude_creds, fetch_amplitude_data
from routes.mixpanel_integration import validate_mixpanel_creds, fetch_mixpanel_data
from routes.zoho_integration import validate_zoho_credentials, fetch_zoho_data
from routes.xero_integration import validate_xero_credentials, fetch_xero_data
from routes.square_integration import validate_square_key, fetch_square_data
from routes.paddle_integration import validate_paddle_key, fetch_paddle_data
from routes.checkout_integration import validate_checkout_key, fetch_checkout_data
from routes.sumup_integration import validate_sumup_key, fetch_sumup_data
from routes.airwallex_integration import validate_airwallex_credentials, fetch_airwallex_data
from routes.woocommerce_integration import validate_woocommerce_key, fetch_woocommerce_data
from routes.squarespace_integration import validate_squarespace_key, fetch_squarespace_data
from routes.square_online_integration import validate_square_online_key, fetch_square_online_data
from routes.opencart_integration import validate_opencart_key, fetch_opencart_data
from routes.volusion_integration import validate_volusion_credentials, fetch_volusion_data
from routes.pipedrive_integration import validate_pipedrive_key, fetch_pipedrive_data
from routes.insightly_integration import validate_insightly_key, fetch_insightly_data
from routes.freshsales_integration import validate_freshsales_key, fetch_freshsales_data
from routes.oracle_cx_integration import validate_oracle_cx_credentials, fetch_oracle_cx_data
from routes.monday_integration import validate_monday_key, fetch_monday_data
from routes.posthog_integration import validate_posthog_key, fetch_posthog_data
from routes.ga4_integration import validate_ga4_credentials, fetch_ga4_data
from routes.tableau_integration import validate_tableau_credentials, fetch_tableau_data
from routes.adobe_analytics_integration import validate_adobe_credentials, fetch_adobe_data
from routes.logrocket_integration import validate_logrocket_key, fetch_logrocket_data
from routes.sage_integration import validate_sage_key, fetch_sage_data
from routes.amazon_seller_integration import validate_amazon_credentials, fetch_amazon_data
from routes.chargebee_integration import validate_chargebee_key, fetch_chargebee_data
from routes.ramp_integration import validate_ramp_credentials, fetch_ramp_data
from routes.brex_integration import validate_brex_key, fetch_brex_data

router = APIRouter()

PLATFORMS = {
    "stripe": {
        "default_revenue_role": "revenue",
        "platform_id": "stripe",
        "name": "Stripe",
        "description": "Sync payment data, subscriptions, and revenue metrics directly from your Stripe account.",
        "icon": "CreditCard",
        "color": "#635BFF",
        "category": "Payments",
        "data_types": ["revenue", "subscriptions", "customers", "invoices"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Secret API Key", "placeholder": "sk_test_... or sk_live_...", "type": "password"},
        ],
        "key_help_url": "https://dashboard.stripe.com/apikeys",
        "key_help_text": "Find your API key on the Stripe Dashboard under Developers > API Keys.",
    },
    "shopify": {
        "default_revenue_role": "revenue",
        "platform_id": "shopify",
        "name": "Shopify",
        "description": "Import e-commerce orders, customer data, and product performance from your Shopify store.",
        "icon": "ShoppingBag",
        "color": "#96BF48",
        "category": "E-Commerce",
        "data_types": ["orders", "customers", "products", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "store_url", "label": "Store URL", "placeholder": "mystore.myshopify.com", "type": "text"},
            {"name": "api_key", "label": "Admin API Access Token", "placeholder": "shpat_...", "type": "password"},
        ],
        "key_help_url": "https://admin.shopify.com/store/YOUR_STORE/settings/apps/development",
        "key_help_text": "Go to Shopify Admin > Settings > Apps > Develop apps > Create app > Configure Admin API scopes (read_orders, read_customers) > Install > Get Access Token.",
    },
    "hubspot": {
        "default_revenue_role": "pipeline",
        "platform_id": "hubspot",
        "name": "HubSpot",
        "description": "Sync your CRM deals, contacts, and pipeline data from HubSpot for unified insights.",
        "icon": "Users",
        "color": "#FF7A59",
        "category": "CRM",
        "data_types": ["deals", "contacts", "pipeline", "activities"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Private App Access Token", "placeholder": "pat-na1-...", "type": "password"},
        ],
        "key_help_url": "https://app.hubspot.com/private-apps/",
        "key_help_text": "Go to HubSpot > Settings > Integrations > Private Apps > Create > Grant CRM scopes (crm.objects.deals.read, crm.objects.contacts.read) > Create app > Copy access token.",
    },
    "salesforce": {
        "default_revenue_role": "pipeline",
        "platform_id": "salesforce",
        "name": "Salesforce",
        "description": "Two-way sync with Salesforce for complete pipeline visibility and deal tracking.",
        "icon": "Cloud",
        "color": "#00A1E0",
        "category": "CRM",
        "data_types": ["opportunities", "accounts", "contacts", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Instance URL", "placeholder": "mycompany.my.salesforce.com", "type": "text"},
            {"name": "api_key", "label": "Access Token", "placeholder": "Your Salesforce access token", "type": "password"},
        ],
        "key_help_url": "https://help.salesforce.com/s/articleView?id=sf.connected_app_create_api_integration.htm",
        "key_help_text": "Use a Connected App or the Salesforce CLI to get an access token. Note: tokens expire after ~2 hours.",
        "token_expires": True,
    },
    "quickbooks": {
        "default_revenue_role": "revenue",
        "platform_id": "quickbooks",
        "name": "QuickBooks",
        "description": "Pull financial data, invoices, and expense reports for comprehensive revenue analysis.",
        "icon": "Calculator",
        "color": "#2CA01C",
        "category": "Finance",
        "data_types": ["invoices", "expenses", "revenue", "accounts"],
        "requires_key": True,
        "key_fields": [
            {"name": "company_id", "label": "Company ID (Realm ID)", "placeholder": "1234567890", "type": "text"},
            {"name": "api_key", "label": "Access Token", "placeholder": "Your QuickBooks access token", "type": "password"},
        ],
        "key_help_url": "https://developer.intuit.com/app/developer/playground",
        "key_help_text": "Use the Intuit Developer OAuth Playground to get an access token and Company ID. Note: tokens expire after ~1 hour.",
        "token_expires": True,
    },
    "paypal": {
        "default_revenue_role": "revenue",
        "platform_id": "paypal",
        "name": "PayPal",
        "description": "Import PayPal transactions and revenue from your PayPal Business account.",
        "icon": "DollarSign",
        "color": "#0070BA",
        "category": "Payments",
        "data_types": ["transactions", "revenue", "customers"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "PayPal app client_id", "type": "text"},
            {"name": "client_secret", "label": "Client Secret", "placeholder": "PayPal app secret", "type": "password"},
            {"name": "sandbox", "label": "Use Sandbox", "type": "checkbox"},
        ],
        "key_help_url": "https://developer.paypal.com/dashboard/applications",
        "key_help_text": "Create a REST app in PayPal Developer Dashboard. Copy the Client ID and Secret for your Live (or Sandbox) app.",
    },
    "amplitude": {
        "default_revenue_role": "signal",
        "platform_id": "amplitude",
        "name": "Amplitude",
        "description": "Sync product analytics events and conversion metrics from your Amplitude project.",
        "icon": "BarChart3",
        "color": "#1E61F0",
        "category": "Analytics",
        "data_types": ["events", "active_users", "conversions"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "API Key", "placeholder": "Amplitude project API Key", "type": "text"},
            {"name": "api_key", "label": "Secret Key", "placeholder": "Amplitude project Secret Key", "type": "password"},
            {"name": "instance_url", "label": "Region", "placeholder": "us or eu", "type": "text"},
        ],
        "key_help_url": "https://app.amplitude.com/analytics/settings/projects",
        "key_help_text": "Open Amplitude > Settings > Projects > select your project. Copy the API Key and Secret Key from the project's General tab. Use 'eu' for EU data residency, otherwise 'us'.",
    },
    "mixpanel": {
        "default_revenue_role": "signal",
        "platform_id": "mixpanel",
        "name": "Mixpanel",
        "description": "Ingest product analytics events to correlate user behavior with revenue.",
        "icon": "BarChart3",
        "color": "#7856FF",
        "category": "Analytics",
        "data_types": ["events", "funnels", "cohorts"],
        "requires_key": True,
        "key_fields": [
            {"name": "company_id", "label": "Project ID", "placeholder": "12345", "type": "text"},
            {"name": "api_key", "label": "Project API Secret", "placeholder": "a1b2c3...", "type": "password"},
            {"name": "instance_url", "label": "Region", "placeholder": "us or eu", "type": "text"},
        ],
        "key_help_url": "https://mixpanel.com/report",
        "key_help_text": "Find your Project ID in Project Settings > Overview. Generate a Service Account (or legacy API Secret) in Project Settings > Service Accounts.",
    },
    "zoho": {
        "default_revenue_role": "pipeline",
        "platform_id": "zoho",
        "name": "Zoho CRM",
        "description": "Pull deals, pipeline, and contacts from your Zoho CRM.",
        "icon": "Users",
        "color": "#C82127",
        "category": "CRM",
        "data_types": ["deals", "contacts", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "1000.XXXXX", "type": "text"},
            {"name": "client_secret", "label": "Client Secret", "placeholder": "Zoho app secret", "type": "password"},
            {"name": "api_key", "label": "Refresh Token", "placeholder": "1000.xxx.xxx", "type": "password"},
            {"name": "instance_url", "label": "Data Center", "placeholder": "com, eu, in, com.au, jp", "type": "text"},
        ],
        "key_help_url": "https://api-console.zoho.com/",
        "key_help_text": "Create a Self-Client in Zoho API Console. Generate a grant token with scope ZohoCRM.modules.deals.READ ZohoCRM.users.READ and exchange it for a refresh_token.",
    },
    "xero": {
        "default_revenue_role": "revenue",
        "platform_id": "xero",
        "name": "Xero",
        "description": "Sync accounts-receivable invoices and revenue from your Xero organisation.",
        "icon": "Calculator",
        "color": "#13B5EA",
        "category": "Finance",
        "data_types": ["invoices", "revenue", "customers"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "Xero app client_id", "type": "text"},
            {"name": "client_secret", "label": "Client Secret", "placeholder": "Xero app secret", "type": "password"},
            {"name": "api_key", "label": "Refresh Token", "placeholder": "Xero refresh_token", "type": "password"},
            {"name": "company_id", "label": "Tenant ID", "placeholder": "Xero tenantId (organisation)", "type": "text"},
        ],
        "key_help_url": "https://developer.xero.com/app/manage",
        "key_help_text": "In the Xero Developer portal, create a Web/Mobile app, complete OAuth2 once to obtain a refresh_token and the Tenant ID of the organisation you want to sync.",
    },
    "square": {
        "default_revenue_role": "revenue",
        "platform_id": "square",
        "name": "Square",
        "description": "Sync payments and revenue from your Square account across all locations.",
        "icon": "CreditCard",
        "color": "#00D632",
        "category": "Payments",
        "data_types": ["payments", "revenue", "customers"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Access Token", "placeholder": "Production or Sandbox access token", "type": "password"},
            {"name": "sandbox", "label": "Use Sandbox", "type": "checkbox"},
        ],
        "key_help_url": "https://developer.squareup.com/apps",
        "key_help_text": "Create an application in the Square Developer Dashboard, then copy its Access Token (Production or Sandbox).",
    },
    "paddle": {
        "default_revenue_role": "revenue",
        "platform_id": "paddle",
        "name": "Paddle",
        "description": "Sync subscription transactions and revenue from your Paddle Billing account.",
        "icon": "CreditCard",
        "color": "#FFDD00",
        "category": "Payments",
        "data_types": ["transactions", "subscriptions", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "API Key", "placeholder": "Paddle server-side API key", "type": "password"},
            {"name": "sandbox", "label": "Use Sandbox", "type": "checkbox"},
        ],
        "key_help_url": "https://developer.paddle.com/api-reference/about/authentication",
        "key_help_text": "In Paddle > Developer Tools > Authentication, generate a server-side API key with read access to transactions.",
    },
    "checkout": {
        "default_revenue_role": "revenue",
        "platform_id": "checkout",
        "name": "Checkout.com",
        "description": "Sync payments and revenue from your Checkout.com account (live or sandbox auto-detected).",
        "icon": "CreditCard",
        "color": "#4B45FF",
        "category": "Payments",
        "data_types": ["payments", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Secret Key", "placeholder": "sk_... or sk_sbox_...", "type": "password"},
        ],
        "key_help_url": "https://www.checkout.com/docs/developer-resources/api/manage-api-keys",
        "key_help_text": "Copy your Secret Key (sk_...) from the Checkout.com Dashboard > Developer > Keys. Sandbox keys (sk_sbox_...) are detected automatically.",
    },
    "sumup": {
        "default_revenue_role": "revenue",
        "platform_id": "sumup",
        "name": "SumUp",
        "description": "Sync in-person and online transaction revenue from your SumUp merchant account.",
        "icon": "CreditCard",
        "color": "#3F97DC",
        "category": "Payments",
        "data_types": ["transactions", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Secret API Key", "placeholder": "sk_... (from SumUp Developer settings)", "type": "password"},
        ],
        "key_help_url": "https://developer.sumup.com/api",
        "key_help_text": "Create an API key at me.sumup.com/settings/developer with the transactions.history scope, then paste it here.",
    },
    "airwallex": {
        "default_revenue_role": "revenue",
        "platform_id": "airwallex",
        "name": "Airwallex",
        "description": "Sync payment intents and revenue from your Airwallex account.",
        "icon": "CreditCard",
        "color": "#FF4438",
        "category": "Payments",
        "data_types": ["payments", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "Airwallex Client ID", "type": "text"},
            {"name": "api_key", "label": "API Key", "placeholder": "Airwallex API Key", "type": "password"},
            {"name": "sandbox", "label": "Use Demo Environment", "type": "checkbox"},
        ],
        "key_help_url": "https://www.airwallex.com/docs/developer-tools/api/manage-api-keys",
        "key_help_text": "In Airwallex > Developer > API keys, create credentials to get a Client ID and API Key with read access.",
    },
    "woocommerce": {
        "default_revenue_role": "revenue",
        "platform_id": "woocommerce",
        "name": "WooCommerce",
        "description": "Sync store orders and revenue from your WooCommerce (WordPress) store.",
        "icon": "ShoppingBag",
        "color": "#96588A",
        "category": "E-Commerce",
        "data_types": ["orders", "revenue", "customers"],
        "requires_key": True,
        "key_fields": [
            {"name": "store_url", "label": "Store URL", "placeholder": "https://mystore.com", "type": "text"},
            {"name": "client_id", "label": "Consumer Key", "placeholder": "ck_...", "type": "text"},
            {"name": "api_key", "label": "Consumer Secret", "placeholder": "cs_...", "type": "password"},
        ],
        "key_help_url": "https://woocommerce.com/document/woocommerce-rest-api/",
        "key_help_text": "In WooCommerce > Settings > Advanced > REST API, add a key with Read access and copy the Consumer Key and Secret.",
    },
    "squarespace": {
        "default_revenue_role": "revenue",
        "platform_id": "squarespace",
        "name": "Squarespace",
        "description": "Sync commerce orders and revenue from your Squarespace store (Commerce Advanced).",
        "icon": "ShoppingBag",
        "color": "#B5B5B5",
        "category": "E-Commerce",
        "data_types": ["orders", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "API Key", "placeholder": "Squarespace Commerce API key", "type": "password"},
        ],
        "key_help_url": "https://support.squarespace.com/hc/en-us/articles/236297987-Squarespace-API-keys",
        "key_help_text": "In Squarespace > Settings > Developer API Keys, generate a key with the Orders permission (requires a Commerce Advanced plan).",
    },
    "square_online": {
        "default_revenue_role": "revenue",
        "platform_id": "square_online",
        "name": "Square Online",
        "description": "Sync online store orders and revenue from your Square Online / Square Orders account.",
        "icon": "ShoppingBag",
        "color": "#00A94F",
        "category": "E-Commerce",
        "data_types": ["orders", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Access Token", "placeholder": "Square Production or Sandbox access token", "type": "password"},
            {"name": "sandbox", "label": "Use Sandbox", "type": "checkbox"},
        ],
        "key_help_url": "https://developer.squareup.com/apps",
        "key_help_text": "Use a Square access token with ORDERS_READ permission (Square Online is built on Square).",
    },
    "opencart": {
        "default_revenue_role": "revenue",
        "platform_id": "opencart",
        "name": "OpenCart",
        "description": "Sync store orders and revenue from your OpenCart store via the REST API.",
        "icon": "ShoppingBag",
        "color": "#23A1D9",
        "category": "E-Commerce",
        "data_types": ["orders", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "store_url", "label": "Store URL", "placeholder": "https://mystore.com", "type": "text"},
            {"name": "api_key", "label": "API Key", "placeholder": "OpenCart API user key", "type": "password"},
        ],
        "key_help_url": "https://docs.opencart.com/en-gb/system/users/api/",
        "key_help_text": "In OpenCart admin > System > Users > API, create an API user with 'order' access and copy its API Key.",
    },
    "volusion": {
        "default_revenue_role": "revenue",
        "platform_id": "volusion",
        "name": "Volusion",
        "description": "Sync store orders and revenue from your Volusion store via the Generic XML export API.",
        "icon": "ShoppingBag",
        "color": "#0FB8AD",
        "category": "E-Commerce",
        "data_types": ["orders", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "store_url", "label": "Store URL", "placeholder": "https://mystore.volusion.com", "type": "text"},
            {"name": "client_id", "label": "Login (Admin Email)", "placeholder": "admin@mystore.com", "type": "text"},
            {"name": "api_key", "label": "Encrypted Password", "placeholder": "Volusion EncryptedPassword", "type": "password"},
        ],
        "key_help_url": "https://helpcenter.volusion.com/s/article/ExportsOrdersExportDeveloper",
        "key_help_text": "In Volusion admin > Inventory > Import/Export > Volusion API, run Generic\\Orders to get your Login and Encrypted Password from the generated URL.",
    },
    "pipedrive": {
        "default_revenue_role": "pipeline",
        "platform_id": "pipedrive",
        "name": "Pipedrive",
        "description": "Sync deals and pipeline value from your Pipedrive CRM.",
        "icon": "Users",
        "color": "#0B8A3D",
        "category": "CRM",
        "data_types": ["deals", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Company Domain", "placeholder": "mycompany (from mycompany.pipedrive.com)", "type": "text"},
            {"name": "api_key", "label": "API Token", "placeholder": "Pipedrive API token", "type": "password"},
        ],
        "key_help_url": "https://pipedrive.readme.io/docs/how-to-find-the-api-token",
        "key_help_text": "In Pipedrive > Settings > Personal preferences > API, copy your personal API token, and use your company domain.",
    },
    "monday": {
        "default_revenue_role": "pipeline",
        "platform_id": "monday",
        "name": "monday.com",
        "description": "Sync CRM board items and deal values from your monday.com workspace.",
        "icon": "Users",
        "color": "#FF3D57",
        "category": "CRM",
        "data_types": ["deals", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "API Token", "placeholder": "monday.com personal API token", "type": "password"},
            {"name": "company_id", "label": "Board ID (optional)", "placeholder": "e.g. 1234567890", "type": "text"},
        ],
        "key_help_url": "https://developer.monday.com/api-reference/docs/authentication",
        "key_help_text": "In monday.com > Developers > My Access Tokens, copy your personal token. Add a Board ID to target your CRM/deals board.",
    },
    "insightly": {
        "default_revenue_role": "pipeline",
        "platform_id": "insightly",
        "name": "Insightly",
        "description": "Sync opportunities and pipeline value from your Insightly CRM.",
        "icon": "Users",
        "color": "#FCB100",
        "category": "CRM",
        "data_types": ["opportunities", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Pod", "placeholder": "na1 (or eu1, etc.)", "type": "text"},
            {"name": "api_key", "label": "API Key", "placeholder": "Insightly API key", "type": "password"},
        ],
        "key_help_url": "https://support.insightly.com/hc/en-us/articles/360038905172-API-User-Guide",
        "key_help_text": "In Insightly > User Settings > API Key, copy your key. Your pod (e.g. na1) is shown in your API URL.",
    },
    "oracle_cx": {
        "default_revenue_role": "pipeline",
        "platform_id": "oracle_cx",
        "name": "Oracle CX Sales",
        "description": "Sync opportunities and pipeline value from Oracle CX / Fusion Sales.",
        "icon": "Users",
        "color": "#C74634",
        "category": "CRM",
        "data_types": ["opportunities", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Instance URL", "placeholder": "https://instance.fa.region.oraclecloud.com", "type": "text"},
            {"name": "client_id", "label": "Username", "placeholder": "Oracle Cloud username", "type": "text"},
            {"name": "api_key", "label": "Password", "placeholder": "Oracle Cloud password", "type": "password"},
        ],
        "key_help_url": "https://docs.oracle.com/en/cloud/saas/sales/faaps/Quick_Start.html",
        "key_help_text": "Use an Oracle Cloud service user (username + password) with permission to read opportunities via the crmRestApi.",
    },
    "freshsales": {
        "default_revenue_role": "pipeline",
        "platform_id": "freshsales",
        "name": "Freshsales",
        "description": "Sync deals and pipeline value from your Freshsales (Freshworks CRM).",
        "icon": "Users",
        "color": "#F5722C",
        "category": "CRM",
        "data_types": ["deals", "pipeline"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Domain", "placeholder": "mycompany (from mycompany.myfreshworks.com)", "type": "text"},
            {"name": "api_key", "label": "API Key", "placeholder": "Freshsales API key", "type": "password"},
        ],
        "key_help_url": "https://support.freshsales.io/support/solutions/articles/220099-how-to-find-my-api-key-",
        "key_help_text": "In Freshsales > Profile Settings > API Settings, copy your API key, and use your Freshworks domain.",
    },
    "posthog": {
        "default_revenue_role": "signal",
        "platform_id": "posthog",
        "name": "PostHog",
        "description": "Product analytics signal — 30-day event volume and engagement from PostHog.",
        "icon": "BarChart3",
        "color": "#1D4AFF",
        "category": "Analytics",
        "data_types": ["events", "engagement", "signal"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Region / Host", "placeholder": "us, eu, or your self-hosted URL", "type": "text"},
            {"name": "company_id", "label": "Project ID", "placeholder": "PostHog project ID (number)", "type": "text"},
            {"name": "api_key", "label": "Personal API Key", "placeholder": "phx_...", "type": "password"},
        ],
        "key_help_url": "https://posthog.com/docs/api/personal-api-keys",
        "key_help_text": "In PostHog > My settings > Personal API Keys, create a key with query:read scope. Find the Project ID in project settings.",
    },
    "ga4": {
        "default_revenue_role": "signal",
        "platform_id": "ga4",
        "name": "Google Analytics 4",
        "description": "Web analytics signal — 30-day active users and sessions from GA4.",
        "icon": "BarChart3",
        "color": "#E8710A",
        "category": "Analytics",
        "data_types": ["users", "sessions", "signal"],
        "requires_key": True,
        "key_fields": [
            {"name": "company_id", "label": "Property ID", "placeholder": "GA4 property ID (e.g. 123456789)", "type": "text"},
            {"name": "api_key", "label": "Service Account JSON", "placeholder": "Paste the full service account JSON key", "type": "password"},
        ],
        "key_help_url": "https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart",
        "key_help_text": "Create a Google Cloud service account, download its JSON key, and add its email to your GA4 property as a Viewer.",
    },
    "adobe_analytics": {
        "default_revenue_role": "signal",
        "platform_id": "adobe_analytics",
        "name": "Adobe Analytics",
        "description": "Web analytics signal — 30-day visits from Adobe Analytics.",
        "icon": "BarChart3",
        "color": "#FA0F00",
        "category": "Analytics",
        "data_types": ["visits", "signal"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "Adobe OAuth Server-to-Server Client ID", "type": "text"},
            {"name": "client_secret", "label": "Client Secret", "placeholder": "Adobe client secret", "type": "password"},
            {"name": "company_id", "label": "Report Suite ID", "placeholder": "rsid (e.g. mycompany.prod)", "type": "text"},
        ],
        "key_help_url": "https://developer.adobe.com/developer-console/docs/guides/authentication/ServerToServerAuthentication/",
        "key_help_text": "In the Adobe Developer Console, create an OAuth Server-to-Server credential for Adobe Analytics and copy the Client ID and Secret. Use your report suite ID (rsid).",
    },
    "tableau": {
        "default_revenue_role": "signal",
        "platform_id": "tableau",
        "name": "Tableau",
        "description": "BI usage signal — workbook, view counts and view usage from Tableau.",
        "icon": "BarChart3",
        "color": "#4E79A7",
        "category": "Analytics",
        "data_types": ["workbooks", "views", "signal"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Server URL", "placeholder": "https://10ax.online.tableau.com", "type": "text"},
            {"name": "company_id", "label": "Site Content URL", "placeholder": "site name (blank for Default)", "type": "text"},
            {"name": "client_id", "label": "PAT Name", "placeholder": "Personal Access Token name", "type": "text"},
            {"name": "api_key", "label": "PAT Secret", "placeholder": "Personal Access Token secret", "type": "password"},
        ],
        "key_help_url": "https://help.tableau.com/current/server/en-us/security_personal_access_tokens.htm",
        "key_help_text": "In Tableau > My Account Settings > Personal Access Tokens, create a token and copy its name and secret. Use the site content URL (blank for Default).",
    },
    "logrocket": {
        "default_revenue_role": "signal",
        "platform_id": "logrocket",
        "name": "LogRocket",
        "description": "Session replay & error-monitoring signal from LogRocket.",
        "icon": "BarChart3",
        "color": "#764ABC",
        "category": "Analytics",
        "data_types": ["sessions", "signal"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Org ID", "placeholder": "LogRocket organisation ID", "type": "text"},
            {"name": "company_id", "label": "App ID", "placeholder": "LogRocket app ID", "type": "text"},
            {"name": "api_key", "label": "API Key", "placeholder": "LogRocket API key", "type": "password"},
        ],
        "key_help_url": "https://docs.logrocket.com/docs/session-highlights-api",
        "key_help_text": "In LogRocket > Settings > API Keys, create a key. Find your Org ID and App ID in your project URL/settings.",
    },
    "sage": {
        "default_revenue_role": "revenue",
        "platform_id": "sage",
        "name": "Sage Accounting",
        "description": "Sync sales invoices and revenue from Sage Business Cloud Accounting.",
        "icon": "Calculator",
        "color": "#00A046",
        "category": "Finance",
        "data_types": ["invoices", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "Access Token", "placeholder": "Sage OAuth2 access token (short-lived)", "type": "password"},
        ],
        "key_help_url": "https://developer.sage.com/accounting/",
        "key_help_text": "Sage uses OAuth2 with short-lived tokens. Complete the Sage OAuth flow in the Developer portal and paste a fresh access token.",
    },
    "amazon_seller": {
        "default_revenue_role": "revenue",
        "platform_id": "amazon_seller",
        "name": "Amazon Seller Central",
        "description": "Sync marketplace orders and revenue from Amazon Seller Central (SP-API).",
        "icon": "ShoppingBag",
        "color": "#FF9900",
        "category": "E-Commerce",
        "data_types": ["orders", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "LWA Client ID", "placeholder": "amzn1.application-oa2-client...", "type": "text"},
            {"name": "client_secret", "label": "LWA Client Secret", "placeholder": "Login with Amazon client secret", "type": "password"},
            {"name": "api_key", "label": "Refresh Token", "placeholder": "Atzr|... LWA refresh token", "type": "password"},
            {"name": "instance_url", "label": "Region", "placeholder": "na, eu, or fe", "type": "text"},
            {"name": "company_id", "label": "Marketplace ID (optional)", "placeholder": "e.g. ATVPDKIKX0DER (US)", "type": "text"},
        ],
        "key_help_url": "https://developer-docs.amazon.com/sp-api/docs/registering-your-application",
        "key_help_text": "Register an SP-API app in Seller Central, authorise it, and provide the LWA Client ID/Secret and Refresh Token. No AWS keys are needed.",
    },
    "chargebee": {
        "default_revenue_role": "revenue",
        "platform_id": "chargebee",
        "name": "Chargebee",
        "description": "Sync subscription invoices and recurring revenue from Chargebee.",
        "icon": "CreditCard",
        "color": "#FF7846",
        "category": "Payments",
        "data_types": ["invoices", "subscriptions", "revenue"],
        "requires_key": True,
        "key_fields": [
            {"name": "instance_url", "label": "Site", "placeholder": "mycompany (from mycompany.chargebee.com)", "type": "text"},
            {"name": "api_key", "label": "API Key", "placeholder": "Chargebee full-access API key", "type": "password"},
        ],
        "key_help_url": "https://apidocs.chargebee.com/docs/api/getting-started",
        "key_help_text": "In Chargebee > Settings > Configure Chargebee > API Keys, add a Full-Access key, and use your site name.",
    },
    "ramp": {
        "default_revenue_role": "signal",
        "platform_id": "ramp",
        "name": "Ramp",
        "description": "Corporate spend signal — 30-day card spend from Ramp (informs burn, not revenue).",
        "icon": "DollarSign",
        "color": "#B4D000",
        "category": "Finance",
        "data_types": ["spend", "transactions", "signal"],
        "requires_key": True,
        "key_fields": [
            {"name": "client_id", "label": "Client ID", "placeholder": "Ramp developer app Client ID", "type": "text"},
            {"name": "client_secret", "label": "Client Secret", "placeholder": "Ramp developer app Client Secret", "type": "password"},
        ],
        "key_help_url": "https://support.ramp.com/accessing-the-developer-api",
        "key_help_text": "In Ramp > Company > Developer, create an app with the Client Credentials grant and transactions:read scope, then copy the Client ID and Secret.",
    },
    "brex": {
        "default_revenue_role": "signal",
        "platform_id": "brex",
        "name": "Brex",
        "description": "Corporate spend signal — 30-day card spend from Brex (informs burn, not revenue).",
        "icon": "DollarSign",
        "color": "#FF5C39",
        "category": "Finance",
        "data_types": ["spend", "transactions", "signal"],
        "requires_key": True,
        "key_fields": [
            {"name": "api_key", "label": "API Token", "placeholder": "Brex API token (transactions.card.readonly)", "type": "password"},
        ],
        "key_help_url": "https://developer.brex.com/guides/quickstart",
        "key_help_text": "In the Brex dashboard > Developer > Settings, create a token with the transactions.card.readonly scope and copy it immediately.",
    },
}


class ConnectRequest(BaseModel):
    api_key: Optional[str] = None
    store_url: Optional[str] = None
    instance_url: Optional[str] = None
    company_id: Optional[str] = None
    sandbox: Optional[bool] = False
    client_id: Optional[str] = None
    client_secret: Optional[str] = None


# Integration slot limits by subscription tier
INTEGRATION_LIMITS = {
    "trial": 2,
    "essential_monthly": 5,
    "essential_yearly": 5,
    "pro_monthly": 15,
    "pro_yearly": 15,
    "enterprise_monthly": None,  # unlimited
    "enterprise_yearly": None,
    "expired": 0,
    "cancelled": 0,
}


def get_integration_limit(tier: str):
    """Returns max integration count or None for unlimited."""
    return INTEGRATION_LIMITS.get(tier, 2)


async def _connect_stripe(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Stripe API key is required")
    validation = await validate_stripe_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Stripe API key"))
    data = await fetch_stripe_data(body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "stripe",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Stripe Account"),
        "account_id": validation.get("account_id", ""),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_shopify(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Shopify access token is required")
    if not body.store_url:
        raise HTTPException(status_code=400, detail="Store URL is required")
    validation = await validate_shopify_key(body.api_key, body.store_url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Shopify credentials"))
    data = await fetch_shopify_data(body.api_key, validation["store_url"], user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "shopify",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Shopify Store"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "store_url": validation["store_url"],
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_hubspot(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="HubSpot access token is required")
    validation = await validate_hubspot_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid HubSpot credentials"))
    data = await fetch_hubspot_data(body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "hubspot",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "HubSpot Account"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_salesforce(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Salesforce access token is required")
    if not body.instance_url:
        raise HTTPException(status_code=400, detail="Instance URL is required")
    validation = await validate_salesforce_key(body.api_key, body.instance_url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Salesforce credentials"))
    data = await fetch_salesforce_data(body.api_key, validation["instance_url"], user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "salesforce",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Salesforce Org"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "instance_url": validation["instance_url"],
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_quickbooks(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="QuickBooks access token is required")
    if not body.company_id:
        raise HTTPException(status_code=400, detail="Company ID is required")
    validation = await validate_quickbooks_key(body.api_key, body.company_id, body.sandbox or False)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid QuickBooks credentials"))
    data = await fetch_quickbooks_data(body.api_key, body.company_id, user_id, body.sandbox or False)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "quickbooks",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "QuickBooks Company"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "company_id": body.company_id,
        "sandbox": body.sandbox or False,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_paypal(body: ConnectRequest, user_id: str, now: str):
    if not body.client_id or not body.client_secret:
        raise HTTPException(status_code=400, detail="PayPal Client ID and Secret are required")
    validation = await validate_paypal_credentials(body.client_id, body.client_secret, body.sandbox or False)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid PayPal credentials"))
    data = await fetch_paypal_data(body.client_id, body.client_secret, body.sandbox or False, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "paypal",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "PayPal Account"),
        "api_key_last4": body.client_secret[-4:],
        "api_key_encrypted": encrypt(body.client_secret),
        "client_id": body.client_id,
        "sandbox": body.sandbox or False,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_amplitude(body: ConnectRequest, user_id: str, now: str):
    if not body.client_id or not body.api_key:
        raise HTTPException(status_code=400, detail="Amplitude API Key and Secret Key are required")
    region = (body.instance_url or "us").strip().lower() or "us"
    validation = await validate_amplitude_creds(body.client_id, body.api_key, region)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Amplitude credentials"))
    data = await fetch_amplitude_data(body.client_id, body.api_key, region, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "amplitude",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Amplitude Project"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "client_id": body.client_id,
        "instance_url": region,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_mixpanel(body: ConnectRequest, user_id: str, now: str):
    if not body.company_id or not body.api_key:
        raise HTTPException(status_code=400, detail="Mixpanel Project ID and API Secret are required")
    region = (body.instance_url or "us").strip().lower() or "us"
    validation = await validate_mixpanel_creds(body.company_id, body.api_key, region)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Mixpanel credentials"))
    data = await fetch_mixpanel_data(body.company_id, body.api_key, region, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "mixpanel",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Mixpanel Project"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "company_id": body.company_id,
        "instance_url": region,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_zoho(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key or not body.client_id or not body.client_secret:
        raise HTTPException(status_code=400, detail="Zoho Refresh Token, Client ID, and Client Secret are required")
    dc = (body.instance_url or "com").strip().lower() or "com"
    validation = await validate_zoho_credentials(body.api_key, body.client_id, body.client_secret, dc)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Zoho credentials"))
    data = await fetch_zoho_data(body.api_key, body.client_id, body.client_secret, dc, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "zoho",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Zoho CRM"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "client_id": body.client_id,
        "client_secret_encrypted": encrypt(body.client_secret),
        "instance_url": dc,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_xero(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key or not body.client_id or not body.client_secret or not body.company_id:
        raise HTTPException(status_code=400, detail="Xero Refresh Token, Client ID, Client Secret, and Tenant ID are required")
    validation = await validate_xero_credentials(body.api_key, body.client_id, body.client_secret, body.company_id)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Xero credentials"))
    data = await fetch_xero_data(body.api_key, body.client_id, body.client_secret, body.company_id, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "xero",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Xero Organisation"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "client_id": body.client_id,
        "client_secret_encrypted": encrypt(body.client_secret),
        "company_id": body.company_id,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_square(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Square Access Token is required")
    sandbox = body.sandbox or False
    validation = await validate_square_key(body.api_key, sandbox)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Square credentials"))
    data = await fetch_square_data(body.api_key, user_id, sandbox)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "square",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Square Account"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "sandbox": sandbox,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_paddle(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Paddle API Key is required")
    sandbox = body.sandbox or False
    validation = await validate_paddle_key(body.api_key, sandbox)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Paddle credentials"))
    data = await fetch_paddle_data(body.api_key, user_id, sandbox)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "paddle",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Paddle Account"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "sandbox": sandbox,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_checkout(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Checkout.com Secret Key is required")
    validation = await validate_checkout_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Checkout.com credentials"))
    data = await fetch_checkout_data(body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "checkout",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Checkout.com Account"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "sandbox": validation.get("sandbox", False),
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_sumup(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="SumUp API Key is required")
    validation = await validate_sumup_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid SumUp credentials"))
    merchant_code = validation.get("merchant_code", "")
    data = await fetch_sumup_data(body.api_key, merchant_code, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "sumup",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "SumUp Account"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "company_id": merchant_code,  # store merchant_code for re-sync
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_airwallex(body: ConnectRequest, user_id: str, now: str):
    if not body.client_id or not body.api_key:
        raise HTTPException(status_code=400, detail="Airwallex Client ID and API Key are required")
    sandbox = body.sandbox or False
    validation = await validate_airwallex_credentials(body.client_id, body.api_key, sandbox)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Airwallex credentials"))
    data = await fetch_airwallex_data(body.client_id, body.api_key, user_id, sandbox)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "airwallex",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Airwallex Account"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "client_id": body.client_id,
        "sandbox": sandbox,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_woocommerce(body: ConnectRequest, user_id: str, now: str):
    if not body.store_url or not body.client_id or not body.api_key:
        raise HTTPException(status_code=400, detail="WooCommerce Store URL, Consumer Key, and Consumer Secret are required")
    validation = await validate_woocommerce_key(body.store_url, body.client_id, body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid WooCommerce credentials"))
    store_url = validation.get("store_url", body.store_url)
    data = await fetch_woocommerce_data(store_url, body.client_id, body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "woocommerce",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "WooCommerce Store"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),  # consumer_secret
        "client_id": body.client_id,  # consumer_key
        "store_url": store_url,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_squarespace(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Squarespace API Key is required")
    validation = await validate_squarespace_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Squarespace credentials"))
    data = await fetch_squarespace_data(body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "squarespace",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Squarespace Store"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_square_online(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Square Access Token is required")
    sandbox = body.sandbox or False
    validation = await validate_square_online_key(body.api_key, sandbox)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Square credentials"))
    data = await fetch_square_online_data(body.api_key, user_id, sandbox)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "square_online",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Square Online"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "sandbox": sandbox,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_opencart(body: ConnectRequest, user_id: str, now: str):
    if not body.store_url or not body.api_key:
        raise HTTPException(status_code=400, detail="OpenCart Store URL and API Key are required")
    validation = await validate_opencart_key(body.store_url, body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid OpenCart credentials"))
    store_url = validation.get("store_url", body.store_url)
    data = await fetch_opencart_data(store_url, body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "opencart",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "OpenCart Store"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "store_url": store_url,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_volusion(body: ConnectRequest, user_id: str, now: str):
    if not body.store_url or not body.client_id or not body.api_key:
        raise HTTPException(status_code=400, detail="Volusion Store URL, Login, and Encrypted Password are required")
    validation = await validate_volusion_credentials(body.store_url, body.client_id, body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Volusion credentials"))
    store_url = validation.get("store_url", body.store_url)
    data = await fetch_volusion_data(store_url, body.client_id, body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "volusion",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Volusion Store"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),  # encrypted password
        "client_id": body.client_id,  # login email
        "store_url": store_url,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_pipedrive(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Pipedrive API Token is required")
    validation = await validate_pipedrive_key(body.api_key, body.instance_url or "")
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Pipedrive credentials"))
    data = await fetch_pipedrive_data(body.api_key, body.instance_url or "", user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "pipedrive",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Pipedrive"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "instance_url": body.instance_url or "",
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_monday(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="monday.com API Token is required")
    validation = await validate_monday_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid monday.com credentials"))
    data = await fetch_monday_data(body.api_key, body.company_id or "", user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "monday",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "monday.com"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "company_id": body.company_id or "",
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_insightly(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Insightly API Key is required")
    validation = await validate_insightly_key(body.api_key, body.instance_url or "")
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Insightly credentials"))
    data = await fetch_insightly_data(body.api_key, body.instance_url or "", user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "insightly",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Insightly"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "instance_url": body.instance_url or "",
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_oracle_cx(body: ConnectRequest, user_id: str, now: str):
    if not body.instance_url or not body.client_id or not body.api_key:
        raise HTTPException(status_code=400, detail="Oracle CX Instance URL, Username, and Password are required")
    validation = await validate_oracle_cx_credentials(body.instance_url, body.client_id, body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Oracle CX credentials"))
    data = await fetch_oracle_cx_data(body.instance_url, body.client_id, body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "oracle_cx",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Oracle CX Sales"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),  # password
        "client_id": body.client_id,  # username
        "instance_url": body.instance_url,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_freshsales(body: ConnectRequest, user_id: str, now: str):
    if not body.instance_url or not body.api_key:
        raise HTTPException(status_code=400, detail="Freshsales Domain and API Key are required")
    validation = await validate_freshsales_key(body.api_key, body.instance_url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Freshsales credentials"))
    data = await fetch_freshsales_data(body.api_key, body.instance_url, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "freshsales",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Freshsales"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "instance_url": body.instance_url,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_posthog(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key or not body.company_id:
        raise HTTPException(status_code=400, detail="PostHog Personal API Key and Project ID are required")
    validation = await validate_posthog_key(body.api_key, body.company_id, body.instance_url or "")
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid PostHog credentials"))
    data = await fetch_posthog_data(body.api_key, body.company_id, body.instance_url or "", user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "posthog",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "PostHog"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "company_id": body.company_id, "instance_url": body.instance_url or "",
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_ga4(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key or not body.company_id:
        raise HTTPException(status_code=400, detail="GA4 Service Account JSON and Property ID are required")
    validation = await validate_ga4_credentials(body.api_key, body.company_id)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid GA4 credentials"))
    data = await fetch_ga4_data(body.api_key, body.company_id, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "ga4",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Google Analytics 4"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),  # service account JSON
        "company_id": body.company_id,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_adobe_analytics(body: ConnectRequest, user_id: str, now: str):
    if not body.client_id or not body.client_secret or not body.company_id:
        raise HTTPException(status_code=400, detail="Adobe Client ID, Client Secret, and Report Suite ID are required")
    validation = await validate_adobe_credentials(body.client_id, body.client_secret, body.company_id)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Adobe Analytics credentials"))
    data = await fetch_adobe_data(body.client_id, body.client_secret, body.company_id, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "adobe_analytics",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Adobe Analytics"),
        "api_key_last4": body.client_secret[-4:],
        "api_key_encrypted": encrypt(body.client_secret),  # client secret
        "client_id": body.client_id, "company_id": body.company_id,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_tableau(body: ConnectRequest, user_id: str, now: str):
    if not body.instance_url or not body.client_id or not body.api_key:
        raise HTTPException(status_code=400, detail="Tableau Server URL, PAT Name, and PAT Secret are required")
    validation = await validate_tableau_credentials(body.instance_url, body.client_id, body.api_key, body.company_id or "")
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Tableau credentials"))
    data = await fetch_tableau_data(body.instance_url, body.client_id, body.api_key, body.company_id or "", user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "tableau",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Tableau"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),  # PAT secret
        "client_id": body.client_id,  # PAT name
        "instance_url": body.instance_url, "company_id": body.company_id or "",
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_logrocket(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key or not body.instance_url or not body.company_id:
        raise HTTPException(status_code=400, detail="LogRocket API Key, Org ID, and App ID are required")
    validation = await validate_logrocket_key(body.api_key, body.instance_url, body.company_id)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid LogRocket credentials"))
    data = await fetch_logrocket_data(body.api_key, body.instance_url, body.company_id, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "logrocket",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "LogRocket"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "instance_url": body.instance_url, "company_id": body.company_id,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_sage(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Sage Access Token is required")
    validation = await validate_sage_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Sage credentials"))
    data = await fetch_sage_data(body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "sage",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Sage Accounting"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_amazon_seller(body: ConnectRequest, user_id: str, now: str):
    if not body.client_id or not body.client_secret or not body.api_key:
        raise HTTPException(status_code=400, detail="Amazon LWA Client ID, Client Secret, and Refresh Token are required")
    region = body.instance_url or "na"
    validation = await validate_amazon_credentials(body.client_id, body.client_secret, body.api_key, region, body.company_id or "")
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Amazon credentials"))
    data = await fetch_amazon_data(body.client_id, body.client_secret, body.api_key, region, body.company_id or "", user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "amazon_seller",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Amazon Seller Central"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),  # refresh token
        "client_id": body.client_id,
        "client_secret_encrypted": encrypt(body.client_secret),
        "instance_url": region, "company_id": body.company_id or "",
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_chargebee(body: ConnectRequest, user_id: str, now: str):
    if not body.instance_url or not body.api_key:
        raise HTTPException(status_code=400, detail="Chargebee Site and API Key are required")
    validation = await validate_chargebee_key(body.api_key, body.instance_url)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Chargebee credentials"))
    data = await fetch_chargebee_data(body.api_key, body.instance_url, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "chargebee",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Chargebee"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "instance_url": body.instance_url,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_ramp(body: ConnectRequest, user_id: str, now: str):
    if not body.client_id or not body.client_secret:
        raise HTTPException(status_code=400, detail="Ramp Client ID and Client Secret are required")
    validation = await validate_ramp_credentials(body.client_id, body.client_secret)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Ramp credentials"))
    data = await fetch_ramp_data(body.client_id, body.client_secret, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "ramp",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Ramp"),
        "api_key_last4": body.client_secret[-4:],
        "api_key_encrypted": encrypt(body.client_secret),
        "client_id": body.client_id,
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


async def _connect_brex(body: ConnectRequest, user_id: str, now: str):
    if not body.api_key:
        raise HTTPException(status_code=400, detail="Brex API Token is required")
    validation = await validate_brex_key(body.api_key)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation.get("error", "Invalid Brex credentials"))
    data = await fetch_brex_data(body.api_key, user_id)
    connection = {
        "connection_id": f"conn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "platform": "brex",
        "connected_at": now, "last_synced": now,
        "records_synced": data["total_records"], "sync_status": "synced",
        "account_name": validation.get("account_name", "Brex"),
        "api_key_last4": body.api_key[-4:],
        "api_key_encrypted": encrypt(body.api_key),
        "stats": data["stats"], "is_live": True,
    }
    return data, connection, validation.get("account_name")


CONNECT_HANDLERS = {
    "stripe": _connect_stripe,
    "shopify": _connect_shopify,
    "hubspot": _connect_hubspot,
    "salesforce": _connect_salesforce,
    "quickbooks": _connect_quickbooks,
    "paypal": _connect_paypal,
    "amplitude": _connect_amplitude,
    "mixpanel": _connect_mixpanel,
    "zoho": _connect_zoho,
    "xero": _connect_xero,
    "square": _connect_square,
    "paddle": _connect_paddle,
    "checkout": _connect_checkout,
    "sumup": _connect_sumup,
    "airwallex": _connect_airwallex,
    "woocommerce": _connect_woocommerce,
    "squarespace": _connect_squarespace,
    "square_online": _connect_square_online,
    "opencart": _connect_opencart,
    "volusion": _connect_volusion,
    "pipedrive": _connect_pipedrive,
    "monday": _connect_monday,
    "insightly": _connect_insightly,
    "oracle_cx": _connect_oracle_cx,
    "freshsales": _connect_freshsales,
    "posthog": _connect_posthog,
    "ga4": _connect_ga4,
    "adobe_analytics": _connect_adobe_analytics,
    "tableau": _connect_tableau,
    "logrocket": _connect_logrocket,
    "sage": _connect_sage,
    "amazon_seller": _connect_amazon_seller,
    "chargebee": _connect_chargebee,
    "ramp": _connect_ramp,
    "brex": _connect_brex,
}


@router.get("/business/platforms")
async def get_platforms(current_user: User = Depends(get_current_user)):
    connections = await db.business_connections.find(
        org_filter(current_user), {"_id": 0}
    ).to_list(20)
    connected_map = {c["platform"]: c for c in connections}

    result = []
    for pid, info in PLATFORMS.items():
        conn = connected_map.get(pid)
        platform_data = {
            **info,
            "connected": conn is not None,
            "connected_at": conn.get("connected_at") if conn else None,
            "last_synced": conn.get("last_synced") if conn else None,
            "records_synced": conn.get("records_synced", 0) if conn else 0,
            "sync_status": conn.get("sync_status", "idle") if conn else "idle",
            "is_live": conn.get("is_live", False) if conn else False,
        }
        if conn and conn.get("account_name"):
            platform_data["account_name"] = conn["account_name"]
        if conn and conn.get("stats"):
            platform_data["stats"] = conn["stats"]
        if conn and conn.get("revenue_role"):
            platform_data["revenue_role"] = conn["revenue_role"]
        result.append(platform_data)
    return result


@router.put("/business/connection/{platform}/role")
async def set_connection_role(platform: str, request: Request, current_user: User = Depends(require_owner)):
    """Update the revenue_role for a connected platform (revenue / pipeline / signal)."""
    data = await request.json()
    role = (data.get("role") or "").lower().strip()
    if role not in ("revenue", "pipeline", "signal"):
        raise HTTPException(status_code=400, detail="role must be one of: revenue, pipeline, signal")
    result = await db.business_connections.update_one(
        {**org_filter(current_user), "platform": platform},
        {"$set": {"revenue_role": role}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Platform not connected")
    return {"status": "updated", "platform": platform, "revenue_role": role}


@router.get("/business/integration-usage")
async def get_integration_usage(current_user: User = Depends(get_current_user)):
    """Returns integration quota + usage for the user's org tier."""
    org = await db.organizations.find_one({"org_id": current_user.org_id}, {"_id": 0}) if current_user.org_id else None
    tier = (org or {}).get("subscription_tier") or current_user.subscription_tier or "trial"
    limit = get_integration_limit(tier)
    used = await db.business_connections.count_documents(org_filter(current_user))
    return {
        "tier": tier,
        "used": used,
        "limit": limit,  # None == unlimited
        "available": (None if limit is None else max(0, limit - used)),
        "at_limit": (False if limit is None else used >= limit),
    }


@router.post("/business/connect/{platform}")
async def connect_platform(platform: str, body: ConnectRequest = ConnectRequest(), current_user: User = Depends(require_owner)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    existing = await db.business_connections.find_one(
        {**org_filter(current_user), "platform": platform}, {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Platform already connected")

    # Tier gate — count-based integration limit
    org = await db.organizations.find_one({"org_id": current_user.org_id}, {"_id": 0}) if current_user.org_id else None
    tier = (org or {}).get("subscription_tier") or current_user.subscription_tier or "trial"
    limit = get_integration_limit(tier)
    if limit is not None:
        used = await db.business_connections.count_documents(org_filter(current_user))
        if used >= limit:
            tier_name = tier.replace("_monthly", "").replace("_yearly", "").title()
            raise HTTPException(
                status_code=403,
                detail=f"Your {tier_name} plan allows {limit} integration{'s' if limit != 1 else ''}. Upgrade to connect more platforms."
            )

    now = datetime.now(timezone.utc).isoformat()
    handler = CONNECT_HANDLERS.get(platform)
    if not handler:
        raise HTTPException(status_code=400, detail="Integration not available")

    data, connection, account_name = await handler(body, current_user.user_id, now)
    connection["org_id"] = current_user.org_id
    # Default revenue role from PLATFORMS dict (revenue/pipeline/signal); user can override later
    connection["revenue_role"] = PLATFORMS[platform].get("default_revenue_role", "revenue")

    if data["deals"]:
        for d in data["deals"]:
            d["org_id"] = current_user.org_id
        await db.deals.insert_many(data["deals"])

    await db.business_connections.insert_one(connection)
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"has_business_connected": True}}
    )

    # Auto-sync pricing data from the newly connected platform
    try:
        from routes.analytics import sync_pricing_from_integrations
        await sync_pricing_from_integrations(current_user)
    except Exception:
        pass  # Non-blocking: pricing sync failure shouldn't break connect flow

    return {
        "status": "connected",
        "platform": platform,
        "is_live": True,
        "account_name": account_name,
        "records_synced": data["total_records"],
        "stats": data.get("stats"),
        "message": f"Connected to {account_name or PLATFORMS[platform]['name']}. {data['total_records']} records synced from live data.",
    }


@router.post("/business/disconnect/{platform}")
async def disconnect_platform(platform: str, current_user: User = Depends(require_owner)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    result = await db.business_connections.delete_one(
        {**org_filter(current_user), "platform": platform}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Platform not connected")

    delete_result = await db.deals.delete_many(
        {**org_filter(current_user), "source": platform, "synced": True}
    )

    remaining = await db.business_connections.count_documents(org_filter(current_user))
    if remaining == 0:
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {"has_business_connected": False}}
        )

    return {"status": "disconnected", "platform": platform, "records_removed": delete_result.deleted_count}


@router.post("/business/sync/{platform}")
async def sync_platform(platform: str, current_user: User = Depends(require_owner)):
    if platform not in PLATFORMS:
        raise HTTPException(status_code=404, detail="Platform not found")

    connection = await db.business_connections.find_one(
        {**org_filter(current_user), "platform": platform}, {"_id": 0}
    )
    if not connection:
        raise HTTPException(status_code=404, detail="Platform not connected")

    api_key = connection.get("api_key_encrypted")
    if not api_key:
        raise HTTPException(status_code=400, detail="No API key found. Please reconnect.")
    api_key = decrypt(api_key)

    # Remove old synced deals for this org+platform
    await db.deals.delete_many({**org_filter(current_user), "source": platform, "synced": True})
    now = datetime.now(timezone.utc).isoformat()

    try:
        if platform == "stripe":
            data = await fetch_stripe_data(api_key, current_user.user_id)
        elif platform == "shopify":
            data = await fetch_shopify_data(api_key, connection.get("store_url", ""), current_user.user_id)
        elif platform == "hubspot":
            data = await fetch_hubspot_data(api_key, current_user.user_id)
        elif platform == "salesforce":
            data = await fetch_salesforce_data(api_key, connection.get("instance_url", ""), current_user.user_id)
        elif platform == "quickbooks":
            data = await fetch_quickbooks_data(api_key, connection.get("company_id", ""), current_user.user_id, connection.get("sandbox", False))
        elif platform == "paypal":
            data = await fetch_paypal_data(
                connection.get("client_id", ""),
                api_key,  # client_secret stored in api_key slot
                connection.get("sandbox", False),
                current_user.user_id,
            )
        elif platform == "amplitude":
            data = await fetch_amplitude_data(
                connection.get("client_id", ""),
                api_key,
                connection.get("instance_url", "us"),
                current_user.user_id,
            )
        elif platform == "mixpanel":
            data = await fetch_mixpanel_data(
                connection.get("company_id", ""),
                api_key,
                connection.get("instance_url", "us"),
                current_user.user_id,
            )
        elif platform == "zoho":
            client_secret = decrypt(connection.get("client_secret_encrypted", ""))
            data = await fetch_zoho_data(
                api_key,  # refresh_token
                connection.get("client_id", ""),
                client_secret,
                connection.get("instance_url", "com"),
                current_user.user_id,
            )
        elif platform == "xero":
            client_secret = decrypt(connection.get("client_secret_encrypted", ""))
            data = await fetch_xero_data(
                api_key,  # refresh_token
                connection.get("client_id", ""),
                client_secret,
                connection.get("company_id", ""),
                current_user.user_id,
            )
        elif platform == "square":
            data = await fetch_square_data(api_key, current_user.user_id, connection.get("sandbox", False))
        elif platform == "paddle":
            data = await fetch_paddle_data(api_key, current_user.user_id, connection.get("sandbox", False))
        elif platform == "checkout":
            data = await fetch_checkout_data(api_key, current_user.user_id)
        elif platform == "sumup":
            data = await fetch_sumup_data(api_key, connection.get("company_id", ""), current_user.user_id)
        elif platform == "airwallex":
            data = await fetch_airwallex_data(
                connection.get("client_id", ""),
                api_key,
                current_user.user_id,
                connection.get("sandbox", False),
            )
        elif platform == "woocommerce":
            data = await fetch_woocommerce_data(
                connection.get("store_url", ""),
                connection.get("client_id", ""),  # consumer_key
                api_key,  # consumer_secret
                current_user.user_id,
            )
        elif platform == "squarespace":
            data = await fetch_squarespace_data(api_key, current_user.user_id)
        elif platform == "square_online":
            data = await fetch_square_online_data(api_key, current_user.user_id, connection.get("sandbox", False))
        elif platform == "opencart":
            data = await fetch_opencart_data(connection.get("store_url", ""), api_key, current_user.user_id)
        elif platform == "volusion":
            data = await fetch_volusion_data(
                connection.get("store_url", ""),
                connection.get("client_id", ""),  # login email
                api_key,  # encrypted password
                current_user.user_id,
            )
        elif platform == "pipedrive":
            data = await fetch_pipedrive_data(api_key, connection.get("instance_url", ""), current_user.user_id)
        elif platform == "monday":
            data = await fetch_monday_data(api_key, connection.get("company_id", ""), current_user.user_id)
        elif platform == "insightly":
            data = await fetch_insightly_data(api_key, connection.get("instance_url", ""), current_user.user_id)
        elif platform == "oracle_cx":
            data = await fetch_oracle_cx_data(
                connection.get("instance_url", ""),
                connection.get("client_id", ""),  # username
                api_key,  # password
                current_user.user_id,
            )
        elif platform == "freshsales":
            data = await fetch_freshsales_data(api_key, connection.get("instance_url", ""), current_user.user_id)
        elif platform == "posthog":
            data = await fetch_posthog_data(api_key, connection.get("company_id", ""), connection.get("instance_url", ""), current_user.user_id)
        elif platform == "ga4":
            data = await fetch_ga4_data(api_key, connection.get("company_id", ""), current_user.user_id)
        elif platform == "adobe_analytics":
            data = await fetch_adobe_data(
                connection.get("client_id", ""),
                api_key,  # client secret
                connection.get("company_id", ""),  # rsid
                current_user.user_id,
            )
        elif platform == "tableau":
            data = await fetch_tableau_data(
                connection.get("instance_url", ""),
                connection.get("client_id", ""),  # PAT name
                api_key,  # PAT secret
                connection.get("company_id", ""),  # site content url
                current_user.user_id,
            )
        elif platform == "logrocket":
            data = await fetch_logrocket_data(api_key, connection.get("instance_url", ""), connection.get("company_id", ""), current_user.user_id)
        elif platform == "sage":
            data = await fetch_sage_data(api_key, current_user.user_id)
        elif platform == "amazon_seller":
            client_secret = decrypt(connection.get("client_secret_encrypted", ""))
            data = await fetch_amazon_data(
                connection.get("client_id", ""),
                client_secret,
                api_key,  # refresh token
                connection.get("instance_url", "na"),
                connection.get("company_id", ""),
                current_user.user_id,
            )
        elif platform == "chargebee":
            data = await fetch_chargebee_data(api_key, connection.get("instance_url", ""), current_user.user_id)
        elif platform == "ramp":
            data = await fetch_ramp_data(connection.get("client_id", ""), api_key, current_user.user_id)
        elif platform == "brex":
            data = await fetch_brex_data(api_key, current_user.user_id)
        else:
            raise HTTPException(status_code=400, detail="Sync not supported for this platform")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Sync failed: {str(e)}")

    if data["deals"]:
        for d in data["deals"]:
            d["org_id"] = current_user.org_id
        await db.deals.insert_many(data["deals"])

    await db.business_connections.update_one(
        {**org_filter(current_user), "platform": platform},
        {"$set": {
            "last_synced": now,
            "records_synced": data["total_records"],
            "sync_status": "synced",
            "stats": data.get("stats"),
        }}
    )
    return {
        "status": "synced", "platform": platform, "is_live": True,
        "records_synced": data["total_records"],
        "stats": data.get("stats"),
        "message": f"Synced {data['total_records']} live records from {PLATFORMS[platform]['name']}.",
    }


@router.get("/business/summary")
async def get_business_summary(current_user: User = Depends(get_current_user)):
    connections = await db.business_connections.find(
        org_filter(current_user), {"_id": 0}
    ).to_list(20)

    total_records = sum(c.get("records_synced", 0) for c in connections)

    synced_deals = await db.deals.find(
        {**org_filter(current_user), "synced": True},
        {"_id": 0, "source": 1, "value": 1, "stage": 1}
    ).to_list(2000)

    by_platform = {}
    for d in synced_deals:
        src = d.get("source", "unknown")
        if src not in by_platform:
            by_platform[src] = {"count": 0, "value": 0}
        by_platform[src]["count"] += 1
        by_platform[src]["value"] += d.get("value", 0)

    platform_summaries = []
    for c in connections:
        p = c["platform"]
        info = PLATFORMS.get(p, {})
        bp = by_platform.get(p, {"count": 0, "value": 0})
        platform_summaries.append({
            "platform": p,
            "name": info.get("name", p),
            "connected_at": c.get("connected_at"),
            "last_synced": c.get("last_synced"),
            "records": bp["count"],
            "total_value": round(bp["value"], 2),
            "is_live": c.get("is_live", False),
            "account_name": c.get("account_name"),
        })

    return {
        "connected_count": len(connections),
        "total_records": total_records,
        "total_synced_value": round(sum(bp["value"] for bp in by_platform.values()), 2),
        "platforms": platform_summaries,
    }
