import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, Clock, AlertTriangle, X, ArrowRight } from 'lucide-react';

/**
 * Top-of-page banner that surfaces trial milestones so users always know
 * where they stand. Each milestone is dismissible per browser, but the
 * dismissal scope is keyed to the milestone itself so the next one
 * (e.g. "3 days left") still shows up after the previous was dismissed.
 *
 * Milestones (priority high → low):
 *   - expired           → trial is over; cannot be dismissed (always shown)
 *   - last_day          → 1 day or less left; cannot be dismissed
 *   - urgent_3          → 2-3 days left; orange
 *   - heads_up_7        → 4-7 days left; indigo
 *   - welcome_14        → fresh 14-day trial; emerald, dismissible
 *
 * Renders nothing when user is on a paid plan or signed-out.
 */
const TrialBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  const milestone = computeMilestone(user);
  const storageKey = milestone ? `inflow_trial_banner_dismissed_${milestone.key}` : null;

  // Reset dismissal when the milestone changes (e.g. day rolls from 8 → 7)
  useEffect(() => {
    if (!storageKey) return;
    setDismissed(localStorage.getItem(storageKey) === '1');
  }, [storageKey]);

  if (!milestone) return null;
  if (milestone.dismissible && dismissed) return null;

  const handleDismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  const Icon = milestone.icon;

  return (
    <div
      className={`relative w-full ${milestone.bg} border-b ${milestone.border}`}
      data-testid={`trial-banner-${milestone.key}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
        <div className={`shrink-0 w-7 h-7 rounded-full ${milestone.iconBg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${milestone.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[13px] sm:text-sm font-medium ${milestone.text} truncate`}>
            {milestone.title}
          </p>
          {milestone.subtitle && (
            <p className={`text-[11px] ${milestone.subtle} truncate`}>{milestone.subtitle}</p>
          )}
        </div>
        <button
          onClick={() => navigate('/choose-plan')}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold ${milestone.cta} transition-colors`}
          data-testid={`trial-banner-cta-${milestone.key}`}
        >
          {milestone.ctaLabel}
          <ArrowRight className="w-3 h-3" />
        </button>
        {milestone.dismissible && (
          <button
            onClick={handleDismiss}
            className={`shrink-0 ${milestone.subtle} hover:opacity-100 opacity-60 transition-opacity p-1`}
            aria-label="Dismiss"
            data-testid={`trial-banner-dismiss-${milestone.key}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

const computeMilestone = (user) => {
  if (!user) return null;
  const tier = user.subscription_tier;

  // Expired — show always until they upgrade
  if (tier === 'expired') {
    return {
      key: 'expired',
      title: 'Your free trial has ended',
      subtitle: 'Upgrade now to restore access to your data and analytics.',
      icon: AlertTriangle,
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400',
      text: 'text-red-200',
      subtle: 'text-red-400/80',
      cta: 'bg-red-500 hover:bg-red-400 text-white',
      ctaLabel: 'Upgrade now',
      dismissible: false,
    };
  }

  if (tier !== 'trial') return null;

  // Read days left — prefer server-computed, fall back to client calc from trial_end
  let daysLeft = typeof user.trial_days_left === 'number' ? user.trial_days_left : null;
  if (daysLeft == null && user.trial_end) {
    try {
      const ms = new Date(user.trial_end).getTime() - Date.now();
      daysLeft = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    } catch { daysLeft = null; }
  }
  if (daysLeft == null) return null;

  // Last day — urgent, non-dismissible
  if (daysLeft <= 1) {
    return {
      key: 'last_day',
      title: daysLeft === 0 ? 'Last day of your free trial' : '1 day left in your free trial',
      subtitle: 'Pick a plan to keep your access uninterrupted.',
      icon: AlertTriangle,
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400',
      text: 'text-red-200',
      subtle: 'text-red-400/80',
      cta: 'bg-red-500 hover:bg-red-400 text-white',
      ctaLabel: 'Choose a plan',
      dismissible: false,
    };
  }

  // 2-3 days — orange
  if (daysLeft <= 3) {
    return {
      key: `urgent_${daysLeft}`,
      title: `${daysLeft} days left in your free trial`,
      subtitle: 'Lock in your plan now — no charge until the trial ends.',
      icon: Clock,
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-400',
      text: 'text-amber-100',
      subtle: 'text-amber-400/80',
      cta: 'bg-amber-500 hover:bg-amber-400 text-zinc-950',
      ctaLabel: 'Choose a plan',
      dismissible: true,
    };
  }

  // 4-7 days — heads-up indigo
  if (daysLeft <= 7) {
    return {
      key: `heads_up_${daysLeft}`,
      title: `${daysLeft} days left in your free trial`,
      subtitle: "Loving InFlow? Pick a plan whenever you're ready.",
      icon: Clock,
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/20',
      iconBg: 'bg-indigo-500/20',
      iconColor: 'text-indigo-300',
      text: 'text-indigo-100',
      subtle: 'text-indigo-300/80',
      cta: 'bg-indigo-500 hover:bg-indigo-400 text-white',
      ctaLabel: 'See plans',
      dismissible: true,
    };
  }

  // Welcome — first half of trial
  if (daysLeft >= 13) {
    return {
      key: 'welcome_14',
      title: 'Welcome to your 14-day free trial',
      subtitle: "Explore everything — no card required. We'll remind you before it ends.",
      icon: Sparkles,
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      text: 'text-emerald-100',
      subtle: 'text-emerald-400/80',
      cta: 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950',
      ctaLabel: 'Browse plans',
      dismissible: true,
    };
  }

  return null;
};

export default TrialBanner;
