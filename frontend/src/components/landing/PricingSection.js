import { useState } from 'react';
import { Check, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const monthlyPlans = [
  { name: 'Essential', price: '59', period: '/month', features: ['Sales Pipeline', 'Core analytics', 'Email support', 'Churn alerts'], cta: 'Unlock Access', featured: false, planId: 'essential_monthly' },
  { name: 'Pro', price: '149', period: '/month', features: ['Sales Performance', 'Priority support', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools'], cta: 'Scale Up', featured: true, planId: 'pro_monthly' },
  { name: 'Enterprise', price: '249', period: '/month', features: ['Everything in Pro', 'Sales Revenue', 'Revenue Intelligence', 'Custom integrations', 'API access'], cta: 'Maximise', featured: false, planId: 'enterprise_monthly' }
];

const multiYearContracts = [
  { duration: '1 Year', price: '5,000', period: '/year', renewal: 'Auto-renews annually', planId: 'contract_1yr', featured: false },
  { duration: '3 Years', price: '10,000', period: '/3 years', renewal: 'Auto-renews every 3 years', planId: 'contract_3yr', featured: true },
  { duration: '6 Years', price: '25,000', period: '/6 years', renewal: 'Auto-renews every 6 years', planId: 'contract_6yr', featured: false },
];

const allFeatures = [
  'Sales Pipeline',
  'Sales Performance',
  'Sales Revenue',
  'Revenue Intelligence',
  'Revenue forecasting',
  'Advanced analytics',
  'Churn prediction',
  'CRO tools',
  'Custom integrations',
  'API access',
  'Priority support',
];

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
            <button onClick={() => setBillingPeriod('multiyear')}
              className={`relative z-10 w-28 py-2 rounded-full text-sm font-medium text-center transition-colors duration-300 ${billingPeriod === 'multiyear' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="billing-multiyear-btn">Multi-Year</button>
          </div>
        </div>

        {billingPeriod === 'monthly' ? (
          <div className="grid md:grid-cols-3 gap-8">
            {monthlyPlans.map((plan, i) => (
              <div key={i} className={`pricing-card ${plan.featured ? 'featured' : ''} reveal reveal-delay-${i + 1}`} data-testid={`pricing-card-${plan.name.toLowerCase()}`}>
                <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>${plan.price}</span>
                  <span className="text-zinc-400">{plan.period}</span>
                </div>
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
        ) : (
          <div>
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              {multiYearContracts.map((contract, i) => (
                <div key={i} className={`pricing-card ${contract.featured ? 'featured' : ''}`} data-testid={`contract-card-${contract.duration.toLowerCase().replace(/\s/g, '-')}`}>
                  <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>{contract.duration}</h3>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>${contract.price}</span>
                    <span className="text-zinc-400">{contract.period}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-sm text-zinc-500">
                    <RefreshCw className="w-3.5 h-3.5" />
                    {contract.renewal}
                  </div>
                  <Button className={`w-full mt-8 ${contract.featured ? 'bg-indigo-600 hover:bg-indigo-500 btn-glow' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                    onClick={() => handlePlanClick(contract.planId)} disabled={loadingPlan === contract.planId} data-testid={`contract-cta-${contract.duration.toLowerCase().replace(/\s/g, '-')}`}>
                    {loadingPlan === contract.planId ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Started <ChevronRight className="w-4 h-4 ml-1" /></>}
                  </Button>
                </div>
              ))}
            </div>

            <div className="pricing-card max-w-3xl mx-auto" data-testid="contract-features">
              <h4 className="text-base font-semibold text-white mb-5" style={{ fontFamily: 'Outfit' }}>All contracts include full platform access</h4>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
                {allFeatures.map((feature, j) => (
                  <div key={j} className="flex items-center gap-3 text-zinc-300 text-sm">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
