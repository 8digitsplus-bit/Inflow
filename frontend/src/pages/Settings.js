import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  User, 
  CreditCard, 
  Check, 
  Sparkles,
  Loader2,
  ChevronRight,
  LogOut,
  AlertCircle,
  XCircle,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import TeamSection from '../components/TeamSection';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Settings = () => {
  const { user, logout, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [plans, setPlans] = useState({});
  const [processingPayment, setProcessingPayment] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [toggling2FA, setToggling2FA] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetch2FAStatus();
    
    // Check for payment return
    const sessionId = searchParams.get('session_id');
    const success = searchParams.get('success');
    
    if (sessionId && success) {
      pollPaymentStatus(sessionId);
    }
  }, [searchParams]);

  const fetch2FAStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/status`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTwoFAEnabled(data.enabled);
      }
    } catch {}
  };

  const toggle2FA = async () => {
    setToggling2FA(true);
    try {
      const endpoint = twoFAEnabled ? '/api/auth/2fa/disable' : '/api/auth/2fa/enable';
      const res = await fetch(`${API_URL}${endpoint}`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setTwoFAEnabled(!twoFAEnabled);
        toast.success(twoFAEnabled ? 'Two-factor authentication disabled' : 'Two-factor authentication enabled');
      } else {
        toast.error('Failed to update 2FA settings');
      }
    } catch {
      toast.error('Failed to update 2FA settings');
    } finally {
      setToggling2FA(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${API_URL}/api/subscription/plans`);
      if (response.ok) {
        const data = await response.json();
        setPlans(data);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;
    const pollInterval = 2000;

    if (attempts >= maxAttempts) {
      toast.error('Payment status check timed out. Please refresh the page.');
      setCheckingStatus(false);
      return;
    }

    setCheckingStatus(true);

    try {
      const response = await fetch(`${API_URL}/api/payments/status/${sessionId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.payment_status === 'paid') {
          toast.success('Payment successful! Your plan has been upgraded.');
          await refreshUser();
          setCheckingStatus(false);
          // Clear URL params
          window.history.replaceState({}, '', '/settings');
          return;
        } else if (data.status === 'expired') {
          toast.error('Payment session expired. Please try again.');
          setCheckingStatus(false);
          return;
        }
      }

      // Continue polling
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    } catch (error) {
      console.error('Error checking payment status:', error);
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    }
  };

  const handleUpgrade = async (planId) => {
    if (planId === user?.subscription_tier) return;
    // Per-user (Enterprise) tiers need the seat selector on /choose-plan
    if (planId.startsWith('enterprise_')) {
      navigate('/choose-plan');
      return;
    }
    
    setProcessingPayment(true);
    try {
      const response = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: planId,
          origin_url: window.location.origin
        })
      });

      if (response.ok) {
        const data = await response.json();
        window.location.href = data.url;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Checkout failed:', error);
      toast.error('Failed to start checkout');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancellingSubscription(true);
    try {
      const response = await fetch(`${API_URL}/api/subscription/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        toast.success('Subscription cancelled successfully');
        setShowCancelConfirm(false);
        await refreshUser();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Failed to cancel');
      }
    } catch {
      toast.error('Failed to cancel subscription');
    } finally {
      setCancellingSubscription(false);
    }
  };

  const canCancel = user?.subscription_tier && !['expired', 'cancelled'].includes(user.subscription_tier);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getTierDisplayName = (tier) => {
    if (!tier || tier === 'cancelled') return 'Cancelled';
    if (tier === 'trial') return 'Trial';
    if (tier === 'expired') return 'Expired';
    const parts = tier.split('_');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts[1] ? ` (${parts[1]})` : '');
  };

  const getTierColor = (tier) => {
    if (!tier) return 'bg-zinc-700 text-zinc-300';
    if (tier.includes('enterprise')) return 'bg-purple-500/20 text-purple-400';
    if (tier.includes('pro')) return 'bg-indigo-500/20 text-indigo-400';
    if (tier.includes('essential')) return 'bg-cyan-500/20 text-cyan-400';
    if (tier === 'trial') return 'bg-amber-500/20 text-amber-400';
    if (tier === 'expired' || tier === 'cancelled') return 'bg-red-500/20 text-red-400';
    return 'bg-zinc-700 text-zinc-300';
  };

  const planConfig = {
    monthly: [
      { key: 'essential_monthly', name: 'Essential', price: 299 },
      { key: 'pro_monthly', name: 'Pro', price: 699, featured: true },
      { key: 'enterprise_monthly', name: 'Enterprise', price: 260, perUser: true }
    ],
    yearly: [
      { key: 'essential_yearly', name: 'Essential', price: 2512, originalPrice: 3588, savings: 1076 },
      { key: 'pro_yearly', name: 'Pro', price: 5872, originalPrice: 8388, featured: true, savings: 2516 },
      { key: 'enterprise_yearly', name: 'Enterprise', price: 2184, originalPrice: 3120, perUser: true, savings: 936 }
    ]
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto" data-testid="settings-page">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
            Settings
          </h1>
          <p className="text-zinc-400 mt-1">Manage your account and subscription</p>
        </div>

        {/* Payment Status Banner */}
        {checkingStatus && (
          <div className="flex items-center gap-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            <span className="text-indigo-300">Verifying payment...</span>
          </div>
        )}

        {/* Profile Section */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="profile-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <User className="w-5 h-5 text-indigo-400" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={user?.picture} alt={user?.name} />
                <AvatarFallback className="bg-indigo-600 text-white text-lg">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold text-white">{user?.name}</h3>
                <p className="text-zinc-400">{user?.email}</p>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getTierColor(user?.subscription_tier)}`}>
                    <Sparkles className="w-3 h-3" />
                    {getTierDisplayName(user?.subscription_tier)} Plan
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-zinc-800 flex flex-wrap items-center gap-3">
              <Button 
                variant="outline" 
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => setShowLogoutConfirm(true)}
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
              {canCancel && (
                <Button
                  variant="outline"
                  className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  onClick={() => setShowCancelConfirm(true)}
                  data-testid="cancel-subscription-btn"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel {user?.subscription_tier === 'trial' ? 'Trial' : 'Subscription'}
                </Button>
              )}
            </div>

            {/* Cancel Confirmation */}
            {showCancelConfirm && (
              <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-lg" data-testid="cancel-confirm-dialog">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-white mb-1">
                      {user?.subscription_tier === 'trial'
                        ? 'Cancel your free trial?'
                        : 'Cancel your subscription?'}
                    </h4>
                    <p className="text-xs text-zinc-400 mb-3">
                      {user?.subscription_tier === 'trial'
                        ? 'You will lose access to your trial immediately. You can resubscribe at any time.'
                        : 'Your access will be revoked immediately. You can resubscribe to any plan at any time.'}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-500 text-white text-xs h-8"
                        onClick={handleCancelSubscription}
                        disabled={cancellingSubscription}
                        data-testid="confirm-cancel-btn"
                      >
                        {cancellingSubscription ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                        ) : null}
                        Yes, cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-zinc-400 text-xs h-8"
                        onClick={() => setShowCancelConfirm(false)}
                        data-testid="keep-subscription-btn"
                      >
                        Keep my plan
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team section */}
        <TeamSection />

        {/* Security — Two-Factor Authentication */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="security-2fa-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-white mb-0.5">Two-Factor Authentication</h4>
                <p className="text-xs text-zinc-500">
                  {twoFAEnabled
                    ? 'A verification code will be sent to your email each time you sign in.'
                    : 'Add an extra layer of security by requiring a verification code at sign-in.'}
                </p>
              </div>
              <button
                onClick={toggle2FA}
                disabled={toggling2FA}
                className={`ml-4 relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 transition-colors duration-200 focus:outline-none ${twoFAEnabled ? 'bg-indigo-600' : 'bg-zinc-700'}`}
                data-testid="2fa-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${twoFAEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {twoFAEnabled && (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/5 border border-indigo-500/20 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <p className="text-xs text-indigo-300">2FA is active. A code will be emailed to you on every sign-in.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Plans */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="subscription-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <CreditCard className="w-5 h-5 text-emerald-400" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Billing Toggle */}
            <div className="mb-6 flex flex-col items-center">
              <div className="inline-flex items-center p-1 bg-zinc-900 rounded-full border border-zinc-800 relative">
                <div
                  className="absolute top-1 bottom-1 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/25 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{
                    width: billingPeriod === 'monthly' ? 'calc(40% - 2px)' : 'calc(60% - 2px)',
                    left: billingPeriod === 'monthly' ? '4px' : 'calc(40% + 2px)',
                  }}
                />
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  className={`relative z-10 px-6 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${
                    billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingPeriod('yearly')}
                  className={`relative z-10 px-6 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${
                    billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Yearly <span className={`ml-1 transition-colors duration-300 ${billingPeriod === 'yearly' ? 'text-emerald-300' : 'text-emerald-400'}`}>Save more</span>
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">*1st year only, renews at full price</p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {planConfig[billingPeriod].map((plan) => {
                const planData = plans[plan.key];
                const isCurrentPlan = user?.subscription_tier === plan.key;
                
                return (
                  <div 
                    key={plan.key}
                    className={`relative p-5 rounded-xl border transition-all ${
                      isCurrentPlan 
                        ? 'bg-indigo-500/10 border-indigo-500/30' 
                        : plan.featured
                          ? 'bg-zinc-900/50 border-indigo-500/20 hover:border-indigo-500/40'
                          : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                    }`}
                    data-testid={`plan-${plan.key}`}
                  >
                    {isCurrentPlan && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full">
                          <Check className="w-3 h-3" /> Current
                        </span>
                      </div>
                    )}
                    
                    <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
                      {plan.name}
                    </h3>
                    
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                        ${plan.price.toLocaleString()}
                      </span>
                      {plan.originalPrice && (
                        <span className="text-sm text-zinc-500 line-through">
                          ${plan.originalPrice.toLocaleString()}
                        </span>
                      )}
                      <span className="text-zinc-400 text-sm">
                        {plan.perUser ? '/user' : `/${billingPeriod === 'monthly' ? 'mo' : 'yr'}`}
                      </span>
                    </div>

                    {plan.savings && (
                      <p className="text-emerald-400 text-xs mt-1">30% off 1st year (save ${plan.savings})</p>
                    )}
                    
                    <ul className="mt-4 space-y-2">
                      {planData?.features?.slice(0, 4).map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    
                    <Button
                      className={`w-full mt-4 ${
                        isCurrentPlan
                          ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 btn-glow'
                      }`}
                      disabled={isCurrentPlan || processingPayment}
                      onClick={() => handleUpgrade(plan.key)}
                      data-testid={`upgrade-${plan.key}-btn`}
                    >
                      {processingPayment ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isCurrentPlan ? (
                        'Current Plan'
                      ) : (
                        <>
                          Upgrade <ChevronRight className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-zinc-400">
                  <p>Payments are processed securely through Stripe. You can cancel anytime.</p>
                  <p className="mt-1">Priority plans include dedicated support and custom features.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800" data-testid="settings-logout-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white" style={{ fontFamily: 'Outfit' }}>Are you sure you want to sign out?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              You'll need to sign back in to access your dashboard and analytics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" data-testid="settings-logout-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-500 text-white" onClick={logout} data-testid="settings-logout-confirm-btn">Sign Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Settings;
