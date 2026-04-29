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
  essential_monthly: { name: 'Essential', price: 299, period: 'month', color: '#06B6D4', features: ['Sales Pipeline', 'Core Analytics', '2 live integrations'] },
  essential_yearly: { name: 'Essential', price: 2512, period: 'year', color: '#06B6D4', originalPrice: 3588, features: ['Sales Pipeline', 'Core Analytics', '2 live integrations'] },
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/choose-plan')} className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm transition-colors" data-testid="back-btn">
            <ArrowLeft className="w-4 h-4" /> Back to plans
          </button>
          <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-5 w-auto" />
          <div className="flex items-center gap-1.5 text-zinc-600 text-xs">
            <Lock className="w-3 h-3" /> Secure
          </div>
        </div>
      </div>

      {/* Centered card container */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

        {/* Heading */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] mb-4" data-testid="checkout-plan-badge">
            <Sparkles className="w-3 h-3" style={{ color: plan.color }} />
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-300">
              InFlow {plan.name}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight" style={{ fontFamily: 'Outfit' }}>
            Complete your subscription
          </h1>
          <p className="text-zinc-500 text-sm">
            14 days free · No charge today · Cancel anytime
          </p>
        </div>

        {/* Glowing wrapper around the card */}
        <div className="relative" data-testid="checkout-card-wrapper">
          {/* Halo */}
          <div
            className="pointer-events-none absolute -inset-1 rounded-3xl opacity-40 blur-2xl"
            style={{ background: `linear-gradient(135deg, ${plan.color}80, #A855F740, ${plan.color}80)` }}
          />

          {/* Card */}
          <div className="relative bg-zinc-950/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl">

            {/* Compact summary strip (top of card) */}
            <div className="px-6 sm:px-8 py-5 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent" data-testid="order-summary">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${plan.color}20` }}>
                  <Zap className="w-5 h-5" style={{ color: plan.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>
                    InFlow {plan.name} {plan.perUser && userCount > 1 && <span className="text-zinc-500 font-normal">· {userCount} seats</span>}
                  </p>
                  <p className="text-zinc-500 text-xs capitalize">{plan.period}ly subscription</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white font-bold text-lg leading-none" style={{ fontFamily: 'Outfit' }}>
                    ${totalPrice.toLocaleString()}
                    <span className="text-zinc-500 text-xs font-normal ml-0.5">/{plan.period}</span>
                  </p>
                  {totalOriginal && (
                    <p className="text-zinc-600 text-[11px] line-through mt-0.5">${totalOriginal.toLocaleString()}</p>
                  )}
                </div>
              </div>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-1.5">
                {plan.features.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10px] text-zinc-400">
                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                    {f}
                  </span>
                ))}
              </div>

              {/* Trial line */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.04]">
                <span className="text-xs text-zinc-500">Total today</span>
                <div className="text-right">
                  <span className="text-white font-bold text-base" style={{ fontFamily: 'Outfit' }}>$0.00</span>
                  <span className="text-emerald-400 text-[10px] ml-2 font-medium">14 days free</span>
                </div>
              </div>
            </div>

            {/* Embedded Stripe iframe */}
            <div className="bg-white" data-testid="embedded-checkout-wrapper">
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ fetchClientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        </div>

        {/* Trust strip below card */}
        <div className="flex items-center justify-center gap-6 mt-6 text-zinc-600 text-[11px]">
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />SSL encrypted</span>
          <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />PCI compliant</span>
          <span className="flex items-center gap-1.5">
            Powered by <span className="text-zinc-400 font-semibold tracking-tight">Stripe</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
