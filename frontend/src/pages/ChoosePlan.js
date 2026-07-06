import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Check, ArrowLeft, Zap, Shield, Clock, Minus, Plus, Users, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import NumberFlow from '@number-flow/react';

// Features kept in exact parity with the landing pricing cards (PricingSection.js)
const PLANS = [
  {
    key: 'essential',
    name: 'Essential',
    perUserMonthly: 59,
    perUserYearly: 499,
    perUserYearlyOriginal: 708,
    tagline: 'For small teams getting started',
    cta: 'Unlock Access',
    features: ['Sales Pipeline', 'Core analytics', '2 live integrations', 'Churn monitoring'],
  },
  {
    key: 'pro',
    name: 'Pro',
    perUserMonthly: 139,
    perUserYearly: 1170,
    perUserYearlyOriginal: 1668,
    popular: true,
    tagline: 'For growing businesses',
    cta: 'Scale Up',
    features: ['Everything in Essential', '4 live integrations', 'CSV import', 'AI insights', 'CRO analysis', 'Revenue forecasting', 'Priority support'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    perUserMonthly: 260,
    perUserYearly: 2184,
    perUserYearlyOriginal: 3120,
    tagline: 'For scaling organizations',
    cta: 'Maximise',
    features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Smart Assist AI', 'Revenue Intelligence'],
  },
];

// Glass tick — identical to the landing pricing cards
const Tick = () => (
  <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
  </span>
);

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const reveal = {
  hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

const ChoosePlan = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [seats, setSeats] = useState(1);

  const handleSelectPlan = (plan) => {
    const tierKey = `${plan.key}_${billingPeriod}`;
    const params = new URLSearchParams({ plan: tierKey, users: String(seats) });
    navigate(`/checkout?${params.toString()}`);
  };

  const isCurrentPlan = (plan) => user?.subscription_tier === `${plan.key}_${billingPeriod}`;

  return (
    <div className="min-h-screen bg-[#050507] flex flex-col items-center px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <Toaster position="top-center" richColors />

      <div className="relative z-10 w-full max-w-5xl">
        <button
          onClick={() => navigate('/settings?tab=subscription')}
          className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-8 transition-colors"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Header */}
        <motion.div variants={container} initial="hidden" animate="visible" className="text-center mb-10">
          <motion.div variants={reveal} className="flex items-center justify-center mb-4">
            <img src="/inflow-logo.png?v=6" alt="InFlow" className="h-7 w-auto object-contain" />
          </motion.div>
          <motion.div variants={reveal} className="flex items-center justify-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-slate-400 fill-slate-400" />
            <span className="text-slate-400 text-sm font-medium uppercase tracking-widest">Choose your plan</span>
          </motion.div>
          <motion.h1 variants={reveal} className="text-3xl sm:text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
            Pick the plan that fits your team
          </motion.h1>
          <motion.p variants={reveal} className="text-zinc-400 text-sm max-w-md mx-auto">
            Billing starts today — cancel anytime.
          </motion.p>
        </motion.div>

        {/* Billing toggle (glass) */}
        <div className="flex flex-col items-center mb-8">
          <div className="inline-flex items-center p-1 bg-white/[0.04] rounded-full border border-white/10 backdrop-blur-md relative" data-testid="billing-toggle">
            <div
              className="absolute top-1 bottom-1 rounded-full bg-white/15 border border-white/20 backdrop-blur-sm transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: 'calc(50% - 4px)', left: billingPeriod === 'monthly' ? '4px' : 'calc(50%)' }}
            />
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`relative z-10 w-32 py-2 rounded-full text-sm font-medium transition-colors text-center ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="toggle-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`relative z-10 w-32 py-2 rounded-full text-sm font-medium transition-colors text-center ${billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="toggle-yearly"
            >
              Yearly
            </button>
          </div>
          {billingPeriod === 'yearly' && (
            <p className="text-emerald-400 text-xs mt-2 font-medium">Save 30% with yearly billing</p>
          )}
        </div>

        {/* Seats control (glass) */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div className="inline-flex items-center gap-3 bg-white/[0.04] rounded-xl px-4 py-2.5 border border-white/10 backdrop-blur-md" data-testid="seats-stepper">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="text-zinc-400 text-sm">Seats</span>
            <div className="flex items-center gap-1.5 ml-1">
              <button
                onClick={() => setSeats(Math.max(1, seats - 1))}
                className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-200 transition-colors"
                data-testid="seats-minus"
                aria-label="Decrease seats"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min="1"
                value={seats}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n) && n >= 1) setSeats(n);
                  else if (e.target.value === '') setSeats(1);
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isNaN(n) || n < 1) setSeats(1);
                }}
                className="w-14 h-7 rounded-md bg-black/40 border border-white/10 text-white text-sm font-semibold text-center focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="seats-input"
                aria-label="Number of seats"
              />
              <button
                onClick={() => setSeats(seats + 1)}
                className="w-7 h-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-200 transition-colors"
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
                onClick={() => setSeats(n)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                  seats === n
                    ? 'bg-white/15 text-white border-white/20'
                    : 'bg-white/[0.03] text-zinc-400 hover:bg-white/10 border-white/10'
                }`}
                data-testid={`seats-preset-${n}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Plans Grid */}
        <motion.div variants={container} initial="hidden" animate="visible" className="grid md:grid-cols-3 gap-5 items-stretch">
          {PLANS.map((plan) => {
            const perUser = billingPeriod === 'monthly' ? plan.perUserMonthly : plan.perUserYearly;
            const perUserOriginal = billingPeriod === 'yearly' ? plan.perUserYearlyOriginal : null;
            const price = perUser * seats;
            const originalPrice = perUserOriginal ? perUserOriginal * seats : null;
            const current = isCurrentPlan(plan);

            return (
              <motion.div
                key={plan.key}
                variants={reveal}
                className={cn(
                  'relative flex flex-col rounded-2xl border p-6 backdrop-blur-xl transition-all duration-300',
                  plan.popular
                    ? 'border-white/25 bg-white/[0.07] shadow-2xl shadow-black/40'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]',
                  current && 'ring-2 ring-emerald-500/40',
                )}
                data-testid={`plan-card-${plan.key}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-white/15 border border-white/20 backdrop-blur-md text-white text-[11px] font-semibold rounded-full shadow-lg">
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
                    <div className="w-2 h-2 rounded-full bg-slate-400" />
                    <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
                  </div>
                  <p className="text-xs text-zinc-500">{plan.tagline}</p>
                </div>

                <div className="mb-5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                      $<NumberFlow value={price} />
                    </span>
                    {originalPrice && (
                      <span className="text-sm text-zinc-600 line-through">
                        $<NumberFlow value={originalPrice} />
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs mt-1">
                    ${perUser.toLocaleString()}/user · {seats} {seats === 1 ? 'seat' : 'seats'}
                  </p>
                  {billingPeriod === 'yearly' && (
                    <p className="text-emerald-400 text-xs mt-1">
                      Save ${((plan.perUserYearlyOriginal - plan.perUserYearly) * seats).toLocaleString()} first year
                    </p>
                  )}
                </div>

                <div className="border-t border-white/5 pt-5 mb-5 flex-1">
                  <ul className="space-y-2.5">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Tick />
                        <span className="text-sm text-zinc-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Button
                  className={cn(
                    'w-full h-11 text-sm font-medium',
                    current
                      ? 'bg-white/5 text-zinc-500 cursor-not-allowed hover:bg-white/5'
                      : 'bg-white/10 hover:bg-white/20 text-white border border-white/15 backdrop-blur-sm',
                  )}
                  disabled={current}
                  onClick={() => handleSelectPlan(plan)}
                  data-testid={`checkout-${plan.key}-btn`}
                >
                  {current ? 'Current Plan' : (<>{plan.cta} <ChevronRight className="w-4 h-4 ml-1" /></>)}
                </Button>
              </motion.div>
            );
          })}
        </motion.div>

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
