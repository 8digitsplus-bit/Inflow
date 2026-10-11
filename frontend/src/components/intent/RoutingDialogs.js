import { useState, useEffect } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { api } from './shared';

const TRIGGERS = [
  ['quote_request', 'Request-a-quote'], ['demo_request', 'Demo request'], ['pricing_view', 'Pricing visit'], ['trial_signup', 'Trial signup'],
  ['webinar_attended', 'Webinar attended'], ['whitepaper_download', 'Whitepaper'], ['docs_view', 'Docs view'], ['case_study_view', 'Case study'],
];
const EMPTY = { name: '', enabled: true, priority: 10, event_types: ['pricing_view', 'quote_request'], min_score: 70, min_value: 0, window_hours: 24,
  ae_ids: [], sla_minutes: 5, actions: { email: true, slack: false, crm: '', briefing: true } };
const field = 'bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1';
const CRM_NAMES = { hubspot: 'HubSpot', salesforce: 'Salesforce', pipedrive: 'Pipedrive', zoho: 'Zoho CRM' };

const Chip = ({ on, onClick, children, testid }) => (
  <button type="button" onClick={onClick} className={`px-2.5 h-7 rounded-full text-[11px] border transition-colors ${on ? 'bg-[#0052ff]/20 border-[#0052ff]/50 text-[#9dbcff]' : 'border-white/10 text-zinc-400 hover:text-white'}`} data-testid={testid}>{children}</button>
);

