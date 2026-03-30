# InFlow - Revenue Intelligence SaaS Platform

## Original Problem Statement
Build "InFlow", a top-tier, full-stack SaaS application for pricing optimization, sales pipeline management, and revenue intelligence. Core features include tier-gated analytics, integrations (Stripe, HubSpot, Salesforce, etc.), and AI tools.

## Tech Stack
- Frontend: React + Tailwind CSS + Shadcn UI + Recharts
- Backend: FastAPI (Python)
- Database: MongoDB
- Auth: JWT + Google OAuth
- Encryption: AES-256 (Fernet) for API keys at rest

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

### Data Visualizations (Diverse - No Duplicate Chart Types)
- Area Charts: Monthly Forecast (Revenue Forecast page)
- Line Charts: Stage Velocity (Pipeline), Activity-to-Close (Sales Performance)
- Radial Progress Rings: Close Rate (Sales Performance)
- CSS Trapezoid Funnels: Pipeline by Stage (Pipeline)
- Donut Chart (Recharts PieChart): Weighted Pipeline (Sales Pipeline)
- Pie Chart: Pipeline Weighted by Stage (Revenue Forecast)
- Conversion Funnel Bars: CRO page

### Security
- AES-256 encryption at rest for all integration API keys
- Encryption utility: /backend/utils/crypto.py

### Integrations Setup
- Stripe, Shopify, HubSpot, Salesforce, QuickBooks (user API key, encrypted at rest)
- Google Auth (functional)
- OpenAI Sora-2 (marketing videos via Emergent LLM Key)
- Claude Sonnet 4.5 (via Emergent LLM Key)

### Marketing Assets
- Cinematic teaser video + 9:16 social media video (Sora-2 + ffmpeg)

## Changes Made (Mar 30, 2026)
- Fixed Weighted Pipeline donut chart (Pipeline page) - switched from custom SVG to Recharts PieChart for reliable rendering + added sample data fallback
- Fixed Conversion Funnel spacing/overlapping (CRO page) - increased spacing, added stage labels on left with percentages on right
- Changed Pipeline Weighted by Stage (Revenue Forecast) from Waterfall chart to Recharts RadialBarChart
- Fixed Pipeline funnel deal count bug (d.deals -> d.count)
- Fixed Dashboard Revenue Trend tooltip: "Forecast" value now formatted as currency (was showing raw number like 380249.99999999994)
- Fixed SalesPerformance Activity-to-Close tooltip: removed fragile >100 threshold that could format deal counts as currency
- Added hover title attributes to Pipeline funnel bars and CRO conversion funnel bars for tooltip data on hover

## Prioritized Backlog

### P0 - Critical
- Implement Functional Email 2FA (currently MOCKED via toast notification, needs Resend/SendGrid integration)

### P1 - High Priority
- AI Deal Scorer (scores pipeline deals)
- AI Revenue Copilot (proactive alerts/notifications)
- AI Email Draft Generator (contextual drafts from deal data)
- Terms of Service page (/terms)

### P2 - Medium Priority
- Integration Health Dashboard
- Email-Scheduled Forecast Reports / Daily AI Briefing

## Key API Endpoints
- `/api/business/connect/{platform}` - Connect integration (encrypts API keys)
- `/api/business/sync/{platform}` - Sync data (decrypts keys)
- `/api/custom-integration/connect` - Custom integration connect
- `/api/custom-integration/fetch` - Custom integration fetch
- `/api/deals` - CRUD for deals
- `/api/analytics/pipeline` - Pipeline analytics
- `/api/analytics/forecasting` - Revenue forecasting
- `/api/analytics/cro` - CRO analytics

## Key Files
- `/app/backend/utils/crypto.py` - AES-256 encryption
- `/app/frontend/src/pages/Pipeline.js` - Sales Pipeline + Donut chart
- `/app/frontend/src/pages/RevenueForecast.js` - Revenue Forecast + Radial Bar
- `/app/frontend/src/pages/ConversionOptimization.js` - CRO + Funnel
- `/app/frontend/src/pages/SalesPerformance.js` - Performance + Radial rings
- `/app/backend/routes/business.py` - Integration connections
- `/app/backend/routes/auth.py` - Authentication (2FA still mocked)

## Test Credentials
- Email: testpro@test.com
- Password: password
