import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Mail, Loader2, Eye, EyeOff, ShieldCheck, User, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const AccountChooser = ({ savedAccount, onSelectAccount, onUseAnother }) => {
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
        className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all duration-200 group"
        data-testid="saved-account-card"
      >
        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
          <span className="text-sm font-semibold text-indigo-300">{initials}</span>
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-medium text-white truncate">{savedAccount.name || 'User'}</p>
          <p className="text-xs text-zinc-500 truncate">{savedAccount.email}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
      </button>

      <button
        onClick={onUseAnother}
        className="w-full flex items-center gap-3 p-4 rounded-xl hover:bg-white/[0.04] transition-all duration-200 mt-2 group"
        data-testid="use-another-account-btn"
      >
        <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
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
  const { loginWithGoogle, loginWithEmail, registerWithEmail, verify2FA, isAuthenticated } = useAuth();
  const [mode, setMode] = useState(isLoginMode ? 'login' : 'register');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [loading, setLoading] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [isRegistering, setIsRegistering] = useState(false);
  const [twoFAState, setTwoFAState] = useState(null);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);

  // Account chooser state
  const savedAccountRaw = localStorage.getItem('inflow_last_account');
  const savedAccount = savedAccountRaw ? JSON.parse(savedAccountRaw) : null;
  const [showAccountChooser, setShowAccountChooser] = useState(isLoginMode && !!savedAccount);

  if (isAuthenticated && !isRegistering) {
    navigate('/dashboard');
    return null;
  }

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
      navigate('/dashboard');
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
        toast.success('Account created!');
        navigate(isTrial ? '/onboarding' : '/choose-plan');
        return;
      } else {
        const result = await loginWithEmail(form.email, form.password);
        if (result.requires_2fa) {
          setTwoFAState(result);
          toast.info(`Verification code: ${result.otp_code_debug}`, { duration: 15000 });
          return;
        }
        navigate('/dashboard');
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
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      <button onClick={() => navigate('/')} className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors z-10" data-testid="back-to-home">
        <ArrowLeft className="w-4 h-4" /><span className="text-sm">Home</span>
      </button>

      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        <div className="flex items-center justify-center mb-8">
          <div className="h-8 overflow-hidden">
            <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-full w-auto object-contain" />
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
          {twoFAState ? (
            /* 2FA Verification Step */
            <div data-testid="2fa-verify-form">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-indigo-400" />
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
                    className="w-11 h-13 text-center text-xl font-mono font-bold bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
                    data-testid={`otp-input-${i}`}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium h-11"
                onClick={handleVerify2FA}
                disabled={loading === '2fa' || otpDigits.join('').length < 6}
                data-testid="verify-2fa-btn"
              >
                {loading === '2fa' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verify & Sign In
              </Button>

              <button
                className="w-full text-zinc-500 hover:text-zinc-300 text-sm mt-4 transition-colors"
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
              onSelectAccount={() => {
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
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-zinc-900/60 px-3 text-zinc-500">or</span></div>
              </div>

              <Button className="w-full bg-transparent hover:bg-zinc-800 text-zinc-300 font-medium h-11 gap-3 border border-zinc-700" onClick={() => setShowEmailForm(true)} data-testid="auth-email-btn">
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
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" className="bg-zinc-800 border-zinc-700 text-white h-11" data-testid="auth-name-input" />
                </div>
              )}
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" className="bg-zinc-800 border-zinc-700 text-white h-11" data-testid="auth-email-input" />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Password</label>
                <div className="relative">
                  <Input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" className="bg-zinc-800 border-zinc-700 text-white h-11 pr-10" data-testid="auth-password-input" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 btn-glow h-11 font-medium" disabled={loading === 'email'} data-testid="auth-submit-btn">
                {loading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'register' ? 'Create Account' : 'Sign In'}
              </Button>
            </form>
          )}

          <p className="text-sm text-zinc-400 text-center mt-6">
            {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); resetForms(); }} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors" data-testid="auth-toggle-mode">
              {mode === 'register' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
          </>
          )}
        </div>

        <p className="text-xs text-zinc-600 text-center mt-6">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
};

export default AuthPage;
