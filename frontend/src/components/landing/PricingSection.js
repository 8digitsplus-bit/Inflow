import { useState } from 'react';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const plans = {
  monthly: [
    { name: 'Essential', price: '59', period: '/month', deals: '1,500 usages', features: ['1,500 usages/month', 'Sales Pipeline', 'Core analytics', 'Email support', 'Churn alerts'], cta: 'Unlock Access', featured: false, planId: 'essential_monthly' },
    { name: 'Pro', price: '149', period: '/month', deals: '7,500 usages', features: ['7,500 usages/month', 'Sales Performance', 'Priority support', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools'], cta: 'Scale Up', featured: true, planId: 'pro_monthly' },
    { name: 'Enterprise', price: '249', period: '/month', deals: '20,000 usages', features: ['20,000 usages/month', 'Everything in Pro', 'Sales Revenue', 'Revenue Intelligence', 'Custom integrations', 'API access'], cta: 'Maximise', featured: false, planId: 'enterprise_monthly' }
  ],
  yearly: [
    { name: 'Essential', price: '496', originalPrice: '708', period: '/year', deals: '3,000 usages', features: ['3,000 usages/year', 'Sales Pipeline', 'Core analytics', 'Email support', 'Churn alerts'], cta: 'Unlock Access', featured: false, planId: 'essential_yearly', savings: '30% off 1st year' },
    { name: 'Pro', price: '1,252', originalPrice: '1,788', period: '/year', deals: '15,000 usages', features: ['15,000 usages/year', 'Sales Performance', 'Priority support', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools'], cta: 'Scale Up', featured: true, planId: 'pro_yearly', savings: '30% off 1st year' },
    { name: 'Enterprise', price: '2,092', originalPrice: '2,988', period: '/year', deals: '40,000 usages', features: ['40,000 usages/year', 'Everything in Pro', 'Sales Revenue', 'Revenue Intelligence', 'Custom integrations', 'API access'], cta: 'Maximise', featured: false, planId: 'enterprise_yearly', savings: '30% off 1st year' }
  ]
};

export const PricingSection = ({ handleGetStarted, isAuthenticated }) => {
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [loadingPlan, setLoadingPlan] = useState(null);

  const handlePlanClick = async (planId) => {
    if (!isAuthenticated) {
      handleGetStarted();
      return;
    }
    setLoadingPlan(planId);
    try {
      const response = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: planId, origin_url: window.location.origin })
      });
      if (response.ok) {
        const data = await response.json();
        window.location.href = data.url;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to start checkout');
      }
    } catch {
      toast.error('Failed to start checkout');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 reveal">
          <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">Pricing</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Unlock full access</h2>
          <p className="mt-4 text-zinc-400">Start growing. Scale as you need.</p>
          <div className="mt-8 inline-flex items-center p-1 bg-zinc-900 rounded-full border border-zinc-800">
            <button onClick={() => setBillingPeriod('monthly')}
              className={`toggle-pill px-5 py-2 rounded-full text-sm font-medium transition-all ${billingPeriod === 'monthly' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
              data-testid="billing-monthly-btn">Monthly</button>
            <button onClick={() => setBillingPeriod('yearly')}
              className={`toggle-pill px-5 py-2 rounded-full text-sm font-medium transition-all ${billingPeriod === 'yearly' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
              data-testid="billing-yearly-btn">Yearly <span className="text-emerald-400 ml-1">Save more</span></button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans[billingPeriod].map((plan, i) => (
            <div key={i} className={`pricing-card ${plan.featured ? 'featured' : ''} reveal reveal-delay-${i + 1}`} data-testid={`pricing-card-${plan.name.toLowerCase()}`}>
              {plan.savings && (
                <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
                  {plan.savings}
                </div>
              )}
              <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>${plan.price}</span>
                {plan.originalPrice && <span className="text-lg text-zinc-500 line-through">${plan.originalPrice}</span>}
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
                onClick={() => handlePlanClick(plan.planId)} disabled={loadingPlan === plan.planId} data-testid={`pricing-cta-${plan.name.toLowerCase()}`}>
                {loadingPlan === plan.planId ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{plan.cta} <ChevronRight className="w-4 h-4 ml-1" /></>}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
