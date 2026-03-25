import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-300">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-12"
          data-testid="privacy-back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <h1
          className="text-3xl sm:text-4xl font-bold text-white mb-2"
          style={{ fontFamily: 'Outfit' }}
          data-testid="privacy-heading"
        >
          Privacy Policy
        </h1>
        <p className="text-sm text-zinc-500 mb-12">Last updated: 24 March 2026</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <Section title="1. Who We Are">
            <p>
              InFlow ("we", "us", "our") operates the InFlow platform at inflow.io. This policy explains what personal data we collect, why we collect it, and how we handle it.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <p className="mb-3">We collect only what is necessary to provide and improve our service:</p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li><strong className="text-zinc-300">Account information</strong> — name, email address, and hashed password when you register, or profile data provided by Google when you use social login.</li>
              <li><strong className="text-zinc-300">Billing data</strong> — payment details are collected and processed by Stripe. We store your subscription plan and billing status but never your card number.</li>
              <li><strong className="text-zinc-300">Business data</strong> — deals, pipeline stages, revenue figures, and customer records you create or import (CSV, API, or connected platforms).</li>
              <li><strong className="text-zinc-300">Integration credentials</strong> — API keys and access tokens you provide to connect third-party platforms (Stripe, Shopify, HubSpot, Salesforce, QuickBooks). These are stored encrypted and used solely to sync your data.</li>
              <li><strong className="text-zinc-300">Usage data</strong> — pages visited, features used, and session duration to help us understand how the product is used.</li>
            </ul>
          </Section>

          <Section title="3. How We Use Your Data">
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li>Provide, maintain, and improve the InFlow platform.</li>
              <li>Process payments and manage your subscription via Stripe.</li>
              <li>Sync data from your connected third-party platforms.</li>
              <li>Generate analytics, forecasts, and AI-powered insights from your business data.</li>
              <li>Send transactional emails (account verification, 2FA codes, billing receipts).</li>
              <li>Respond to support requests and tickets you create.</li>
            </ul>
          </Section>

          <Section title="4. AI & Your Data">
            <p>
              InFlow uses AI (powered by Anthropic Claude) to analyse your pipeline, generate pricing recommendations, and answer questions via the Agentic AI assistant. Your business data is sent to the AI provider only during active requests and is not used to train any external AI models. AI-generated insights are derived solely from your own data.
            </p>
          </Section>

          <Section title="5. Third-Party Services">
            <p className="mb-3">We share data only with services necessary to operate InFlow:</p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li><strong className="text-zinc-300">Stripe</strong> — payment processing and subscription management.</li>
              <li><strong className="text-zinc-300">Anthropic</strong> — AI analysis (data processed per-request, not stored or used for training).</li>
              <li><strong className="text-zinc-300">Google</strong> — social login authentication (only if you choose Google sign-in).</li>
              <li><strong className="text-zinc-300">Connected platforms</strong> — Shopify, HubSpot, Salesforce, QuickBooks (data flows from them to InFlow using credentials you provide).</li>
            </ul>
            <p className="mt-3">We do not sell, rent, or share your personal data with advertisers or data brokers.</p>
          </Section>

          <Section title="6. Data Security">
            <p>
              All data is encrypted in transit (TLS) and at rest. Integration credentials are stored encrypted. Passwords are hashed using bcrypt. We support optional two-factor authentication (2FA) for additional account security. Access to production systems is restricted to authorised personnel.
            </p>
          </Section>

          <Section title="7. Data Retention">
            <p>
              We retain your account and business data for as long as your account is active. If you cancel your subscription, your data is retained for 30 days in case you reactivate, then permanently deleted. You can request immediate deletion at any time by contacting us.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li><strong className="text-zinc-300">Access</strong> — request a copy of the personal data we hold about you.</li>
              <li><strong className="text-zinc-300">Correction</strong> — update or correct inaccurate data via your Settings page.</li>
              <li><strong className="text-zinc-300">Deletion</strong> — request deletion of your account and all associated data.</li>
              <li><strong className="text-zinc-300">Export</strong> — download your business data.</li>
              <li><strong className="text-zinc-300">Withdraw consent</strong> — disconnect integrations or disable 2FA at any time from Settings.</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, email us at <a href="mailto:privacy@inflow.io" className="text-indigo-400 hover:text-indigo-300 transition-colors">privacy@inflow.io</a>.</p>
          </Section>

          <Section title="9. Cookies">
            <p>
              We use essential cookies to maintain your login session and remember your preferences. We do not use advertising or tracking cookies. No third-party tracking scripts are loaded on our platform.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We may update this policy from time to time. If we make material changes, we will notify you by email or through a notice on the platform. Continued use of InFlow after changes constitutes acceptance.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              If you have questions about this privacy policy or how we handle your data, contact us at <a href="mailto:privacy@inflow.io" className="text-indigo-400 hover:text-indigo-300 transition-colors">privacy@inflow.io</a>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div data-testid={`privacy-section-${title.split('.')[0].trim().toLowerCase()}`}>
    <h2 className="text-base font-semibold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
      {title}
    </h2>
    {children}
  </div>
);

export default PrivacyPolicy;
