import { useEffect, useState } from 'react';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { resetProdfixUser } from '../../lib/prodfix';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const call = async (path, opts = {}) => {
  const res = await fetch(`${API_URL}/api${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
  return data;
};

const CONSEQUENCES = (days) => [
  "You'll be signed out on every device.",
  'Your subscription is cancelled straight away, with no refund for the rest of the billing period.',
  `Sign back in within ${days} days to restore your account. You'll need to choose a plan again.`,
  `After ${days} days your account, workspace and all data stored in InFlow are permanently deleted. Your connected tools (CRM, Stripe, accounting) aren't touched.`,
];

const DeleteAccountDialog = ({ open, onOpenChange, info }) => {
  const [secret, setSecret] = useState('');
  const [confirm, setConfirm] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(null);

  const sendCode = async () => {
    setBusy('code');
    try {
      const d = await call('/account/delete/code', { method: 'POST' });
      setCodeSent(true);
      toast.success(`Code sent to ${d.email_hint}`);
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  const submit = async () => {
    setBusy('delete');
    try {
      const d = await call('/account/delete', {
        method: 'POST',
        body: JSON.stringify({ confirm, ...(info.has_password ? { password: secret } : { code: secret }) }),
      });
      ['inflow_authed', 'inflow_last_account'].forEach((k) => localStorage.removeItem(k));
      resetProdfixUser();
      window.location.href = `/auth?mode=login&deleted=${encodeURIComponent(d.purge_at)}`;
    } catch (e) { toast.error(e.message); setBusy(null); }
  };

  const ready = confirm.trim().toUpperCase() === 'DELETE' && secret.trim() && (info.has_password || codeSent);
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-lg" data-testid="delete-account-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400" /> Delete your account?</DialogTitle>
          <DialogDescription className="text-zinc-400">Here's what happens next:</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm text-zinc-300 list-disc pl-5" data-testid="delete-account-consequences">
          {CONSEQUENCES(info.grace_days).map((c) => <li key={c}>{c}</li>)}
        </ul>
        <div className="space-y-4 pt-2">
          {info.has_password ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">Enter your password to confirm</Label>
              <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password"
                className="bg-black/40 border-white/10 text-white" data-testid="delete-account-password-input" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-300">We'll email a code to {info.email_hint} to confirm it's you</Label>
              <div className="flex gap-2">
                <Input value={secret} onChange={(e) => setSecret(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" inputMode="numeric"
                  className="bg-black/40 border-white/10 text-white" data-testid="delete-account-code-input" />
                <Button type="button" variant="outline" onClick={sendCode} disabled={!!busy}
                  className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10" data-testid="delete-account-send-code-btn">
                  {busy === 'code' && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}{codeSent ? 'Resend' : 'Email me a code'}
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Type <span className="font-mono text-red-300">DELETE</span> to confirm</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="bg-black/40 border-white/10 text-white" data-testid="delete-account-confirm-input" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy} className="text-zinc-300" data-testid="delete-account-cancel-btn">Keep my account</Button>
          <Button onClick={submit} disabled={!ready || !!busy} className="bg-red-600 hover:bg-red-500 text-white" data-testid="delete-account-submit-btn">
            {busy === 'delete' && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />} Delete my account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const DeleteAccountCard = ({ className }) => {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { call('/account/deletion').then(setInfo).catch(() => {}); }, []);

  return (
    <div className={className} data-testid="privacy-card">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-400" /> Delete account</h2>
      <p className="mb-4 mt-0.5 text-xs text-zinc-500">Permanently delete your account and everything stored in InFlow, after a {info?.grace_days ?? 30}-day grace period.</p>
      {info?.blocked_by_members ? (
        <p className="text-xs text-amber-300/80" data-testid="delete-account-blocked-note">Transfer ownership or remove the other members from your workspace before deleting your account.</p>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!info}
          className="rounded-full border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200" data-testid="delete-account-btn">
          Delete my account
        </Button>
      )}
      {info && open && <DeleteAccountDialog open={open} onOpenChange={setOpen} info={info} />}
    </div>
  );
};
