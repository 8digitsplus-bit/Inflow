import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import {
  ArrowLeft, Loader2, Link2, Send, X, Sparkles, StickyNote, CheckSquare, Phone, Mail,
  Handshake, Flame, RefreshCw, AlertTriangle, Clock, Trash2, Check, Save, Plug,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const glass = 'bg-white/[0.04] border border-white/10 backdrop-blur-xl';
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);

const KINDS = [
  { key: 'note', label: 'Note', icon: StickyNote, needsTarget: true },
  { key: 'task', label: 'Task', icon: CheckSquare, needsTarget: true },
  { key: 'call', label: 'Call', icon: Phone, needsTarget: true },
  { key: 'email', label: 'Email', icon: Mail, needsTarget: true },
  { key: 'deal', label: 'Deal', icon: Handshake, needsTarget: false },
];
const KIND_META = Object.fromEntries(KINDS.map((k) => [k.key, k]));
const STATUS_STYLE = {
  draft: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  executed: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
};
const SOURCE_META = {
  intent: { label: 'InFlow AI', icon: Flame, color: 'text-amber-300' },
  inflow: { label: 'Pushed', icon: Send, color: 'text-[#4d8bff]' },
  hubspot: { label: 'HubSpot', icon: RefreshCw, color: 'text-orange-300' },
};
const emptyPayload = (k) => ({
  note: { body: '' },
  task: { title: '', body: '', priority: 'MEDIUM', due_date: '' },
  call: { title: '', notes: '', direction: 'OUTBOUND', when: '' },
  email: { subject: '', text: '', when: '' },
  deal: { dealname: '', amount: '', closedate: '' },
}[k] || {});
const summarize = (a) => {
  const p = a.payload || {};
  return a.kind === 'note' ? p.body : a.kind === 'task' ? p.title : a.kind === 'call' ? p.title : a.kind === 'email' ? p.subject : a.kind === 'deal' ? p.dealname : '';
};
const parseDraft = (kind, c) => {
  if (kind === 'note') return { body: c };
  const first = c.split('\n')[0].replace(/^\s*(?:Title|Subject):\s*/i, '').trim();
  const m = c.match(/\n+([\s\S]*)$/);
  const rest = m ? m[1].trim() : '';
  if (kind === 'task') return { title: first, body: rest };
  if (kind === 'call') return { title: first, notes: rest };
  if (kind === 'email') return { subject: first, text: rest };
  return {};
};
const fmtTs = (ts) => {
  if (!ts) return '';
  const d = /^\d+$/.test(String(ts)) ? new Date(Number(ts)) : new Date(ts);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
};

