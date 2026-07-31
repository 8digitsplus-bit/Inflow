import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Check, ArrowLeft, Zap, Shield, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { Toaster } from '../components/ui/sonner';
import { TimelineContent } from '../components/ui/timeline-animation';
import { VerticalCutReveal } from '../components/ui/vertical-cut-reveal';

// Features kept in exact parity with the landing pricing cards (PricingSection.js)
const PLANS = {
  essential: {
    key: 'essential', name: 'Essential', tagline: 'For small teams getting started',
    monthly: 75, yearly: 747, yearlyFirst: 597.60,
    features: ['Sales Pipeline', 'Core analytics', '5 live integrations', 'Churn monitoring'],
  },
  pro: {
    key: 'pro', name: 'Pro', tagline: 'For growing businesses',
    monthly: 179, yearly: 1695, yearlyFirst: 1356,
    features: ['Everything in Essential', '15 live integrations', 'CSV import', 'AI insights', 'CRO analysis', 'Revenue forecasting', 'Priority support'],
  },
  enterprise: {
    key: 'enterprise', name: 'Enterprise', tagline: 'For scaling organizations',
    monthly: 327, yearly: 2499, yearlyFirst: 1999.20,
    features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Smart Assist AI', 'Revenue Intelligence', 'Competitor Intelligence'],
  },
};

// Glass tick — identical to the landing pricing cards
const Tick = () => (
  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
    <Check className="w-3 h-3 text-white" strokeWidth={3} />
  </span>
);

const revealVariants = {
  visible: (i) => ({ y: 0, opacity: 1, filter: 'blur(0px)', transition: { delay: i * 0.15, duration: 0.5 } }),
  hidden: { filter: 'blur(10px)', y: -20, opacity: 0 },
};
const timelineVariants = {
  visible: (i) => ({ y: 0, opacity: 1, filter: 'blur(0px)', transition: { delay: i * 0.1, duration: 0.5 } }),
  hidden: { filter: 'blur(10px)', y: -20, opacity: 0 },
};

// Sliding pill switch (from the provided design), supports 2–3 options, brand-blue capsule.
const PricingSwitch = ({ options, value, onChange, layoutId, testidPrefix }) => (
  <div
    className="relative z-10 w-full rounded-full bg-white/[0.04] border border-white/10 p-1 backdrop-blur-md grid"
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
  >
    {options.map((opt) => {
      const active = value === opt.key;
      return (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          data-testid={`${testidPrefix}-${opt.key}`}
          className={cn(
            'relative z-10 h-12 sm:h-14 rounded-full font-semibold transition-colors',
            active ? 'text-white' : 'text-zinc-400 hover:text-white',
          )}
        >
          {active && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-full border border-white/25 bg-gradient-to-b from-white/[0.16] to-white/[0.05] backdrop-blur-xl shadow-lg shadow-black/30 ring-1 ring-inset ring-white/10"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative flex items-center justify-center gap-1.5 text-sm sm:text-base">
            {opt.label}
            {opt.badge && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold', active ? 'bg-white/25 text-white' : 'bg-emerald-500/15 text-emerald-400')}>{opt.badge}</span>
            )}
          </span>
        </button>
      );
    })}
  </div>
);

