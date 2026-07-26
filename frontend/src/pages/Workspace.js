import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Workflow, Loader2, StickyNote, CheckSquare, Phone, Mail, Handshake, Sparkles,
  Send, Trash2, Check, X, AlertTriangle, Plug, RefreshCw, Clock,
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

const KINDS = [
  { key: 'note', label: 'Add note', icon: StickyNote, needsTarget: true },
  { key: 'task', label: 'Create task', icon: CheckSquare, needsTarget: true },
  { key: 'call', label: 'Log call', icon: Phone, needsTarget: true },
  { key: 'email', label: 'Log email', icon: Mail, needsTarget: true },
  { key: 'deal', label: 'New deal', icon: Handshake, needsTarget: false },
];
const KIND_META = Object.fromEntries(KINDS.map((k) => [k.key, k]));
const STATUS_STYLE = {
  draft: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  executed: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const emptyPayload = (kind) => {
  switch (kind) {
    case 'note': return { body: '' };
    case 'task': return { title: '', body: '', priority: 'MEDIUM', due_date: '' };
    case 'call': return { title: '', notes: '', direction: 'OUTBOUND', when: '' };
    case 'email': return { subject: '', text: '', when: '' };
    case 'deal': return { dealname: '', amount: '', pipeline: '', dealstage: '', closedate: '', contact_id: '' };
    default: return {};
  }
};

const parseDraft = (kind, content) => {
  if (kind === 'note') return { body: content };
  const m = content.match(/^\s*(?:Title|Subject):\s*(.+?)\n+([\s\S]*)$/i);
  const first = content.split('\n')[0].replace(/^\s*(?:Title|Subject):\s*/i, '').trim();
  const rest = m ? m[2].trim() : content.replace(/^.*\n+/, '').trim();
  if (kind === 'task') return { title: first, body: rest };
  if (kind === 'call') return { title: first, notes: rest };
  if (kind === 'email') return { subject: first, text: rest };
  return {};
};

const summarize = (a) => {
  const p = a.payload || {};
  if (a.kind === 'note') return p.body;
  if (a.kind === 'task') return p.title;
  if (a.kind === 'call') return p.title;
  if (a.kind === 'email') return p.subject;
  if (a.kind === 'deal') return `${p.dealname}${p.amount ? ` · $${p.amount}` : ''}`;
  return '';
};

export default function Workspace() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState([]);
  const [targets, setTargets] = useState({ deals: [], contacts: [], pipelines: [], error: null });
  const [targetsLoading, setTargetsLoading] = useState(false);

  const [kind, setKind] = useState('note');
  const [payload, setPayload] = useState(emptyPayload('note'));
  const [targetType, setTargetType] = useState('deal');
  const [targetId, setTargetId] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState(null); // action being confirmed
  const [pushing, setPushing] = useState(false);

  const isOwner = !!status?.is_owner;
  const hubspot = (status?.providers || []).find((p) => p.platform === 'hubspot');

  const req = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api/workspace${path}`, {
      credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const st = await req('/status');
      setStatus(st);
      setActions(await req('/actions'));
    } catch (e) { /* gate */ }
    finally { setLoading(false); }
  }, [req]);

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    try {
      const t = await req('/targets?provider=hubspot');
      setTargets(t);
      if (t.error) toast.error(t.error);
    } catch (e) { setTargets({ deals: [], contacts: [], pipelines: [], error: e.message }); toast.error(e.message); }
    setTargetsLoading(false);
  }, [req]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (status && hubspot?.connected) loadTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const selectKind = (k) => { setKind(k); setPayload(emptyPayload(k)); setTargetId(''); };
  const setField = (f, v) => setPayload((p) => ({ ...p, [f]: v }));

  const runAIDraft = async () => {
    setAiBusy(true);
    try {
      const label = targetType === 'deal'
        ? (targets.deals.find((d) => d.id === targetId)?.label)
        : (targets.contacts.find((c) => c.id === targetId)?.label);
      const r = await req('/ai-draft', {
        method: 'POST',
        body: JSON.stringify({ kind, target_label: label || (payload.dealname || ''), context: payload.body || payload.notes || payload.text || '' }),
      });
      const parsed = parseDraft(kind, r.content || '');
      setPayload((p) => ({ ...p, ...parsed }));
      toast.success('AI draft ready — review before pushing');
    } catch (e) { toast.error(e.message); }
    setAiBusy(false);
  };

  const currentTarget = () => {
    if (!KIND_META[kind].needsTarget) return null;
    const list = targetType === 'deal' ? targets.deals : targets.contacts;
    const rec = list.find((r) => r.id === targetId);
    return { type: targetType, id: targetId, label: rec?.label || '' };
  };

  const saveDraft = async () => {
    if (KIND_META[kind].needsTarget && !targetId) { toast.error('Pick a HubSpot record to attach this to'); return; }
    setSaving(true);
    try {
      const body = { provider: 'hubspot', kind, target: currentTarget(), payload, ai_used: false };
      await req('/actions', { method: 'POST', body: JSON.stringify(body) });
      toast.success('Saved as draft — review & push when ready');
      setPayload(emptyPayload(kind)); setTargetId('');
      setActions(await req('/actions'));
      setStatus(await req('/status'));
    } catch (e) { toast.error(e.message); }
    setSaving(false);
  };

  const doPush = async () => {
    if (!confirm) return;
    setPushing(true);
    try {
      await req(`/actions/${confirm.action_id}/execute`, { method: 'POST' });
      toast.success('Pushed to HubSpot');
      setConfirm(null);
      setActions(await req('/actions'));
      setStatus(await req('/status'));
    } catch (e) { toast.error(e.message); setActions(await req('/actions')); }
    setPushing(false);
  };

  const removeAction = async (a) => {
    try { await req(`/actions/${a.action_id}`, { method: 'DELETE' }); setActions(await req('/actions')); setStatus(await req('/status')); }
    catch (e) { toast.error(e.message); }
  };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="workspace-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;

  const pipelines = targets.pipelines || [];
  const activePipeline = pipelines.find((pp) => pp.id === payload.pipeline) || pipelines[0];
  const KindIcon = KIND_META[kind].icon;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="workspace-page">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Workflow className="w-4 h-4" /> Revenue Execution · Workspace</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Action Workspace</h1>
          <p className="text-zinc-400 text-sm mt-1 max-w-2xl">Take control — push changes straight back into your connected tools. Draft a note, task, activity or a new deal, review it, then <span className="text-white">confirm to write it to HubSpot</span>. Nothing is sent until you approve it.</p>
        </div>

        {/* Connection banner */}
        {!hubspot?.connected ? (
          <div className={`rounded-2xl ${glass} p-6 flex flex-col sm:flex-row sm:items-center gap-4 mb-6`} data-testid="workspace-no-connection">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0"><Plug className="w-5 h-5 text-amber-300" /></div>
            <div className="flex-1">
              <div className="text-white font-semibold text-sm">Connect HubSpot to start pushing actions</div>
              <div className="text-zinc-400 text-xs mt-0.5">The Workspace writes notes, tasks, activities and deals into HubSpot. Connect it with a Private App token that has write access.</div>
            </div>
            <Button onClick={() => (window.location.href = '/connect-business')} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-9 text-sm" data-testid="workspace-connect-btn"><Plug className="w-4 h-4 mr-1.5" /> Connect HubSpot</Button>
          </div>
        ) : (
          <div className={`rounded-2xl ${glass} px-5 py-3 flex items-center gap-3 mb-6`} data-testid="workspace-connection">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm text-zinc-300">Connected to <span className="text-white font-medium">{hubspot.account_name || 'HubSpot'}</span></span>
            <span className="text-xs text-zinc-500 ml-2">{targets.deals.length} deals · {targets.contacts.length} contacts</span>
            <Button variant="ghost" size="sm" onClick={loadTargets} disabled={targetsLoading} className="ml-auto h-8 text-xs text-zinc-400 hover:text-white" data-testid="workspace-refresh-targets">{targetsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}</Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Composer */}
          <div className={`lg:col-span-3 rounded-2xl ${glass} p-5`} data-testid="workspace-composer">
            <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><KindIcon className="w-4 h-4 text-[#4d8bff]" /> New action</div>
            {/* kind pills */}
            <div className="flex flex-wrap gap-2 mb-5">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <button key={k.key} onClick={() => selectKind(k.key)} disabled={!isOwner}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors disabled:opacity-40 ${kind === k.key ? 'bg-[#0052ff]/15 text-[#4d8bff] border-[#0052ff]/40' : 'bg-white/[0.03] text-zinc-400 border-white/10 hover:text-white'}`}
                    data-testid={`kind-${k.key}`}><Icon className="w-3.5 h-3.5" /> {k.label}</button>
                );
              })}
            </div>

            {!isOwner && <div className="text-[11px] text-zinc-500 mb-4">Write actions are owner-only.</div>}

            {/* target picker */}
            {KIND_META[kind].needsTarget && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-zinc-500 text-[11px]">Attach to</Label>
                  <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white h-9 px-2" data-testid="target-type-select">
                    <option value="deal">Deal</option>
                    <option value="contact">Contact</option>
                  </select>
                </div>
                <div>
                  <Label className="text-zinc-500 text-[11px]">{targetType === 'deal' ? 'HubSpot deal' : 'HubSpot contact'}</Label>
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white h-9 px-2" data-testid="target-record-select">
                    <option value="">{targetsLoading ? 'Loading…' : 'Select a record'}</option>
                    {(targetType === 'deal' ? targets.deals : targets.contacts).map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* fields per kind */}
            <div className="space-y-3">
              {kind === 'note' && (
                <div><Label className="text-zinc-500 text-[11px]">Note</Label><Textarea rows={5} value={payload.body} onChange={(e) => setField('body', e.target.value)} placeholder="What happened / what to remember…" className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm mt-1" data-testid="field-note-body" /></div>
              )}
              {kind === 'task' && (
                <>
                  <div><Label className="text-zinc-500 text-[11px]">Task title</Label><Input value={payload.title} onChange={(e) => setField('title', e.target.value)} placeholder="Follow up on proposal" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="field-task-title" /></div>
                  <div><Label className="text-zinc-500 text-[11px]">Details (optional)</Label><Textarea rows={3} value={payload.body} onChange={(e) => setField('body', e.target.value)} className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm mt-1" data-testid="field-task-body" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-zinc-500 text-[11px]">Priority</Label><select value={payload.priority} onChange={(e) => setField('priority', e.target.value)} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white h-9 px-2" data-testid="field-task-priority"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div>
                    <div><Label className="text-zinc-500 text-[11px]">Due date</Label><Input type="date" value={payload.due_date} onChange={(e) => setField('due_date', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="field-task-due" /></div>
                  </div>
                </>
              )}
              {kind === 'call' && (
                <>
                  <div><Label className="text-zinc-500 text-[11px]">Call title</Label><Input value={payload.title} onChange={(e) => setField('title', e.target.value)} placeholder="Discovery call" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="field-call-title" /></div>
                  <div><Label className="text-zinc-500 text-[11px]">Notes</Label><Textarea rows={4} value={payload.notes} onChange={(e) => setField('notes', e.target.value)} className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm mt-1" data-testid="field-call-notes" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-zinc-500 text-[11px]">Direction</Label><select value={payload.direction} onChange={(e) => setField('direction', e.target.value)} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white h-9 px-2" data-testid="field-call-direction"><option value="OUTBOUND">Outbound</option><option value="INBOUND">Inbound</option></select></div>
                    <div><Label className="text-zinc-500 text-[11px]">When</Label><Input type="datetime-local" value={payload.when} onChange={(e) => setField('when', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="field-call-when" /></div>
                  </div>
                </>
              )}
              {kind === 'email' && (
                <>
                  <div><Label className="text-zinc-500 text-[11px]">Subject</Label><Input value={payload.subject} onChange={(e) => setField('subject', e.target.value)} placeholder="Following up" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="field-email-subject" /></div>
                  <div><Label className="text-zinc-500 text-[11px]">Body</Label><Textarea rows={5} value={payload.text} onChange={(e) => setField('text', e.target.value)} className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm mt-1" data-testid="field-email-text" /></div>
                  <div><Label className="text-zinc-500 text-[11px]">When</Label><Input type="datetime-local" value={payload.when} onChange={(e) => setField('when', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1 w-full sm:w-1/2" data-testid="field-email-when" /></div>
                </>
              )}
              {kind === 'deal' && (
                <>
                  <div><Label className="text-zinc-500 text-[11px]">Deal name</Label><Input value={payload.dealname} onChange={(e) => setField('dealname', e.target.value)} placeholder="Acme — New business" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="field-deal-name" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-zinc-500 text-[11px]">Amount ($)</Label><Input type="number" value={payload.amount} onChange={(e) => setField('amount', e.target.value)} placeholder="10000" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="field-deal-amount" /></div>
                    <div><Label className="text-zinc-500 text-[11px]">Close date</Label><Input type="date" value={payload.closedate} onChange={(e) => setField('closedate', e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="field-deal-close" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-zinc-500 text-[11px]">Pipeline</Label><select value={payload.pipeline} onChange={(e) => { setField('pipeline', e.target.value); setField('dealstage', ''); }} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white h-9 px-2" data-testid="field-deal-pipeline"><option value="">Default</option>{pipelines.map((pp) => <option key={pp.id} value={pp.id}>{pp.label}</option>)}</select></div>
                    <div><Label className="text-zinc-500 text-[11px]">Stage</Label><select value={payload.dealstage} onChange={(e) => setField('dealstage', e.target.value)} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white h-9 px-2" data-testid="field-deal-stage"><option value="">First stage</option>{(activePipeline?.stages || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 mt-5">
              {kind !== 'deal' && (
                <Button variant="outline" size="sm" onClick={runAIDraft} disabled={!isOwner || aiBusy} className="border-zinc-700 text-zinc-300 hover:bg-white/5 h-9 text-xs" data-testid="ai-draft-btn">{aiBusy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5 text-[#4d8bff]" />} AI draft</Button>
              )}
              <Button size="sm" onClick={saveDraft} disabled={!isOwner || saving} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-9 text-xs ml-auto" data-testid="save-draft-btn">{saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />} Save as draft</Button>
            </div>
          </div>

          {/* History */}
          <div className={`lg:col-span-2 rounded-2xl ${glass} p-5`} data-testid="workspace-history">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-white flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /> Action queue</div>
              <span className="text-[11px] text-zinc-500">{status?.drafts || 0} draft · {status?.executed || 0} pushed</span>
            </div>
            {actions.length === 0 ? (
              <div className="text-center text-zinc-500 text-sm py-10" data-testid="no-actions">No actions yet. Compose one on the left, review it, then push to HubSpot.</div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto" data-testid="actions-list">
                {actions.map((a) => {
                  const Icon = KIND_META[a.kind]?.icon || StickyNote;
                  return (
                    <div key={a.action_id} className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-3" data-testid={`action-${a.action_id}`}>
                      <div className="flex items-start gap-2">
                        <Icon className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white text-sm font-medium">{KIND_META[a.kind]?.label || a.kind}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${STATUS_STYLE[a.status]}`} data-testid={`action-status-${a.action_id}`}>{a.status}</span>
                          </div>
                          {a.target?.label && <div className="text-[11px] text-zinc-500 mt-0.5 truncate">→ {a.target.label}</div>}
                          <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{summarize(a)}</div>
                          {a.status === 'failed' && a.result?.error && <div className="text-[11px] text-red-300/90 mt-1 flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {a.result.error}</div>}
                          {a.status === 'executed' && <div className="text-[11px] text-emerald-400/80 mt-1">Pushed to HubSpot{a.result?.hubspot_id ? ` · id ${a.result.hubspot_id}` : ''}</div>}
                        </div>
                      </div>
                      {isOwner && a.status !== 'executed' && (
                        <div className="flex items-center gap-2 mt-2.5">
                          <Button size="sm" onClick={() => setConfirm(a)} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-7 text-[11px]" data-testid={`push-${a.action_id}`}><Send className="w-3 h-3 mr-1" /> {a.status === 'failed' ? 'Retry push' : 'Review & push'}</Button>
                          <Button size="sm" variant="ghost" onClick={() => removeAction(a)} className="h-7 text-[11px] text-zinc-500 hover:text-red-400 ml-auto" data-testid={`delete-${a.action_id}`}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm push dialog (human-in-the-loop) */}
      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="confirm-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><Send className="w-5 h-5 text-[#4d8bff]" /> Push to HubSpot?</DialogTitle>
            <DialogDescription className="text-zinc-400">This writes directly to your HubSpot account. Review before confirming.</DialogDescription>
          </DialogHeader>
          {confirm && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm" data-testid="confirm-preview">
              <div className="flex items-center gap-2"><span className="text-zinc-500 text-xs uppercase tracking-wide w-20">Action</span><span className="text-white">{KIND_META[confirm.kind]?.label}</span></div>
              {confirm.target?.label && <div className="flex items-center gap-2"><span className="text-zinc-500 text-xs uppercase tracking-wide w-20">Target</span><span className="text-white">{confirm.target.label}</span></div>}
              <div className="flex items-start gap-2"><span className="text-zinc-500 text-xs uppercase tracking-wide w-20 flex-shrink-0">Content</span><span className="text-zinc-200 whitespace-pre-wrap">{summarize(confirm)}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={pushing} className="text-zinc-400 hover:text-white" data-testid="confirm-cancel-btn"><X className="w-4 h-4 mr-1" /> Cancel</Button>
            <Button onClick={doPush} disabled={pushing} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="confirm-push-btn">{pushing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Confirm & push</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
