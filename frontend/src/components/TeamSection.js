import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import {
  Users, Mail, Copy, Check, UserPlus, Loader2, Trash2, ShieldCheck, Crown, Clock
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function TeamSection() {
  const { user } = useAuth();
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [seats, setSeats] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [o, m, s, i] = await Promise.all([
        fetch(`${API_URL}/api/org/me`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch(`${API_URL}/api/org/members`, { credentials: 'include' }).then(r => r.ok ? r.json() : { members: [] }),
        fetch(`${API_URL}/api/org/seats`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch(`${API_URL}/api/org/invites`, { credentials: 'include' }).then(r => r.ok ? r.json() : { invites: [] }),
      ]);
      setOrg(o);
      setMembers(m.members || []);
      setSeats(s);
      setInvites(i.invites || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const isOwner = org?.role === 'owner';
  const isEnterprise = seats?.is_enterprise;

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`${API_URL}/api/org/invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Invite failed');
        return;
      }
      if (data.email_sent) {
        toast.success(`Invite email sent to ${data.email}`);
      } else {
        // Email not configured — let owner copy the link
        navigator.clipboard.writeText(data.accept_url).catch(() => {});
        toast.success('Invite link copied to clipboard (email not configured yet)', { duration: 6000 });
      }
      setInviteEmail('');
      loadAll();
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId, name) => {
    if (!window.confirm(`Remove ${name} from your team? They will lose access immediately.`)) return;
    const res = await fetch(`${API_URL}/api/org/members/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.detail || 'Remove failed');
      return;
    }
    toast.success(`${name} removed from the team`);
    loadAll();
  };

  const handleRevoke = async (inviteId) => {
    const res = await fetch(`${API_URL}/api/org/invites/${inviteId}/revoke`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      toast.success('Invite revoked');
      loadAll();
    }
  };

  const copyAcceptUrl = async (invite) => {
    // We don't store the token client-side — fetch a fresh one by calling invite again?
    // For now, show the accept_url that came back when the invite was created.
    // (Since the endpoint does not expose the token after creation, revoke + re-invite if needed.)
    toast.info('To re-copy the link, revoke this invite and send a new one.', { duration: 5000 });
  };

  if (loading) {
    return (
      <Card className="bg-zinc-950/50 border-white/10" data-testid="team-section">
        <CardContent className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500 mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-950/50 border-white/10" data-testid="team-section">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
          <Users className="w-5 h-5 text-slate-400" />
          Team
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Org header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-white/[0.06]">
          <div>
            <p className="text-sm text-zinc-300 font-medium">{org?.name}</p>
            <p className="text-xs text-zinc-500 capitalize">
              {org?.subscription_tier?.replace('_', ' ') || 'trial'}
              {seats?.unlimited
                ? ` · ${seats?.members} member${seats?.members === 1 ? '' : 's'} · unlimited seats`
                : ` · ${seats?.members}/${seats?.seats} seats used`}
            </p>
          </div>
          {isEnterprise && (
            <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 text-xs font-medium" data-testid="unlimited-seats-badge">
              Unlimited seats
            </span>
          )}
        </div>

        {/* Gating message for non-Enterprise */}
        {!isEnterprise && (
          <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/5 to-slate-500/5 border border-purple-500/20">
            <div className="flex items-start gap-3">
              <Crown className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-white mb-1">Team collaboration is an Enterprise feature</h4>
                <p className="text-xs text-zinc-400 mb-3">
                  Invite teammates, share deals and integrations, and collaborate on AI-powered revenue intelligence.
                  Enterprise is $400/month — flat rate, unlimited team members.
                </p>
                <Button
                  size="sm"
                  onClick={() => window.location.assign('/choose-plan')}
                  className="bg-white/10 hover:bg-white/20 text-xs h-8"
                  data-testid="upgrade-for-team-btn"
                >
                  Upgrade to Enterprise
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Invite form — owner + enterprise only */}
        {isOwner && isEnterprise && (
          <form onSubmit={handleInvite} className="space-y-2" data-testid="invite-form">
            <label className="text-xs font-medium text-zinc-400">Invite by email</label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter teammate's email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                disabled={inviting || seats?.available <= 0}
                className="flex-1 bg-zinc-900/50 border-zinc-800 text-sm"
                data-testid="invite-email-input"
              />
              <Button
                type="submit"
                disabled={inviting || seats?.available <= 0 || !inviteEmail.trim()}
                className="bg-white/10 hover:bg-white/20 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="send-invite-btn"
              >
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <><UserPlus className="w-4 h-4 mr-1.5" />Send invite</>
                )}
              </Button>
            </div>
            {seats?.available <= 0 ? (
              <p className="text-xs text-amber-400">All seats are filled. Add more seats from the plan page to invite more teammates.</p>
            ) : !inviteEmail.trim() ? (
              <p className="text-xs text-zinc-500">Type an email above, then click Send invite.</p>
            ) : null}
          </form>
        )}

        {/* Members list */}
        <div className="space-y-2" data-testid="members-list">
          <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Members ({members.length})
          </h4>
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/30 border border-white/[0.04] hover:border-white/[0.08] transition-colors"
              data-testid={`member-${m.user_id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-slate-600/20 text-slate-300 flex items-center justify-center text-xs font-semibold shrink-0">
                  {m.name?.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() || m.email[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate flex items-center gap-1.5">
                    {m.name}
                    {m.role === 'owner' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 text-[10px] font-medium">
                        <Crown className="w-2.5 h-2.5" /> Owner
                      </span>
                    )}
                    {m.user_id === user?.user_id && (
                      <span className="text-[10px] text-zinc-500">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{m.email}</p>
                </div>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button
                  onClick={() => handleRemove(m.user_id, m.name)}
                  className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                  data-testid={`remove-member-${m.user_id}-btn`}
                  title="Remove from team"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Pending invites — owner only */}
        {isOwner && invites.length > 0 && (
          <div className="space-y-2" data-testid="pending-invites">
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Pending invites ({invites.length})
            </h4>
            {invites.map((inv) => (
              <div
                key={inv.invite_id}
                className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/15"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{inv.email}</p>
                    <p className="text-xs text-zinc-500">Invite pending · expires {new Date(inv.expires_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(inv.invite_id)}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-2"
                  data-testid={`revoke-invite-${inv.invite_id}-btn`}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Member-role note */}
        {!isOwner && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-500/5 border border-slate-500/15">
            <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400">
              You're a <span className="text-slate-400 font-medium">member</span> of this team. You have read access to deals, pipeline, and integrations, and can run AI analyses. Only the owner can edit data or manage billing.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
