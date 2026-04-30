import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Users } from 'lucide-react';
import { Button } from '../ui/button';

const plans = {
  monthly: [
    { name: 'Essential', price: '59', period: '/user', perUser: true, features: ['Sales Pipeline', 'Core analytics', '2 live integrations', 'Churn monitoring', 'Email support'], cta: 'Unlock Access', featured: false, planId: 'essential_monthly' },
    { name: 'Pro', price: '139', period: '/user', perUser: true, features: ['Everything in Essential', '4 live integrations', 'CSV import', 'AI insights', 'CRO analysis', 'Revenue forecasting', 'Priority support'], cta: 'Scale Up', featured: true, planId: 'pro_monthly' },
    { name: 'Enterprise', price: '260', period: '/user', perUser: true, features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Smart Assist AI', 'Revenue Intelligence', 'Dedicated support'], cta: 'Maximise', featured: false, planId: 'enterprise_monthly' }
  ],
  yearly: [
    { name: 'Essential', price: '499', originalPrice: '708', period: '/user', perUser: true, features: ['Sales Pipeline', 'Core analytics', '2 live integrations', 'Churn monitoring', 'Email support'], cta: 'Unlock Access', featured: false, planId: 'essential_yearly', savings: '30% off 1st year' },
    { name: 'Pro', price: '1,170', originalPrice: '1,668', period: '/user', perUser: true, features: ['Everything in Essential', '4 live integrations', 'CSV import', 'AI insights', 'CRO analysis', 'Revenue forecasting', 'Priority support'], cta: 'Scale Up', featured: true, planId: 'pro_yearly', savings: '30% off 1st year' },
    { name: 'Enterprise', price: '2,184', originalPrice: '3,120', period: '/user', perUser: true, features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Smart Assist AI', 'Revenue Intelligence', 'Dedicated support'], cta: 'Maximise', featured: false, planId: 'enterprise_yearly', savings: '30% off 1st year' }
  ]
};

export const PricingSection = ({ handleGetStarted, isAuthenticated }) => {
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  const handlePlanClick = (plan) => {
    if (!isAuthenticated) {
      // Unauthenticated → start a free trial (no card). User picks a paid plan
      // later from inside the app when ready to upgrade.
      handleGetStarted();
      return;
    }
    // Logged-in user wants to upgrade → seat selector on /choose-plan
    navigate(`/choose-plan`);
  };

  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 reveal">
          <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">Pricing</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Unlock full access</h2>
          <p className="mt-4 text-zinc-400">Start growing. Scale as you need.</p>
          <div className="mt-8 inline-flex items-center p-1 bg-zinc-900 rounded-full border border-zinc-800 relative" data-testid="billing-toggle">
            <div
              className="absolute top-1 bottom-1 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/25 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: 'calc(50% - 4px)',
                left: billingPeriod === 'monthly' ? '4px' : 'calc(50%)',
              }}
            />
            <button onClick={() => setBillingPeriod('monthly')}
              className={`relative z-10 w-28 py-2 rounded-full text-sm font-medium text-center transition-colors duration-300 ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="billing-monthly-btn">Monthly</button>
            <button onClick={() => setBillingPeriod('yearly')}
              className={`relative z-10 w-28 py-2 rounded-full text-sm font-medium text-center transition-colors duration-300 ${billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="billing-yearly-btn">Yearly</button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans[billingPeriod].map((plan, i) => (
            <div key={i} className={`pricing-card ${plan.featured ? 'featured' : ''}`} data-testid={`pricing-card-${plan.name.toLowerCase()}`}>
              {plan.savings && (
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
                  {plan.savings}
                </div>
              )}
              <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
              <div className="mt-4 flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>${plan.price}</span>
                {plan.originalPrice && <span className="text-lg text-zinc-500 line-through">${plan.originalPrice}</span>}
                <span className="text-zinc-400">{plan.period}</span>
              </div>
              {plan.perUser && (
                <p className="mt-2 text-xs text-purple-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Choose any number of seats
                </p>
              )}
              <ul className="mt-8 space-y-4">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-center gap-3 text-zinc-300">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button className={`w-full mt-8 ${plan.featured ? 'bg-indigo-600 hover:bg-indigo-500 btn-glow' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                onClick={() => handlePlanClick(plan)} data-testid={`pricing-cta-${plan.name.toLowerCase()}`}>
                {plan.cta} <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
