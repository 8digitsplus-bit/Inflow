import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Loader2, Users, AlertCircle, CheckCircle2, LogOut, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/org/invite/${token}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(data.detail || 'Invite not found');
        } else {
          setInvite(data);
        }
      } catch {
        if (active) setError('Failed to load invite');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token]);

  const handleJoinAsExistingUser = async () => {
    setJoining(true);
    try {
      const res = await fetch(`${API_URL}/api/org/accept-invite/${token}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Failed to join');
        return;
      }
      toast.success(`Joined ${data.org_name}`);
      if (refreshUser) await refreshUser();
      navigate('/dashboard');
    } finally {
      setJoining(false);
    }
  };

  const handleSignupAndJoin = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setJoining(true);
    try {
      const res = await fetch(`${API_URL}/api/org/signup-and-accept/${token}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Signup failed');
        return;
      }
      toast.success(`Welcome to ${data.org_name}!`);
      if (refreshUser) await refreshUser();
      navigate('/dashboard');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center px-4">
        <Toaster position="top-center" richColors />
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>
            Invite unavailable
          </h1>
          <p className="text-zinc-400 text-sm mb-6">{error}</p>
          <Button onClick={() => navigate('/')} className="bg-zinc-800 hover:bg-zinc-700" data-testid="invite-go-home-btn">
            Go to homepage
          </Button>
        </div>
      </div>
    );
  }

  const loggedInAsDifferentEmail = user && user.email?.toLowerCase() !== invite.email?.toLowerCase();
  const loggedInAsInvitee = user && user.email?.toLowerCase() === invite.email?.toLowerCase();

  return (
    <div className="min-h-screen bg-[#050507] flex items-center justify-center px-4 py-12 relative">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <Toaster position="top-center" richColors />

      <div className="relative z-10 max-w-md w-full">
        <div className="text-center mb-8">
          <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-6 mx-auto mb-6" />
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-5">
            <Users className="w-7 h-7 text-indigo-400" />
          </div>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">You've been invited</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>
            Join {invite.org_name}
          </h1>
          <p className="text-zinc-400 text-sm">
            <span className="text-zinc-300">{invite.inviter_name}</span> invited <span className="text-zinc-300">{invite.email}</span> to collaborate on InFlow.
          </p>
          {invite.subscription_tier?.startsWith('enterprise') && (
            <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs">
              <Crown className="w-3 h-3" />
              Enterprise plan
            </div>
          )}
        </div>

        <div className="bg-zinc-950/60 border border-white/[0.06] rounded-2xl p-6">
          {/* Logged in as correct user — one-click accept */}
          {loggedInAsInvitee && (
            <div className="text-center" data-testid="accept-logged-in">
              <p className="text-sm text-zinc-300 mb-1">Signed in as</p>
              <p className="text-white font-medium mb-5">{user.email}</p>
              <Button
                onClick={handleJoinAsExistingUser}
                disabled={joining}
                className="w-full bg-indigo-600 hover:bg-indigo-500 h-11"
                data-testid="accept-invite-btn"
              >
                {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : `Accept and join ${invite.org_name}`}
              </Button>
            </div>
          )}

          {/* Logged in as someone else — force switch */}
          {loggedInAsDifferentEmail && (
            <div className="text-center space-y-3" data-testid="accept-wrong-user">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-sm text-amber-300">
                  This invitation was sent to <span className="font-medium">{invite.email}</span>, but you're signed in as <span className="font-medium">{user.email}</span>.
                </p>
              </div>
              <Button
                onClick={async () => { await logout(); }}
                variant="outline"
                className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                data-testid="switch-account-btn"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out and continue as {invite.email}
              </Button>
            </div>
          )}

          {/* Not logged in — signup form */}
          {!user && (
            <form onSubmit={handleSignupAndJoin} className="space-y-4" data-testid="accept-signup-form">
              <p className="text-xs text-zinc-500 mb-2">Create your InFlow account</p>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Email</label>
                <Input value={invite.email} disabled className="bg-zinc-900/50 border-zinc-800 text-zinc-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Full name</label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Jane Doe"
                  className="bg-zinc-900/50 border-zinc-800"
                  data-testid="signup-name-input"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Create password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  className="bg-zinc-900/50 border-zinc-800"
                  data-testid="signup-password-input"
                />
              </div>
              <Button
                type="submit"
                disabled={joining || !name.trim() || password.length < 6}
                className="w-full bg-indigo-600 hover:bg-indigo-500 h-11"
                data-testid="signup-and-join-btn"
              >
                {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : `Create account and join`}
              </Button>
            </form>
          )}
        </div>

        <p className="text-[11px] text-zinc-600 text-center mt-5">
          By joining, you'll have read access to team deals, integrations, and AI analytics.
          Only the team owner can edit data or manage billing.
        </p>
      </div>
    </div>
  );
}
