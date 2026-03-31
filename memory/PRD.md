# InFlow - Revenue Intelligence SaaS Platform

## Original Problem Statement
Build "InFlow", a top-tier, full-stack SaaS application for pricing optimization, sales pipeline management, and revenue intelligence. Core features include tier-gated analytics, integrations (Stripe, HubSpot, Salesforce, etc.), and AI tools. The app is now pivoting to be highly AI-driven with a custom AI orchestration engine that executes tasks and orchestrates workflows.

## Tech Stack
- Frontend: React + Tailwind CSS + Shadcn UI + Recharts
- Backend: FastAPI (Python)
- Database: MongoDB
- Auth: Session cookies (httpOnly) + Google OAuth
- Encryption: AES-256 (Fernet) for API keys at rest
- AI: Claude Opus 4.6 via Emergent LLM Key (emergentintegrations library)

## What's Been Implemented

### Core Features
- Landing page with glassmorphism cards, dark theme
- Authentication: Email/password + Google OAuth + account chooser
- Subscription tiers: Essential ($79/mo), Pro ($249/mo), Enterprise ($500/mo) with Monthly/Yearly toggle
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

### AI Copilot Orchestrator (NEW - Mar 31, 2026)
- **Sidebar copilot** accessible from every dashboard page via floating sparkles button
- **Powered by Claude Opus 4.6** via Emergent LLM Key
- **Natural language interface** — users type plain English questions
- **Page-context aware** — knows which page user is viewing, provides relevant suggestions
- **Tool-use architecture** — AI can call 12 tools to query real business data:
  - query_deals, analytics_summary, integration_status, revenue_breakdown
  - churn_risk, deal_details, forecast, search_deals
  - top_opportunities, stage_velocity, draft_email, score_deal
- **Multi-step reasoning** — up to 3 iterations of tool calls per query
- **Persistent chat sessions** — conversations saved in MongoDB, history browseable
- **Read-only mode** — gives recommendations without modifying data
- Backend: `/app/backend/routes/orchestrator.py`
- Frontend: `/app/frontend/src/components/AICopilot.js`

### Data Visualizations (Diverse - No Duplicate Chart Types)
- Area Charts: Monthly Forecast (Revenue Forecast page)
- Line Charts: Stage Velocity (Pipeline), Activity-to-Close (Sales Performance)
- Radial Progress Rings: Close Rate (Sales Performance)
- CSS Trapezoid Funnels: Pipeline by Stage (Pipeline)
- Donut Chart: Weighted Pipeline (Sales Pipeline)
- Pie Chart: Pipeline Weighted by Stage (Revenue Forecast)
- Conversion Funnel Bars: CRO page

### Security
- AES-256 encryption at rest for all integration API keys
- Encryption utility: /backend/utils/crypto.py

### Integrations Setup
- Stripe, Shopify, HubSpot, Salesforce, QuickBooks (user API key, encrypted at rest)
- Google Auth (functional)
- OpenAI Sora-2 (marketing videos via Emergent LLM Key)
- Claude Sonnet 4.5 (via Emergent LLM Key) - used in support agent
- Claude Opus 4.6 (via Emergent LLM Key) - AI Copilot Orchestrator

### Marketing Assets
- Cinematic teaser video + 9:16 social media video (Sora-2 + ffmpeg)

## Prioritized Backlog

### P0 - Critical
- Implement Functional Email 2FA (currently MOCKED via toast notification, needs Resend/SendGrid integration)

### P1 - High Priority
- Terms of Service page (/terms)
- AI Deal Scorer as standalone feature (currently available via copilot)
- AI Revenue Copilot (proactive alerts/notifications)
- AI Email Draft Generator as standalone feature (currently available via copilot)

### P2 - Medium Priority
- Integration Health Dashboard
- Email-Scheduled Forecast Reports / Daily AI Briefing
- Copilot write mode (allow AI to update deal stages, create deals)

## Key API Endpoints
- `/api/orchestrator/chat` - AI Copilot chat (POST)
- `/api/orchestrator/sessions` - List chat sessions (GET)
- `/api/orchestrator/sessions/{id}` - Get/Delete session (GET/DELETE/PATCH)
- `/api/business/connect/{platform}` - Connect integration
- `/api/business/sync/{platform}` - Sync data
- `/api/deals` - CRUD for deals
- `/api/analytics/pipeline` - Pipeline analytics
- `/api/analytics/forecasting` - Revenue forecasting
- `/api/analytics/cro` - CRO analytics
- `/api/analytics/pricing/sync` - Auto-sync pricing data

## Key Files
- `/app/backend/routes/orchestrator.py` - AI Copilot Orchestrator (Claude Opus 4.6)
- `/app/frontend/src/components/AICopilot.js` - Copilot sidebar UI
- `/app/frontend/src/components/DashboardLayout.js` - Layout with copilot integration
- `/app/backend/routes/agent.py` - Legacy support agent (Claude Sonnet 4.5)
- `/app/backend/utils/crypto.py` - AES-256 encryption
- `/app/frontend/src/constants/colors.js` - Global chart color scheme

## Test Credentials
- Email: testpro@test.com / Password: password (Pro plan)
- Email: testdemo@inflow.com / Password: password (Demo account)
