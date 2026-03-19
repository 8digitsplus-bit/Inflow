import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Check, Loader2, ArrowLeft, Shield, Lock, Clock, 
  CreditCard, Zap, ChevronRight, PartyPopper, CheckCircle2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PLANS = {
  essential_monthly: { name: 'Essential', price: 59, period: 'month', color: '#06B6D4', features: ['Sales Pipeline', 'Core Analytics', 'Churn Monitoring', 'Live Integration', '1,500 usages/mo'] },
  essential_yearly: { name: 'Essential', price: 496, period: 'year', color: '#06B6D4', originalPrice: 708, features: ['Sales Pipeline', 'Core Analytics', 'Churn Monitoring', 'Live Integration', '1,500 usages/mo'] },
  pro_monthly: { name: 'Pro', price: 149, period: 'month', color: '#6366F1', features: ['Everything in Essential', 'Sales Performance', 'AI Insights', 'Pricing Optimization', 'CRO Analysis', '7,500 usages/mo'] },
  pro_yearly: { name: 'Pro', price: 1252, period: 'year', color: '#6366F1', originalPrice: 1788, features: ['Everything in Essential', 'Sales Performance', 'AI Insights', 'Pricing Optimization', 'CRO Analysis', '7,500 usages/mo'] },
  enterprise_monthly: { name: 'Enterprise', price: 249, period: 'month', color: '#A855F7', features: ['Everything in Pro', 'Revenue Intelligence', 'Smart Assist AI', 'Custom Integrations', 'API Access', '20,000 usages/mo'] },
  enterprise_yearly: { name: 'Enterprise', price: 2092, period: 'year', color: '#A855F7', originalPrice: 2988, features: ['Everything in Pro', 'Revenue Intelligence', 'Smart Assist AI', 'Custom Integrations', 'API Access', '20,000 usages/mo'] },
};

