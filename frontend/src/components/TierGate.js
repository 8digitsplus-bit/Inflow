import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from './DashboardLayout';
import { Lock, ArrowRight, Sparkles, Check, Clock } from 'lucide-react';
import { Button } from './ui/button';

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

const TIERS = [
  {
    name: 'Essential',
    price: '$59',
    period: '/mo',
    level: 1,
    color: 'indigo',
    features: [
      'Sales Pipeline Management',
      'Basic Analytics Dashboard',
      'Churn Monitoring',
      '1,500 monthly actions',
    ],
  },
  {
    name: 'Pro',
    price: '$149',
    period: '/mo',
    level: 2,
    color: 'cyan',
    popular: true,
    features: [
      'Everything in Essential',
      'Sales Performance Analytics',
      'AI-Powered Insights',
      'Pricing Optimization',
      'CRO Analysis',
      '7,500 monthly actions',
    ],
  },
  {
    name: 'Enterprise',
    price: '$249',
    period: '/mo',
    level: 3,
    color: 'purple',
    features: [
      'Everything in Pro',
      'Sales Revenue Analytics',
      'Revenue Intelligence',
      'Smart Assist',
      'Custom Integrations',
      '20,000 monthly actions',
    ],
  },
];

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
        {/* Header */}
        <div className="text-center mb-8 max-w-lg">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-5">
            {isExpired || isCancelled ? <Clock className="w-7 h-7 text-amber-400" /> : <Lock className="w-7 h-7 text-indigo-400" />}
          </div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>
            {isExpired ? 'Your trial has ended' : isCancelled ? 'Your subscription was cancelled' : isTrial ? 'Upgrade to unlock this feature' : 'Upgrade your plan'}
          </h2>
          <p className="text-zinc-400 text-sm">
            {isExpired
              ? 'Choose a plan below to continue using InFlow and unlock all features.'
              : isCancelled
                ? 'Resubscribe to a plan below to regain access to all features.'
                : isTrial
                  ? `You have ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left on your trial. Upgrade now to access this feature.`
                  : 'Select a plan to unlock premium features and supercharge your revenue intelligence.'}
          </p>
        </div>

        {/* Tier Cards */}
        <div className="grid md:grid-cols-3 gap-4 w-full max-w-3xl">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative rounded-2xl border p-5 transition-all hover:scale-[1.02] ${
                t.popular
                  ? 'bg-zinc-900/80 border-cyan-500/40 shadow-lg shadow-cyan-500/5'
                  : 'bg-zinc-900/50 border-white/10'
              }`}
              data-testid={`upgrade-tier-${t.name.toLowerCase()}`}
            >
              {t.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] font-semibold uppercase tracking-wider">
                  Most Popular
                </span>
              )}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-white" style={{ fontFamily: 'Outfit' }}>{t.name}</h3>
                <div className="mt-2 flex items-baseline gap-0.5">
                  <span className="text-2xl font-bold text-white">{t.price}</span>
                  <span className="text-xs text-zinc-500">{t.period}</span>
                </div>
              </div>
              <ul className="space-y-2 mb-5">
                {t.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                    <Check className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/settings">
                <Button
                  className={`w-full text-xs h-9 ${
                    t.popular
                      ? 'bg-indigo-600 hover:bg-indigo-500'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                  data-testid={`upgrade-btn-${t.name.toLowerCase()}`}
                >
                  <Sparkles className="w-3 h-3 mr-1.5" />
                  Upgrade to {t.name}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        {isTrial && (
          <p className="text-[11px] text-zinc-600 mt-5">
            Trial includes: Dashboard access, Live Integration, and basic metrics.
          </p>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TierGate;
