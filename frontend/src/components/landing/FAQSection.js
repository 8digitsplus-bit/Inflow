import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'What is InFlow and who is it for?',
    a: 'A revenue intelligence platform for B2B SaaS, e-commerce, and service teams. Founders, RevOps, and finance use it to unify pipeline + revenue data and run AI-powered analytics from one dashboard.',
  },
  {
    q: 'How does the free trial and sign-up work?',
    a: 'You pick a plan and create your account right on the checkout page. From there you can start an optional 14-day free trial — your card is saved but you’re charged $0 today and can cancel anytime before it ends — or subscribe and pay immediately. You’re always in control from Settings → Billing.',
  },
  {
    q: 'What data sources can I connect?',
    a: '35+ live integrations across five categories — Payments (Stripe, PayPal, Square, Chargebee…), E-Commerce (Shopify, WooCommerce, Amazon Seller…), CRM (HubSpot, Salesforce, Pipedrive…), Finance (QuickBooks, Xero, Sage…) and Analytics (GA4, Amplitude, Mixpanel, PostHog…). Your plan sets how many you can connect at once (Essential 5, Pro 15, Enterprise unlimited). Pro adds CSV import; Enterprise adds Custom API access.',
  },
  {
    q: 'What can InFlow’s AI do?',
    a: 'Claude powers a suite of tools: AI revenue insights and forecasting, automatic revenue-leak detection, pricing guidance with a written rationale and projected impact, and Competitor Intelligence — which auto-extracts competitors’ public pricing and benchmarks it against yours. Everything runs on demand, so nothing changes on your account without you.',
  },
  {
    q: "What's the difference between Essential, Pro & Enterprise?",
    a: 'Essential ($75/mo) — 5 integrations + core analytics. Pro ($179/mo) — 15 integrations, AI insights, CSV import, forecasting. Enterprise ($327/mo) — unlimited integrations, Custom API, Smart Assist AI, Competitor Intelligence. Flat monthly or yearly subscription per workspace. Yearly billing saves up to 36%.',
  },
  {
    q: 'Can I cancel or change my plan at any time?',
    a: 'Yes. Settings → Manage Billing lets you update your card, switch plans, view invoices, or cancel — all self-serve. No lock-in contracts.',
  },
  {
    q: 'Is my data secure?',
    a: 'Encrypted in transit (TLS 1.3) and at rest. Integration credentials encrypted with AES, payments handled by Stripe (we never see your card), optional 2FA on every plan, and your data is never used to train AI models.',
  },
  {
    q: 'What kind of support do you offer?',
    a: 'All plans include AI support chat and a ticket system, with priority handling on Pro and Enterprise. Smart Assist AI — our autonomous agent that investigates your data and takes actions — is exclusive to Enterprise. You can also reach us anytime at support@inflowft.com.',
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
      <ChevronDown className={`w-5 h-5 flex-shrink-0 text-zinc-500 transition-transform duration-300 ${open ? 'rotate-180 text-slate-400' : ''}`} />
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
