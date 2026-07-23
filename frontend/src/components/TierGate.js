import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from './DashboardLayout';
import { Lock, ArrowRight, Sparkles, Check, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { ALL_FEATURES } from '../lib/pricing';

// Under the value-based plan every paying customer maps to the top tier internally,
// so "level >= 1" simply means "active/paid" (trial=0, expired/cancelled=-1).
const TIER_LEVEL = {
  trial: 0,
  expired: -1,
  cancelled: -1,
  free: 0,
  essential_monthly: 1,
  essential_yearly: 1,
  pro_monthly: 2,
  pro_yearly: 2,
  enterprise_monthly: 3,
  enterprise_yearly: 3,
};

const TierGate = ({ requiredLevel, children }) => {
  const { user } = useAuth();
  const tier = user?.subscription_tier || 'trial';
  const userLevel = TIER_LEVEL[tier] ?? 0;

  if (userLevel >= requiredLevel) return children;

  const isTrial = tier === 'trial';
  const isExpired = tier === 'expired';
  const isCancelled = tier === 'cancelled';
  const daysLeft = user?.trial_days_left ?? 0;

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4" data-testid="tier-gate-overlay">
        <div className="text-center mb-8 max-w-lg">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mx-auto mb-5">
            {isExpired || isCancelled ? <Clock className="w-7 h-7 text-amber-400" /> : <Lock className="w-7 h-7 text-slate-400" />}
          </div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>
            {isExpired ? 'Your trial has ended' : isCancelled ? 'Your subscription was cancelled' : 'Unlock every InFlow feature'}
          </h2>
          <p className="text-zinc-400 text-sm">
            {isExpired
              ? 'Activate a plan to continue using InFlow — every feature is included.'
              : isCancelled
                ? 'Resubscribe to regain access — every feature is included.'
                : isTrial
                  ? `You have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left on your trial. Activate a plan to unlock this feature.`
                  : 'Activate a plan to unlock this feature.'}
          </p>
        </div>

        {/* Single value-based plan — no feature tiers */}
        <div className="relative w-full max-w-md" data-testid="upgrade-panel">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-3xl opacity-50 blur-xl"
            style={{ background: 'linear-gradient(135deg, rgba(0,82,255,0.25), rgba(255,255,255,0.05) 45%, rgba(0,82,255,0.2))' }}
          />
          <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-6 shadow-[0_8px_50px_-12px_rgba(0,0,0,0.6)]">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-[#4d8bff]" />
              <span className="text-[#4d8bff] font-semibold uppercase tracking-widest text-xs">One plan · everything included</span>
            </div>
            <p className="text-white text-lg font-semibold mb-4" style={{ fontFamily: 'Outfit' }}>
              You only pay for the deals &amp; revenue you track.
            </p>
            <ul className="space-y-2 mb-6">
              {ALL_FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/choose-plan">
              <Button
                className="w-full h-11 rounded-full text-sm font-semibold text-white border-2 border-[#0052ff] bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] shadow-lg shadow-[#0052ff]/30 hover:brightness-110"
                data-testid="upgrade-cta-btn"
              >
                {isExpired || isCancelled ? 'Reactivate my plan' : 'View pricing & activate'}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>

        {isTrial && (
          <p className="text-[11px] text-zinc-600 mt-5">
            Trial includes dashboard access, live integrations, and basic metrics.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TierGate;
