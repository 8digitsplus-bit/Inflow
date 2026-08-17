import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'What is InFlow and who is it for?',
    a: "InFlow's a revenue intelligence platform for businesses, e-commerce, solo-founders & rev-ops.",
  },
  {
    q: 'How does the free trial and sign-up work?',
    a: 'You choose your plan & create your account. From the checkout page you can opt for the 14 day free trial.',
  },
  {
    q: 'What data sources can I connect?',
    a: 'You can choose from up to 35 integrations across: payments, e-commerce, CRM, analytics & finance.',
  },
  {
    q: 'Do you offer a discount on annual plans?',
    a: 'Yes — new customers get 20% off their first year on any annual plan: $597 (Essential), $1,356 (Pro), $1,999 (Enterprise). Plans renew at the standard yearly price after year one.',
  },
  {
    q: "What can InFlow's AI do?",
    a: "Claude powers on-demand AI revenue insights and forecasting, automatic revenue-leak detection, pricing guidance with a written rationale, and Competitor Intelligence that benchmarks rivals' public pricing against yours.",
  },
  {
    q: 'Can I cancel or change my plan at any time?',
    a: 'Yes you can cancel anytime from Settings → Manage Billing.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. Data is secured in transit & at rest via TLS 1.3.',
  },
  {
    q: 'Can I push updates back into my CRM?',
    a: 'Yes. In the Workspace you can draft notes, tasks, calls, emails, deals and offers and push them into the CRM you choose — HubSpot, Salesforce or Pipedrive — with a review-and-confirm step before anything is written.',
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
