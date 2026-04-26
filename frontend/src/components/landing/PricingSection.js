import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Loader2, Users } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const plans = {
  monthly: [
    { name: 'Essential', price: '299', period: '/month', features: ['Sales Pipeline', 'Core analytics', '2 live integrations', 'Churn alerts', 'Email support'], cta: 'Unlock Access', featured: false, planId: 'essential_monthly' },
    { name: 'Pro', price: '699', period: '/month', features: ['Everything in Essential', '4 live integrations', 'CSV import', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools', 'Priority support'], cta: 'Scale Up', featured: true, planId: 'pro_monthly' },
    { name: 'Enterprise', price: '260', period: '/user', perUser: true, features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Sales Revenue analytics', 'Revenue Intelligence', 'Dedicated support'], cta: 'Maximise', featured: false, planId: 'enterprise_monthly' }
  ],
  yearly: [
    { name: 'Essential', price: '2,512', originalPrice: '3,588', period: '/year', features: ['Sales Pipeline', 'Core analytics', '2 live integrations', 'Churn alerts', 'Email support'], cta: 'Unlock Access', featured: false, planId: 'essential_yearly', savings: '30% off 1st year' },
    { name: 'Pro', price: '5,872', originalPrice: '8,388', period: '/year', features: ['Everything in Essential', '4 live integrations', 'CSV import', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools', 'Priority support'], cta: 'Scale Up', featured: true, planId: 'pro_yearly', savings: '30% off 1st year' },
    { name: 'Enterprise', price: '2,184', originalPrice: '3,120', period: '/user', perUser: true, features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Sales Revenue analytics', 'Revenue Intelligence', 'Dedicated support'], cta: 'Maximise', featured: false, planId: 'enterprise_yearly', savings: '30% off 1st year' }
  ]
};

export const PricingSection = ({ handleGetStarted, isAuthenticated }) => {
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [loadingPlan, setLoadingPlan] = useState(null);

  const handlePlanClick = async (plan) => {
    if (!isAuthenticated) {
      handleGetStarted();
      return;
    }
    // Enterprise = route to seat-selector page
    if (plan.perUser) {
      navigate(`/choose-plan`);
      return;
    }
    setLoadingPlan(plan.planId);
    try {
      const response = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: plan.planId, origin_url: window.location.origin })
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
                onClick={() => handlePlanClick(plan)} disabled={loadingPlan === plan.planId} data-testid={`pricing-cta-${plan.name.toLowerCase()}`}>
                {loadingPlan === plan.planId ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{plan.cta} <ChevronRight className="w-4 h-4 ml-1" /></>}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
