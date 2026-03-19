import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PLANS = [
  {
    key: 'essential',
    name: 'Essential',
    monthlyPrice: 59,
    yearlyPrice: 599,
    features: [
      'Sales Pipeline Management',
      'Basic Analytics Dashboard',
      'Churn Monitoring',
      'Live Integration',
      '1,500 monthly actions',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 149,
    yearlyPrice: 1490,
    popular: true,
    features: [
      'Everything in Essential',
      'Sales Performance Analytics',
      'AI-Powered Insights',
      'Pricing Optimization',
      'CRO Analysis',
      '7,500 monthly actions',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 249,
    yearlyPrice: 2490,
    features: [
      'Everything in Pro',
      'Sales Revenue Analytics',
      'Revenue Intelligence',
      'Smart Assist',
      'Custom Integrations',
      '20,000 monthly actions',
    ],
  },
];

const ChoosePlan = () => {
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [processingPlan, setProcessingPlan] = useState(null);

  const handleSelectPlan = async (plan) => {
    const tierKey = `${plan.key}_${billingPeriod}`;
    setProcessingPlan(tierKey);
    try {
      const response = await fetch(`${API_URL}/api/payments/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: tierKey }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          toast.success('Plan activated!');
          navigate('/onboarding');
        }
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Failed to process');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setProcessingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <Toaster position="top-center" />

      <div className="relative z-10 w-full max-w-3xl">
        <div className="flex items-center justify-center mb-6">
          <div className="h-8 overflow-hidden">
            <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-full w-auto object-contain" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
            Choose your plan
          </h1>
          <p className="text-zinc-400 text-sm mt-2">Select a plan to get started with InFlow</p>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`px-4 py-1.5 rounded-full text-sm transition-all ${
              billingPeriod === 'monthly' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
            data-testid="billing-monthly"
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod('yearly')}
            className={`px-4 py-1.5 rounded-full text-sm transition-all ${
              billingPeriod === 'yearly' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
            data-testid="billing-yearly"
          >
            Yearly
            <span className="ml-1.5 text-[10px] text-emerald-400">Save 30%</span>
          </button>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const price = billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const tierKey = `${plan.key}_${billingPeriod}`;
            const isProcessing = processingPlan === tierKey;

            return (
              <div
                key={plan.key}
                className={`relative rounded-2xl border p-5 transition-all hover:scale-[1.02] ${
                  plan.popular
                    ? 'bg-zinc-900/80 border-cyan-500/40 shadow-lg shadow-cyan-500/5'
                    : 'bg-zinc-900/50 border-white/10'
                }`}
                data-testid={`plan-card-${plan.key}`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">
                    Most Popular
                  </span>
                )}
                <h3 className="text-base font-semibold text-white mb-1" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
                <div className="flex items-baseline gap-0.5 mb-4">
                  <span className="text-3xl font-bold text-white">${price}</span>
                  <span className="text-xs text-zinc-500">/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
                <ul className="space-y-2 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                      <Check className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full text-xs h-9 ${
                    plan.popular
                      ? 'bg-indigo-600 hover:bg-indigo-500'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isProcessing}
                  data-testid={`select-plan-${plan.key}`}
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Sparkles className="w-3 h-3 mr-1.5" />
                  )}
                  Get {plan.name}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          All plans include a 30-day money-back guarantee
        </p>
      </div>
    </div>
  );
};

export default ChoosePlan;
