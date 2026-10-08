import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import {
  Rocket, ArrowLeft, Sparkles, Mail, Send, Undo2, Link2, Plus, Trash2, Loader2,
  Tag, Gauge, X, Building2, MessageSquare, Settings2, UserPlus, Check,
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
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const glass = 'bg-white/[0.04] border border-white/10 backdrop-blur-xl';

const LABEL_COLORS = {
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  red: 'bg-red-500/15 text-red-300 border-red-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  zinc: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};
const CATS = [
  { key: 'all', name: 'All' },
  { key: 'priority', name: 'Priority Pipeline' },
  { key: 'sales', name: 'Sales' },
  { key: 'marketing', name: 'Marketing' },
];
const CAT_NAME = { priority: 'Priority Pipeline', sales: 'Sales', marketing: 'Marketing' };
const COLOR_CHOICES = ['blue', 'amber', 'violet', 'red', 'emerald', 'cyan', 'zinc'];

export default function OutreachWorkspace() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState('');
  const [tab, setTab] = useState('all');
  const [selectedId, setSelectedId] = useState(params.get('candidate') || '');
  const [busy, setBusy] = useState('');

  // compose state for the selected candidate
  const [to, setTo] = useState('');
  const [assignee, setAssignee] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [links, setLinks] = useState([]);
  const [newLink, setNewLink] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [delay, setDelay] = useState(30);

  // undo-send countdown
  const [pending, setPending] = useState(null); // { queue_id, remaining, sent }
  const timerRef = useRef(null);

  // dialogs
  const [slackOpen, setSlackOpen] = useState(false);
  const [slackForm, setSlackForm] = useState({ webhook_url: '', channel_label: '' });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ keyword: '', label: '', color: 'blue' });

  const req = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }, []);

  const loadBoard = useCallback(async () => {
    try {
      const b = await req('/outreach/board');
      setBoard(b);
    } catch (e) {
      setGate(e.message || 'Unable to load');
    } finally {
      setLoading(false);
    }
  }, [req]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  const candidates = board?.candidates || [];
  const selected = candidates.find(c => c.candidate_id === selectedId) || null;

  // hydrate compose fields when the resolved candidate changes
  useEffect(() => {
    if (!selected) return;
    setTo(selected.contact_email || '');
    setAssignee(selected.assignee || '');
    setSubject(selected.draft_subject || '');
    setBody(selected.draft_body || '');
    setLinks(selected.links || []);
    setPending(null);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [selected?.candidate_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-select first candidate in tab when none chosen
  useEffect(() => {
    if (selectedId || candidates.length === 0) return;
    const first = tab === 'all' ? candidates[0] : candidates.find(c => c.category === tab);
    if (first) setSelectedId(first.candidate_id);
  }, [candidates, tab, selectedId]);

  const visible = tab === 'all' ? candidates : candidates.filter(c => c.category === tab);

  const patchCandidate = async (payload) => {
    const r = await req(`/outreach/candidate/${selectedId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    await loadBoard();
    return r;
  };

  const generateDraft = async () => {
    if (!selected) return;
    setBusy('draft');
    try {
      const d = await req(`/outreach/candidate/${selectedId}/draft`, { method: 'POST', body: JSON.stringify({}) });
      setSubject(d.subject || '');
      setBody(d.body || '');
      toast.success(d.ai_used ? 'AI drafted your upgrade email' : 'Draft ready (template)');
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const saveDraft = async () => {
    if (!selected) return;
    setBusy('save');
    try {
      await patchCandidate({ draft_subject: subject, draft_body: body, links, assignee });
      toast.success('Saved');
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const moveCategory = async (cat) => {
    try { await patchCandidate({ category: cat }); toast.success(`Moved to ${CAT_NAME[cat]}`); }
    catch (e) { toast.error(e.message); }
  };

  const addLabel = async () => {
    const l = newLabel.trim();
    if (!l) return;
    setNewLabel('');
    try { await patchCandidate({ add_label: l }); } catch (e) { toast.error(e.message); }
  };

  const removeLabel = async (label) => {
    try { await patchCandidate({ remove_label: label }); } catch (e) { toast.error(e.message); }
  };

  const addLink = () => {
    const l = newLink.trim();
    if (!l) return;
    const next = [...links, l];
    setLinks(next); setNewLink('');
    patchCandidate({ links: next }).catch((e) => toast.error(e.message));
  };
  const removeLink = (i) => {
    const next = links.filter((_, idx) => idx !== i);
    setLinks(next);
    patchCandidate({ links: next }).catch((e) => toast.error(e.message));
  };

  const saveAssignee = async () => {
    try { await patchCandidate({ assignee }); toast.success(assignee ? `Assigned to ${assignee}` : 'Assignee cleared'); }
    catch (e) { toast.error(e.message); }
  };

  const startCountdown = (queue_id, seconds) => {
    setPending({ queue_id, remaining: seconds, sent: false });
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setPending((p) => {
        if (!p) return p;
        if (p.remaining <= 1) {
          clearInterval(timerRef.current); timerRef.current = null;
          setTimeout(loadBoard, 1200);
          return { ...p, remaining: 0, sent: true };
        }
        return { ...p, remaining: p.remaining - 1 };
      });
    }, 1000);
  };

  const scheduleSend = async () => {
    if (!to || !to.includes('@')) { toast.error('Enter a valid customer email in "To"'); return; }
    if (!subject.trim() || !body.trim()) { toast.error('Subject and body are required'); return; }
    setBusy('send');
    try {
      const r = await req('/outreach/schedule-send', {
        method: 'POST',
        body: JSON.stringify({ candidate_id: selectedId, to, subject, body, delay_seconds: delay, category: selected?.category }),
      });
      startCountdown(r.queue_id, r.delay_seconds);
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const undoSend = async () => {
    if (!pending) return;
    try {
      await req(`/outreach/cancel-send/${pending.queue_id}`, { method: 'POST' });
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setPending(null);
      toast.success('Send cancelled — nothing went out');
    } catch (e) {
      toast.error(e.message);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setPending((p) => p ? { ...p, remaining: 0, sent: true } : p);
    }
  };

  const slackAlert = async () => {
    setBusy('slack');
    try { await req('/outreach/slack-alert', { method: 'POST', body: JSON.stringify({ candidate_id: selectedId }) }); toast.success('Posted to Slack'); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const pushCrm = async (provider) => {
    setBusy(`crm-${provider}`);
    try {
      await req('/outreach/push-crm', { method: 'POST', body: JSON.stringify({ candidate_id: selectedId, provider, kind: 'task' }) });
      toast.success(`Task created in ${provider === 'hubspot' ? 'HubSpot' : 'Salesforce'}`);
      await loadBoard();
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const saveSlack = async () => {
    setBusy('slack-cfg');
    try {
      await req('/outreach/slack-config', { method: 'PUT', body: JSON.stringify(slackForm) });
      toast.success('Slack connected');
      setSlackOpen(false); setSlackForm({ webhook_url: '', channel_label: '' });
      await loadBoard();
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const addRule = async () => {
    if (!ruleForm.keyword.trim() || !ruleForm.label.trim()) { toast.error('Keyword and label are required'); return; }
    setBusy('rule');
    try {
      await req('/outreach/label-rules', { method: 'POST', body: JSON.stringify(ruleForm) });
      setRuleForm({ keyword: '', label: '', color: 'blue' });
      await loadBoard();
      toast.success('Trigger added');
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };
  const deleteRule = async (rule_id) => {
    try { await req(`/outreach/label-rules/${rule_id}`, { method: 'DELETE' }); await loadBoard(); }
    catch (e) { toast.error(e.message); }
  };

  const integrations = board?.integrations || {};
  const teammates = board?.teammates || [];

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="outreach-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;
  }
  if (gate) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="outreach-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Rocket className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Upgrade Outreach</h2>
          <p className="text-zinc-400 text-sm max-w-md">{gate}</p>
          <Button onClick={() => navigate('/upsell')} className="mt-5 bg-white/10 hover:bg-white/20 text-white" data-testid="outreach-back-gate"><ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Upsell Engine</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="outreach-workspace-page">
        {/* Header */}
        <button onClick={() => navigate('/upsell')} className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-xs mb-4" data-testid="outreach-back-btn"><ArrowLeft className="w-4 h-4" /> Back to Upsell Engine</button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Rocket className="w-4 h-4" /> Revenue Execution · Upgrade Outreach</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Upgrade Outreach</h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">Triage expansion opportunities into intent lanes, let AI draft the upgrade email, review and edit, then send with a strategic undo window — every account tied to attributable $ expansion.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={() => setRulesOpen(true)} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="open-rules-btn"><Settings2 className="w-4 h-4 mr-1.5" /> Label triggers</Button>
            <Button onClick={() => setSlackOpen(true)} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="open-slack-btn"><MessageSquare className="w-4 h-4 mr-1.5" /> {integrations.slack ? 'Slack connected' : 'Connect Slack'}</Button>
          </div>
        </div>

        {/* Intent tabs */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto" data-testid="intent-tabs">
          {CATS.map((c) => {
            const count = c.key === 'all' ? candidates.length : (board?.tabs?.[c.key] || 0);
            return (
              <button key={c.key} onClick={() => setTab(c.key)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors whitespace-nowrap ${tab === c.key ? 'bg-[#0052ff] border-[#0052ff] text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white'}`}
                data-testid={`tab-${c.key}`}>
                {c.name} <span className={`ml-1 text-xs ${tab === c.key ? 'text-white/80' : 'text-zinc-600'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
          {/* Candidate list */}
          <div className={`rounded-2xl ${glass} overflow-hidden self-start`} data-testid="outreach-candidate-list">
            <div className="px-4 py-3 border-b border-white/[0.06] text-xs font-semibold text-zinc-400 uppercase tracking-wide">{tab === 'all' ? 'All opportunities' : CAT_NAME[tab]}</div>
            {visible.length === 0 ? (
              <div className="px-4 py-10 text-center text-zinc-500 text-sm" data-testid="outreach-empty">No opportunities here. Run a scan in the Upsell Engine first.</div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto divide-y divide-white/[0.05]">
                {visible.map((c) => (
                  <button key={c.candidate_id} onClick={() => setSelectedId(c.candidate_id)}
                    className={`w-full text-left px-4 py-3 transition-colors ${selectedId === c.candidate_id ? 'bg-[#0052ff]/10' : 'hover:bg-white/[0.03]'}`}
                    data-testid={`outreach-cand-${c.candidate_id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white font-medium text-sm truncate">{c.account}</span>
                      <span className="text-emerald-400 font-semibold text-sm flex-shrink-0">{money(c.est_expansion_value)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(c.labels || []).slice(0, 3).map((l) => (
                        <span key={l.label} className={`px-1.5 py-0.5 rounded text-[10px] border ${LABEL_COLORS[l.color] || LABEL_COLORS.zinc}`}>{l.label}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> {c.expansion_score}/100</span>
                      {c.assignee && <span className="flex items-center gap-1 truncate"><UserPlus className="w-3 h-3" /> {c.assignee}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Compose pane */}
          {!selected ? (
            <div className={`rounded-2xl ${glass} flex items-center justify-center min-h-[300px] text-zinc-500 text-sm`} data-testid="outreach-no-selection">Select an opportunity to compose an upgrade email.</div>
          ) : (
            <div className={`rounded-2xl ${glass} p-5`} data-testid="outreach-compose">
              {/* account header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-4 border-b border-white/[0.06]">
                <div>
                  <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Outfit' }}>{selected.account}</h2>
                  <div className="text-xs text-zinc-500 mt-0.5">Now {money(selected.current_value)} · potential <span className="text-emerald-400 font-semibold">{money(selected.est_expansion_value)}/yr</span> · score {selected.expansion_score}/100</div>
                </div>
                <select value={selected.category} onChange={(e) => moveCategory(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-8 px-2 self-start" data-testid="category-select">
                  <option value="priority">Priority Pipeline</option>
                  <option value="sales">Sales</option>
                  <option value="marketing">Marketing</option>
                </select>
              </div>

              {/* labels */}
              <div className="py-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2 flex-wrap" data-testid="labels-row">
                  {(selected.labels || []).map((l) => (
                    <span key={l.label} className={`group px-2 py-0.5 rounded-md text-[11px] border inline-flex items-center gap-1 ${LABEL_COLORS[l.color] || LABEL_COLORS.zinc}`}>
                      {l.label}
                      <button onClick={() => removeLabel(l.label)} className="opacity-50 hover:opacity-100" data-testid={`remove-label-${l.label}`}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  <div className="flex items-center gap-1">
                    <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLabel()} placeholder="+ label" className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-[11px] h-7 px-2 w-24" data-testid="add-label-input" />
                  </div>
                </div>
              </div>

              {/* assign + to */}
              <div className="grid sm:grid-cols-2 gap-3 py-4 border-b border-white/[0.06]">
                <div>
                  <Label className="text-zinc-500 text-[11px]">Assign to (teammate)</Label>
                  <div className="flex gap-1.5 mt-1">
                    <input list="teammates-list" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="@teammate or email" className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md text-white h-9 text-sm px-2" data-testid="assignee-input" />
                    <datalist id="teammates-list">
                      {teammates.map((t) => <option key={t.email} value={t.email}>{t.name}</option>)}
                    </datalist>
                    <Button onClick={saveAssignee} className="h-9 bg-white/10 hover:bg-white/20 text-white px-3" data-testid="save-assignee-btn"><Check className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div>
                  <Label className="text-zinc-500 text-[11px]">To (customer)</Label>
                  <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="contact@customer.com" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="to-input" />
                </div>
              </div>

              {/* draft */}
              <div className="py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-zinc-400 text-xs font-semibold">Upgrade email</Label>
                  <Button onClick={generateDraft} disabled={busy === 'draft'} size="sm" className="h-8 text-xs bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="generate-draft-btn">{busy === 'draft' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} AI draft</Button>
                </div>
                <div><Label className="text-zinc-500 text-[11px]">Subject</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="subject-input" /></div>
                <div><Label className="text-zinc-500 text-[11px]">Body</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="bg-zinc-900 border-zinc-700 text-white text-sm mt-1 leading-relaxed" placeholder="Click “AI draft” to generate, then review and edit before sending." data-testid="body-input" /></div>

                {/* links */}
                <div>
                  <Label className="text-zinc-500 text-[11px] flex items-center gap-1"><Link2 className="w-3 h-3" /> Links to include</Label>
                  <div className="flex gap-1.5 mt-1">
                    <Input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} placeholder="https://yourapp.com/upgrade" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm" data-testid="link-input" />
                    <Button onClick={addLink} className="h-9 bg-white/10 hover:bg-white/20 text-white px-3" data-testid="add-link-btn"><Plus className="w-4 h-4" /></Button>
                  </div>
                  {links.length > 0 && (
                    <div className="mt-2 space-y-1" data-testid="links-list">
                      {links.map((l, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-sky-300 bg-white/[0.03] rounded-md px-2 py-1.5">
                          <Link2 className="w-3 h-3 flex-shrink-0" /><span className="truncate flex-1">{l}</span>
                          <button onClick={() => removeLink(i)} className="text-zinc-600 hover:text-red-400" data-testid={`remove-link-${i}`}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* integration actions */}
              <div className="flex flex-wrap items-center gap-2 py-4 border-t border-white/[0.06]" data-testid="integration-actions">
                <span className="text-[11px] text-zinc-500 mr-1">Route to:</span>
                {integrations.slack ? (
                  <Button onClick={slackAlert} disabled={busy === 'slack'} size="sm" className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white" data-testid="slack-alert-btn">{busy === 'slack' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5 mr-1" />} Slack alert</Button>
                ) : (
                  <Button onClick={() => setSlackOpen(true)} size="sm" variant="outline" className="h-8 text-xs border-zinc-700 text-zinc-400 hover:bg-white/5" data-testid="slack-connect-inline"><MessageSquare className="w-3.5 h-3.5 mr-1" /> Connect Slack</Button>
                )}
                {integrations.hubspot && <Button onClick={() => pushCrm('hubspot')} disabled={busy === 'crm-hubspot'} size="sm" className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white" data-testid="push-hubspot-btn">{busy === 'crm-hubspot' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Building2 className="w-3.5 h-3.5 mr-1" />} HubSpot task</Button>}
                {integrations.salesforce && <Button onClick={() => pushCrm('salesforce')} disabled={busy === 'crm-salesforce'} size="sm" className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white" data-testid="push-salesforce-btn">{busy === 'crm-salesforce' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Building2 className="w-3.5 h-3.5 mr-1" />} Salesforce task</Button>}
              </div>

              {/* send row / undo countdown */}
              {pending ? (
                <div className="flex items-center justify-between gap-3 mt-2 rounded-xl bg-[#0052ff]/10 border border-[#0052ff]/30 px-4 py-3" data-testid="undo-banner">
                  {pending.sent ? (
                    <span className="text-emerald-300 text-sm font-medium flex items-center gap-2"><Check className="w-4 h-4" /> Sent to {to}</span>
                  ) : (
                    <>
                      <span className="text-white text-sm font-medium flex items-center gap-2"><Send className="w-4 h-4 text-[#4d8bff]" /> Sending in <span className="font-mono" data-testid="undo-countdown">{pending.remaining}s</span>…</span>
                      <Button onClick={undoSend} size="sm" className="h-8 text-xs bg-white/15 hover:bg-white/25 text-white" data-testid="undo-send-btn"><Undo2 className="w-3.5 h-3.5 mr-1" /> Undo</Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-zinc-500 text-[11px]">Undo window</Label>
                    <select value={delay} onChange={(e) => setDelay(parseInt(e.target.value))} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-8 px-2" data-testid="delay-select">
                      <option value={10}>10 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={saveDraft} disabled={busy === 'save'} variant="outline" className="h-9 border-zinc-700 text-zinc-300 hover:bg-white/5 text-sm" data-testid="save-draft-btn">{busy === 'save' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Save draft</Button>
                    <Button onClick={scheduleSend} disabled={busy === 'send'} className="h-9 bg-[#0052ff] hover:bg-[#0047d6] text-white text-sm" data-testid="send-btn">{busy === 'send' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />} Send</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Slack connect dialog */}
      <Dialog open={slackOpen} onOpenChange={setSlackOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="slack-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-[#0052ff]" /> Connect Slack</DialogTitle>
            <DialogDescription className="text-zinc-400">Post upsell alerts to a Slack channel. Create an <span className="text-zinc-200">Incoming Webhook</span> in your Slack app settings and paste its URL below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-zinc-400 text-xs">Incoming Webhook URL</Label><Input value={slackForm.webhook_url} onChange={(e) => setSlackForm({ ...slackForm, webhook_url: e.target.value })} placeholder="https://hooks.slack.com/services/..." className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="slack-webhook-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Channel label (optional)</Label><Input value={slackForm.channel_label} onChange={(e) => setSlackForm({ ...slackForm, channel_label: e.target.value })} placeholder="#revenue-alerts" className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="slack-channel-input" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSlackOpen(false)} className="text-zinc-400" data-testid="slack-cancel-btn">Cancel</Button>
            <Button onClick={saveSlack} disabled={busy === 'slack-cfg'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="slack-save-btn">{busy === 'slack-cfg' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Label triggers dialog */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="rules-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><Tag className="w-5 h-5 text-[#0052ff]" /> Behavioral label triggers</DialogTitle>
            <DialogDescription className="text-zinc-400">Auto-apply a label to any opportunity whose account name or signals contain a keyword. Built-in labels (Upgrade Potential, Hot Lead, Churn Risk…) apply automatically from account health.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-[40vh] overflow-y-auto" data-testid="rules-list">
            {(board?.label_rules || []).length === 0 ? (
              <div className="text-zinc-500 text-sm text-center py-4">No keyword triggers yet.</div>
            ) : (board?.label_rules || []).map((r) => (
              <div key={r.rule_id} className="flex items-center gap-2 bg-white/[0.03] rounded-lg px-3 py-2" data-testid={`rule-${r.rule_id}`}>
                <span className="text-zinc-400 text-xs">if contains</span>
                <span className="text-white text-xs font-medium">“{r.keyword}”</span>
                <span className="text-zinc-400 text-xs">→</span>
                <span className={`px-2 py-0.5 rounded-md text-[11px] border ${LABEL_COLORS[r.color] || LABEL_COLORS.zinc}`}>{r.label}</span>
                <button onClick={() => deleteRule(r.rule_id)} className="ml-auto text-zinc-600 hover:text-red-400" data-testid={`delete-rule-${r.rule_id}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end pt-2 border-t border-white/[0.06]">
            <div><Label className="text-zinc-500 text-[11px]">Keyword</Label><Input value={ruleForm.keyword} onChange={(e) => setRuleForm({ ...ruleForm, keyword: e.target.value })} placeholder="enterprise" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="rule-keyword-input" /></div>
            <div><Label className="text-zinc-500 text-[11px]">Label</Label><Input value={ruleForm.label} onChange={(e) => setRuleForm({ ...ruleForm, label: e.target.value })} placeholder="Strategic" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="rule-label-input" /></div>
            <select value={ruleForm.color} onChange={(e) => setRuleForm({ ...ruleForm, color: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm h-9 px-2" data-testid="rule-color-select">
              {COLOR_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <DialogFooter>
            <Button onClick={addRule} disabled={busy === 'rule'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="add-rule-btn">{busy === 'rule' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />} Add trigger</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
