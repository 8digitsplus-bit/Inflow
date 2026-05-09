import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Check, ArrowLeft, Zap, Shield, Clock, Loader2, Minus, Plus, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PLANS = [
  {
    key: 'essential',
    name: 'Essential',
    perUserMonthly: 59,
    perUserYearly: 499,
    perUserYearlyOriginal: 708,
    defaultUsers: 1,
    minUsers: 1,
    tagline: 'For small teams getting started',
    perUser: true,
    features: [
      'Sales Pipeline Management',
      'Core Analytics Dashboard',
      'Churn Monitoring',
      '2 live integrations',
      'Email support',
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    perUserMonthly: 139,
    perUserYearly: 1170,
    perUserYearlyOriginal: 1668,
    defaultUsers: 1,
    minUsers: 1,
    popular: true,
    tagline: 'For growing businesses',
    perUser: true,
    features: [
      'Everything in Essential',
      '4 live integrations',
      'CSV import',
      'AI-Powered Insights',
      'Pricing Optimization',
      'CRO Analysis',
      'Revenue Forecasting',
      'Priority support',
    ],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    perUserMonthly: 260,
    perUserYearly: 2184,
    perUserYearlyOriginal: 3120,
    defaultUsers: 1,
    minUsers: 1,
    tagline: 'For scaling organizations',
    perUser: true,
    features: [
      'Everything in Pro',
      'Unlimited integrations',
      'Custom API access',
      'Smart Assist (AI)',
      'Revenue Intelligence',
      'Dedicated support',
    ],
  },
];

const ChoosePlan = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [processingPlan, setProcessingPlan] = useState(null);
  const [enterpriseUsers, setEnterpriseUsers] = useState(1);

  const handleSelectPlan = (plan) => {
    const tierKey = `${plan.key}_${billingPeriod}`;
    const params = new URLSearchParams({ plan: tierKey, users: String(enterpriseUsers) });
    navigate(`/checkout?${params.toString()}`);
  };

  const isCurrentPlan = (plan) => {
    if (!user?.subscription_tier) return false;
    return user.subscription_tier === `${plan.key}_${billingPeriod}`;
  };

  return (
    <div className="min-h-screen bg-[#050507] flex flex-col items-center px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <Toaster position="top-center" richColors />

      <div className="relative z-10 w-full max-w-5xl">
        {/* Back button */}
        <button
          onClick={() => navigate('/settings?tab=subscription')}
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
            Pick the plan that fits your team. Billing starts today — cancel anytime.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="flex flex-col items-center mb-10">
          <div className="inline-flex items-center p-1 bg-zinc-900 rounded-full border border-zinc-800 relative">
            <div
              className="absolute top-1 bottom-1 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/25 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: 'calc(50% - 4px)',
                left: billingPeriod === 'monthly' ? '4px' : 'calc(50%)',
              }}
            />
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`relative z-10 w-32 py-2 rounded-full text-sm font-medium transition-colors text-center ${
                billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              data-testid="toggle-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`relative z-10 w-32 py-2 rounded-full text-sm font-medium transition-colors text-center ${
                billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              data-testid="toggle-yearly"
            >
              Yearly
            </button>
          </div>
          {billingPeriod === 'yearly' && (
            <p className="text-emerald-400 text-xs mt-2 font-medium">Save 30% with yearly billing</p>
          )}
        </div>

        {/* Global seats control — quick presets + stepper + free input — applies to every tier */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="inline-flex items-center gap-3 bg-zinc-900/80 rounded-xl px-4 py-2.5 border border-white/[0.06]" data-testid="seats-stepper">
            <Users className="w-4 h-4 text-indigo-400" />
            <span className="text-zinc-400 text-sm">Seats</span>
            <div className="flex items-center gap-1.5 ml-1">
              <button
                onClick={() => setEnterpriseUsers(Math.max(1, enterpriseUsers - 1))}
                className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 transition-colors"
                data-testid="seats-minus"
                aria-label="Decrease seats"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min="1"
                value={enterpriseUsers}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n) && n >= 1) setEnterpriseUsers(n);
                  else if (e.target.value === '') setEnterpriseUsers(1);
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n) || n < 1) setEnterpriseUsers(1);
                }}
                className="w-14 h-7 rounded-md bg-zinc-950 border border-zinc-800 text-white text-sm font-semibold text-center focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="seats-input"
                aria-label="Number of seats"
              />
              <button
                onClick={() => setEnterpriseUsers(enterpriseUsers + 1)}
                className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-300 transition-colors"
                data-testid="seats-plus"
                aria-label="Increase seats"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5" data-testid="seats-presets">
            <span className="text-[11px] text-zinc-500 mr-1 uppercase tracking-wider">Quick</span>
            {[1, 3, 5, 10, 25].map((n) => (
              <button
                key={n}
                onClick={() => setEnterpriseUsers(n)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  enterpriseUsers === n
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800'
                }`}
                data-testid={`seats-preset-${n}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-5">
          {PLANS.map((plan) => {
            const perUser = billingPeriod === 'monthly' ? plan.perUserMonthly : plan.perUserYearly;
            const perUserOriginal = billingPeriod === 'yearly' ? plan.perUserYearlyOriginal : null;
            const price = perUser * enterpriseUsers;
            const originalPrice = perUserOriginal ? perUserOriginal * enterpriseUsers : null;
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
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
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
                  <p className="text-indigo-400 text-xs mt-1">
                    ${perUser.toLocaleString()}/user · {enterpriseUsers} {enterpriseUsers === 1 ? 'seat' : 'seats'}
                  </p>
                  {billingPeriod === 'yearly' && (
                    <p className="text-emerald-400 text-xs mt-1">
                      Save ${((plan.perUserYearlyOriginal - plan.perUserYearly) * enterpriseUsers).toLocaleString()} first year
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
