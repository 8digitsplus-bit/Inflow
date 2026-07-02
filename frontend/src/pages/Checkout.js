import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Check, ArrowLeft, Lock, Zap, ShieldCheck,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';
import { useAuth } from '../contexts/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Stripe recommends calling loadStripe() at module level (NOT inside the component
// render loop) so their fraud detection can monitor the page from first paint.
const STRIPE_PUBLISHABLE_KEY = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

const PLANS = {
  essential_monthly: { name: 'Essential', price: 59, period: 'month', perUser: true, features: ['Sales Pipeline', 'Core Analytics', '2 live integrations', 'Churn Monitoring'] },
  essential_yearly: { name: 'Essential', price: 499, period: 'year', perUser: true, originalPrice: 708, features: ['Sales Pipeline', 'Core Analytics', '2 live integrations', 'Churn Monitoring'] },
  pro_monthly: { name: 'Pro', price: 139, period: 'month', perUser: true, features: ['4 live integrations', 'CSV import', 'AI Insights', 'CRO Analysis'] },
  pro_yearly: { name: 'Pro', price: 1170, period: 'year', perUser: true, originalPrice: 1668, features: ['4 live integrations', 'CSV import', 'AI Insights', 'CRO Analysis'] },
  enterprise_monthly: { name: 'Enterprise', price: 260, period: 'month', perUser: true, features: ['Unlimited integrations', 'Custom API access', 'Smart Assist AI'] },
  enterprise_yearly: { name: 'Enterprise', price: 2184, period: 'year', perUser: true, originalPrice: 3120, features: ['Unlimited integrations', 'Custom API access', 'Smart Assist AI'] },
};

// Framer Motion blur-in reveal — matches the sitewide glass aesthetic.
const reveal = {
  hidden: { opacity: 0, filter: 'blur(8px)', y: 14 },
  visible: (i = 0) => ({
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    transition: { type: 'spring', bounce: 0.3, duration: 1.1, delay: 0.1 + i * 0.08 },
  }),
};

