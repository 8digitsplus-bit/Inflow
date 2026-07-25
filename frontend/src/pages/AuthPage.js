import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Mail, Loader2, Eye, EyeOff, ShieldCheck, User, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { CanvasRevealEffect } from '../components/ui/canvas-reveal-effect';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const AccountChooser = ({ savedAccount, onSelectAccount, onUseAnother, isActiveSession }) => {
  const initials = savedAccount.name
    ? savedAccount.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : savedAccount.email[0].toUpperCase();

  return (
    <div data-testid="account-chooser">
      <h2 className="text-xl font-semibold text-white text-center mb-1" style={{ fontFamily: 'Outfit' }}>
        Choose an account
      </h2>
      <p className="text-zinc-400 text-sm text-center mb-6">
        to continue to InFlow
      </p>

      <button
        onClick={onSelectAccount}
        className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-xl hover:bg-white/[0.08] hover:border-white/25 transition-all duration-200 group"
        data-testid="saved-account-card"
      >
        <div className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0 relative">
          <span className="text-sm font-semibold text-white">{initials}</span>
          {isActiveSession && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-zinc-900 flex items-center justify-center" data-testid="active-session-dot">
              <CheckCircle2 className="w-2 h-2 text-white" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-white truncate">{savedAccount.name || 'User'}</p>
          <p className="text-xs text-zinc-500 truncate">{savedAccount.email}</p>
          {isActiveSession && (
            <p className="text-[10px] text-emerald-400 mt-0.5 font-medium">Signed in · click to continue</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
      </button>

      <button
        onClick={onUseAnother}
        className="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-white/[0.04] transition-all duration-200 mt-2 group"
        data-testid="use-another-account-btn"
      >
        <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-zinc-400" />
        </div>
        <span className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors">Use another account</span>
      </button>
    </div>
  );
};

const AuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTrial = searchParams.get('trial') === 'true';
  const isLoginMode = searchParams.get('mode') === 'login';
  const { loginWithGoogle, loginWithEmail, registerWithEmail, verify2FA, isAuthenticated, user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState(isLoginMode || localStorage.getItem('inflow_last_account') ? 'login' : 'register');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [loading, setLoading] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [isRegistering, setIsRegistering] = useState(false);
  const [twoFAState, setTwoFAState] = useState(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);

  // Account chooser state
  // Guard against a corrupt localStorage value: an unguarded JSON.parse here
  // throws during render and trips the app-wide Sentry ErrorBoundary, locking
  // the user out of login entirely (Reload re-hits the same crash). Clear the
  // bad value so the user recovers automatically.
  const savedAccount = (() => {
    const raw = localStorage.getItem('inflow_last_account');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem('inflow_last_account');
      return null;
    }
  })();
  const [showAccountChooser, setShowAccountChooser] = useState(!!savedAccount);

  // True when the saved account matches the currently authenticated user (one-click sign-in possible)
  const isActiveSession = !!(isAuthenticated && user && savedAccount && user.email === savedAccount.email);

  // Consume any pending checkout intent the user expressed before being asked to log in.
  // Set by PricingSection when an unauthenticated visitor clicks a tier's CTA.
  const getPostAuthDestination = (defaultPath = '/dashboard') => {
    try {
      const raw = localStorage.getItem('inflow_pending_checkout');
      if (!raw) return defaultPath;
      const intent = JSON.parse(raw);
      localStorage.removeItem('inflow_pending_checkout');
      if (intent?.plan) return `/checkout?plan=${encodeURIComponent(intent.plan)}`;
    } catch { /* fall through */ }
    return defaultPath;
  };

  // Redirect if already authenticated AND the user did NOT come here for a fresh-login from chooser
  // (Side-effect must run in effect, not during render.)
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || isRegistering) return;
    // If a chooser is being shown for the same logged-in user, let them click to continue.
    if (showAccountChooser && isActiveSession) return;
    // If chooser was dismissed (Use another account / Sign in form open), don't auto-redirect either.
    if (showEmailForm || !showAccountChooser) return;
    navigate(getPostAuthDestination('/dashboard'));
  }, [authLoading, isAuthenticated, isRegistering, showAccountChooser, isActiveSession, showEmailForm, navigate]);

  const handleGoogle = () => {
    setLoading('google');
    loginWithGoogle();
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newDigits = pasted.split('');
      setOtpDigits(newDigits);
      otpRefs.current[5]?.focus();
    }
  };

  const handleVerify2FA = async () => {
    const code = otpDigits.join('');
    if (code.length !== 6) { toast.error('Please enter the full 6-digit code'); return; }
    setLoading('2fa');
    try {
      await verify2FA(twoFAState.user_id, code);
      navigate(getPostAuthDestination('/dashboard'));
    } catch (err) {
      toast.error(err.message);
      setOtpDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(null);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error('Please fill in all fields'); return; }
    if (mode === 'register' && !form.name) { toast.error('Please enter your name'); return; }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setLoading('email');
    try {
      if (mode === 'register') {
        setIsRegistering(true);
        await registerWithEmail(form.name, form.email, form.password);
        toast.success('Account created! Your 14-day free trial has started.');
        // Fresh signup → land on dashboard to start using the free trial.
        // (Paid-plan selection now happens from inside the app.)
        navigate('/dashboard');
        return;
      } else {
        const result = await loginWithEmail(form.email, form.password);
        if (result.requires_2fa) {
          setTwoFAState(result);
          if (result.email_sent) {
            toast.success(`Code sent to ${result.email_hint}`);
          } else {
            toast.info(`Code generated — check ${result.email_hint}. If it doesn't arrive, use "Re-send".`, { duration: 6000 });
          }
          return;
        }
        navigate(getPostAuthDestination('/dashboard'));
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(null);
    }
  };

  const resetForms = () => {
    setShowEmailForm(false);
  };

  return (
    <div className="min-h-screen bg-[#050507] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <CanvasRevealEffect
          animationSpeed={3}
          containerClassName="bg-[#050507]"
          colors={[[255, 255, 255], [255, 255, 255]]}
          dotSize={6}
          reverse={false}
        />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, rgba(5,5,7,0.95) 0%, transparent 70%)' }} />
        <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#050507] to-transparent" />
      </div>

      <button onClick={() => navigate('/')} className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors z-10" data-testid="back-to-home">
        <ArrowLeft className="w-4 h-4" /><span className="text-sm">Home</span>
      </button>

      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        <div className="flex items-center justify-center mb-8">
          <div className="h-8 overflow-hidden">
            <img src="/inflow-logo.png?v=6" alt="InFlow" className="h-full w-auto object-contain" />
          </div>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8 backdrop-blur-2xl shadow-2xl shadow-black/40">
          {authLoading ? (
            <div className="flex items-center justify-center py-12" data-testid="auth-loading">
              <Loader2 className="w-6 h-6 animate-spin text-white/70" />
            </div>
          ) : twoFAState ? (
            /* 2FA Verification Step */
            <div data-testid="2fa-verify-form">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-white text-center mb-1" style={{ fontFamily: 'Outfit' }}>
                Verify your identity
              </h2>
              <p className="text-zinc-400 text-sm text-center mb-6">
                We sent a 6-digit code to <span className="text-zinc-300">{twoFAState.email_hint}</span>
              </p>

              <div className="flex justify-center gap-2 mb-6" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => otpRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="w-11 h-13 text-center text-xl font-mono font-bold bg-white/[0.04] border border-white/10 rounded-lg text-white focus:border-white/40 focus:ring-1 focus:ring-white/20 outline-none transition-colors backdrop-blur-sm"
                    data-testid={`otp-input-${i}`}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <Button
                className="w-full bg-white/10 text-white hover:bg-white/20 font-medium h-11"
                onClick={handleVerify2FA}
                disabled={loading === '2fa' || otpDigits.join('').length < 6}
                data-testid="verify-2fa-btn"
              >
                {loading === '2fa' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verify & Sign In
              </Button>

              <button
                className="w-full text-xs text-zinc-500 hover:text-zinc-300 mt-3 transition-colors"
                onClick={async () => {
                  try {
                    const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/2fa/resend`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ user_id: twoFAState.user_id }),
                    });
                    const d = await res.json();
                    if (res.ok && d.email_sent) toast.success(`Code re-sent to ${twoFAState.email_hint}`);
                    else toast.error(d.detail || 'Failed to re-send code');
                  } catch {
                    toast.error('Failed to re-send code');
                  }
                }}
                data-testid="resend-2fa-btn"
              >
                Didn't get the code? Re-send
              </button>

              <button
                className="w-full text-zinc-500 hover:text-zinc-300 text-sm mt-3 transition-colors"
                onClick={() => { setTwoFAState(null); setOtpDigits(['', '', '', '', '', '']); }}
                data-testid="back-to-login-btn"
              >
                Back to sign in
              </button>
            </div>
          ) : showAccountChooser && savedAccount ? (
            /* Account Chooser (Google-style) */
            <AccountChooser
              savedAccount={savedAccount}
              isActiveSession={isActiveSession}
              onSelectAccount={() => {
                if (isActiveSession) {
                  // One-click sign-in: session cookie still valid, go straight to dashboard
                  // (or to a pending checkout if the user was mid-purchase before login).
                  navigate(getPostAuthDestination('/dashboard'));
                  return;
                }
                setShowAccountChooser(false);
                setMode('login');
                setForm({ ...form, email: savedAccount.email });
                setShowEmailForm(true);
              }}
              onUseAnother={() => {
                setShowAccountChooser(false);
                setMode('login');
                setForm({ name: '', email: '', password: '' });
              }}
            />
          ) : (
          <>
          <h2 className="text-xl font-semibold text-white text-center mb-1" style={{ fontFamily: 'Outfit' }}>
            {mode === 'register' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-zinc-400 text-sm text-center mb-6">
            {mode === 'register' ? 'Start optimizing your revenue' : 'Sign in to your account'}
          </p>

          {!showEmailForm ? (
            <div className="space-y-3">
              <Button className="w-full bg-white hover:bg-zinc-100 text-zinc-900 font-medium h-11 gap-3" onClick={handleGoogle} disabled={loading === 'google'} data-testid="auth-google-btn">
                {loading === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Continue with Google
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                <div className="relative flex justify-center text-xs"><span className="px-3 text-zinc-500">or</span></div>
              </div>

              <Button className="w-full bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 font-medium h-11 gap-3 border border-white/10 backdrop-blur-sm" onClick={() => setShowEmailForm(true)} data-testid="auth-email-btn">
                <Mail className="w-5 h-5" />
                Continue with Email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <button type="button" onClick={resetForms} className="text-zinc-400 hover:text-white text-sm flex items-center gap-1 mb-2 transition-colors">
                <ArrowLeft className="w-3 h-3" /> Back to options
              </button>
              {mode === 'register' && (
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Full Name</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" className="bg-white/[0.04] border-white/10 text-white placeholder:text-zinc-500 h-11 backdrop-blur-sm focus-visible:ring-white/20" data-testid="auth-name-input" />
                </div>
              )}
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" className="bg-white/[0.04] border-white/10 text-white placeholder:text-zinc-500 h-11 backdrop-blur-sm focus-visible:ring-white/20" data-testid="auth-email-input" />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Password</label>
                <div className="relative">
                  <Input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" className="bg-white/[0.04] border-white/10 text-white placeholder:text-zinc-500 h-11 pr-10 backdrop-blur-sm focus-visible:ring-white/20" data-testid="auth-password-input" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full bg-white/10 text-white hover:bg-white/20 h-11 font-medium" disabled={loading === 'email'} data-testid="auth-submit-btn">
                {loading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'register' ? 'Create Account' : 'Sign In'}
              </Button>
            </form>
          )}

          <p className="text-sm text-zinc-400 text-center mt-6">
            {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); resetForms(); }} className="text-white hover:text-zinc-300 font-medium transition-colors underline underline-offset-2" data-testid="auth-toggle-mode">
              {mode === 'register' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
          </>
          )}
        </div>

        <p className="text-xs text-zinc-600 text-center mt-6">By continuing, you agree to our <a href="/terms" className="text-zinc-500 hover:text-zinc-400 underline underline-offset-2">Terms of Service</a> and <a href="/privacy" className="text-zinc-500 hover:text-zinc-400 underline underline-offset-2">Privacy Policy</a>.</p>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
};

export default AuthPage;
