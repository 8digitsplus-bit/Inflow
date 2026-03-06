import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from './DashboardLayout';
import { Lock, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from './ui/button';

const TIER_LEVEL = {
  free: 0,
  essential_monthly: 1,
  essential_yearly: 1,
  pro_monthly: 2,
  pro_yearly: 2,
  enterprise_monthly: 3,
  enterprise_yearly: 3,
};

const TIER_NAMES = {
  1: 'Essential',
  2: 'Pro',
  3: 'Enterprise',
};

const TierGate = ({ requiredLevel, children }) => {
  const { user } = useAuth();
  const tier = user?.subscription_tier || 'free';
  const userLevel = TIER_LEVEL[tier] ?? 0;

  if (userLevel >= requiredLevel) return children;

  const requiredName = TIER_NAMES[requiredLevel] || 'a higher';

  return (
    <DashboardLayout>
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="tier-gate-overlay">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>
            {requiredName} Plan Required
          </h2>
          <p className="text-zinc-400 mb-6">
            This feature is available on the <span className="text-indigo-400 font-medium">{requiredName}</span> plan and above. Upgrade to unlock full access.
          </p>
          <Link to="/settings">
            <Button className="bg-indigo-600 hover:bg-indigo-500 btn-glow px-8 h-11" data-testid="tier-gate-upgrade-btn">
              <Sparkles className="w-4 h-4 mr-2" />
              Upgrade to {requiredName}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <p className="text-xs text-zinc-500 mt-4">
            Your current plan: <span className="text-zinc-300 capitalize">{tier.split('_')[0]}</span>
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TierGate;
