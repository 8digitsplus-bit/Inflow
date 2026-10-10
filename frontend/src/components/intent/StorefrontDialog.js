import { useState, useEffect } from 'react';
import { Loader2, Crown, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { api } from './shared';

const AUDIENCE = [['pricing_view', 'Pricing visit'], ['quote_request', 'Quote request'], ['demo_request', 'Demo request'], ['trial_signup', 'Trial signup'], ['webinar_attended', 'Webinar'], ['whitepaper_download', 'Whitepaper']];
const EMPTY = { name: '', enabled: true, priority: 10, min_score: 70, event_types: ['pricing_view'], accounts: '', headline: '', message: '',
  discount_pct: 10, contract_terms: '', cta_label: 'Claim your offer', cta_url: '', expires_days: 14 };
const field = 'bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1';

export const RedCarpetBanner = ({ offer, account = 'Acme Corp', testid = 'redcarpet-preview' }) => (
  <div className="rounded-2xl border border-[#0052ff]/45 bg-[rgba(10,12,20,0.92)] backdrop-blur-xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)]" data-testid={testid}>
    <div className="flex gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] tracking-[0.14em] uppercase text-[#4d8bff] font-bold mb-1">Prepared for {account}</div>
        <div className="text-[15px] font-bold text-white mb-1">{offer.headline || 'Your offer headline'}</div>
        {offer.message && <div className="text-xs text-zinc-300 mb-1.5">{offer.message}</div>}
        {offer.contract_terms && <div className="text-[11px] text-zinc-400">Terms: {offer.contract_terms}</div>}
        {Number(offer.discount_pct) > 0 && <div className="mt-2 text-[11px] text-zinc-200">Code <span className="font-mono bg-[#0052ff]/20 border border-[#0052ff]/45 px-1.5 py-0.5 rounded">{offer.promo_code || 'AUTO-CODE'}</span> · {offer.discount_pct}% off</div>}
      </div>
      <div className="flex flex-col items-end gap-2"><X className="w-4 h-4 text-zinc-500" />{offer.cta_label && <span className="bg-[#0052ff] text-white text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap">{offer.cta_label}</span>}</div>
    </div>
  </div>
);

export const StorefrontDialog = ({ open, onOpenChange, rule, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(rule ? { ...EMPTY, ...rule, accounts: (rule.accounts || []).join(', ') } : EMPTY); }, [open, rule]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (v) => setF((x) => ({ ...x, event_types: x.event_types.includes(v) ? x.event_types.filter((i) => i !== v) : [...x.event_types, v] }));

  const save = async () => {
    setBusy(true);
    try {
      const body = JSON.stringify({ ...f, accounts: f.accounts.split(',').map((s) => s.trim()).filter(Boolean), min_score: Number(f.min_score),
        discount_pct: Number(f.discount_pct || 0), expires_days: Number(f.expires_days), priority: Number(f.priority) });
      await api(rule ? `/storefronts/${rule.rule_id}` : '/storefronts', { method: rule ? 'PUT' : 'POST', body });
      toast.success(rule ? 'Storefront updated' : 'Red-carpet storefront live');
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="storefront-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: 'Outfit' }}><Crown className="w-5 h-5 text-[#4d8bff]" /> {rule ? 'Edit storefront' : 'New red-carpet storefront'}</DialogTitle>
          <DialogDescription className="text-zinc-400">Who qualifies, and what they see on your pricing page, quote form and hosted quote page.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div><Label className="text-zinc-400 text-xs">Rule name</Label><Input value={f.name} onChange={set('name')} placeholder="Enterprise red carpet" className={field} data-testid="sf-name-input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-zinc-400 text-xs">Min intent score</Label><Input type="number" value={f.min_score} onChange={set('min_score')} className={field} data-testid="sf-min-score-input" /></div>
              <div><Label className="text-zinc-400 text-xs">Priority</Label><Input type="number" value={f.priority} onChange={set('priority')} className={field} data-testid="sf-priority-input" /></div>
            </div>
            <div><Label className="text-zinc-400 text-xs">Must have shown (any)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">{AUDIENCE.map(([k, l]) => (
                <button key={k} type="button" onClick={() => toggle(k)} className={`px-2.5 h-7 rounded-full text-[11px] border ${f.event_types.includes(k) ? 'bg-[#0052ff]/20 border-[#0052ff]/50 text-[#9dbcff]' : 'border-white/10 text-zinc-400'}`} data-testid={`sf-audience-${k}`}>{l}</button>
              ))}</div></div>
            <div><Label className="text-zinc-400 text-xs">Named accounts only (optional, comma-separated)</Label><Input value={f.accounts} onChange={set('accounts')} placeholder="Hooli, Pied Piper" className={field} data-testid="sf-accounts-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Headline</Label><Input value={f.headline} onChange={set('headline')} placeholder="Your pre-approved pricing is ready" className={field} data-testid="sf-headline-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Message</Label><Textarea value={f.message} onChange={set('message')} rows={2} className="bg-zinc-900 border-zinc-700 text-white text-sm mt-1" data-testid="sf-message-input" /></div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-zinc-400 text-xs">Pre-approved discount %</Label><Input type="number" value={f.discount_pct} onChange={set('discount_pct')} className={field} data-testid="sf-discount-input" /></div>
              <div><Label className="text-zinc-400 text-xs">Offer valid (days)</Label><Input type="number" value={f.expires_days} onChange={set('expires_days')} className={field} data-testid="sf-expires-input" /></div>
            </div>
            <div><Label className="text-zinc-400 text-xs">Custom contract terms</Label><Textarea value={f.contract_terms} onChange={set('contract_terms')} rows={2} placeholder="Net-60 · annual billed quarterly · 30-day opt-out" className="bg-zinc-900 border-zinc-700 text-white text-sm mt-1" data-testid="sf-terms-input" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-zinc-400 text-xs">CTA label</Label><Input value={f.cta_label} onChange={set('cta_label')} className={field} data-testid="sf-cta-label-input" /></div>
              <div><Label className="text-zinc-400 text-xs">CTA link</Label><Input value={f.cta_url} onChange={set('cta_url')} placeholder="https://…/checkout" className={field} data-testid="sf-cta-url-input" /></div>
            </div>
            <div className="flex items-center justify-between text-sm text-zinc-300"><span>Enabled</span><Switch checked={f.enabled} onCheckedChange={(v) => setF((x) => ({ ...x, enabled: v }))} data-testid="sf-enabled-switch" /></div>
            <div><div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Live preview</div><RedCarpetBanner offer={f} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy} className="bg-[#0052ff] hover:bg-[#0047d6]" data-testid="sf-save-btn">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} {rule ? 'Save storefront' : 'Launch storefront'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
