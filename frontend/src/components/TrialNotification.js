import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
} from './ui/dialog';
import { Button } from './ui/button';
import { Clock, AlertTriangle, XCircle, Zap } from 'lucide-react';

const MILESTONES = [7, 3, 1, 0];

const TrialNotification = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showPopup, setShowPopup] = useState(false);
  const [daysLeft, setDaysLeft] = useState(null);

  useEffect(() => {
    if (!user) return;
    const isTrial = user.subscription_tier === 'trial';
    const isExpiredTier = user.subscription_tier === 'expired';
    if (!isTrial && !isExpiredTier) return;

    const days = isExpiredTier ? 0 : (user.trial_days_left ?? null);
    if (days === null) return;
    setDaysLeft(days);

    const isMilestone = MILESTONES.includes(days);
    const dismissedKey = `trial_dismissed_${days}`;
    const alreadyDismissed = sessionStorage.getItem(dismissedKey);

    if (isMilestone && !alreadyDismissed) {
      setShowPopup(true);
    }

    if (days <= 0 || isExpiredTier) {
      setShowPopup(true);
    }
  }, [user]);

  const handleDismiss = () => {
    if (daysLeft > 0) {
      sessionStorage.setItem(`trial_dismissed_${daysLeft}`, 'true');
      setShowPopup(false);
    }
  };

  const handleUpgrade = () => {
    setShowPopup(false);
    navigate('/choose-plan');
  };

  if (!user || (user.subscription_tier !== 'trial' && user.subscription_tier !== 'expired') || daysLeft === null) return null;

  const isExpired = daysLeft <= 0;

  const config = isExpired
    ? { icon: XCircle, iconColor: 'text-red-400', iconBg: 'bg-red-500/15', title: 'Your free trial has expired', desc: 'Upgrade now to continue using InFlow and keep all your data.', accent: 'red' }
    : daysLeft === 1
    ? { icon: AlertTriangle, iconColor: 'text-amber-400', iconBg: 'bg-amber-500/15', title: 'Your trial expires tomorrow', desc: 'This is your last day! Upgrade now to keep uninterrupted access to all features.', accent: 'amber' }
    : daysLeft <= 3
    ? { icon: AlertTriangle, iconColor: 'text-amber-400', iconBg: 'bg-amber-500/15', title: `${daysLeft} days left on your free trial`, desc: 'Your trial is ending soon. Upgrade to keep your data and access all features.', accent: 'amber' }
    : { icon: Clock, iconColor: 'text-slate-400', iconBg: 'bg-slate-500/15', title: `${daysLeft} days left on your free trial`, desc: 'Enjoying InFlow? Upgrade anytime to unlock the full experience.', accent: 'indigo' };

  const Icon = config.icon;

  return (
    <Dialog open={showPopup} onOpenChange={isExpired ? undefined : setShowPopup}>
      <DialogContent
        className="bg-zinc-900 border-zinc-800 sm:max-w-md p-0 overflow-hidden"
        onPointerDownOutside={isExpired ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isExpired ? (e) => e.preventDefault() : undefined}
        hideCloseButton={isExpired}
        data-testid="trial-notification-popup"
      >
        <div className={`h-1 w-full ${
          config.accent === 'red' ? 'bg-red-500' : config.accent === 'amber' ? 'bg-amber-500' : 'bg-slate-500'
        }`} />

        <div className="px-6 pt-6 pb-2 flex flex-col items-center text-center">
          <div className={`w-14 h-14 rounded-2xl ${config.iconBg} flex items-center justify-center mb-4`}>
            <Icon className={`w-7 h-7 ${config.iconColor}`} />
          </div>

          <h2 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }} data-testid="trial-popup-title">
            {config.title}
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
            {config.desc}
          </p>
        </div>

        {!isExpired && (
          <div className="px-6 py-2">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
              <span>Trial progress</span>
              <span>{14 - daysLeft} of 14 days used</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  daysLeft <= 3 ? 'bg-amber-500' : 'bg-slate-500'
                }`}
                style={{ width: `${((14 - daysLeft) / 14) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="px-6 pb-6 pt-4 space-y-2">
          <Button
            className="w-full bg-white/10 hover:bg-white/20 h-11 font-medium"
            onClick={handleUpgrade}
            data-testid="trial-upgrade-btn"
          >
            <Zap className="w-4 h-4 mr-2" />
            {isExpired ? 'Upgrade Now' : 'View Plans & Upgrade'}
          </Button>

          {!isExpired && (
            <Button
              variant="ghost"
              className="w-full text-zinc-500 hover:text-zinc-300 h-9 text-sm"
              onClick={handleDismiss}
              data-testid="trial-dismiss-btn"
            >
              Remind me later
            </Button>
          )}

          {isExpired && (
            <Button
              className="w-full bg-zinc-700 hover:bg-zinc-600 h-11 font-medium text-white"
              onClick={async () => { await logout(); window.location.href = '/'; }}
              data-testid="trial-return-home-btn"
            >
              Return to homepage
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TrialNotification;
