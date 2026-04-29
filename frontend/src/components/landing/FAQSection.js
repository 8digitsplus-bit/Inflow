import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'What is InFlow and who is it for?',
    a: 'InFlow is a revenue intelligence platform for B2B SaaS, e-commerce, and service businesses. Founders, RevOps, and finance teams use it to unify pipeline + revenue data, optimize pricing, predict churn, and track growth — all from a single dashboard powered by AI.',
  },
  {
    q: 'How does the 14-day free trial work?',
    a: 'Pick a plan, enter your card, and get full access to that tier for 14 days. We don\'t charge anything during the trial — Stripe holds your payment method on file and billing only starts on day 14. You can cancel anytime from Settings → Manage Billing and you won\'t be charged a cent.',
  },
  {
    q: 'What data sources can I connect?',
    a: 'InFlow has 10 live integrations: Stripe, PayPal, Shopify, Xero, and QuickBooks for revenue; HubSpot, Salesforce, and Zoho CRM for pipeline; Mixpanel and Amplitude for product analytics. Each integration auto-syncs deals, customers, payments, or events. Pro and Enterprise plans can also bulk-import via CSV; Enterprise can build a Custom API connector for any system we don\'t support out of the box.',
  },
  {
    q: 'How does AI-powered pricing optimization work?',
    a: 'The Pricing Optimizer reads your historical revenue, deal sizes, and conversion data, then uses Claude to recommend a price point for each product. You get a written rationale, projected revenue impact, and a competitive positioning summary you can share with stakeholders. It runs on demand — no surprise re-pricing.',
  },
  {
    q: "What's the difference between Essential, Pro & Enterprise?",
    a: 'Essential ($299/mo) — Sales Pipeline, core analytics, churn monitoring, and 2 live integrations. Pro ($699/mo) — adds AI insights, CRO analysis, revenue forecasting, CSV import, 4 live integrations, and priority support. Enterprise ($260/user/mo, min 1 seat) — adds unlimited integrations, Custom API access, Smart Assist AI, advanced revenue intelligence, and dedicated support. Yearly plans get 30% off the first year.',
  },
  {
    q: 'Can I cancel or change my plan at any time?',
    a: 'Yes. From Settings → Manage Billing you can update your card, switch plans, view past invoices, download VAT-compliant PDFs, or cancel — all self-serve. Cancellations take effect at the end of your current billing period and there are no lock-in contracts.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. All data is encrypted in transit (TLS 1.3) and at rest. Integration credentials are stored encrypted with AES, never logged. Payments are processed by Stripe — InFlow never sees your card details. Optional two-factor authentication via email is available on every plan, and your business data is never shared between accounts or used to train AI models.',
  },
  {
    q: 'What kind of support do you offer?',
    a: 'Email support on Essential, priority response on Pro, and dedicated account support on Enterprise. The Smart Assist AI sidebar is available across the app to help you investigate metrics, summarize integrations, and answer questions about your own data — without needing to wait on a human.',
  },
];

const FAQItem = ({ q, a, open, onClick }) => (
  <div
    className="border-b border-white/5 last:border-0"
    data-testid={`faq-item-${q.slice(0, 20).replace(/\s/g, '-').toLowerCase()}`}
  >
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-5 text-left group"
    >
      <span className={`text-sm sm:text-base font-medium pr-4 transition-colors ${open ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>
        {q}
      </span>
      <ChevronDown className={`w-5 h-5 flex-shrink-0 text-zinc-500 transition-transform duration-300 ${open ? 'rotate-180 text-indigo-400' : ''}`} />
    </button>
    <div
      className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        open ? 'max-h-96 pb-5' : 'max-h-0'
      }`}
    >
      <p className="text-zinc-400 text-sm leading-relaxed pr-8">{a}</p>
    </div>
  </div>
);

export const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section id="faq" className="py-24 px-4 sm:px-6 lg:px-8" data-testid="faq-section">
      <div className="max-w-3xl mx-auto reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
            FAQs
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base">Everything you need to know about InFlow</p>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl px-6 sm:px-8">
          {faqs.map((faq, i) => (
            <FAQItem
              key={i}
              q={faq.q}
              a={faq.a}
              open={openIndex === i}
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
