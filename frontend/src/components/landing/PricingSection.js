import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

const plans = {
  monthly: [
    { name: 'Essential', price: '49', period: '/month', deals: '1,000 deals', features: ['1,000 deals/month', 'Core analytics', 'Email support', 'Pipeline view', 'Churn alerts'], cta: 'Unlock Access', featured: false, planId: 'essential_monthly' },
    { name: 'Pro', price: '99', period: '/month', deals: '5,000 deals', features: ['5,000 deals/month', 'AI pricing insights', 'Priority support', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools'], cta: 'Scale Up', featured: true, planId: 'pro_monthly' },
    { name: 'Enterprise', price: '179', period: '/month', deals: '12,000 deals', features: ['12,000 deals/month', 'Everything in Pro', 'Custom integrations', 'API access', 'Advanced churn analytics', 'Request for Quote'], cta: 'Maximise', featured: false, planId: 'enterprise_monthly' }
  ],
  yearly: [
    { name: 'Essential', price: '490', period: '/year', deals: '2,500 deals', features: ['2,500 deals/year', 'Core analytics', 'Email support', 'Pipeline view', 'Churn alerts'], cta: 'Unlock Access', featured: false, planId: 'essential_yearly', savings: 'Save $98 first year' },
    { name: 'Pro', price: '990', period: '/year', deals: '12,000 deals', features: ['12,000 deals/year', 'AI pricing insights', 'Priority support', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools'], cta: 'Scale Up', featured: true, planId: 'pro_yearly', savings: 'Save $198 first year' },
    { name: 'Enterprise', price: '1,799', period: '/year', deals: '30,000 deals', features: ['30,000 deals/year', 'Everything in Pro', 'Custom integrations', 'API access', 'Advanced churn analytics', 'Request for Quote'], cta: 'Maximise', featured: false, planId: 'enterprise_yearly', savings: 'Save $349 first year' }
  ]
};

export const PricingSection = ({ handleGetStarted }) => {
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">Pricing</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Unlock full access</h2>
          <p className="mt-4 text-zinc-400">Start growing. Scale as you need.</p>
          <div className="mt-8 inline-flex items-center p-1 bg-zinc-900 rounded-full border border-zinc-800">
            <button onClick={() => setBillingPeriod('monthly')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billingPeriod === 'monthly' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
              data-testid="billing-monthly-btn">Monthly</button>
            <button onClick={() => setBillingPeriod('yearly')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billingPeriod === 'yearly' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
              data-testid="billing-yearly-btn">Yearly <span className="text-emerald-400 ml-1">17% off*</span></button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">*First year only, then regular price</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans[billingPeriod].map((plan, i) => (
            <div key={i} className={`pricing-card ${plan.featured ? 'featured' : ''} animate-fade-in`} style={{ animationDelay: `${i * 0.1}s` }} data-testid={`pricing-card-${plan.name.toLowerCase()}`}>
              {plan.savings && (
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
                  {plan.savings}
                </div>
              )}
              <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>${plan.price}</span>
                <span className="text-zinc-400">{plan.period}</span>
              </div>
              <p className="mt-2 text-sm text-indigo-400">{plan.deals}</p>
              <ul className="mt-8 space-y-4">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-center gap-3 text-zinc-300">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button className={`w-full mt-8 ${plan.featured ? 'bg-indigo-600 hover:bg-indigo-500 btn-glow' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                onClick={handleGetStarted} data-testid={`pricing-cta-${plan.name.toLowerCase()}`}>
                {plan.cta} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