const ChoosePlan = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const pageRef = useRef(null);
  const [planKey, setPlanKey] = useState('pro');
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  const plan = PLANS[planKey];
  const isYearly = billingPeriod === 'yearly';
  const price = isYearly ? plan.yearlyFirst : plan.monthly;
  const originalPrice = isYearly ? plan.yearly : null;
  const savingsPct = 20;
  const priceFmt = { minimumFractionDigits: price % 1 ? 2 : 0, maximumFractionDigits: 2 };
  const isCurrent = user?.subscription_tier === `${planKey}_${billingPeriod}`;

  const handlePurchase = () => {
    if (isCurrent) return;
    const params = new URLSearchParams({ plan: `${planKey}_${billingPeriod}` });
    navigate(`/checkout?${params.toString()}`);
  };

  return (
    <div ref={pageRef} className="min-h-screen bg-[#050507] relative overflow-hidden">
      <Toaster position="top-center" richColors />
      {/* Blue radial ambience (from the provided design), tuned for dark theme */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(125% 125% at 50% 8%, #050507 42%, #0052ff 130%)' }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Hero */}
        <div className="max-w-3xl mx-auto text-center mb-14">
          <TimelineContent as="div" animationNum={0} timelineRef={pageRef} customVariants={revealVariants} className="flex items-center justify-center mb-4">
            <Zap className="h-5 w-5 text-[#0052ff] fill-[#0052ff] mr-2" />
            <span className="text-[#4d8bff] font-medium uppercase tracking-widest text-sm">Choose your plan</span>
          </TimelineContent>
          <h1 className="md:text-6xl sm:text-5xl text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.14}
              staggerFrom="first"
              reverse
              containerClassName="justify-center"
              transition={{ type: 'spring', stiffness: 250, damping: 40, delay: 0.35 }}
            >
              Let's get started
            </VerticalCutReveal>
          </h1>
          <TimelineContent as="p" animationNum={1} timelineRef={pageRef} customVariants={revealVariants} className="text-lg text-zinc-400">
            Pick a plan — billing starts today, cancel anytime.
          </TimelineContent>
        </div>

        {/* What's inside */}
        <div className="grid sm:grid-cols-2 md:gap-14 gap-8 items-start">
          {/* Left: feature list of selected plan */}
          <div>
            <TimelineContent as="div" animationNum={2} timelineRef={pageRef} customVariants={revealVariants} className="mb-5">
              <h3 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit' }}>What's inside</h3>
              <p className="text-zinc-400 text-sm">
                <span className="text-white font-semibold">{plan.name}</span> — {plan.tagline}
              </p>
            </TimelineContent>
            <AnimatePresence mode="wait">
              <motion.div
                key={planKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="space-y-3.5"
                data-testid="feature-list"
              >
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Tick />
                    <span className="text-zinc-200">{feature}</span>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right: controls + price + purchase */}
          <div className="space-y-7">
            <TimelineContent as="div" animationNum={3} timelineRef={pageRef} customVariants={revealVariants}>
              <h4 className="font-semibold text-white mb-1">Choose your plan</h4>
              <p className="text-sm text-zinc-400 mb-2">Scale features to your stage of growth</p>
              <PricingSwitch
                layoutId="plan-pill"
                testidPrefix="plan-select"
                value={planKey}
                onChange={setPlanKey}
                options={[
                  { key: 'essential', label: 'Essential' },
                  { key: 'pro', label: 'Pro' },
                  { key: 'enterprise', label: 'Enterprise' },
                ]}
              />
            </TimelineContent>

            <TimelineContent as="div" animationNum={4} timelineRef={pageRef} customVariants={revealVariants}>
              <h4 className="font-semibold text-white mb-1">Billing period</h4>
              <p className="text-sm text-zinc-400 mb-2">Get {savingsPct}% off your first year when you pay yearly</p>
              <PricingSwitch
                layoutId="billing-pill"
                testidPrefix="toggle"
                value={billingPeriod}
                onChange={setBillingPeriod}
                options={[
                  { key: 'monthly', label: 'Monthly' },
                  { key: 'yearly', label: 'Yearly', badge: `-${savingsPct}%` },
                ]}
              />
            </TimelineContent>

            {/* Price + purchase */}
            <TimelineContent as="div" animationNum={5} timelineRef={pageRef} customVariants={revealVariants} className="grid grid-cols-2 items-center gap-3 pt-2">
              <div className="flex items-baseline">
                <span className="text-5xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                  $<NumberFlow value={price} format={priceFmt} />
                </span>
                {originalPrice && (
                  <span className="text-lg text-zinc-500 line-through ml-2">
                    $<NumberFlow value={originalPrice} format={{ maximumFractionDigits: 0 }} />
                  </span>
                )}
              </div>
              <button
                onClick={handlePurchase}
                disabled={isCurrent}
                data-testid="purchase-btn"
                className={cn(
                  'h-14 w-full rounded-full text-lg font-semibold transition-all',
                  isCurrent
                    ? 'bg-white/5 text-zinc-500 cursor-not-allowed border border-white/10'
                    : 'text-white border-2 border-[#0052ff] bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] shadow-lg shadow-[#0052ff]/30 hover:brightness-110',
                )}
              >
                {isCurrent ? 'Current Plan' : 'Purchase'}
              </button>
              <p className="col-span-2 text-xs text-[#4d8bff]">
                {billingPeriod === 'monthly'
                  ? 'Billed monthly · cancel anytime'
                  : `20% off your first year · renews at $${plan.yearly.toLocaleString()}/yr`}
              </p>
            </TimelineContent>
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mt-16 text-zinc-600 text-xs">
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Secured by Stripe</span>
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Cancel anytime</span>
          <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Instant activation</span>
        </div>
      </div>
    </div>
  );
};

export default ChoosePlan;
