import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Zap, ArrowLeft, Mail, Loader2, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const MicrosoftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 21 21">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
);

const AuthPage = () => {
  const navigate = useNavigate();
  const { loginWithGoogle, loginWithEmail, registerWithEmail, loginWithMicrosoft, isAuthenticated } = useAuth();
  const [mode, setMode] = useState('login');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [loading, setLoading] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [isRegistering, setIsRegistering] = useState(false);

  // Only redirect if already authenticated and NOT in the middle of registering
  if (isAuthenticated && !isRegistering) {
    navigate('/dashboard');
    return null;
  }

  const handleGoogle = () => {
    setLoading('google');
    loginWithGoogle();
  };

  const handleMicrosoft = async () => {
    setLoading('microsoft');
    try {
      await loginWithMicrosoft();
    } catch (err) {
      toast.error(err.message || 'Microsoft login not available yet');
      setLoading(null);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error('Please fill in all fields');
      return;
    }
    if (mode === 'register' && !form.name) {
      toast.error('Please enter your name');
      return;
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading('email');
    try {
      if (mode === 'register') {
        setIsRegistering(true);
        await registerWithEmail(form.name, form.email, form.password);
        toast.success('Account created!');
        navigate('/onboarding');
        return;
      } else {
        await loginWithEmail(form.email, form.password);
        navigate('/dashboard');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors z-10"
        data-testid="back-to-home"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm">Home</span>
      </button>

      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Vector</span>
        </div>

        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-8 backdrop-blur-xl">
          <h2 className="text-xl font-semibold text-white text-center mb-1" style={{ fontFamily: 'Outfit' }}>
            {mode === 'register' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-zinc-400 text-sm text-center mb-6">
            {mode === 'register' ? 'Start optimizing your revenue' : 'Sign in to your account'}
          </p>

          {!showEmailForm ? (
            <div className="space-y-3">
              {/* Google */}
              <Button
                className="w-full bg-white hover:bg-zinc-100 text-zinc-900 font-medium h-11 gap-3"
                onClick={handleGoogle}
                disabled={loading === 'google'}
                data-testid="auth-google-btn"
              >
                {loading === 'google' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Continue with Google
              </Button>

              {/* Microsoft */}
              <Button
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium h-11 gap-3 border border-zinc-700"
                onClick={handleMicrosoft}
                disabled={loading === 'microsoft'}
                data-testid="auth-microsoft-btn"
              >
                {loading === 'microsoft' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MicrosoftIcon />
                )}
                Continue with Microsoft
              </Button>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-zinc-900/60 px-3 text-zinc-500">or</span>
                </div>
              </div>

              {/* Email */}
              <Button
                className="w-full bg-transparent hover:bg-zinc-800 text-zinc-300 font-medium h-11 gap-3 border border-zinc-700"
                onClick={() => setShowEmailForm(true)}
                data-testid="auth-email-btn"
              >
                <Mail className="w-5 h-5" />
                Continue with Email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <button
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="text-zinc-400 hover:text-white text-sm flex items-center gap-1 mb-2 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Back to options
              </button>

              {mode === 'register' && (
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Full Name</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="John Doe"
                    className="bg-zinc-800 border-zinc-700 text-white h-11"
                    data-testid="auth-name-input"
                  />
                </div>
              )}

              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@company.com"
                  className="bg-zinc-800 border-zinc-700 text-white h-11"
                  data-testid="auth-email-input"
                />
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min. 6 characters"
                    className="bg-zinc-800 border-zinc-700 text-white h-11 pr-10"
                    data-testid="auth-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 btn-glow h-11 font-medium"
                disabled={loading === 'email'}
                data-testid="auth-submit-btn"
              >
                {loading === 'email' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : mode === 'register' ? (
                  'Create Account'
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          )}

          <p className="text-sm text-zinc-400 text-center mt-6">
            {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setShowEmailForm(false); }}
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              data-testid="auth-toggle-mode"
            >
              {mode === 'register' ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>

        <p className="text-xs text-zinc-600 text-center mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  );
};

export default AuthPage;
