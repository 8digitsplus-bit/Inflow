import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, CheckCircle2, ChevronRight, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CheckoutReturn = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const sessionId = searchParams.get('session_id');

  const [state, setState] = useState({ phase: 'loading', data: null, error: null });

  useEffect(() => {
    if (!sessionId) {
      setState({ phase: 'error', error: 'Missing session_id' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/payments/session-status/${sessionId}`, {
          credentials: 'include',
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          if (!cancelled) setState({ phase: 'error', error: err.detail || 'Failed to retrieve session' });
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        setState({ phase: 'done', data });
        if (data.status === 'complete' && refreshUser) refreshUser();
      } catch {
        if (!cancelled) setState({ phase: 'error', error: 'Network error retrieving session' });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, refreshUser]);

  // Loading
  if (state.phase === 'loading') {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center px-4" data-testid="checkout-return-loading">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-400 mx-auto mb-4" />
          <p className="text-zinc-300 text-base font-medium">Confirming your payment…</p>
          <p className="text-zinc-500 text-sm mt-1">This usually takes a few seconds.</p>
        </div>
      </div>
    );
  }

  // Error
  if (state.phase === 'error') {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>
            Couldn't confirm payment
          </h1>
          <p className="text-zinc-500 text-sm mb-6">{state.error}</p>
          <Button onClick={() => navigate('/settings')} className="bg-indigo-600 hover:bg-indigo-500" data-testid="checkout-return-settings-btn">
            Go to Settings
          </Button>
        </div>
      </div>
    );
  }

  const { status, customer_email } = state.data;

  // User closed Stripe iframe before paying → bounce them back to retry.
  if (status === 'open') {
    return <Navigate to="/choose-plan" replace />;
  }

  // Session expired → ask them to start over
  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>
            Checkout session expired
          </h1>
          <p className="text-zinc-500 text-sm mb-6">No worries — start over and we'll get you sorted in seconds.</p>
          <Button onClick={() => navigate('/choose-plan')} className="bg-indigo-600 hover:bg-indigo-500" data-testid="checkout-return-restart-btn">
            Choose a plan
          </Button>
        </div>
      </div>
    );
  }

  // status === 'complete' → success
  return (
    <div className="min-h-screen bg-[#050507] flex items-center justify-center px-4" data-testid="checkout-return-success">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6 animate-in zoom-in duration-500">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
          You're all set!
        </h1>
        <p className="text-zinc-400 mb-2">
          Your subscription is active and your 14-day free trial has begun.
        </p>
        {customer_email && (
          <p className="text-zinc-600 text-xs mb-8">
            A confirmation receipt will appear at <span className="text-zinc-400">{customer_email}</span>.
          </p>
        )}
        <Button
          onClick={() => navigate('/dashboard')}
          className="bg-indigo-600 hover:bg-indigo-500 px-8 h-11"
          data-testid="checkout-return-dashboard-btn"
        >
          Go to Dashboard <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
};

export default CheckoutReturn;