const Checkout = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const planKey = searchParams.get('plan') || 'pro_monthly';
  const plan = PLANS[planKey];

  const [step, setStep] = useState('review'); // review | processing | success
  const [processing, setProcessing] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [name, setName] = useState(user?.name || '');
  const pollRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handlePayment = async () => {
    if (!email.trim()) { toast.error('Please enter your email'); return; }
    setProcessing(true);

    try {
      const response = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: planKey, origin_url: window.location.origin }),
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.detail || 'Failed to create payment session');
        setProcessing(false);
        return;
      }

      const { url, session_id } = await response.json();
      setStep('processing');

      // Open Stripe in popup
      const w = 500, h = 700;
      const left = (window.innerWidth - w) / 2 + window.screenX;
      const top = (window.innerHeight - h) / 2 + window.screenY;
      popupRef.current = window.open(url, 'stripe_checkout', `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);

      // Poll for payment status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_URL}/api/payments/status/${session_id}`, { credentials: 'include' });
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status === 'paid' || statusData.status === 'complete') {
              clearInterval(pollRef.current);
              if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
              setStep('success');
              if (refreshUser) refreshUser();
            }
          }
        } catch {}
      }, 3000);

      // Also detect popup close
      const popupCheck = setInterval(() => {
        if (popupRef.current && popupRef.current.closed) {
          clearInterval(popupCheck);
          if (step !== 'success') {
            setProcessing(false);
            setStep('review');
          }
        }
      }, 1000);

    } catch {
      toast.error('Something went wrong');
      setProcessing(false);
    }
  };

  if (!plan) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Invalid plan selected</p>
          <Button onClick={() => navigate('/choose-plan')} className="bg-indigo-600 hover:bg-indigo-500">View Plans</Button>
        </div>
      </div>
    );
  }

  // Success state
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center px-4">
        <Toaster position="top-center" richColors />
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6 animate-in zoom-in duration-500">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
            Welcome to {plan.name}!
          </h1>
          <p className="text-zinc-400 mb-8">
            Your subscription is now active. All {plan.name} features have been unlocked.
          </p>
          <Button 
            onClick={() => navigate('/dashboard')} 
            className="bg-indigo-600 hover:bg-indigo-500 px-8 h-11"
            data-testid="go-to-dashboard-btn"
          >
            Go to Dashboard <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  const tax = 0;
  const total = plan.price;

  return (
    <div className="min-h-screen bg-[#09090B] relative overflow-hidden">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#09090B]">
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

          {/* Left: Payment Form */}
          <div className="lg:col-span-3 order-2 lg:order-1">
            {step === 'processing' ? (
              <div className="bg-zinc-900/50 border border-white/[0.06] rounded-2xl p-8 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Completing your payment...</h3>
                <p className="text-zinc-400 text-sm mb-6">A secure payment window has opened. Complete your payment there.</p>
                <p className="text-zinc-600 text-xs">If the window didn't open, check your popup blocker.</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="mt-4 border-zinc-700 text-zinc-400 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30"
                  onClick={() => { if (popupRef.current && !popupRef.current.closed) popupRef.current.focus(); }}
                >
                  Bring payment window to front
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit' }}>Checkout</h2>
                  <p className="text-zinc-500 text-sm">Complete your subscription to InFlow {plan.name}</p>
                </div>

                {/* Account Info */}
                <div className="bg-zinc-900/50 border border-white/[0.06] rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">1</div>
                    Account Information
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-zinc-500 block mb-1.5">Full Name</label>
                      <input
                        type="text" value={name} onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                        data-testid="checkout-name-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-500 block mb-1.5">Email</label>
                      <input
                        type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                        data-testid="checkout-email-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="bg-zinc-900/50 border border-white/[0.06] rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">2</div>
                    Payment Method
                  </h3>
                  <div className="flex items-center gap-3 p-3 bg-zinc-800/30 border border-zinc-700/30 rounded-lg">
                    <CreditCard className="w-5 h-5 text-zinc-400" />
                    <div className="flex-1">
                      <p className="text-sm text-zinc-300">Credit or Debit Card</p>
                      <p className="text-[11px] text-zinc-600">Powered by Stripe — your card details are never stored on our servers</p>
                    </div>
                    <div className="flex gap-1">
                      {['Visa', 'MC', 'Amex'].map(c => (
                        <span key={c} className="px-1.5 py-0.5 bg-zinc-700/50 rounded text-[9px] font-medium text-zinc-400">{c}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Pay Button */}
                <Button
                  className="w-full h-12 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all"
                  onClick={handlePayment}
                  disabled={processing}
                  data-testid="pay-now-btn"
                >
                  {processing ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing...</>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Pay ${total.toLocaleString()}.00
                    </>
                  )}
                </Button>

                {/* Trust */}
                <div className="flex items-center justify-center gap-5 text-zinc-600 text-[11px]">
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" />SSL Encrypted</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Cancel anytime</span>
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" />Instant access</span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Order Summary */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <div className="bg-zinc-900/50 border border-white/[0.06] rounded-xl p-5 lg:sticky lg:top-8">
              <h3 className="text-sm font-semibold text-zinc-300 mb-4">Order Summary</h3>
              
              {/* Plan */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/[0.04]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${plan.color}15` }}>
                  <Zap className="w-5 h-5" style={{ color: plan.color }} />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>InFlow {plan.name}</p>
                  <p className="text-zinc-500 text-xs capitalize">{plan.period}ly subscription</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">${plan.price.toLocaleString()}</p>
                  {plan.originalPrice && (
                    <p className="text-zinc-600 text-xs line-through">${plan.originalPrice.toLocaleString()}</p>
                  )}
                </div>
              </div>

              {/* Features */}
              <div className="space-y-2 mb-4 pb-4 border-b border-white/[0.04]">
                {plan.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="text-zinc-400 text-xs">{f}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Subtotal</span>
                  <span className="text-zinc-300">${plan.price.toLocaleString()}.00</span>
                </div>
                {plan.originalPrice && (
                  <div className="flex justify-between text-sm">
                    <span className="text-emerald-400">Savings</span>
                    <span className="text-emerald-400">-${(plan.originalPrice - plan.price).toLocaleString()}.00</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Tax</span>
                  <span className="text-zinc-300">$0.00</span>
                </div>
              </div>

              <div className="flex justify-between pt-3 border-t border-white/[0.06]">
                <span className="text-white font-semibold">Total</span>
                <span className="text-white font-bold text-lg" style={{ fontFamily: 'Outfit' }}>${total.toLocaleString()}.00</span>
              </div>

              {/* Billing cycle note */}
              <p className="text-[10px] text-zinc-600 mt-3">
                Billed {plan.period}ly. You can cancel or change your plan anytime from Settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
