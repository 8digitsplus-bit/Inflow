import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check, ArrowLeft, Lock, Zap, ShieldCheck, Sparkles,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Toaster } from '../components/ui/sonner';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Stripe recommends calling loadStripe() at module level (NOT inside the component
// render loop) so their fraud detection can monitor the page from first paint.
const STRIPE_PUBLISHABLE_KEY = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

const PLANS = {
  essential_monthly: { name: 'Essential', price: 299, period: 'month', color: '#06B6D4', features: ['Sales Pipeline', 'Core Analytics', '2 live integrations', 'Churn Monitoring'] },
  essential_yearly: { name: 'Essential', price: 2512, period: 'year', color: '#06B6D4', originalPrice: 3588, features: ['Sales Pipeline', 'Core Analytics', '2 live integrations', 'Churn Monitoring'] },
  pro_monthly: { name: 'Pro', price: 699, period: 'month', color: '#6366F1', features: ['4 live integrations', 'CSV import', 'AI Insights', 'CRO Analysis'] },
  pro_yearly: { name: 'Pro', price: 5872, period: 'year', color: '#6366F1', originalPrice: 8388, features: ['4 live integrations', 'CSV import', 'AI Insights', 'CRO Analysis'] },
  enterprise_monthly: { name: 'Enterprise', price: 260, period: 'month', color: '#A855F7', perUser: true, features: ['Unlimited integrations', 'Custom API access', 'Smart Assist AI'] },
  enterprise_yearly: { name: 'Enterprise', price: 2184, period: 'year', color: '#A855F7', originalPrice: 3120, perUser: true, features: ['Unlimited integrations', 'Custom API access', 'Smart Assist AI'] },
};

const Checkout = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const planKey = searchParams.get('plan') || 'pro_monthly';
  const plan = PLANS[planKey];
  const usersParam = parseInt(searchParams.get('users')) || 1;
  const userCount = plan?.perUser ? Math.max(1, usersParam) : 1;
  const totalPrice = plan ? plan.price * userCount : 0;
  const totalOriginal = plan?.originalPrice ? plan.originalPrice * userCount : null;

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
          <Button onClick={() => navigate('/choose-plan')} className="bg-indigo-600 hover:bg-indigo-500" data-testid="checkout-view-plans-btn">
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
    <div className="min-h-screen bg-[#050507] relative overflow-hidden">
      <Toaster position="top-center" richColors />

      {/* Ambient radial glow background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] rounded-full opacity-[0.18] blur-[120px]"
          style={{ background: `radial-gradient(circle, ${plan.color} 0%, transparent 70%)` }}
        />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full opacity-[0.10] blur-[100px] bg-purple-600" />
      </div>

      {/* Header */}
      <div className="relative border-b border-white/[0.04] bg-[#050507]/80 backdrop-blur-xl z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <button onClick={() => navigate('/choose-plan')} className="flex items-center gap-2 text-zinc-500 hover:text-white text-xs transition-colors" data-testid="back-btn">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to plans
          </button>
          <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-4 w-auto" />
          <div className="flex items-center gap-1.5 text-zinc-600 text-xs">
            <Lock className="w-3 h-3" /> Secure
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4">

        {/* Compact heading */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] mb-2" data-testid="checkout-plan-badge">
            <Sparkles className="w-3 h-3" style={{ color: plan.color }} />
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-300">
              InFlow {plan.name}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ fontFamily: 'Outfit' }}>
            Complete your subscription
          </h1>
          <p className="text-zinc-500 text-xs mt-1">14 days free · No charge today · Cancel anytime</p>
        </div>

        {/* Two-column: Summary (left) + Stripe iframe (right) */}
        <div className="grid lg:grid-cols-12 gap-5 items-start">

          {/* Left: Summary card */}
          <div className="lg:col-span-5 order-2 lg:order-1">
            <div className="relative" data-testid="order-summary">
              {/* Halo */}
              <div
                className="pointer-events-none absolute -inset-px rounded-2xl opacity-50 blur-xl"
                style={{ background: `linear-gradient(135deg, ${plan.color}60, #A855F730, ${plan.color}60)` }}
              />
              {/* Card */}
              <div className="relative bg-zinc-950/80 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-5">

                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/[0.06]">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${plan.color}20` }}>
                    <Zap className="w-5 h-5" style={{ color: plan.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>
                      InFlow {plan.name}
                    </p>
                    <p className="text-zinc-500 text-[11px] capitalize">
                      {plan.period}ly subscription
                      {plan.perUser && userCount > 1 && ` · ${userCount} seats`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white font-bold leading-none" style={{ fontFamily: 'Outfit' }}>
                      ${totalPrice.toLocaleString()}
                      <span className="text-zinc-500 text-[11px] font-normal ml-0.5">/{plan.period}</span>
                    </p>
                    {totalOriginal && (
                      <p className="text-zinc-600 text-[10px] line-through mt-0.5">${totalOriginal.toLocaleString()}</p>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-1.5 mb-4 pb-4 border-b border-white/[0.06]">
                  {plan.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3} />
                      </div>
                      <span className="text-zinc-400 text-[12px]">{f}</span>
                    </div>
                  ))}
                </div>

                {/* Subtotal lines */}
                <div className="space-y-1.5 mb-4">
                  {plan.perUser && userCount > 1 && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-500">${plan.price.toLocaleString()} × {userCount} seats</span>
                      <span className="text-zinc-300">${totalPrice.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Subtotal</span>
                    <span className="text-zinc-300">${(totalOriginal || totalPrice).toLocaleString()}</span>
                  </div>
                  {totalOriginal && (
                    <div className="flex justify-between text-[11px]">
                      <span className="text-emerald-400">First-year discount (30%)</span>
                      <span className="text-emerald-400">-${(totalOriginal - totalPrice).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-500">Free trial</span>
                    <span className="text-emerald-400">14 days</span>
                  </div>
                </div>

                {/* Total today */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-white font-semibold text-sm">Total today</span>
                  <span className="text-white font-bold text-xl" style={{ fontFamily: 'Outfit' }}>$0.00</span>
                </div>

                <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed">
                  After your 14-day trial: <span className="text-zinc-400">${totalPrice.toLocaleString()}/{plan.period}</span>. Cancel anytime from Settings — no charge during the trial.
                </p>
              </div>
            </div>

            {/* Trust strip below summary */}
            <div className="flex items-center justify-center gap-4 mt-3 text-zinc-600 text-[10px]">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" />SSL</span>
              <span className="flex items-center gap-1"><Lock className="w-3 h-3" />PCI compliant</span>
              <span className="flex items-center gap-1">
                Powered by <span className="text-zinc-400 font-semibold">Stripe</span>
              </span>
            </div>
          </div>

          {/* Right: Stripe iframe */}
          <div className="lg:col-span-7 order-1 lg:order-2">
            <div className="relative" data-testid="embedded-checkout-wrapper">
              {/* Halo */}
              <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-indigo-500/30 via-purple-500/15 to-indigo-500/30 blur-xl opacity-60" />
              {/* Card */}
              <div className="relative bg-white rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_0_60px_-15px_rgba(99,102,241,0.5)]">
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{ fetchClientSecret }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
