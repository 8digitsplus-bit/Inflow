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
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import Enable2FADialog from '../components/Enable2FADialog';
import { toast } from 'sonner';
import { VolumeSlider } from '../components/VolumeSlider';
import { ALL_FEATURES, computePrice, contractsForTier, formatDeals, planKeyFor, clampTier } from '../lib/pricing';

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
  const [dealUsage, setDealUsage] = useState(null);
  const [settingsUnits, setSettingsUnits] = useState(2);
  const [updatingVolume, setUpdatingVolume] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/business/deal-usage`, { credentials: 'include' });
        if (res.ok) {
          const d = await res.json();
          setDealUsage(d);
          if (d.volume_units !== undefined && d.volume_units !== null) {
            setSettingsUnits(clampTier(d.volume_units));
          }
        }
      } catch (e) { /* non-blocking */ }
    })();
  }, []);

  const handleUpdateVolume = async () => {
    const tier = user?.subscription_tier;
    const isPaidUsage = tier === 'enterprise_monthly' || tier === 'enterprise_yearly';
    if (!isPaidUsage) {
      navigate(`/checkout?plan=${planKeyFor(billingPeriod)}&units=${settingsUnits}`);
      return;
    }
    setUpdatingVolume(true);
    try {
      const res = await fetch(`${API_URL}/api/subscription/update-volume`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: settingsUnits }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Volume updated to ${formatDeals(contractsForTier(settingsUnits))} deals tracked`);
        if (refreshUser) await refreshUser();
        const u = await fetch(`${API_URL}/api/business/deal-usage`, { credentials: 'include' });
        if (u.ok) setDealUsage(await u.json());
      } else {
        toast.error(data.detail || 'Could not update your volume');
      }
    } catch (e) {
      toast.error('Could not update your volume');
    } finally {
      setUpdatingVolume(false);
    }
  };
  const [show2FADialog, setShow2FADialog] = useState(false);
  const [org, setOrg] = useState(null);
  const [subDetails, setSubDetails] = useState(null);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/org/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(setOrg)
      .catch(() => {});
  }, []);

  const fetchSubDetails = async () => {
    try {
      const res = await fetch(`${API_URL}/api/subscription/details`, { credentials: 'include' });
      if (res.ok) setSubDetails(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchSubDetails();
  }, [user?.subscription_tier]);

  const handleToggleAutoRenew = async (enabled) => {
    setTogglingAutoRenew(true);
    try {
      const res = await fetch(`${API_URL}/api/subscription/auto-renew`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        toast.success(enabled ? 'Auto-renew turned on' : 'Auto-renew turned off — your plan will end at the period end');
        await fetchSubDetails();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Failed to update auto-renew');
      }
    } catch {
      toast.error('Failed to update auto-renew');
    } finally {
      setTogglingAutoRenew(false);
    }
  };

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
    // Enabling 2FA requires the email-code confirmation flow
    if (!twoFAEnabled) {
      setShow2FADialog(true);
      return;
    }
    // Disabling is instant
    setToggling2FA(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/disable`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setTwoFAEnabled(false);
        toast.success('Two-factor authentication disabled');
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

  const [loadingPortal, setLoadingPortal] = useState(false);
  const handleOpenBillingPortal = async () => {
    setLoadingPortal(true);
    try {
      const response = await fetch(`${API_URL}/api/billing/portal-session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_url: window.location.origin }),
      });
      const data = await response.json();
      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.detail || 'Could not open billing portal');
      }
    } catch {
      toast.error('Could not open billing portal');
    } finally {
      setLoadingPortal(false);
    }
  };

  const hasActivePaidSub = user?.subscription_tier && !['trial', 'expired', 'cancelled', 'free', null, undefined].includes(user.subscription_tier);

  const canCancel = user?.subscription_tier && !['expired', 'cancelled'].includes(user.subscription_tier) && org?.role === 'owner';
  const canChangePlan = org?.role === 'owner';

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getTierDisplayName = (tier) => {
    if (!tier || tier === 'cancelled') return 'Cancelled';
    if (tier === 'trial') return 'Trial';
    if (tier === 'expired') return 'Expired';
    if (tier.startsWith('enterprise')) return 'InFlow';
    const parts = tier.split('_');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts[1] ? ` (${parts[1]})` : '');
  };

  const getTierColor = (tier) => {
    if (!tier) return 'bg-zinc-700 text-zinc-300';
    if (tier.includes('enterprise')) return 'bg-purple-500/20 text-purple-400';
    if (tier.includes('pro')) return 'bg-slate-500/20 text-slate-400';
    if (tier.includes('essential')) return 'bg-cyan-500/20 text-cyan-400';
    if (tier === 'trial') return 'bg-amber-500/20 text-amber-400';
    if (tier === 'expired' || tier === 'cancelled') return 'bg-red-500/20 text-red-400';
    return 'bg-zinc-700 text-zinc-300';
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
          <div className="flex items-center gap-3 p-4 bg-slate-500/10 border border-slate-500/20 rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            <span className="text-slate-300">Verifying payment...</span>
          </div>
        )}

        {/* Profile Section */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="profile-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <User className="w-5 h-5 text-slate-400" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={user?.picture} alt={user?.name} />
                <AvatarFallback className="bg-slate-600 text-white text-lg">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold text-white">{user?.name}</h3>
                <p className="text-zinc-400">{user?.email}</p>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getTierColor(org?.subscription_tier || user?.subscription_tier)}`}>
                    <Sparkles className="w-3 h-3" />
                    {getTierDisplayName(org?.subscription_tier || user?.subscription_tier)} Plan
                  </span>
                </div>
              </div>
            </div>

            {/* Auto-renew status block — shown when there is a real Stripe subscription */}
            {subDetails?.has_subscription && org?.role === 'owner' && (
              <div className="mt-6 pt-6 border-t border-zinc-800" data-testid="auto-renew-block">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${subDetails.auto_renew ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                      <RefreshCw className={`w-4 h-4 ${subDetails.auto_renew ? 'text-emerald-400' : 'text-amber-400'}`} />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-white mb-0.5">
                        {subDetails.auto_renew ? 'Auto-renew is on' : 'Auto-renew is off'}
                      </h4>
                      <p className="text-xs text-zinc-500">
                        {subDetails.current_period_end ? (
                          subDetails.auto_renew
                            ? <>Your plan renews on <span className="text-zinc-300">{new Date(subDetails.current_period_end).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>.</>
                            : <>Your plan ends on <span className="text-zinc-300">{new Date(subDetails.current_period_end).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>. You'll keep access until then.</>
                        ) : 'Manage how your subscription continues.'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className={subDetails.auto_renew
                      ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs h-8'
                      : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs h-8'}
                    onClick={() => handleToggleAutoRenew(!subDetails.auto_renew)}
                    disabled={togglingAutoRenew}
                    data-testid="auto-renew-toggle-btn"
                  >
                    {togglingAutoRenew ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : null}
                    {subDetails.auto_renew ? 'Turn off' : 'Turn on'}
                  </Button>
                </div>
              </div>
            )}

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
              {hasActivePaidSub && org?.role === 'owner' && (
                <Button
                  variant="outline"
                  className="border-slate-500/40 text-slate-300 hover:bg-slate-500/10 hover:border-slate-400"
                  onClick={handleOpenBillingPortal}
                  disabled={loadingPortal}
                  data-testid="manage-billing-btn"
                >
                  {loadingPortal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  Manage Billing
                </Button>
              )}
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

        {/* Security — Two-Factor Authentication */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="security-2fa-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <ShieldCheck className="w-5 h-5 text-slate-400" />
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
                className={`ml-4 relative inline-flex h-6 w-11 items-center rounded-full flex-shrink-0 transition-colors duration-200 focus:outline-none ${twoFAEnabled ? 'bg-slate-600' : 'bg-zinc-700'}`}
                data-testid="2fa-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${twoFAEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {twoFAEnabled && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-500/5 border border-slate-500/20 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <p className="text-xs text-slate-300">2FA is active. A code will be emailed to you on every sign-in.</p>
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
            {!canChangePlan && org?.role === 'member' && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-slate-500/5 border border-slate-500/15">
                <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-zinc-400">
                  You're a <span className="text-slate-400 font-medium">member</span> of this team. Only the team owner can change the plan or cancel the subscription.
                </p>
              </div>
            )}
            {/* Billing Toggle */}
            <div className="mb-6 flex flex-col items-center">
              <div className="inline-flex items-center p-1 bg-zinc-900 rounded-full border border-zinc-800 relative">
                <div
                  className="absolute top-1 bottom-1 rounded-full bg-slate-600 shadow-lg shadow-slate-500/25 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
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
              <p className="text-xs text-zinc-500 mt-2">*Get 2 months free when you pay yearly</p>
            </div>

            <div className="p-6 rounded-xl border border-slate-500/20 bg-zinc-900/50" data-testid="volume-manager">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Deals &amp; revenue tracked</h3>
                  <p className="text-zinc-400 text-xs">
                    {dealUsage?.limit
                      ? `Tracking ${(dealUsage.used ?? 0).toLocaleString()} of ${dealUsage.limit.toLocaleString()} deals`
                      : 'Choose how much volume you want to track'}
                  </p>
                </div>
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="settings-volume-value">
                  {formatDeals(contractsForTier(settingsUnits))}
                </span>
              </div>
              <VolumeSlider
                tier={settingsUnits}
                onChange={setSettingsUnits}
                testidPrefix="settings-volume"
                disabled={!canChangePlan}
              />

              {dealUsage?.at_limit && (
                <p className="mt-3 text-amber-400 text-xs" data-testid="volume-at-limit">
                  You've hit your volume — slide up to keep tracking new deals.
                </p>
              )}

              <div className="mt-5 flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="settings-volume-price">
                    ${computePrice(settingsUnits, billingPeriod).toLocaleString()}
                  </span>
                  <span className="text-zinc-400 text-sm">/{billingPeriod === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
                <Button
                  className="bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] text-white border border-[#0052ff] hover:brightness-110 disabled:opacity-40"
                  disabled={updatingVolume || !canChangePlan}
                  onClick={handleUpdateVolume}
                  data-testid="update-volume-btn"
                >
                  {updatingVolume ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : hasActivePaidSub ? (
                    <>Update volume <ChevronRight className="w-4 h-4 ml-1" /></>
                  ) : (
                    <>Get started <ChevronRight className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
              </div>

              <ul className="mt-5 grid sm:grid-cols-2 gap-x-4 gap-y-2 pt-4 border-t border-zinc-800">
                {ALL_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
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
      <Enable2FADialog
        open={show2FADialog}
        onOpenChange={setShow2FADialog}
        onEnabled={() => setTwoFAEnabled(true)}
      />
    </DashboardLayout>
  );
};

export default Settings;