export default function AccountWorkspace() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({ dealname: '', amount: '', dealstage: '' });
  const [linkId, setLinkId] = useState('');
  const [kind, setKind] = useState('note');
  const [payload, setPayload] = useState(emptyPayload('note'));
  const [aiBusy, setAiBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [fieldConfirm, setFieldConfirm] = useState(false);

  const lead = data?.lead;
  const linked = data?.linked_deal_id;
  const hub = data?.hubspot || {};

  const req = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api/workspace${path}`, {
      credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.detail || 'Request failed');
    return d;
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await req(`/account/${leadId}`);
      setData(d);
      const f = d.hubspot?.deal_fields || {};
      setFields({ dealname: f.dealname || d.lead?.account || '', amount: f.amount || '', dealstage: f.dealstage || '' });
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  }, [req, leadId]);

  useEffect(() => { load(); }, [load]);

  const setField = (f, v) => setPayload((p) => ({ ...p, [f]: v }));

  const linkDeal = async () => {
    if (!linkId) { toast.error('Pick a HubSpot deal to link'); return; }
    try {
      const d = (hub.deals || []).find((x) => x.id === linkId);
      await req(`/account/${leadId}/link`, { method: 'POST', body: JSON.stringify({ hubspot_deal_id: linkId, label: d?.label || '' }) });
      toast.success('Linked to HubSpot deal');
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const pushFields = async () => {
    setFieldConfirm(false); setBusy(true);
    try {
      await req(`/account/${leadId}/fields`, { method: 'POST', body: JSON.stringify(fields) });
      toast.success('Fields pushed to HubSpot');
      await load();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const runAI = async () => {
    setAiBusy(true);
    try {
      const r = await req('/ai-draft', { method: 'POST', body: JSON.stringify({ kind, target_label: lead?.account, context: payload.body || payload.notes || payload.text || '' }) });
      setPayload((p) => ({ ...p, ...parseDraft(kind, r.content || '') }));
      toast.success('AI draft ready — review before pushing');
    } catch (e) { toast.error(e.message); }
    setAiBusy(false);
  };

  const saveDraft = async () => {
    const meta = KIND_META[kind];
    if (meta.needsTarget && !linked) { toast.error('Link a HubSpot deal first to attach notes, tasks & activities'); return; }
    setBusy(true);
    try {
      const target = meta.needsTarget ? { type: 'deal', id: linked, label: lead?.account } : null;
      await req('/actions', { method: 'POST', body: JSON.stringify({ provider: 'hubspot', kind, target, payload, account_ref: leadId }) });
      toast.success('Saved — review & push to HubSpot');
      setPayload(emptyPayload(kind));
      await load();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };

  const doPush = async () => {
    if (!confirm) return;
    setPushing(true);
    try {
      await req(`/actions/${confirm.action_id}/execute`, { method: 'POST' });
      toast.success('Pushed to HubSpot');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); await load(); }
    setPushing(false);
  };

  const removeAction = async (a) => {
    try { await req(`/actions/${a.action_id}`, { method: 'DELETE' }); await load(); }
    catch (e) { toast.error(e.message); }
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="account-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;
  if (!lead) return <DashboardLayout><div className="p-8 text-center text-zinc-400" data-testid="account-not-found">Account not found. <button onClick={() => navigate('/discover')} className="text-[#4d8bff] underline">Back to Upsell Engine</button></div></DashboardLayout>;

  const KindIcon = KIND_META[kind].icon;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="account-workspace-page">
        {/* Header */}
        <button onClick={() => navigate('/discover')} className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs mb-4" data-testid="account-back-btn"><ArrowLeft className="w-4 h-4" /> Back to Upsell Engine</button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Handshake className="w-4 h-4" /> Account Workspace · 2-way sync</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="account-name">{lead.account}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${lead.intent_score >= 60 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-white/5 text-zinc-400 border-white/10'}`}><Flame className="w-3 h-3" /> intent {lead.intent_score}/100</span>
              <span className="text-xs text-zinc-500">{money(lead.value)} · {lead.best_stage} · {lead.probability}%</span>
              {linked ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 flex items-center gap-1" data-testid="account-linked-badge"><Link2 className="w-3 h-3" /> HubSpot linked</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md border bg-zinc-600/15 text-zinc-400 border-zinc-600/30" data-testid="account-unlinked-badge">Not linked</span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={busy} className="h-8 text-xs text-zinc-400 hover:text-white flex-shrink-0" data-testid="account-refresh-btn"><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sync now</Button>
        </div>

        {hub.error && (
          <div className={`rounded-xl ${glass} px-4 py-2.5 mb-6 flex items-center gap-2 text-[11px] text-red-300/90`} data-testid="account-hub-error"><AlertTriangle className="w-3.5 h-3.5" /> {hub.error}</div>
        )}
        {!hub.connected && (
          <div className={`rounded-xl ${glass} px-4 py-2.5 mb-6 flex items-center gap-2 text-[11px] text-amber-300/90`} data-testid="account-no-connection"><Plug className="w-3.5 h-3.5" /> Connect HubSpot to enable 2-way sync for this account.</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: fields + composer + actions */}
          <div className="lg:col-span-3 space-y-6">
            {/* Link / fields */}
            <div className={`rounded-2xl ${glass} p-5`} data-testid="account-fields-card">
              <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Link2 className="w-4 h-4 text-[#4d8bff]" /> HubSpot record</div>
              {!linked && hub.connected && (
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <select value={linkId} onChange={(e) => setLinkId(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white h-9 px-2" data-testid="account-link-select">
                    <option value="">Select the HubSpot deal for this account…</option>
                    {(hub.deals || []).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                  <Button size="sm" onClick={linkDeal} className="bg-white/10 hover:bg-white/20 text-white h-9 text-xs" data-testid="account-link-btn"><Link2 className="w-3.5 h-3.5 mr-1.5" /> Link</Button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1"><Label className="text-zinc-500 text-[11px]">Deal name</Label><Input value={fields.dealname} onChange={(e) => setFields((f) => ({ ...f, dealname: e.target.value }))} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-field-name" /></div>
                <div><Label className="text-zinc-500 text-[11px]">Amount</Label><Input value={fields.amount} onChange={(e) => setFields((f) => ({ ...f, amount: e.target.value }))} placeholder="—" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-field-amount" /></div>
                <div><Label className="text-zinc-500 text-[11px]">Stage</Label><Input value={fields.dealstage} onChange={(e) => setFields((f) => ({ ...f, dealstage: e.target.value }))} placeholder="—" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-field-stage" /></div>
              </div>
              <div className="flex justify-end mt-3">
                <Button size="sm" onClick={() => setFieldConfirm(true)} disabled={busy || !linked} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-8 text-xs disabled:opacity-40" data-testid="account-push-fields-btn"><Save className="w-3.5 h-3.5 mr-1.5" /> Push field updates to HubSpot</Button>
              </div>
            </div>

            {/* Action composer */}
            <div className={`rounded-2xl ${glass} p-5`} data-testid="account-composer">
              <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><KindIcon className="w-4 h-4 text-[#4d8bff]" /> Push an action</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {KINDS.map((k) => {
                  const Icon = k.icon;
                  return <button key={k.key} onClick={() => { setKind(k.key); setPayload(emptyPayload(k.key)); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${kind === k.key ? 'bg-[#0052ff]/15 text-[#4d8bff] border-[#0052ff]/40' : 'bg-white/[0.03] text-zinc-400 border-white/10 hover:text-white'}`} data-testid={`account-kind-${k.key}`}><Icon className="w-3.5 h-3.5" /> {k.label}</button>;
                })}
              </div>
              <div className="space-y-3">
                {kind === 'note' && <div><Label className="text-zinc-500 text-[11px]">Note</Label><Textarea rows={4} value={payload.body} onChange={(e) => setField('body', e.target.value)} className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm mt-1" data-testid="account-note-body" /></div>}
                {kind === 'task' && (<>
                  <div><Label className="text-zinc-500 text-[11px]">Task title</Label><Input value={payload.title} onChange={(e) => setField('title', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-task-title" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-zinc-500 text-[11px]">Priority</Label><select value={payload.priority} onChange={(e) => setField('priority', e.target.value)} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white h-9 px-2" data-testid="account-task-priority"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div>
                    <div><Label className="text-zinc-500 text-[11px]">Due date</Label><Input type="date" value={payload.due_date} onChange={(e) => setField('due_date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-task-due" /></div>
                  </div>
                </>)}
                {kind === 'call' && (<>
                  <div><Label className="text-zinc-500 text-[11px]">Call title</Label><Input value={payload.title} onChange={(e) => setField('title', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-call-title" /></div>
                  <div><Label className="text-zinc-500 text-[11px]">Notes</Label><Textarea rows={3} value={payload.notes} onChange={(e) => setField('notes', e.target.value)} className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm mt-1" data-testid="account-call-notes" /></div>
                </>)}
                {kind === 'email' && (<>
                  <div><Label className="text-zinc-500 text-[11px]">Subject</Label><Input value={payload.subject} onChange={(e) => setField('subject', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-email-subject" /></div>
                  <div><Label className="text-zinc-500 text-[11px]">Body</Label><Textarea rows={4} value={payload.text} onChange={(e) => setField('text', e.target.value)} className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm mt-1" data-testid="account-email-text" /></div>
                </>)}
                {kind === 'deal' && (<>
                  <div><Label className="text-zinc-500 text-[11px]">Deal name</Label><Input value={payload.dealname} onChange={(e) => setField('dealname', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-deal-name" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-zinc-500 text-[11px]">Amount ($)</Label><Input type="number" value={payload.amount} onChange={(e) => setField('amount', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-deal-amount" /></div>
                    <div><Label className="text-zinc-500 text-[11px]">Close date</Label><Input type="date" value={payload.closedate} onChange={(e) => setField('closedate', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="account-deal-close" /></div>
                  </div>
                </>)}
              </div>
              {KIND_META[kind].needsTarget && !linked && <div className="text-[11px] text-amber-300/80 mt-3 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Link a HubSpot deal above to attach this.</div>}
              <div className="flex items-center gap-2 mt-4">
                {kind !== 'deal' && <Button variant="outline" size="sm" onClick={runAI} disabled={aiBusy} className="border-zinc-700 text-zinc-300 hover:bg-white/5 h-9 text-xs" data-testid="account-ai-btn">{aiBusy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[#4d8bff]" />} AI draft</Button>}
                <Button size="sm" onClick={saveDraft} disabled={busy} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-9 text-xs ml-auto" data-testid="account-save-btn">{busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />} Save as draft</Button>
              </div>
            </div>

            {/* Draft actions for this account */}
            <div className={`rounded-2xl ${glass} p-5`} data-testid="account-actions">
              <div className="text-sm font-semibold text-white mb-3">Pending actions</div>
              {(data.actions || []).length === 0 ? (
                <div className="text-center text-zinc-500 text-sm py-6" data-testid="account-no-actions">No actions yet for this account.</div>
              ) : (
                <div className="space-y-2" data-testid="account-actions-list">
                  {data.actions.map((a) => {
                    const Icon = KIND_META[a.kind]?.icon || StickyNote;
                    return (
                      <div key={a.action_id} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3" data-testid={`account-action-${a.action_id}`}>
                        <div className="flex items-start gap-2">
                          <Icon className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2"><span className="text-white text-sm font-medium">{KIND_META[a.kind]?.label}</span><span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${STATUS_STYLE[a.status]}`}>{a.status}</span></div>
                            <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{summarize(a)}</div>
                            {a.status === 'failed' && a.result?.error && <div className="text-[11px] text-red-300/90 mt-1">{a.result.error}</div>}
                          </div>
                        </div>
                        {a.status !== 'executed' && (
                          <div className="flex items-center gap-2 mt-2.5">
                            <Button size="sm" onClick={() => setConfirm(a)} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-7 text-[11px]" data-testid={`account-push-${a.action_id}`}><Send className="w-3 h-3 mr-1" /> {a.status === 'failed' ? 'Retry' : 'Review & push'}</Button>
                            <Button size="sm" variant="ghost" onClick={() => removeAction(a)} className="h-7 text-[11px] text-zinc-500 hover:text-red-400 ml-auto" data-testid={`account-delete-${a.action_id}`}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: merged timeline */}
          <div className={`lg:col-span-2 rounded-2xl ${glass} p-5`} data-testid="account-timeline">
            <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /> Activity timeline</div>
            {(data.timeline || []).length === 0 ? (
              <div className="text-center text-zinc-500 text-sm py-8">No activity yet.</div>
            ) : (
              <div className="space-y-3 max-h-[640px] overflow-y-auto" data-testid="account-timeline-list">
                {data.timeline.map((t, i) => {
                  const meta = SOURCE_META[t.source] || SOURCE_META.inflow;
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="flex items-start gap-2.5" data-testid={`timeline-item-${i}`}>
                      <div className={`w-7 h-7 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center flex-shrink-0 ${meta.color}`}><Icon className="w-3.5 h-3.5" /></div>
                      <div className="flex-1 min-w-0 pb-2 border-b border-white/[0.05]">
                        <div className="flex items-center gap-2"><span className={`text-[10px] uppercase tracking-wide font-semibold ${meta.color}`}>{meta.label}</span>{t.kind && <span className="text-[10px] text-zinc-500">· {t.kind}</span>}</div>
                        <div className="text-xs text-zinc-300 mt-0.5 line-clamp-3">{t.detail}</div>
                        {t.ts && <div className="text-[10px] text-zinc-600 mt-0.5">{fmtTs(t.ts)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm push action */}
      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="account-confirm-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><Send className="w-5 h-5 text-[#4d8bff]" /> Push to HubSpot?</DialogTitle>
            <DialogDescription className="text-zinc-400">This writes directly to {lead.account}'s HubSpot record.</DialogDescription>
          </DialogHeader>
          {confirm && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-200 whitespace-pre-wrap" data-testid="account-confirm-preview">{KIND_META[confirm.kind]?.label}: {summarize(confirm)}</div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={pushing} className="text-zinc-400 hover:text-white" data-testid="account-confirm-cancel"><X className="w-4 h-4 mr-1" /> Cancel</Button>
            <Button onClick={doPush} disabled={pushing} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="account-confirm-push">{pushing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Confirm & push</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm push fields */}
      <Dialog open={fieldConfirm} onOpenChange={setFieldConfirm}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="account-field-confirm-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><Save className="w-5 h-5 text-[#4d8bff]" /> Update HubSpot record?</DialogTitle>
            <DialogDescription className="text-zinc-400">Push these field values to {lead.account}'s HubSpot deal.</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5 text-sm">
            <div className="flex gap-2"><span className="text-zinc-500 w-24">Deal name</span><span className="text-white">{fields.dealname || '—'}</span></div>
            <div className="flex gap-2"><span className="text-zinc-500 w-24">Amount</span><span className="text-white">{fields.amount || '—'}</span></div>
            <div className="flex gap-2"><span className="text-zinc-500 w-24">Stage</span><span className="text-white">{fields.dealstage || '—'}</span></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFieldConfirm(false)} disabled={busy} className="text-zinc-400 hover:text-white" data-testid="account-field-cancel"><X className="w-4 h-4 mr-1" /> Cancel</Button>
            <Button onClick={pushFields} disabled={busy} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="account-field-push">{busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />} Confirm & push</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
