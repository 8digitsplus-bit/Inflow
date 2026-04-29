import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'What is InFlow and who is it for?',
    a: 'A revenue intelligence platform for B2B SaaS, e-commerce, and service teams. Founders, RevOps, and finance use it to unify pipeline + revenue data and run AI-powered analytics from one dashboard.',
  },
  {
    q: 'How does the 14-day free trial work?',
    a: 'Pick a plan, enter your card, get full access for 14 days. We don\'t charge anything during the trial — billing only starts on day 14, and you can cancel anytime from Settings → Manage Billing.',
  },
  {
    q: 'What data sources can I connect?',
    a: '10 live integrations: Stripe, PayPal, Shopify, Xero, QuickBooks, HubSpot, Salesforce, Zoho CRM, Mixpanel, and Amplitude. Pro adds CSV import; Enterprise adds Custom API access.',
  },
  {
    q: 'How does AI-powered pricing optimization work?',
    a: 'Claude analyses your historical revenue and conversion data, then recommends an optimal price with a written rationale and projected revenue impact. It runs on demand — no surprise re-pricing.',
  },
  {
    q: "What's the difference between Essential, Pro & Enterprise?",
    a: 'Essential ($299/mo) — 2 integrations + core analytics. Pro ($699/mo) — 4 integrations, AI insights, CSV import, forecasting. Enterprise ($260/user/mo) — unlimited integrations, Custom API, Smart Assist AI. Yearly = 30% off year one.',
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
    a: 'Email support on Essential, priority on Pro, dedicated account support on Enterprise. Smart Assist AI is built into the app on every tier to answer questions about your data instantly.',
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
