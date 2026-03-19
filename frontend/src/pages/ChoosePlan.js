import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Check, ArrowLeft, Zap, Shield, Clock } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PLANS = [
  {
    key: 'essential',
    name: 'Essential',
    monthlyPrice: 59,
    yearlyPrice: 496,
    yearlyOriginal: 708,
    tagline: 'For small teams getting started',
    color: '#06B6D4',
    features: [
      'Sales Pipeline Management',
      'Core Analytics Dashboard',
      'Churn Monitoring',
      'Live Integration',
      '1,500 monthly usages',
      'Email support',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyPrice: 149,
    yearlyPrice: 1252,
    yearlyOriginal: 1788,
    popular: false,
    tagline: 'For growing businesses',
    color: '#6366F1',
    features: [
      'Everything in Essential',
      'Sales Performance Analytics',
      'AI-Powered Insights',
      'Pricing Optimization',
      'CRO Analysis',
      'Revenue Forecasting',
      '7,500 monthly usages',
      'Priority support',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 249,
    yearlyPrice: 2092,
    yearlyOriginal: 2988,
    tagline: 'For scaling organizations',
    color: '#A855F7',
    features: [
      'Everything in Pro',
      'Sales Revenue Analytics',
      'Revenue Intelligence',
      'Smart Assist (AI)',
      'Custom Integrations',
      'API Access',
      '20,000 monthly usages',
      'Dedicated support',
    ],
  },
];

const ChoosePlan = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [processingPlan, setProcessingPlan] = useState(null);

  const handleSelectPlan = (plan) => {
    const tierKey = `${plan.key}_${billingPeriod}`;
    navigate(`/checkout?plan=${tierKey}`);
  };

  const isCurrentPlan = (plan) => {
    if (!user?.subscription_tier) return false;
    return user.subscription_tier === `${plan.key}_${billingPeriod}`;
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col items-center px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <Toaster position="top-center" richColors />

      <div className="relative z-10 w-full max-w-5xl">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-8 transition-colors"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center mb-4">
            <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-7 w-auto object-contain" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
            Choose your plan
          </h1>
          <p className="text-zinc-400 text-sm max-w-md mx-auto">
            Start with a 14-day free trial on any plan. No credit card required to start.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex flex-col items-center mb-10">
          <div className="inline-flex items-center p-1 bg-zinc-900 rounded-full border border-zinc-800 relative">
            <div
              className="absolute top-1 bottom-1 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/25 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: billingPeriod === 'monthly' ? 'calc(45% - 2px)' : 'calc(55% - 2px)',
                left: billingPeriod === 'monthly' ? '4px' : 'calc(45% + 2px)',
              }}
            />
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`relative z-10 px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              data-testid="toggle-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`relative z-10 px-6 py-2 rounded-full text-sm font-medium transition-colors ${
                billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              data-testid="toggle-yearly"
            >
              Yearly <span className="text-emerald-400 ml-1">Save 30%</span>
            </button>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2">*1st year pricing, renews at standard rate</p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((plan) => {
            const price = billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const originalPrice = billingPeriod === 'yearly' ? plan.yearlyOriginal : null;
            const current = isCurrentPlan(plan);
            const tierKey = `${plan.key}_${billingPeriod}`;
            const isProcessing = processingPlan === tierKey;

            return (
              <div
                key={plan.key}
                className={`relative rounded-2xl border p-6 transition-all ${
                  plan.popular
                    ? 'border-indigo-500/40 bg-indigo-500/[0.03] shadow-lg shadow-indigo-500/5'
                    : 'border-white/10 bg-zinc-950/60 hover:border-zinc-700'
                } ${current ? 'ring-2 ring-emerald-500/30' : ''}`}
                data-testid={`plan-card-${plan.key}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-indigo-600 text-white text-[11px] font-semibold rounded-full shadow-lg shadow-indigo-500/30">
                      Most Popular
                    </span>
                  </div>
                )}

                {current && (
                  <div className="absolute -top-3 right-4">
                    <span className="px-2.5 py-0.5 bg-emerald-600 text-white text-[11px] font-medium rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" /> Current
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: plan.color }} />
                    <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
                  </div>
                  <p className="text-xs text-zinc-500">{plan.tagline}</p>
                </div>

                <div className="mb-5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                      ${price.toLocaleString()}
                    </span>
                    {originalPrice && (
                      <span className="text-sm text-zinc-600 line-through">${originalPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <span className="text-zinc-500 text-sm">/{billingPeriod === 'monthly' ? 'month' : 'year'}</span>
                  {billingPeriod === 'yearly' && (
                    <p className="text-emerald-400 text-xs mt-1">
                      Save ${(plan.yearlyOriginal - plan.yearlyPrice).toLocaleString()} first year
                    </p>
                  )}
                </div>

                <div className="border-t border-white/5 pt-5 mb-5">
                  <ul className="space-y-2.5">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-zinc-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  className={`w-full h-11 text-sm font-medium ${
                    current
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : plan.popular
                        ? 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  }`}
                  disabled={current || isProcessing}
                  onClick={() => handleSelectPlan(plan)}
                  data-testid={`checkout-${plan.key}-btn`}
                >
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing...</>
                  ) : current ? (
                    'Current Plan'
                  ) : (
                    `Subscribe to ${plan.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-10 text-zinc-600 text-xs">
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Secured by Stripe</span>
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Cancel anytime</span>
          <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Instant activation</span>
        </div>
      </div>
    </div>
  );
};

export default ChoosePlan;
