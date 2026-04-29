import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check, ArrowLeft, Shield, Lock, Clock, Zap,
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
  essential_monthly: { name: 'Essential', price: 299, period: 'month', color: '#06B6D4', features: ['Sales Pipeline', 'Core Analytics', 'Churn Monitoring', '2 live integrations'] },
  essential_yearly: { name: 'Essential', price: 2512, period: 'year', color: '#06B6D4', originalPrice: 3588, features: ['Sales Pipeline', 'Core Analytics', 'Churn Monitoring', '2 live integrations'] },
  pro_monthly: { name: 'Pro', price: 699, period: 'month', color: '#6366F1', features: ['Everything in Essential', '4 live integrations', 'CSV import', 'AI Insights', 'CRO Analysis'] },
  pro_yearly: { name: 'Pro', price: 5872, period: 'year', color: '#6366F1', originalPrice: 8388, features: ['Everything in Essential', '4 live integrations', 'CSV import', 'AI Insights', 'CRO Analysis'] },
  enterprise_monthly: { name: 'Enterprise', price: 260, period: 'month', color: '#A855F7', perUser: true, features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Smart Assist AI'] },
  enterprise_yearly: { name: 'Enterprise', price: 2184, period: 'year', color: '#A855F7', originalPrice: 3120, perUser: true, features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Smart Assist AI'] },
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

  // Embedded Checkout fetches its client_secret via this callback every mount.
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

      <div className="border-b border-white/[0.06] bg-[#050507]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/choose-plan')} className="flex items-center gap-2 text-zinc-500 hover:text-white text-sm transition-colors" data-testid="back-btn">
            <ArrowLeft className="w-4 h-4" /> Back to plans
          </button>
          <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-5 w-auto" />
          <div className="flex items-center gap-1.5 text-zinc-600 text-xs">
            <Lock className="w-3 h-3" /> Secure checkout
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">

          <div className="lg:col-span-3 order-2 lg:order-1">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit' }}>Checkout</h2>
                <p className="text-zinc-500 text-sm">Complete your subscription to InFlow {plan.name}</p>
              </div>

              <div className="bg-white rounded-xl overflow-hidden" data-testid="embedded-checkout-wrapper">
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{ fetchClientSecret }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>

              <div className="flex items-center justify-center gap-5 text-zinc-600 text-[11px]">
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" />SSL Encrypted</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Cancel anytime</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" />Instant access</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 order-1 lg:order-2">
            <div className="bg-zinc-900/50 border border-white/[0.06] rounded-xl p-5 lg:sticky lg:top-8" data-testid="order-summary">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">Order Summary</h3>

              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/[0.04]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${plan.color}15` }}>
                  <Zap className="w-5 h-5" style={{ color: plan.color }} />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>InFlow {plan.name}</p>
                  <p className="text-zinc-500 text-xs capitalize">{plan.period}ly subscription</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">${totalPrice.toLocaleString()}</p>
                  {totalOriginal && (
                    <p className="text-zinc-600 text-xs line-through">${totalOriginal.toLocaleString()}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-4 pb-4 border-b border-white/[0.04]">
                {plan.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="text-zinc-400 text-xs">{f}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-4">
                {plan.perUser && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">${plan.price.toLocaleString()} × {userCount} users</span>
                    <span className="text-zinc-300">${totalPrice.toLocaleString()}.00</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Subtotal</span>
                  <span className="text-zinc-300">${(totalOriginal || totalPrice).toLocaleString()}.00</span>
                </div>
                {totalOriginal && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-400">First year discount (30%)</span>
                    <span className="text-emerald-400">-${(totalOriginal - totalPrice).toLocaleString()}.00</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Trial</span>
                  <span className="text-emerald-400">14 days free</span>
                </div>
              </div>

              <div className="flex justify-between pt-3 border-t border-white/[0.06]">
                <span className="text-white font-semibold">Total today</span>
                <span className="text-white font-bold text-lg" style={{ fontFamily: 'Outfit' }}>$0.00</span>
              </div>

              <p className="text-[10px] text-zinc-600 mt-3">
                After your 14-day free trial: ${totalPrice.toLocaleString()}/{plan.period}. Cancel anytime from Settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
