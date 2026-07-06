import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Check, ArrowLeft, Zap, Shield, Clock, Minus, Plus, Users, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { TimelineContent } from '../components/ui/timeline-animation';
import { VerticalCutReveal } from '../components/ui/vertical-cut-reveal';

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

const revealVariants = {
  visible: (i) => ({
    y: 0,
    opacity: 1,
    filter: 'blur(0px)',
    transition: { delay: i * 0.15, duration: 0.5 },
  }),
  hidden: { filter: 'blur(10px)', y: -20, opacity: 0 },
};
const cardVariants = {
  visible: (i) => ({
    y: 0,
    opacity: 1,
    filter: 'blur(0px)',
    transition: { delay: 0.4 + i * 0.18, duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  }),
  hidden: { filter: 'blur(10px)', y: 24, opacity: 0 },
};

// Bold sliding pill switch (from the provided design), adapted to InFlow's brand blue.
const BillingSwitch = ({ value, onChange }) => {
  const options = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'yearly', label: 'Yearly' },
  ];
  return (
    <div className="relative z-10 flex w-full max-w-sm mx-auto rounded-full bg-white/[0.04] border border-white/10 p-1 backdrop-blur-md">
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={cn(
              'relative z-10 w-full h-12 rounded-full font-semibold transition-colors',
              active ? 'text-white' : 'text-zinc-400 hover:text-white',
            )}
            data-testid={`toggle-${opt.key}`}
          >
            {active && (
              <motion.span
                layoutId="billing-pill"
                className="absolute inset-0 rounded-full border-2 border-[#0052ff] bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] shadow-lg shadow-[#0052ff]/30"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {opt.label}
              {opt.key === 'yearly' && (
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold', active ? 'bg-white/25 text-white' : 'bg-emerald-500/15 text-emerald-400')}>-30%</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const ChoosePlan = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const pageRef = useRef(null);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [seats, setSeats] = useState(1);

  const handleSelectPlan = (plan) => {
    const tierKey = `${plan.key}_${billingPeriod}`;
    const params = new URLSearchParams({ plan: tierKey, users: String(seats) });
    navigate(`/checkout?${params.toString()}`);
  };

  const isCurrentPlan = (plan) => user?.subscription_tier === `${plan.key}_${billingPeriod}`;

  return (
    <div ref={pageRef} className="min-h-screen bg-[#050507] flex flex-col items-center px-4 py-12 relative overflow-hidden">
      {/* Blue radial ambience (from the provided design), tuned for dark theme */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-70"
        style={{ background: 'radial-gradient(125% 125% at 50% 100%, #050507 45%, #0052ff 130%)' }}
      />
      <Toaster position="top-center" richColors />

      <div className="relative z-10 w-full max-w-5xl">
        <button
          onClick={() => navigate('/settings?tab=subscription')}
          className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm mb-8 transition-colors"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Animated hero */}
        <div className="text-center mb-10">
          <TimelineContent as="div" animationNum={0} timelineRef={pageRef} customVariants={revealVariants} className="flex items-center justify-center mb-4">
            <img src="/inflow-logo.png?v=6" alt="InFlow" className="h-7 w-auto object-contain" />
          </TimelineContent>
          <TimelineContent as="div" animationNum={1} timelineRef={pageRef} customVariants={revealVariants} className="flex items-center justify-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-[#0052ff] fill-[#0052ff]" />
            <span className="text-[#4d8bff] text-sm font-medium uppercase tracking-widest">Choose your plan</span>
          </TimelineContent>
          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.12}
              staggerFrom="first"
              reverse
              containerClassName="justify-center"
              transition={{ type: 'spring', stiffness: 250, damping: 40, delay: 0.3 }}
            >
              Pick the plan that fits your team
            </VerticalCutReveal>
          </h1>
          <TimelineContent as="p" animationNum={2} timelineRef={pageRef} customVariants={revealVariants} className="text-zinc-400 text-base max-w-md mx-auto">
            Billing starts today — cancel anytime.
          </TimelineContent>
        </div>

        {/* Billing switch */}
        <TimelineContent as="div" animationNum={3} timelineRef={pageRef} customVariants={revealVariants} className="mb-8">
          <BillingSwitch value={billingPeriod} onChange={setBillingPeriod} />
        </TimelineContent>

        {/* Seats control (glass) */}
        <TimelineContent as="div" animationNum={4} timelineRef={pageRef} customVariants={revealVariants} className="flex flex-col items-center gap-3 mb-10">
          <div className="inline-flex items-center gap-3 bg-white/[0.04] rounded-xl px-4 py-2.5 border border-white/10 backdrop-blur-md" data-testid="seats-stepper">
            <Users className="w-4 h-4 text-[#4d8bff]" />
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
                className="w-14 h-7 rounded-md bg-black/40 border border-white/10 text-white text-sm font-semibold text-center focus:outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                  seats === n ? 'bg-[#0052ff] text-white border-[#0052ff]' : 'bg-white/[0.03] text-zinc-400 hover:bg-white/10 border-white/10',
                )}
                data-testid={`seats-preset-${n}`}
              >
                {n}
              </button>
            ))}
          </div>
        </TimelineContent>

        {/* Plans Grid — staggered reveal */}
        <div className="grid md:grid-cols-3 gap-5 items-stretch">
          {PLANS.map((plan, idx) => {
            const perUser = billingPeriod === 'monthly' ? plan.perUserMonthly : plan.perUserYearly;
            const perUserOriginal = billingPeriod === 'yearly' ? plan.perUserYearlyOriginal : null;
            const price = perUser * seats;
            const originalPrice = perUserOriginal ? perUserOriginal * seats : null;
            const current = isCurrentPlan(plan);

            return (
              <TimelineContent
                key={plan.key}
                as="div"
                animationNum={idx}
                timelineRef={pageRef}
                customVariants={cardVariants}
                className={cn(
                  'relative flex flex-col rounded-2xl border p-6 backdrop-blur-xl transition-all duration-300',
                  plan.popular
                    ? 'border-[#0052ff]/40 bg-[#0052ff]/[0.06] shadow-2xl shadow-[#0052ff]/10'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]',
                  current && 'ring-2 ring-emerald-500/40',
                )}
                data-testid={`plan-card-${plan.key}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] border border-[#0052ff] text-white text-[11px] font-semibold rounded-full shadow-lg shadow-[#0052ff]/40">
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
                    <div className="w-2 h-2 rounded-full bg-[#0052ff]" />
                    <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
                  </div>
                  <p className="text-xs text-zinc-500">{plan.tagline}</p>
                </div>

                <div className="mb-5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                      $<NumberFlow value={price} />
                    </span>
                    {originalPrice && (
                      <span className="text-sm text-zinc-600 line-through">
                        $<NumberFlow value={originalPrice} />
                      </span>
                    )}
                  </div>
                  <p className="text-[#4d8bff] text-xs mt-1">
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
                    'w-full h-11 text-sm font-semibold',
                    current
                      ? 'bg-white/5 text-zinc-500 cursor-not-allowed hover:bg-white/5'
                      : plan.popular
                        ? 'text-white border-2 border-[#0052ff] bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] shadow-lg shadow-[#0052ff]/30 hover:brightness-110'
                        : 'bg-white/10 hover:bg-white/20 text-white border border-white/15 backdrop-blur-sm',
                  )}
                  disabled={current}
                  onClick={() => handleSelectPlan(plan)}
                  data-testid={`checkout-${plan.key}-btn`}
                >
                  {current ? 'Current Plan' : (<>{plan.cta} <ChevronRight className="w-4 h-4 ml-1" /></>)}
                </Button>
              </TimelineContent>
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
