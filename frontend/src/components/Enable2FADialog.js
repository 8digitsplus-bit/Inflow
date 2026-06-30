import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Loader2, ShieldCheck, Mail } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function Enable2FADialog({ open, onOpenChange, onEnabled }) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailHint, setEmailHint] = useState('');
  const [code, setCode] = useState('');
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setCode('');
      setEmailHint('');
      hasRequestedRef.current = false;
      return;
    }
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    (async () => {
      setSending(true);
      try {
        const res = await fetch(`${API_URL}/api/auth/2fa/enable/request`, {
          method: 'POST',
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.detail || 'Failed to send code');
          onOpenChange(false);
          return;
        }
        setEmailHint(data.email_hint);
        if (!data.email_sent) {
          toast.info('Code generated. If you don\'t receive the email, use the resend button or contact the team owner.', { duration: 6000 });
        }
      } finally {
        setSending(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length < 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/enable/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Invalid code');
        return;
      }
      toast.success('Two-factor authentication enabled');
      onEnabled?.();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/2fa/enable/request`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) toast.success('Code re-sent');
      else toast.error('Failed to re-send code');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm" data-testid="enable-2fa-dialog">
        <DialogHeader>
          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
          </div>
          <DialogTitle className="text-white" style={{ fontFamily: 'Outfit' }}>
            Enable two-factor authentication
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            We've sent a 6-digit code to <span className="text-zinc-300">{emailHint || 'your email'}</span>.
            Enter it below to finish enabling 2FA.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerify} className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1.5">Verification code</label>
            <Input
              autoFocus
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="bg-zinc-900/50 border-zinc-800 text-center text-2xl tracking-[0.4em] font-mono h-12"
              data-testid="enable-2fa-code-input"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
            data-testid="enable-2fa-verify-btn"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify and enable'}
          </Button>
          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
            data-testid="enable-2fa-resend-btn"
          >
            <Mail className="w-3 h-3" />
            {sending ? 'Sending…' : "Didn't get the code? Re-send"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
