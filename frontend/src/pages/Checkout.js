import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Check, ArrowLeft, Lock, Zap, ShieldCheck, Loader2, Mail, KeyRound, User as UserIcon,
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
  essential_monthly: { name: 'Essential', price: 75, period: 'month', features: ['Sales Pipeline', 'Core Analytics', '5 live integrations', 'Churn Monitoring'] },
  essential_yearly: { name: 'Essential', price: 597.60, period: 'year', originalPrice: 747, features: ['Sales Pipeline', 'Core Analytics', '5 live integrations', 'Churn Monitoring'] },
  pro_monthly: { name: 'Pro', price: 179, period: 'month', features: ['15 live integrations', 'CSV import', 'AI Insights', 'CRO Analysis'] },
  pro_yearly: { name: 'Pro', price: 1356, period: 'year', originalPrice: 1695, features: ['15 live integrations', 'CSV import', 'AI Insights', 'CRO Analysis'] },
  enterprise_monthly: { name: 'Enterprise', price: 327, period: 'month', features: ['Unlimited integrations', 'Custom API access', 'Smart Assist AI', 'Competitor Intelligence'] },
  enterprise_yearly: { name: 'Enterprise', price: 1999.20, period: 'year', originalPrice: 2499, features: ['Unlimited integrations', 'Custom API access', 'Smart Assist AI', 'Competitor Intelligence'] },
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
  const { user, registerWithEmail } = useAuth();

  const planKey = searchParams.get('plan') || 'pro_monthly';
  const plan = PLANS[planKey];
  const totalPrice = plan ? plan.price : 0;
  const totalOriginal = plan?.originalPrice ? plan.originalPrice : null;
  const discountPct = totalOriginal ? Math.round((1 - totalPrice / totalOriginal) * 100) : 0;
  const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });

  const authed = !!user;

  // Inline account creation (checkout-first flow) for logged-out visitors.
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState(null);
  const [emailExists, setEmailExists] = useState(false);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setFormError(null);
    setEmailExists(false);
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      setFormError('Enter your name, email, and a password (at least 8 characters).');
      return;
    }
    setCreating(true);
    try {
      // On success the session cookie is set and `user` is populated, which
      // swaps the right column over to the Stripe embedded payment form.
      await registerWithEmail(form.name.trim(), form.email.trim().toLowerCase(), form.password);
    } catch (err) {
      const msg = err?.message || 'Could not create your account. Please try again.';
      if (/already registered|already exists|exists/i.test(msg)) {
        setEmailExists(true);
        setFormError('An account with this email already exists.');
      } else {
        setFormError(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  // Trial: existing users honor their real remaining trial; brand-new signups
  // always start a fresh 14-day trial (card captured, $0 charged today).
  const realTrialDaysLeft = (() => {
    if (!user?.trial_end) return 0;
    try {
      const end = new Date(user.trial_end);
      const ms = end.getTime() - Date.now();
      return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    } catch { return 0; }
  })();
  const trialAvailable = authed ? realTrialDaysLeft >= 2 : true; // Stripe min trial = 48h
  const [useTrial, setUseTrial] = useState(true);
  const trialActive = trialAvailable && useTrial;
  const trialDaysLeft = authed ? realTrialDaysLeft : 14;
  const trialEndDate = (() => {
    const base = (authed && user?.trial_end) ? new Date(user.trial_end) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return base.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  })();

  const fetchClientSecret = useCallback(async () => {
    const response = await fetch(`${API_URL}/api/payments/create-checkout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: planKey,
        origin_url: window.location.origin,
        trial: useTrial,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create checkout session');
    }
    const data = await response.json();
    if (!data.client_secret) throw new Error('No client_secret returned');
    return data.client_secret;
  }, [planKey, useTrial]);

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

  const inputClass = 'w-full h-11 rounded-xl bg-black/40 border border-white/10 pl-10 pr-3 text-sm text-white placeholder-zinc-500 transition-colors focus:outline-none focus:border-[#0052ff] focus:ring-1 focus:ring-[#0052ff]';

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
            {authed ? 'Complete your subscription' : (trialActive ? 'Start your 14-day free trial' : 'Subscribe to InFlow')}
          </h1>
          <p className="text-zinc-400 text-[11px] mt-0.5">
            {trialActive
              ? `${trialDaysLeft} days free · No charge today · Cancel anytime`
              : 'Billed today · Cancel anytime'}
          </p>
        </motion.div>

        {/* Two-column: Summary (left) + account/payment (right) */}
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
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white font-bold leading-none" style={{ fontFamily: 'Outfit' }}>
                      ${fmt(totalPrice)}
                    </p>
                    {totalOriginal && (
                      <p className="text-zinc-500 text-[10px] line-through mt-0.5">${fmt(totalOriginal)}</p>
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
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">Subtotal</span>
                    <span className="text-zinc-200">${fmt(totalOriginal || totalPrice)}</span>
                  </div>
                  {totalOriginal && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-emerald-300">First-year discount ({discountPct}%)</span>
                      <span className="text-emerald-300">-${fmt(totalOriginal - totalPrice)}</span>
                    </div>
                  )}
                  {trialAvailable && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-400">Free trial</span>
                      <span className={trialActive ? 'text-emerald-300' : 'text-zinc-500'}>
                        {trialActive ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}` : 'Skipped'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Billing option: start trial vs pay now */}
                {trialAvailable && (
                  <div className="grid grid-cols-2 gap-2 mb-4" data-testid="trial-option">
                    <button
                      type="button"
                      onClick={() => setUseTrial(true)}
                      className={`text-left rounded-xl border p-3 transition-all ${trialActive ? 'border-[#0052ff] bg-[#0052ff]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
                      data-testid="trial-option-trial"
                    >
                      <span className="flex items-center gap-1.5 text-white text-[12px] font-semibold">
                        <span className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center ${trialActive ? 'border-[#0052ff] bg-[#0052ff]' : 'border-white/30'}`}>
                          {trialActive && <Check className="w-2 h-2 text-white" strokeWidth={4} />}
                        </span>
                        Start free trial
                      </span>
                      <span className="block text-[10px] text-zinc-400 mt-1">{trialDaysLeft} days free · $0 today</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseTrial(false)}
                      className={`text-left rounded-xl border p-3 transition-all ${!trialActive ? 'border-[#0052ff] bg-[#0052ff]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
                      data-testid="trial-option-now"
                    >
                      <span className="flex items-center gap-1.5 text-white text-[12px] font-semibold">
                        <span className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center ${!trialActive ? 'border-[#0052ff] bg-[#0052ff]' : 'border-white/30'}`}>
                          {!trialActive && <Check className="w-2 h-2 text-white" strokeWidth={4} />}
                        </span>
                        Subscribe now
                      </span>
                      <span className="block text-[10px] text-zinc-400 mt-1">Pay ${fmt(totalPrice)} today</span>
                    </button>
                  </div>
                )}

                {/* Total today */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.05] border border-white/[0.1] backdrop-blur-sm">
                  <span className="text-white font-semibold text-sm">Total today</span>
                  <span className="text-white font-bold text-xl" style={{ fontFamily: 'Outfit' }}>
                    {trialActive ? '$0.00' : `$${fmt(totalPrice)}`}
                  </span>
                </div>

                <p className="text-[10px] text-zinc-500 mt-3 leading-relaxed">
                  {trialActive ? (
                    <>You'll be charged <span className="text-zinc-300">${fmt(totalPrice)}</span> on <span className="text-zinc-300">{trialEndDate}</span> when your trial ends. Cancel anytime in Settings — no charge during the trial.</>
                  ) : (
                    <>Charged today: <span className="text-zinc-300">${fmt(totalPrice)}</span>. Cancel anytime from Settings.</>
                  )}
                  {totalOriginal && (
                    <> Renews at <span className="text-zinc-300">${fmt(totalOriginal)}/year</span> after your first year.</>
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

          {/* Right: account creation (logged out) OR Stripe payment (logged in) */}
          <motion.div
            className="lg:col-span-6 order-1 lg:order-2"
            variants={reveal}
            initial="hidden"
            animate="visible"
            custom={2}
          >
            <div className="relative" data-testid="checkout-right-column">
              {/* Glass halo */}
              <div aria-hidden className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-white/25 via-white/5 to-slate-500/20 blur-xl opacity-70" />

              {authed ? (
                /* Stripe's embedded UI is light-themed, kept on a clean surface */
                <div className="relative bg-white rounded-2xl overflow-hidden ring-1 ring-white/20 shadow-[0_8px_60px_-15px_rgba(0,0,0,0.7)]" data-testid="embedded-checkout-wrapper">
                  <EmbeddedCheckoutProvider
                    key={trialActive ? 'trial' : 'now'}
                    stripe={stripePromise}
                    options={{ fetchClientSecret }}
                  >
                    <EmbeddedCheckout />
                  </EmbeddedCheckoutProvider>
                </div>
              ) : (
                <div className="relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]" data-testid="checkout-account-form">
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  <h2 className="text-white font-semibold text-base" style={{ fontFamily: 'Outfit' }}>Create your account</h2>
                  <p className="text-zinc-400 text-xs mt-1 mb-4">Set up your login, then add payment on the next step. No charge today.</p>

                  <form onSubmit={handleCreateAccount} className="space-y-3">
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text" autoComplete="name" placeholder="Full name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className={inputClass}
                        data-testid="checkout-name-input"
                      />
                    </div>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email" autoComplete="email" placeholder="Work email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className={inputClass}
                        data-testid="checkout-email-input"
                      />
                    </div>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password" autoComplete="new-password" placeholder="Password (min 8 characters)"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className={inputClass}
                        data-testid="checkout-password-input"
                      />
                    </div>

                    {formError && (
                      <p className="text-red-400 text-xs" data-testid="checkout-form-error">{formError}</p>
                    )}

                    {emailExists ? (
                      <Button
                        type="button"
                        onClick={() => navigate('/auth')}
                        className="w-full h-11 bg-[#0052ff] hover:bg-[#0047e0] text-white font-semibold"
                        data-testid="checkout-login-instead-btn"
                      >
                        Log in instead
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        disabled={creating}
                        className="w-full h-11 bg-[#0052ff] hover:bg-[#0047e0] text-white font-semibold disabled:opacity-60"
                        data-testid="checkout-create-account-btn"
                      >
                        {creating ? (
                          <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating account…</>
                        ) : (
                          <>Continue to payment</>
                        )}
                      </Button>
                    )}
                  </form>

                  <p className="text-zinc-500 text-xs mt-4 text-center">
                    Already have an account?{' '}
                    <button onClick={() => navigate('/auth')} className="text-[#4d8bff] hover:text-white transition-colors" data-testid="checkout-login-link">Log in</button>
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
