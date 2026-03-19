import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'What is InFlow and who is it for?',
    a: 'InFlow is an AI-powered revenue intelligence platform for B2B businesses. It helps sales teams, founders, and revenue leaders optimize pricing, manage sales pipelines, track revenue, predict churn, and improve conversion rates — all from one dashboard.',
  },
  {
    q: 'How does the 14-day free trial work?',
    a: 'When you sign up for the free trial, you get full access to all InFlow features for 14 days — no credit card required. You\'ll receive notifications as your trial nears expiration. If you choose not to upgrade, your account will be paused until you select a plan.',
  },
  {
    q: 'What data sources can I connect?',
    a: 'InFlow integrates with Stripe, Shopify, HubSpot, Salesforce, and QuickBooks. Connect your existing business tools from the "Connect Business" page and InFlow will automatically sync your revenue, pipeline, customer, and financial data.',
  },
  {
    q: 'How does AI-powered pricing optimization work?',
    a: 'Our Pricing Optimizer uses Claude AI to analyze your current pricing, competitor data, margins, and market segment. It recommends an optimal price point with a detailed strategy — including projected revenue impact and market positioning insights.',
  },
  {
    q: 'What\'s the difference between Essential, Pro, and Enterprise?',
    a: 'Essential ($59/mo) gives you the Sales Pipeline and core analytics. Pro ($149/mo) adds Sales Performance, revenue forecasting, churn prediction, CRO tools, and priority support. Enterprise ($249/mo) includes everything plus Revenue Intelligence, custom integrations, and API access.',
  },
  {
    q: 'Can I cancel or change my plan at any time?',
    a: 'Yes. You can upgrade, downgrade, or cancel your subscription at any time from the Settings page. Cancellations take effect at the end of your current billing period — no hidden fees or lock-in contracts.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. All data is encrypted in transit and at rest. We use secure OAuth connections for third-party integrations, and your business data is never shared with other users or used for training AI models.',
  },
  {
    q: 'What kind of support do you offer?',
    a: 'All plans include access to our AI-powered Priority Support — a live chat assistant that knows InFlow inside and out and can answer questions about your account instantly. Pro and Enterprise users get priority queuing. You can also create formal support tickets for complex issues.',
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
        open ? 'max-h-48 pb-5' : 'max-h-0'
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
            Frequently Asked Questions
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base">Everything you need to know about InFlow</p>
        </div>

        <div className="bg-zinc-900/30 border border-white/5 rounded-2xl px-6 sm:px-8">
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
