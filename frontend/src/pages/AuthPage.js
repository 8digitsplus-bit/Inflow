import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Loader2, Eye, EyeOff, ShieldCheck, User, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const AccountChooser = ({ savedAccount, onSelectAccount, onUseAnother, isActiveSession }) => {
  const initials = savedAccount.name
    ? savedAccount.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : savedAccount.email[0].toUpperCase();

  return (
    <div className="w-full" data-testid="account-chooser">
      <h2 className="text-2xl font-semibold text-white mb-1 text-center">Choose an account</h2>
      <p className="text-gray-400 text-sm text-center mb-6">to continue to InFlow</p>

      <button
        onClick={onSelectAccount}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 transition-all duration-200 group"
        data-testid="saved-account-card"
      >
        <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0 relative">
          <span className="text-sm font-semibold text-white">{initials}</span>
          {isActiveSession && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#121212] flex items-center justify-center" data-testid="active-session-dot">
              <CheckCircle2 className="w-2 h-2 text-white" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-white truncate">{savedAccount.name || 'User'}</p>
          <p className="text-xs text-gray-400 truncate">{savedAccount.email}</p>
          {isActiveSession && (
            <p className="text-[10px] text-emerald-400 mt-0.5 font-medium">Signed in · click to continue</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors shrink-0" />
      </button>

      <button
        onClick={onUseAnother}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-white/10 transition-all duration-200 mt-2 group"
        data-testid="use-another-account-btn"
      >
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-gray-400" />
        </div>
        <span className="text-sm text-gray-400 group-hover:text-gray-200 transition-colors">Use another account</span>
      </button>
    </div>
  );
};

const AuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isLoginMode = searchParams.get('mode') === 'login';
  const { loginWithGoogle, loginWithEmail, registerWithEmail, verify2FA, isAuthenticated, user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState(isLoginMode || localStorage.getItem('inflow_last_account') ? 'login' : 'register');
  const [loading, setLoading] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [twoFAState, setTwoFAState] = useState(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  // Guard against a corrupt localStorage value so an unguarded JSON.parse can't
  // crash the app during render and lock the user out of login.
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

  const isActiveSession = !!(isAuthenticated && user && savedAccount && user.email === savedAccount.email);

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

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || isRegistering) return;
    if (showAccountChooser && isActiveSession) return;
    if (!showAccountChooser) return;
    navigate(getPostAuthDestination('/dashboard'));
  }, [authLoading, isAuthenticated, isRegistering, showAccountChooser, isActiveSession, navigate]);

  const handleGoogle = () => {
    setLoading('google');
    loginWithGoogle();
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
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
      setOtpDigits(pasted.split(''));
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
    setError('');
    if (!form.email || !form.password) { setError('Please enter both email and password.'); return; }
    if (mode === 'register' && !form.name) { setError('Please enter your name.'); return; }
    if (!validateEmail(form.email)) { setError('Please enter a valid email address.'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading('email');
    try {
      if (mode === 'register') {
        setIsRegistering(true);
        await registerWithEmail(form.name, form.email, form.password);
        toast.success('Account created! Your 14-day free trial has started.');
        navigate('/dashboard');
        return;
      }
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'register' ? 'login' : 'register');
    setError('');
  };

  const inputClass = 'w-full px-5 py-3 rounded-xl bg-white/10 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 transition';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 28%, #17171b 0%, #08080a 60%, #050507 100%)' }}>
      <button onClick={() => navigate('/')} className="absolute top-6 left-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors z-20" data-testid="back-to-home">
        <ArrowLeft className="w-4 h-4" /><span className="text-sm">Home</span>
      </button>

      {/* Glass card */}
      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-gradient-to-r from-[#ffffff10] to-[#121212] backdrop-blur-sm border border-white/10 shadow-2xl p-8 flex flex-col items-center animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <div className="h-7 overflow-hidden">
            <img src="/inflow-logo.png?v=6" alt="InFlow" className="h-full w-auto object-contain" />
          </div>
        </div>

        {authLoading ? (
          <div className="flex items-center justify-center py-10 w-full" data-testid="auth-loading">
            <Loader2 className="w-6 h-6 animate-spin text-white/70" />
          </div>
        ) : twoFAState ? (
          /* 2FA Verification */
          <div className="w-full" data-testid="2fa-verify-form">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-white text-center mb-1">Verify your identity</h2>
            <p className="text-gray-400 text-sm text-center mb-6">
              We sent a 6-digit code to <span className="text-gray-200">{twoFAState.email_hint}</span>
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
                  className="w-11 h-12 text-center text-xl font-mono font-bold bg-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/30 transition"
                  data-testid={`otp-input-${i}`}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            <button
              className="w-full bg-white/10 text-white font-medium px-5 py-3 rounded-full shadow hover:bg-white/20 transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              onClick={handleVerify2FA}
              disabled={loading === '2fa' || otpDigits.join('').length < 6}
              data-testid="verify-2fa-btn"
            >
              {loading === '2fa' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify & Sign In
            </button>

            <button
              className="w-full text-xs text-gray-500 hover:text-gray-300 mt-3 transition-colors"
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
              className="w-full text-gray-500 hover:text-gray-300 text-sm mt-3 transition-colors"
              onClick={() => { setTwoFAState(null); setOtpDigits(['', '', '', '', '', '']); }}
              data-testid="back-to-login-btn"
            >
              Back to sign in
            </button>
          </div>
        ) : showAccountChooser && savedAccount ? (
          <AccountChooser
            savedAccount={savedAccount}
            isActiveSession={isActiveSession}
            onSelectAccount={() => {
              if (isActiveSession) {
                navigate(getPostAuthDestination('/dashboard'));
                return;
              }
              setShowAccountChooser(false);
              setMode('login');
              setForm({ ...form, email: savedAccount.email });
            }}
            onUseAnother={() => {
              setShowAccountChooser(false);
              setMode('login');
              setForm({ name: '', email: '', password: '' });
            }}
          />
        ) : (
          <>
            <h2 className="text-2xl font-semibold text-white mb-1 text-center">
              {mode === 'register' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-gray-400 text-sm text-center mb-6">
              {mode === 'register' ? 'Start optimizing your revenue' : 'Sign in to your account'}
            </p>

            <form onSubmit={handleEmailSubmit} className="flex flex-col w-full gap-4">
              <div className="w-full flex flex-col gap-3">
                {mode === 'register' && (
                  <input
                    placeholder="Full name"
                    type="text"
                    value={form.name}
                    className={inputClass}
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(''); }}
                    data-testid="auth-name-input"
                  />
                )}
                <input
                  placeholder="Email"
                  type="email"
                  value={form.email}
                  className={inputClass}
                  onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(''); }}
                  data-testid="auth-email-input"
                />
                <div className="relative">
                  <input
                    placeholder="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    className={`${inputClass} pr-12`}
                    onChange={(e) => { setForm({ ...form, password: e.target.value }); setError(''); }}
                    data-testid="auth-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && (
                  <div className="text-sm text-red-400 text-left" data-testid="auth-error">{error}</div>
                )}
              </div>

              <hr className="border-white/10" />

              <div>
                <button
                  type="submit"
                  disabled={loading === 'email'}
                  className="w-full bg-white/10 text-white font-medium px-5 py-3 rounded-full shadow hover:bg-white/20 transition mb-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  data-testid="auth-submit-btn"
                >
                  {loading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {mode === 'register' ? 'Create account' : 'Sign in'}
                </button>

                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={loading === 'google'}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-[#232526] to-[#2d2e30] rounded-full px-5 py-3 font-medium text-white shadow hover:brightness-110 transition mb-2 text-sm disabled:opacity-50"
                  data-testid="auth-google-btn"
                >
                  {loading === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
                  Continue with Google
                </button>

                <div className="w-full text-center mt-2">
                  <span className="text-xs text-gray-400">
                    {mode === 'register' ? 'Already have an account? ' : "Don't have an account? "}
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="underline text-white/80 hover:text-white"
                      data-testid="auth-toggle-mode"
                    >
                      {mode === 'register' ? 'Sign in' : "Sign up, it's free!"}
                    </button>
                  </span>
                </div>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Social proof */}
      <div className="relative z-10 mt-10 flex flex-col items-center text-center">
        <p className="text-gray-400 text-sm mb-3">
          Join <span className="font-medium text-white">thousands</span> of revenue teams already using InFlow.
        </p>
        <div className="flex -space-x-2">
          {[
            'https://cdn.21st.dev/assets/mirror/a6/a634d4f02fe5b77804943c1d74b8d70e35ffe26454e0e9af9717432a2c72bfde.jpg',
            'https://cdn.21st.dev/assets/mirror/d8/d8dab29a5736d5c2b0084d720d3db02c785560071609be501541922928fdf831.jpg',
            'https://cdn.21st.dev/assets/mirror/d1/d1a3e08d4e37d6ee2b7de1db8df87c1dc7acd8ffb004caaf980917de518a60c9.jpg',
            'https://cdn.21st.dev/assets/mirror/f0/f07b84f12ef125cbb837a7bd64da401992f5f62bd55fee10d01cd3dcc8abae80.jpg',
          ].map((src, i) => (
            <img key={i} src={src} alt="user" className="w-8 h-8 rounded-full border-2 border-[#050507] object-cover" />
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center mt-8 relative z-10 max-w-sm">
        By continuing, you agree to our <a href="/terms" className="text-gray-500 hover:text-gray-400 underline underline-offset-2">Terms of Service</a> and <a href="/privacy" className="text-gray-500 hover:text-gray-400 underline underline-offset-2">Privacy Policy</a>.
      </p>

      <Toaster position="top-right" richColors />
    </div>
  );
};

export default AuthPage;