const Checkout = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const planKey = searchParams.get('plan') || 'pro_monthly';
  const plan = PLANS[planKey];
  const usersParam = parseInt(searchParams.get('users')) || 1;
  const userCount = plan?.perUser ? Math.max(1, usersParam) : 1;
  const totalPrice = plan ? plan.price * userCount : 0;
  const totalOriginal = plan?.originalPrice ? plan.originalPrice * userCount : null;

  // Compute remaining trial days from the user's actual trial_end (if any).
  // If they have time left, we honor it; otherwise they're charged immediately.
  const trialDaysLeft = (() => {
    if (!user?.trial_end) return 0;
    try {
      const end = new Date(user.trial_end);
      const ms = end.getTime() - Date.now();
      return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    } catch { return 0; }
  })();
  const hasTrialRemaining = trialDaysLeft >= 2; // Stripe min trial = 48h
  const trialEndDate = hasTrialRemaining
    ? new Date(user.trial_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const fetchClientSecret = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/payments/create-checkout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: planKey,
        origin_url: window.location.origin,
        users: userCount,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create checkout session');
    }
    const data = await response.json();
    if (!data.client_secret) throw new Error('No client_secret returned');
    return data.client_secret;
  }, [planKey, userCount]);

  if (!plan) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Invalid plan selected</p>
          <Button onClick={() => navigate('/choose-plan')} className="bg-white/10 text-white border border-white/15 hover:bg-white/20 backdrop-blur-sm" data-testid="checkout-view-plans-btn">
            View Plans
          </Button>
        </div>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-amber-400 mb-2 font-semibold">Payments unavailable</p>
          <p className="text-zinc-500 text-sm">REACT_APP_STRIPE_PUBLISHABLE_KEY is not configured.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] relative overflow-hidden flex flex-col">
      <Toaster position="top-center" richColors />

      {/* Ambient glass glows — matches Hero / Auth aesthetic */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden -z-0">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[36rem] w-[40rem] rounded-full bg-slate-500/10 blur-[130px]" />
        <div className="absolute left-0 top-32 h-[24rem] w-[16rem] -rotate-45 rounded-full bg-cyan-500/[0.05] blur-[110px]" />
        <div className="absolute right-0 bottom-0 h-[28rem] w-[18rem] rotate-45 rounded-full bg-slate-600/[0.06] blur-[110px]" />
      </div>

      {/* Header */}
      <div className="relative border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-xl z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-11 flex items-center justify-between">
          <button onClick={() => navigate('/choose-plan')} className="flex items-center gap-2 text-zinc-400 hover:text-white text-xs transition-colors" data-testid="back-btn">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <img src="/inflow-logo.png?v=6" alt="InFlow" className="h-4 w-auto" />
          <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
            <Lock className="w-3 h-3" /> Secure
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl w-full mx-auto px-4 sm:px-6 py-3 sm:py-4 flex-1">

        {/* Compact heading — desktop only to save mobile space */}
        <motion.div
          className="hidden sm:block text-center mb-3"
          initial={{ filter: 'blur(8px)', opacity: 0, y: 10 }}
          animate={{ filter: 'blur(0px)', opacity: 1, y: 0, transition: { duration: 1.1, delay: 0.1 } }}
        >
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight" style={{ fontFamily: 'Outfit' }}>
            Complete your subscription
          </h1>
          <p className="text-zinc-400 text-[11px] mt-0.5">
            {hasTrialRemaining
              ? `${trialDaysLeft} days left in your free trial · No charge today · Cancel anytime`
              : 'No charge until you confirm · Cancel anytime'}
          </p>
        </motion.div>

        {/* Two-column: Summary (left) + Stripe iframe (right) */}
        <div className="grid lg:grid-cols-12 gap-4 lg:gap-5 items-start">

          {/* Left: Summary card */}
          <motion.div
            className="lg:col-span-6 order-2 lg:order-1"
            variants={reveal}
            initial="hidden"
            animate="visible"
            custom={1}
          >
            <div className="relative" data-testid="order-summary">
              {/* Glass halo */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-px rounded-2xl opacity-60 blur-xl"
                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04) 45%, rgba(99,102,241,0.18))' }}
              />
              {/* Card */}
              <div className="relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]">
                {/* top sheen */}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/[0.08]">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.06] border border-white/10 backdrop-blur-sm">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>
                      InFlow {plan.name}
                    </p>
                    <p className="text-zinc-400 text-[11px] capitalize">
                      {plan.period}ly subscription
                      {plan.perUser && userCount > 1 && ` · ${userCount} seats`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white font-bold leading-none" style={{ fontFamily: 'Outfit' }}>
                      ${totalPrice.toLocaleString()}
                    </p>
                    {totalOriginal && (
                      <p className="text-zinc-500 text-[10px] line-through mt-0.5">${totalOriginal.toLocaleString()}</p>
                    )}
                  </div>
                </div>

                {/* Features — white circle ticks to match Pricing */}
                <div className="space-y-1.5 mb-4 pb-4 border-b border-white/[0.08]">
                  {plan.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      </span>
                      <span className="text-zinc-300 text-[12px]">{f}</span>
                    </div>
                  ))}
                </div>

                {/* Subtotal lines */}
                <div className="space-y-1.5 mb-4">
                  {plan.perUser && userCount > 1 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400">${plan.price.toLocaleString()} × {userCount} seats</span>
                      <span className="text-zinc-200">${totalPrice.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Subtotal</span>
                    <span className="text-zinc-200">${(totalOriginal || totalPrice).toLocaleString()}</span>
                  </div>
                  {totalOriginal && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-emerald-300">First-year discount (30%)</span>
                      <span className="text-emerald-300">-${(totalOriginal - totalPrice).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Free trial</span>
                    <span className="text-emerald-300">
                      {hasTrialRemaining ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left` : 'No trial remaining'}
                    </span>
                  </div>
                </div>

                {/* Total today */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.05] border border-white/[0.1] backdrop-blur-sm">
                  <span className="text-white font-semibold text-sm">Total today</span>
                  <span className="text-white font-bold text-xl" style={{ fontFamily: 'Outfit' }}>
                    {hasTrialRemaining ? '$0.00' : `$${totalPrice.toLocaleString()}`}
                  </span>
                </div>

                <p className="text-[10px] text-zinc-500 mt-3 leading-relaxed">
                  {hasTrialRemaining ? (
                    <>You'll be charged <span className="text-zinc-300">${totalPrice.toLocaleString()}</span> on <span className="text-zinc-300">{trialEndDate}</span> when your trial ends. Cancel anytime in Settings — no charge during the trial.</>
                  ) : (
                    <>Charged today: <span className="text-zinc-300">${totalPrice.toLocaleString()}</span>. Cancel anytime from Settings.</>
                  )}
                </p>
              </div>
            </div>

            {/* Trust strip below summary */}
            <div className="flex items-center justify-center gap-4 mt-3 text-zinc-500 text-[10px]">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" />SSL</span>
              <span className="flex items-center gap-1"><Lock className="w-3 h-3" />PCI compliant</span>
              <span className="flex items-center gap-1">
                Powered by <span className="text-zinc-300 font-semibold">Stripe</span>
              </span>
            </div>
          </motion.div>

          {/* Right: Stripe iframe */}
          <motion.div
            className="lg:col-span-6 order-1 lg:order-2"
            variants={reveal}
            initial="hidden"
            animate="visible"
            custom={2}
          >
            <div className="relative" data-testid="embedded-checkout-wrapper">
              {/* Glass halo */}
              <div aria-hidden className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-white/25 via-white/5 to-slate-500/20 blur-xl opacity-70" />
              {/* Card — Stripe's embedded UI is light-themed, kept on a clean surface */}
              <div className="relative bg-white rounded-2xl overflow-hidden ring-1 ring-white/20 shadow-[0_8px_60px_-15px_rgba(0,0,0,0.7)]">
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{ fetchClientSecret }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
