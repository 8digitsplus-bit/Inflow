import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import {
  Telescope, ScanLine, Loader2, Flame, Users, TrendingUp, Mail, CalendarClock, Route,
  Sparkles, Check, Copy, Target, Brain, Lightbulb, Zap, Trophy, ArrowDown, ChevronDown, ChevronUp, ArrowUpRight,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const CAT_STYLE = {
  Marketing: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  Sales: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Product: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};
const STATUS_STYLE = {
  new: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  analyzed: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  executed: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  won: 'bg-emerald-500/25 text-emerald-200 border-emerald-500/40',
  lost: 'bg-red-500/15 text-red-300 border-red-500/30',
  dismissed: 'bg-zinc-600/15 text-zinc-400 border-zinc-600/30',
};
const ACTION_META = {
  send_email: { label: 'Send email', icon: Mail },
  book_call: { label: 'Book a call', icon: CalendarClock },
  loop_in_ae: { label: 'Loop in AE', icon: Route },
  nurture: { label: 'Nurture', icon: Sparkles },
};
const OUTCOMES = [
  { key: 'replied', label: 'Positive reply' },
  { key: 'meeting_booked', label: 'Meeting booked' },
  { key: 'won', label: 'Won' },
  { key: 'no_response', label: 'No response' },
  { key: 'lost', label: 'Lost' },
];
const glass = 'bg-white/[0.04] border border-white/10 backdrop-blur-xl';

// ---- one step in the vertical flow
const Step = ({ icon: Icon, n, label, done, active, children, last }) => (
  <div className="relative pl-11" data-testid={`flow-step-${n}`}>
    {!last && <div className={`absolute left-[15px] top-8 bottom-0 w-px ${done ? 'bg-emerald-500/40' : 'bg-white/10'}`} />}
    <div className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center border ${done ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : active ? 'bg-[#0052ff]/20 border-[#0052ff]/50 text-[#4d8bff]' : 'bg-white/[0.03] border-white/10 text-zinc-500'}`}>
      {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
    </div>
    <div className="pb-6">
      <div className="text-[11px] uppercase tracking-widest font-semibold text-slate-400 mb-1.5">{label}</div>
      {children}
    </div>
  </div>
);

export default function HighIntent() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [expanded, setExpanded] = useState(null);

  const [flow, setFlow] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [artifact, setArtifact] = useState('');
  const [to, setTo] = useState('');
  const [executing, setExecuting] = useState(false);
  const [measuring, setMeasuring] = useState('');
  const [copied, setCopied] = useState(false);

  const isOwner = !!status?.is_owner;

  const req = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api/intent${path}`, {
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
      if (st.is_paid) setLeads(await req('/leads'));
    } catch (e) { /* gate */ }
    finally { setLoading(false); }
  }, [req]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openL = leads.filter(l => !['dismissed', 'won', 'lost'].includes(l.status));
  const hot = openL.filter(l => l.intent_score >= 60);
  const influenced = leads.reduce((s, l) => s + (l.impact?.value_influenced || 0), 0);

  const handleScan = async () => {
    setBusy('scan');
    try {
      const r = await req('/scan', { method: 'POST' });
      toast.success(`Scan complete — ${r.leads_found} buyer(s), ${r.hot_leads} hot`);
      setLeads(await req('/leads'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const runAnalyze = useCallback(async (lead) => {
    setAnalyzing(true);
    try {
      const b = await req(`/leads/${lead.lead_id}/analyze`, { method: 'POST', body: '{}' });
      setFlow(f => f && f.lead_id === lead.lead_id ? { ...f, briefing: b, status: f.status === 'new' ? 'analyzed' : f.status } : f);
      setArtifact(b.recommended_action?.artifact || '');
      setLeads(await req('/leads'));
    } catch (e) { toast.error(e.message); }
    setAnalyzing(false);
  }, [req]);

  const openFlow = (lead) => {
    setFlow(lead);
    setArtifact(lead.briefing?.recommended_action?.artifact || '');
    setTo(lead.contact_email || '');
    setCopied(false);
    if (!lead.briefing) runAnalyze(lead);
  };

  const doExecute = async (send) => {
    const type = flow.briefing?.recommended_action?.type;
    if (send && type === 'send_email' && (!to || !to.includes('@'))) { toast.error('Enter a recipient email to send'); return; }
    setExecuting(true);
    try {
      const r = await req(`/leads/${flow.lead_id}/execute`, { method: 'POST', body: JSON.stringify({ to, send: !!send, artifact }) });
      toast.success(r.sent ? `Sent to ${to}` : 'Marked as executed');
      setFlow(f => ({ ...f, executed: r.executed, status: 'executed' }));
      setLeads(await req('/leads'));
    } catch (e) { toast.error(e.message); }
    setExecuting(false);
  };

  const doMeasure = async (outcome) => {
    setMeasuring(outcome);
    try {
      const im = await req(`/leads/${flow.lead_id}/impact`, { method: 'POST', body: JSON.stringify({ outcome }) });
      setFlow(f => ({ ...f, impact: im, status: outcome === 'won' ? 'won' : outcome === 'lost' ? 'lost' : 'executed' }));
      setLeads(await req('/leads'));
      toast.success('Impact measured');
    } catch (e) { toast.error(e.message); }
    setMeasuring('');
  };

  const dismissLead = async (l) => {
    try { await req(`/leads/${l.lead_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) }); setLeads(await req('/leads')); }
    catch (e) { toast.error(e.message); }
  };

  const copyArtifact = async () => {
    try {
      await navigator.clipboard.writeText(artifact || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.error('Clipboard unavailable — select the text and copy manually');
    }
  };

  // -------- gates
  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="intent-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;
  if (!status?.is_paid) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="intent-paid-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Telescope className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Upsell Engine</h2>
          <p className="text-zinc-400 text-sm max-w-md">Grow revenue from the accounts most ready to move. Available on any active InFlow subscription.</p>
        </div>
      </DashboardLayout>
    );
  }

  const briefing = flow?.briefing;
  const pred = briefing?.prediction;
  const action = briefing?.recommended_action;
  const ActionIcon = action ? (ACTION_META[action.type]?.icon || Zap) : Zap;
  const isEmail = action?.type === 'send_email';
  const executed = flow?.executed;
  const impact = flow?.impact;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="high-intent-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Telescope className="w-4 h-4" /> Revenue Execution · Upsell</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Upsell Engine</h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">Spot an account that's ready to grow, let AI analyze everything, understand <span className="text-white">why it matters</span>, see the <span className="text-white">predicted outcome</span>, and execute the <span className="text-white">one action</span> that expands revenue — then measure the impact.</p>
          </div>
          <Button onClick={handleScan} disabled={busy === 'scan'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-9 text-sm flex-shrink-0" data-testid="scan-buyers-btn">
            {busy === 'scan' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ScanLine className="w-4 h-4 mr-1.5" />} Scan for buyers
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-hot">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><Flame className="w-4 h-4" /> Hot buyers</div>
            <div className="text-3xl font-bold text-white">{hot.length}</div>
            <div className="text-[11px] text-zinc-500 mt-1">intent score ≥ 60</div>
          </div>
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-open">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><Users className="w-4 h-4" /> Buyers in play</div>
            <div className="text-3xl font-bold text-white">{openL.length}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{leads.length} detected total</div>
          </div>
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-influenced">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><TrendingUp className="w-4 h-4" /> Revenue influenced</div>
            <div className="text-3xl font-bold text-white">{money(influenced)}</div>
            <div className="text-[11px] text-zinc-500 mt-1">measured impact</div>
          </div>
        </div>

        {/* Leads */}
        <div className={`rounded-2xl ${glass} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2"><Target className="w-4 h-4 text-slate-400" /><h2 className="text-sm font-semibold text-white">Upsell opportunities</h2>{!isOwner && <span className="text-[11px] text-zinc-500 ml-auto">Flow actions are owner-only</span>}</div>
          {openL.length === 0 ? (
            <div className="px-5 py-12 text-center text-zinc-500 text-sm" data-testid="no-leads">No buyers detected yet. Click <span className="text-white font-medium">Scan for buyers</span> to analyze your open opportunities for buying-intent signals.</div>
          ) : (
            <div className="divide-y divide-white/[0.05]" data-testid="leads-list">
              {openL.map((l) => (
                <div key={l.lead_id} className="px-5 py-4" data-testid={`lead-row-${l.lead_id}`}>
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium truncate">{l.account}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${STATUS_STYLE[l.status] || STATUS_STYLE.new}`} data-testid={`lead-status-${l.lead_id}`}>{l.status}</span>
                        <span className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${l.intent_score >= 60 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-white/5 text-zinc-400 border-white/10'}`}><Flame className="w-3 h-3" /> {l.intent_score}/100</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(l.signals || []).map((s) => (
                          <span key={s.key} className={`px-2 py-0.5 rounded-md text-[10px] border ${CAT_STYLE[s.cat] || 'bg-white/5 text-zinc-300 border-white/10'}`} title={`${s.cat}: ${s.detail}`}>{s.label} · {s.detail}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right lg:flex-shrink-0">
                      <div className="text-lg font-bold text-white">{money(l.value)}</div>
                      <div className="text-[11px] text-zinc-500">open · {l.probability}% · {l.best_stage}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Button size="sm" disabled={!isOwner} onClick={() => openFlow(l)} className="h-8 text-xs bg-[#0052ff] hover:bg-[#0047d6] text-white disabled:opacity-40" data-testid={`open-flow-${l.lead_id}`}><Sparkles className="w-3.5 h-3.5 mr-1" /> {l.briefing ? 'Open AI flow' : 'Analyze buyer'}</Button>
                    <button onClick={() => setExpanded(expanded === l.lead_id ? null : l.lead_id)} className="h-8 text-xs text-zinc-400 hover:text-white flex items-center gap-1 px-2" data-testid={`activity-${l.lead_id}`}>{expanded === l.lead_id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Activity</button>
                    {isOwner && <Button size="sm" variant="ghost" onClick={() => dismissLead(l)} className="h-8 text-xs text-zinc-500 hover:text-zinc-300 ml-auto" data-testid={`dismiss-${l.lead_id}`}>Dismiss</Button>}
                  </div>
                  {expanded === l.lead_id && (
                    <div className="mt-3 rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-1.5" data-testid={`activity-log-${l.lead_id}`}>
                      {(l.activity || []).slice().reverse().map((a, i) => (
                        <div key={i} className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap"><span className="text-zinc-600">{new Date(a.ts).toLocaleDateString()}</span><span className="text-zinc-500 capitalize">{a.type.replace('_', ' ')}:</span> {a.detail} <span className="text-zinc-600">· {a.by}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Guided flow dialog */}
      <Dialog open={!!flow} onOpenChange={(o) => { if (!o) setFlow(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="flow-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-[#4d8bff]" /> {flow?.account}</DialogTitle>
            <DialogDescription className="text-zinc-400">Guided AI flow — from detection to measured impact.</DialogDescription>
          </DialogHeader>

          {flow && (
            <div className="pt-2">
              {/* 1. Opportunity detected */}
              <Step icon={Target} n={1} label="Opportunity detected" done active>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${flow.intent_score >= 60 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-white/5 text-zinc-400 border-white/10'}`}><Flame className="w-3 h-3" /> intent {flow.intent_score}/100</span>
                  <span className="text-xs text-zinc-500">{money(flow.value)} · {flow.best_stage} · {flow.probability}%</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(flow.signals || []).map((s) => (
                    <span key={s.key} className={`px-2 py-0.5 rounded-md text-[10px] border ${CAT_STYLE[s.cat] || 'bg-white/5 text-zinc-300 border-white/10'}`}>{s.label}</span>
                  ))}
                </div>
              </Step>

              {/* 2. AI analyzes everything */}
              <Step icon={Brain} n={2} label="AI analyzes everything" done={!!briefing} active={analyzing}>
                {analyzing ? (
                  <div className="flex items-center gap-2 text-zinc-400 text-sm" data-testid="flow-analyzing"><Loader2 className="w-4 h-4 animate-spin" /> Reading the signals and building a briefing…</div>
                ) : briefing ? (
                  <div className="text-xs text-emerald-400/80 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Analysis complete</div>
                ) : (
                  <Button size="sm" onClick={() => runAnalyze(flow)} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-8 text-xs" data-testid="flow-analyze-btn"><Brain className="w-3.5 h-3.5 mr-1" /> Analyze</Button>
                )}
              </Step>

              {briefing && (
                <>
                  {/* 3. Why this buyer matters */}
                  <Step icon={Lightbulb} n={3} label="Why this buyer matters" done>
                    <p className="text-sm text-zinc-200 leading-relaxed" data-testid="flow-why">{briefing.why}</p>
                  </Step>

                  {/* 4. Predicted outcome */}
                  <Step icon={TrendingUp} n={4} label="AI predicts the outcome" done>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="flow-prediction">
                      <div className="grid grid-cols-3 gap-3 text-center mb-3">
                        <div><div className="text-[10px] uppercase text-zinc-500 tracking-wide">Close prob.</div><div className="text-lg font-bold text-[#4d8bff]">{pred.close_probability}%</div></div>
                        <div><div className="text-[10px] uppercase text-zinc-500 tracking-wide">Expected</div><div className="text-lg font-bold text-emerald-400">{money(pred.expected_value)}</div></div>
                        <div><div className="text-[10px] uppercase text-zinc-500 tracking-wide">Timeline</div><div className="text-lg font-bold text-white">{pred.timeline}</div></div>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-2"><div className="h-full bg-gradient-to-r from-[#0052ff] to-[#4d8bff]" style={{ width: `${pred.close_probability}%` }} /></div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border uppercase ${pred.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : pred.confidence === 'medium' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'}`}>{pred.confidence} confidence</span>
                        <span className="text-xs text-zinc-400">{pred.summary}</span>
                      </div>
                    </div>
                  </Step>

                  {/* 5. Recommended ONE action */}
                  <Step icon={Zap} n={5} label="AI recommends one action" done={!!executed}>
                    <div className="rounded-xl border border-[#0052ff]/30 bg-[#0052ff]/[0.06] p-4" data-testid="flow-recommendation">
                      <div className="flex items-center gap-2 mb-1">
                        <ActionIcon className="w-4 h-4 text-[#4d8bff]" />
                        <span className="text-white font-semibold text-sm">{action.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/10">{ACTION_META[action.type]?.label || action.type}</span>
                      </div>
                      <p className="text-xs text-zinc-400 mb-3">{action.rationale}</p>
                      <Textarea value={artifact} onChange={(e) => setArtifact(e.target.value)} rows={7} className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm leading-relaxed" data-testid="flow-artifact" />
                      <div className="flex justify-end mt-2">
                        <Button size="sm" variant="outline" onClick={copyArtifact} className="border-zinc-700 text-zinc-300 hover:bg-white/5 h-8 text-xs" data-testid="flow-copy-btn">{copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />} {copied ? 'Copied' : 'Copy'}</Button>
                      </div>
                    </div>
                  </Step>

                  {/* 6. User executes */}
                  <Step icon={Check} n={6} label="Execute" done={!!executed}>
                    {executed ? (
                      <div className="text-sm text-emerald-300 flex items-center gap-2" data-testid="flow-executed"><Check className="w-4 h-4" /> {executed.sent ? `Email sent · ${flow.contact_email}` : `Executed: ${executed.title}`}</div>
                    ) : (
                      <div className="space-y-2">
                        {isEmail && (
                          <div><Label className="text-zinc-500 text-[11px]">Recipient email</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="buyer@company.com" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="flow-to-input" /></div>
                        )}
                        <div className="flex items-center gap-2">
                          {isEmail ? (
                            <>
                              <Button size="sm" onClick={() => doExecute(true)} disabled={executing} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-8 text-xs" data-testid="flow-execute-send-btn">{executing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Mail className="w-3.5 h-3.5 mr-1" />} Send &amp; mark done</Button>
                              <button onClick={() => doExecute(false)} disabled={executing} className="text-xs text-zinc-500 hover:text-zinc-300" data-testid="flow-execute-mark-btn">Mark done without sending</button>
                            </>
                          ) : (
                            <Button size="sm" onClick={() => doExecute(false)} disabled={executing} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-8 text-xs" data-testid="flow-execute-mark-btn">{executing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} Mark as done</Button>
                          )}
                        </div>
                      </div>
                    )}
                  </Step>

                  {/* 7. AI measures impact */}
                  {executed && (
                    <Step icon={Trophy} n={7} label="AI measures impact" done={!!impact} last>
                      {impact ? (
                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4" data-testid="flow-impact">
                          <div className="flex items-center gap-2 mb-1">
                            <Trophy className="w-4 h-4 text-emerald-400" />
                            <span className="text-white font-semibold text-sm capitalize">{impact.outcome.replace('_', ' ')}</span>
                            {impact.value_influenced > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">+{money(impact.value_influenced)} influenced</span>}
                          </div>
                          <p className="text-xs text-zinc-300">{impact.summary}</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Log the outcome so InFlow can measure impact and learn.</p>
                          <div className="flex flex-wrap gap-2" data-testid="flow-outcomes">
                            {OUTCOMES.map((o) => (
                              <Button key={o.key} size="sm" variant="outline" disabled={!!measuring} onClick={() => doMeasure(o.key)} className="border-zinc-700 text-zinc-300 hover:bg-white/5 h-8 text-xs" data-testid={`flow-outcome-${o.key}`}>{measuring === o.key ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}{o.label}</Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </Step>
                  )}
                </>
              )}

              {/* Manage in individual workspace (2-way sync) */}
              <div className="border-t border-white/10 mt-1 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" data-testid="flow-manage-footer">
                <div className="text-[11px] text-zinc-500">Open a dedicated workspace to sync this account both ways with your CRM.</div>
                <Button size="sm" variant="outline" onClick={() => navigate(`/workspace/account/${flow.lead_id}`)} className="border-[#0052ff]/40 text-[#4d8bff] hover:bg-[#0052ff]/10 h-8 text-xs" data-testid="flow-manage-btn"><ArrowUpRight className="w-3.5 h-3.5 mr-1" /> Manage</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
