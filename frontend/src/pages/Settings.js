import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { SyncSettingsCard } from '../components/sync/SyncSettingsCard';
import { DeleteAccountCard } from '../components/settings/DeleteAccountCard';
import { motion } from 'framer-motion';
import {
  Check,
  Loader2,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  XCircle,
  FileText,
  Wallet,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import Enable2FADialog from '../components/Enable2FADialog';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PLAN_PRICING = {
  essential_monthly: { price: 75, period: 'month' },
  essential_yearly: { price: 597, period: 'year' },
  pro_monthly: { price: 179, period: 'month' },
  pro_yearly: { price: 1356, period: 'year' },
  enterprise_monthly: { price: 327, period: 'month' },
  enterprise_yearly: { price: 1999, period: 'year' },
};

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

const Settings = () => {
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [plans, setPlans] = useState({});
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [toggling2FA, setToggling2FA] = useState(false);
  const [show2FADialog, setShow2FADialog] = useState(false);
  const [org, setOrg] = useState(null);
  const [subDetails, setSubDetails] = useState(null);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  const fetchOrg = () => fetch(`${API_URL}/api/org/me`, { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(setOrg)
    .catch(() => {});

  useEffect(() => { fetchOrg(); }, []);

  const fetchSubDetails = async () => {
    try {
      const res = await fetch(`${API_URL}/api/subscription/details`, { credentials: 'include' });
      if (res.ok) setSubDetails(await res.json());
    } catch {}
  };

  useEffect(() => { fetchSubDetails(); }, [user?.subscription_tier]);

  useEffect(() => {
    fetchPlans();
    fetch2FAStatus();
    const sessionId = searchParams.get('session_id');
    const success = searchParams.get('success');
    if (sessionId && success) pollPaymentStatus(sessionId);
  }, [searchParams]);

  const fetch2FAStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/status`, { credentials: 'include' });
      if (res.ok) setTwoFAEnabled((await res.json()).enabled);
    } catch {}
  };

  const toggle2FA = async () => {
    if (!twoFAEnabled) { setShow2FADialog(true); return; }
    setToggling2FA(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/disable`, { method: 'POST', credentials: 'include' });
      if (res.ok) { setTwoFAEnabled(false); toast.success('Two-factor authentication disabled'); }
      else toast.error('Failed to update 2FA settings');
    } catch { toast.error('Failed to update 2FA settings'); }
    finally { setToggling2FA(false); }
  };

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${API_URL}/api/subscription/plans`);
      if (response.ok) setPlans(await response.json());
    } catch (error) { console.error('Failed to fetch plans:', error); }
  };

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;
    if (attempts >= maxAttempts) { toast.error('Payment status check timed out. Please refresh the page.'); setCheckingStatus(false); return; }
    setCheckingStatus(true);
    try {
      const response = await fetch(`${API_URL}/api/payments/status/${sessionId}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.payment_status === 'paid') {
          toast.success('Payment successful! Your plan has been upgraded.');
          await refreshUser();
          setCheckingStatus(false);
          window.history.replaceState({}, '', '/settings');
          return;
        } else if (data.status === 'expired') {
          toast.error('Payment session expired. Please try again.');
          setCheckingStatus(false);
          return;
        }
      }
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (error) {
      console.error('Error checking payment status:', error);
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    }
  };

  const handleCancelSubscription = async () => {
    setCancellingSubscription(true);
    try {
      const response = await fetch(`${API_URL}/api/subscription/cancel`, { method: 'POST', credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setShowCancelConfirm(false);
        if (data.status === 'scheduled') {
          toast.success(data.cancel_at ? `Your plan will end on ${fmtDate(data.cancel_at)}. You keep full access until then.` : data.message, { id: 'sub-renewal' });
          await fetchSubDetails();
        } else {
          toast.success('Subscription cancelled successfully');
          await Promise.all([refreshUser(), fetchOrg()]);
        }
      } else {
        toast.error((await response.json()).detail || 'Failed to cancel');
      }
    } catch { toast.error('Failed to cancel subscription'); }
    finally { setCancellingSubscription(false); }
  };

  const handleOpenBillingPortal = async () => {
    setLoadingPortal(true);
    try {
      const response = await fetch(`${API_URL}/api/billing/portal-session`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_url: window.location.origin }),
      });
      const data = await response.json();
      if (response.ok && data.url) window.location.href = data.url;
      else toast.error(data.detail || 'Could not open billing portal');
    } catch { toast.error('Could not open billing portal'); }
    finally { setLoadingPortal(false); }
  };

  const handleToggleAutoRenew = async (enabled) => {
    setTogglingAutoRenew(true);
    try {
      const res = await fetch(`${API_URL}/api/subscription/auto-renew`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        toast.success(enabled ? 'Auto-renew turned on' : "Auto-renew turned off — your plan will end at the period end", { id: 'sub-renewal' });
        await fetchSubDetails();
      } else {
        toast.error((await res.json().catch(() => ({}))).detail || 'Failed to update auto-renew');
      }
    } catch { toast.error('Failed to update auto-renew'); }
    finally { setTogglingAutoRenew(false); }
  };

  const tier = org?.subscription_tier || user?.subscription_tier;
  const isPaid = tier && !['trial', 'expired', 'cancelled', 'free', null, undefined].includes(tier);
  const isOwner = org?.role === 'owner';
  const cancelScheduled = !!(subDetails?.has_subscription && subDetails?.cancel_at_period_end);
  const canCancel = tier && !['expired', 'cancelled'].includes(tier) && isOwner && !cancelScheduled;
  const periodEndLabel = subDetails?.current_period_end ? fmtDate(subDetails.current_period_end) : 'the end of your billing period';
  const canChangePlan = isOwner;
  const pricing = PLAN_PRICING[tier];

  const getInitials = (name) => !name ? 'U' : name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const planBaseName = (t) => {
    if (!t || t === 'cancelled') return 'Cancelled';
    if (t === 'trial') return 'Free Trial';
    if (t === 'expired') return 'Expired';
    const base = t.split('_')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  };
  const billedLabel = (t) => {
    if (!PLAN_PRICING[t]) return t === 'trial' ? 'No card on file' : '';
    return t.includes('yearly') ? 'Billed yearly' : 'Billed monthly';
  };
  const getTierColor = (t) => {
    if (!t) return 'bg-zinc-700/40 text-zinc-300 border-zinc-600/40';
    if (t.includes('enterprise')) return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    if (t.includes('pro')) return 'bg-[#0052ff]/15 text-[#7aa6ff] border-[#0052ff]/40';
    if (t.includes('essential')) return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    if (t === 'trial') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    return 'bg-red-500/15 text-red-300 border-red-500/30';
  };
  const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const planFeatures = (plans[tier]?.features || []).slice(0, 4);

  const innerCard = 'rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur';
  const pillOutline = 'rounded-full border border-white/15 bg-white/5 text-zinc-300 hover:text-white hover:border-white/25';
  const pillPrimary = 'rounded-full bg-[#0052ff] text-white hover:bg-[#0047d6] shadow-[0_20px_60px_-30px_rgba(0,82,255,0.9)] transition-transform duration-300 hover:-translate-y-0.5';

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="group w-full max-w-5xl mx-auto rounded-3xl overflow-hidden border border-white/10 bg-white/[0.03] p-6 sm:p-10 backdrop-blur-xl relative"
        data-testid="settings-page"
      >
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 -z-10" />

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="w-12 h-12 flex-shrink-0 ring-2 ring-white/10">
              <AvatarImage src={user?.picture} alt={user?.name} />
              <AvatarFallback className="bg-[#0052ff]/30 text-white text-sm">{getInitials(user?.name)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-zinc-400">Account</div>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl" style={{ fontFamily: 'Outfit' }}>Manage your account & subscription</h1>
              <p className="mt-2 text-sm text-zinc-400">Update personal details, control security, and manage your current plan in one place.</p>
            </div>
          </div>
          <Badge className={`rounded-full border px-4 py-2 text-xs font-medium whitespace-nowrap ${getTierColor(tier)}`} data-testid="settings-tier-badge">
            {planBaseName(tier)} Plan
          </Badge>
        </div>

        {/* Payment status banner */}
        {checkingStatus && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-[#0052ff]/10 border border-[#0052ff]/20 rounded-2xl" data-testid="payment-status-banner">
            <Loader2 className="w-5 h-5 animate-spin text-[#7aa6ff]" />
            <span className="text-zinc-200 text-sm">Verifying payment…</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Security */}
            <div className={innerCard} data-testid="security-card">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#7aa6ff]" /> Security</h2>
              <p className="mb-4 mt-0.5 text-xs text-zinc-500">Control how you access your account.</p>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-zinc-300">Email</Label>
                  <p className="text-sm text-zinc-400 truncate" title={user?.email}>{user?.email}</p>
                </div>
                <div className="flex items-start justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <Label className="text-xs font-medium text-zinc-300">Two-factor authentication</Label>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {twoFAEnabled ? 'A code is emailed to you at every sign-in.' : 'Require an emailed code when you sign in.'}
                    </p>
                  </div>
                  <Switch
                    checked={twoFAEnabled}
                    onCheckedChange={() => toggle2FA()}
                    disabled={toggling2FA}
                    className="data-[state=checked]:bg-[#0052ff] flex-shrink-0 mt-0.5"
                    data-testid="2fa-toggle"
                  />
                </div>
              </div>
            </div>

            <SyncSettingsCard className={innerCard} />
            <DeleteAccountCard className={innerCard} />

            {/* Renewal */}
            <div className={innerCard} data-testid="renewal-card">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2"><RefreshCw className="w-4 h-4 text-[#7aa6ff]" /> Renewal</h2>
              <p className="mb-4 mt-0.5 text-xs text-zinc-500">Decide whether your plan renews automatically.</p>
              {subDetails?.has_subscription && isOwner ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-300">Auto-renew subscription</span>
                    <Switch
                      checked={!!subDetails?.auto_renew}
                      onCheckedChange={(v) => handleToggleAutoRenew(v)}
                      disabled={togglingAutoRenew}
                      className="data-[state=checked]:bg-[#0052ff]"
                      data-testid="auto-renew-toggle-btn"
                    />
                  </div>
                  {subDetails?.current_period_end && (
                    <p className="mt-3 text-xs text-zinc-500">
                      {subDetails.auto_renew
                        ? <>Renews on <span className="text-zinc-300">{fmtDate(subDetails.current_period_end)}</span>.</>
                        : <>Ends on <span className="text-zinc-300">{fmtDate(subDetails.current_period_end)}</span>. You keep access until then.</>}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between gap-3 opacity-60">
                  <span className="text-sm text-zinc-400">Auto-renew subscription</span>
                  <Switch checked={false} disabled className="flex-shrink-0" />
                </div>
              )}
              {!(subDetails?.has_subscription && isOwner) && (
                <p className="mt-3 text-xs text-zinc-600">Available once you're on an active paid plan{!isOwner ? ' (owner only)' : ''}.</p>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div className="space-y-6">
            {/* Current plan */}
            <div className={innerCard} data-testid="current-plan-card">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">Current plan</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">{planBaseName(tier)}{billedLabel(tier) ? ` — ${billedLabel(tier)}` : ''}</p>
                </div>
                {pricing && (
                  <div className="text-right">
                    <span className="text-2xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>${money(pricing.price)}</span>
                    <p className="text-xs text-zinc-500">per {pricing.period} · per workspace</p>
                  </div>
                )}
              </div>

              {planFeatures.length > 0 && (
                <div className="mt-5 space-y-3">
                  {planFeatures.map((feature) => (
                    <p key={feature} className="flex items-center gap-2 text-sm text-zinc-300">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#0052ff]/40 bg-[#0052ff]/10 text-[#7aa6ff] flex-shrink-0">
                        <Check className="h-3 w-3" aria-hidden />
                      </span>
                      {feature}
                    </p>
                  ))}
                </div>
              )}

              {cancelScheduled && (
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200" data-testid="cancel-scheduled-notice">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>Cancels on <span className="font-medium text-amber-100" data-testid="cancel-scheduled-date">{periodEndLabel}</span>. You keep full access until then and won't be charged again.</span>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {cancelScheduled && isOwner && (
                  <Button
                    variant="outline"
                    className={`flex-1 ${pillOutline} px-6 py-3 text-sm`}
                    onClick={() => handleToggleAutoRenew(true)}
                    disabled={togglingAutoRenew}
                    data-testid="resume-subscription-btn"
                  >
                    {togglingAutoRenew ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Keep my subscription
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="outline"
                    className={`flex-1 ${pillOutline} px-6 py-3 text-sm border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200`}
                    onClick={() => setShowCancelConfirm(true)}
                    data-testid="cancel-subscription-btn"
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Cancel {tier === 'trial' ? 'trial' : 'subscription'}
                  </Button>
                )}
                <Button
                  className={`flex-1 ${pillPrimary} px-6 py-3 text-sm disabled:opacity-40 disabled:hover:translate-y-0`}
                  onClick={() => navigate('/choose-plan')}
                  disabled={!canChangePlan}
                  data-testid="manage-plan-btn"
                >
                  {canChangePlan ? 'Manage plan' : 'Owner only'} <ArrowUpRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>

            {/* Billing */}
            <div className={innerCard} data-testid="billing-card">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Wallet className="w-4 h-4 text-[#7aa6ff]" /> Billing</h2>
              <p className="mb-4 mt-0.5 text-xs text-zinc-500">Download invoices or update your payment details.</p>
              {isPaid && isOwner ? (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button variant="outline" className={`flex-1 ${pillOutline} px-6 py-3 text-sm`} onClick={handleOpenBillingPortal} disabled={loadingPortal} data-testid="view-invoices-btn">
                    {loadingPortal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} View invoices
                  </Button>
                  <Button variant="outline" className={`flex-1 ${pillOutline} px-6 py-3 text-sm`} onClick={handleOpenBillingPortal} disabled={loadingPortal} data-testid="update-payment-btn">
                    {loadingPortal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wallet className="w-4 h-4 mr-2" />} Update payment method
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-zinc-600">Invoices and payment methods appear once you're on an active paid plan{!isOwner ? ' (owner only)' : ''}.</p>
              )}
              <div className="mt-4 flex items-start gap-2 text-xs text-zinc-600">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Payments are processed securely through Stripe. You can cancel anytime.</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Cancel confirmation */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800" data-testid="cancel-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white" style={{ fontFamily: 'Outfit' }}>
              {tier === 'trial' ? 'Cancel your free trial?' : 'Cancel your subscription?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {subDetails?.has_subscription
                ? `Your plan will stay fully active until ${periodEndLabel}. After that it won't renew and you won't be charged again. You can undo this any time before then.`
                : tier === 'trial'
                  ? 'You will lose access to your trial immediately. You can resubscribe at any time.'
                  : 'Your access will end immediately. You can resubscribe to any plan at any time.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" data-testid="keep-subscription-btn">Keep my plan</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-500 text-white" onClick={handleCancelSubscription} disabled={cancellingSubscription} data-testid="confirm-cancel-btn">
              {cancellingSubscription ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Enable2FADialog open={show2FADialog} onOpenChange={setShow2FADialog} onEnabled={() => setTwoFAEnabled(true)} />
    </DashboardLayout>
  );
};

export default Settings;
