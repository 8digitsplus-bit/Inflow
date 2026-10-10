import { useState, useEffect } from 'react';
import { Loader2, FlaskConical } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { api } from './shared';

const TYPES = [
  ['quote_request', 'Request-a-quote submitted'], ['demo_request', 'Demo requested'], ['pricing_view', 'Pricing page visit'],
  ['trial_signup', 'Trial signup'], ['webinar_attended', 'Webinar attended'], ['whitepaper_download', 'Whitepaper download'],
  ['docs_view', 'Product docs view'], ['case_study_view', 'Case study view'],
];
const field = 'bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1';

export const SimulateDialog = ({ open, onOpenChange, onDone }) => {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ account: '', type: 'pricing_view', email: '', region: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) api('/intent/profiles').then((p) => setAccounts(p.map((x) => x.account))).catch(() => {});
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    if (!form.account.trim()) { toast.error('Pick or type an account'); return; }
    setBusy(true);
    const t0 = performance.now();
    try {
      await api('/intent/events/simulate', { method: 'POST', body: JSON.stringify(form) });
      toast.success(`Signal unified into ${form.account} in ${Math.round(performance.now() - t0)}ms — routing rules evaluated`);
      onOpenChange(false);
      setTimeout(onDone, 800);
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md" data-testid="simulate-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: 'Outfit' }}><FlaskConical className="w-5 h-5 text-[#4d8bff]" /> Send a test signal</DialogTitle>
          <DialogDescription className="text-zinc-400">Fire a real intent event through the data cloud to watch scoring, speed-to-lead routing and storefront matching happen live. Tagged as a test.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-zinc-400 text-xs">Account</Label><Input list="sim-accounts" value={form.account} onChange={set('account')} placeholder="e.g. Globex" className={field} data-testid="simulate-account-input" />
            <datalist id="sim-accounts">{accounts.map((a) => <option key={a} value={a} />)}</datalist></div>
          <div><Label className="text-zinc-400 text-xs">Intent event</Label>
            <select value={form.type} onChange={set('type')} className={`w-full rounded-md px-2 ${field}`} data-testid="simulate-type-select">
              {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-zinc-400 text-xs">Contact email (optional)</Label><Input value={form.email} onChange={set('email')} placeholder="buyer@company.com" className={field} data-testid="simulate-email-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Region (optional)</Label><Input value={form.region} onChange={set('region')} placeholder="NA / EMEA / APAC" className={field} data-testid="simulate-region-input" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="simulate-submit-btn">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Fire signal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