export const RuleDialog = ({ open, onOpenChange, rule, aes, destinations, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(rule ? { ...EMPTY, ...rule, actions: { ...EMPTY.actions, ...(rule.actions || {}) } } : EMPTY); }, [open, rule]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const act = (k, v) => setF((x) => ({ ...x, actions: { ...x.actions, [k]: v } }));
  const toggle = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((i) => i !== v) : [...x[k], v] }));

  const save = async () => {
    setBusy(true);
    try {
      const body = JSON.stringify({ ...f, min_score: Number(f.min_score), min_value: Number(f.min_value || 0), window_hours: Number(f.window_hours), priority: Number(f.priority), sla_minutes: Number(f.sla_minutes) });
      await api(rule ? `/intent/routing-rules/${rule.rule_id}` : '/intent/routing-rules', { method: rule ? 'PUT' : 'POST', body });
      toast.success(rule ? 'Rule updated — open profiles re-evaluated' : 'Rule live — open profiles evaluated instantly');
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-xl max-h-[90vh] overflow-y-auto" data-testid="rule-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: 'Outfit' }}><Zap className="w-5 h-5 text-[#4d8bff]" /> {rule ? 'Edit routing rule' : 'New speed-to-lead rule'}</DialogTitle>
          <DialogDescription className="text-zinc-400">When a profile crosses this trigger, InFlow assigns an AE round-robin and fires every alert in seconds — no queue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Rule name</Label><Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Hot pricing intent → AE now" className={field} data-testid="rule-name-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Priority</Label><Input type="number" value={f.priority} onChange={(e) => set('priority', e.target.value)} className={field} data-testid="rule-priority-input" /></div>
          </div>
          <div><Label className="text-zinc-400 text-xs">Critical intent triggers (any)</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">{TRIGGERS.map(([k, l]) => <Chip key={k} on={f.event_types.includes(k)} onClick={() => toggle('event_types', k)} testid={`rule-trigger-${k}`}>{l}</Chip>)}</div></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-zinc-400 text-xs">Min intent score</Label><Input type="number" value={f.min_score} onChange={(e) => set('min_score', e.target.value)} className={field} data-testid="rule-min-score-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Min deal value ($)</Label><Input type="number" value={f.min_value} onChange={(e) => set('min_value', e.target.value)} className={field} data-testid="rule-min-value-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Trigger window (h)</Label><Input type="number" value={f.window_hours} onChange={(e) => set('window_hours', e.target.value)} className={field} data-testid="rule-window-input" /></div>
          </div>
          <div><Label className="text-zinc-400 text-xs">AE pool (round-robin · none selected = whole roster)</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">{aes.length ? aes.map((a) => <Chip key={a.ae_id} on={f.ae_ids.includes(a.ae_id)} onClick={() => toggle('ae_ids', a.ae_id)} testid={`rule-ae-${a.ae_id}`}>{a.name}</Chip>) : <span className="text-xs text-zinc-500">Add AEs to the roster first.</span>}</div></div>
          <div className="rounded-xl border border-white/10 p-3 space-y-2.5">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">On assignment</div>
            {[['email', 'Email the AE instantly'], ['slack', `Alert Slack${destinations.slack ? '' : ' (connect below)'}`], ['briefing', 'Generate AI agent briefing']].map(([k, l]) => (
              <div key={k} className="flex items-center justify-between text-sm text-zinc-300"><span>{l}</span><Switch checked={!!f.actions[k]} onCheckedChange={(v) => act(k, v)} data-testid={`rule-action-${k}`} /></div>
            ))}
            <div className="flex items-center justify-between text-sm text-zinc-300"><span>Set owner + task in CRM</span>
              <select value={f.actions.crm} onChange={(e) => act('crm', e.target.value)} className="h-8 rounded-md bg-zinc-900 border border-zinc-700 text-xs px-2" data-testid="rule-action-crm">
                <option value="">Don't push</option>
                {Object.entries(CRM_NAMES).map(([p, n]) => <option key={p} value={p} disabled={!destinations[p]}>{n}{destinations[p] ? '' : ' (not connected)'}</option>)}
              </select></div>
          </div>
          <div className="flex items-center justify-between text-sm text-zinc-300"><span>Rule enabled</span><Switch checked={f.enabled} onCheckedChange={(v) => set('enabled', v)} data-testid="rule-enabled-switch" /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy} className="bg-[#0052ff] hover:bg-[#0047d6]" data-testid="rule-save-btn">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} {rule ? 'Save rule' : 'Create rule'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AE_EMPTY = { name: '', email: '', territories: '', min_deal: '', max_deal: '', active: true, crm_owner_ids: { hubspot: '', salesforce: '', pipedrive: '', zoho: '' } };

export const AeDialog = ({ open, onOpenChange, ae, onSaved }) => {
  const [f, setF] = useState(AE_EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(ae ? { ...AE_EMPTY, ...ae, territories: (ae.territories || []).join(', '), min_deal: ae.min_deal ?? '', max_deal: ae.max_deal ?? '', crm_owner_ids: { ...AE_EMPTY.crm_owner_ids, ...(ae.crm_owner_ids || {}) } } : AE_EMPTY);
  }, [open, ae]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const body = JSON.stringify({ ...f, territories: f.territories.split(',').map((s) => s.trim()).filter(Boolean),
        min_deal: f.min_deal === '' ? null : Number(f.min_deal), max_deal: f.max_deal === '' ? null : Number(f.max_deal) });
      await api(ae ? `/intent/aes/${ae.ae_id}` : '/intent/aes', { method: ae ? 'PUT' : 'POST', body });
      toast.success(ae ? 'AE updated' : 'AE added to the roster');
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="ae-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'Outfit' }}>{ae ? 'Edit account executive' : 'Add account executive'}</DialogTitle>
          <DialogDescription className="text-zinc-400">Territories and deal-size bands are optional — leave empty to take any lead.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-zinc-400 text-xs">Name</Label><Input value={f.name} onChange={set('name')} className={field} data-testid="ae-name-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Email (alerts)</Label><Input value={f.email} onChange={set('email')} className={field} data-testid="ae-email-input" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-zinc-400 text-xs">Territories</Label><Input value={f.territories} onChange={set('territories')} placeholder="NA, EMEA" className={field} data-testid="ae-territories-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Min deal ($)</Label><Input type="number" value={f.min_deal} onChange={set('min_deal')} className={field} data-testid="ae-min-deal-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Max deal ($)</Label><Input type="number" value={f.max_deal} onChange={set('max_deal')} className={field} data-testid="ae-max-deal-input" /></div>
          </div>
          <div><Label className="text-zinc-400 text-xs">CRM owner IDs (so pushed tasks land on this AE)</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">{Object.entries(CRM_NAMES).map(([p, n]) => (
              <Input key={p} value={f.crm_owner_ids[p]} onChange={(e) => setF((x) => ({ ...x, crm_owner_ids: { ...x.crm_owner_ids, [p]: e.target.value } }))} placeholder={`${n} owner ID`} className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs" data-testid={`ae-owner-${p}`} />
            ))}</div></div>
          <div className="flex items-center justify-between text-sm text-zinc-300"><span>Active on the roster</span><Switch checked={f.active} onCheckedChange={(v) => setF((x) => ({ ...x, active: v }))} data-testid="ae-active-switch" /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy} className="bg-[#0052ff] hover:bg-[#0047d6]" data-testid="ae-save-btn">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
