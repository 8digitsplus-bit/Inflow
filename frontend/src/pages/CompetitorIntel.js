import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Swords, Plus, Trash2, RefreshCw, Pencil, Loader2, Globe, TrendingUp, TrendingDown,
  Minus, ExternalLink, AlertTriangle, History, Building2, DollarSign,
  Target, Search, Brain, Share2, Rocket, Check, Copy, Download, X, ChevronRight, ChevronLeft,
  Sparkles, Lightbulb, ShieldAlert, CheckCircle2, Circle, Users, Package, MessageSquare, Compass,
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
const money = (n, cur = 'USD') =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: (cur || 'USD').toUpperCase(), maximumFractionDigits: 0 }).format(n);
const emptyPlan = () => ({ name: '', price: null, period: 'monthly', currency: 'USD', features: [] });

const STEPS = [
  { id: 1, title: 'Plan', sub: 'Define what you need to learn, such as new pricing or product features.', icon: Target },
  { id: 2, title: 'Gather', sub: 'Collect legal and public data from websites, social media, financial filings, and job postings.', icon: Search },
  { id: 3, title: 'Analyze', sub: 'Turn raw facts into clear patterns. Compare competitor strengths and weaknesses against your own.', icon: Brain },
  { id: 4, title: 'Share', sub: 'Distribute key insights to internal teams like sales, product, or leadership.', icon: Share2 },
  { id: 5, title: 'Act', sub: 'Use the findings to adjust your strategy, tweak prices, or update products.', icon: Rocket },
];

const FOCUS_OPTIONS = ['Pricing', 'Product features', 'Positioning & messaging', 'Job postings (hiring)', 'Financial filings (funding)', 'Social media', 'News & PR'];
const GATHER_SOURCES = [
  { label: 'Websites & pricing pages', icon: Globe },
  { label: 'Social media', icon: Users },
  { label: 'Financial filings', icon: DollarSign },
  { label: 'Job postings', icon: Building2 },
];
const TEAMS = [
  { key: 'sales', label: 'Sales' },
  { key: 'product', label: 'Product' },
  { key: 'leadership', label: 'Leadership' },
  { key: 'marketing', label: 'Marketing' },
];
const CAT_META = {
  pricing: { icon: DollarSign, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  product: { icon: Package, cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  messaging: { icon: MessageSquare, cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  strategy: { icon: Compass, cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
};
const STATUS_META = {
  todo: { label: 'To do', cls: 'text-zinc-400', dot: 'bg-zinc-500' },
  in_progress: { label: 'In progress', cls: 'text-amber-400', dot: 'bg-amber-500' },
  done: { label: 'Done', cls: 'text-emerald-400', dot: 'bg-emerald-500' },
};
const nextStatus = (s) => (s === 'todo' ? 'in_progress' : s === 'in_progress' ? 'done' : 'todo');

// Reusable plan editor (competitor plans + your own pricing)
const PlanEditor = ({ plans, setPlans, testid }) => (
  <div className="space-y-3" data-testid={testid}>
    {plans.map((p, i) => (
      <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
        <div className="flex gap-2">
          <Input value={p.name} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Plan name" className="bg-zinc-900 border-zinc-700 text-white h-8 text-sm" data-testid={`${testid}-name-${i}`} />
          <Input type="number" value={p.price ?? ''} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, price: e.target.value === '' ? null : parseFloat(e.target.value) } : x))} placeholder="Price" className="bg-zinc-900 border-zinc-700 text-white h-8 text-sm w-24" data-testid={`${testid}-price-${i}`} />
          <select value={p.period} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, period: e.target.value } : x))} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-8 px-1">
            <option value="monthly">/mo</option>
            <option value="yearly">/yr</option>
            <option value="one-time">once</option>
            <option value="custom">custom</option>
          </select>
          <button onClick={() => setPlans(plans.filter((_, j) => j !== i))} className="text-zinc-600 hover:text-red-400 px-1" data-testid={`${testid}-remove-${i}`}><Trash2 className="w-4 h-4" /></button>
        </div>
        <Textarea
          value={(p.features || []).join('\n')}
          onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, features: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } : x))}
          placeholder="One feature per line"
          rows={2}
          className="bg-zinc-900 border-zinc-700 text-white text-xs"
        />
      </div>
    ))}
    <Button onClick={() => setPlans([...plans, emptyPlan()])} variant="ghost" className="text-zinc-400 hover:text-white h-8 text-xs" data-testid={`${testid}-add-plan`}>
      <Plus className="w-4 h-4 mr-1" /> Add plan
    </Button>
  </div>
);

const StatusBadge = ({ status }) => {
  const map = {
    extracted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    manual: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    error: 'bg-red-500/15 text-red-300 border-red-500/30',
    empty: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    pending: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${map[status] || map.pending}`}>{status}</span>;
};

// Add/remove tag list with its own input
const TagList = ({ items, onAdd, onRemove, placeholder, testid }) => {
  const [val, setVal] = useState('');
  const add = () => { const v = val.trim(); if (v) { onAdd(v); setVal(''); } };
  return (
    <div data-testid={testid}>
      <div className="flex gap-2 mb-2">
        <Input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm" data-testid={`${testid}-input`} />
        <Button onClick={add} className="bg-white/10 hover:bg-white/20 text-white h-9 shrink-0" data-testid={`${testid}-add`}><Plus className="w-4 h-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-sm text-zinc-200" data-testid={`${testid}-item-${i}`}>
            {it}
            <button onClick={() => onRemove(i)} className="text-zinc-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-zinc-600 py-1">Nothing added yet.</span>}
      </div>
    </div>
  );
};

const Bullets = ({ title, items, icon: Icon, color }) => (
  <div>
    <div className={`flex items-center gap-1.5 text-xs font-semibold mb-1.5 ${color}`}><Icon className="w-3.5 h-3.5" /> {title}</div>
    <ul className="space-y-1">
      {items.map((t, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-zinc-600 mt-1">•</span><span>{t}</span></li>)}
      {items.length === 0 && <li className="text-xs text-zinc-600">—</li>}
    </ul>
  </div>
);

export default function CompetitorIntel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState(1);

  const [competitors, setCompetitors] = useState([]);
  const [bench, setBench] = useState(null);
  const [plan, setPlan] = useState({ objectives: [], focus_areas: [], key_questions: [], notes: '' });
  const [analysis, setAnalysis] = useState(null);
  const [actions, setActions] = useState([]);
  const [shares, setShares] = useState([]);
  const [busy, setBusy] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', url: '' });
  const [editComp, setEditComp] = useState(null);
  const [editPlans, setEditPlans] = useState([]);
  const [myOpen, setMyOpen] = useState(false);
  const [myPlans, setMyPlans] = useState([]);

  const [shareTeams, setShareTeams] = useState([]);
  const [shareNote, setShareNote] = useState('');
  const [newAction, setNewAction] = useState({ title: '', category: 'strategy' });

  const req = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api/competitors${path}`, {
      credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }, []);

  const refresh = useCallback(async () => {
    const [c, b, pl, an, ac, sh] = await Promise.all([
      req(''), req('/benchmark'), req('/plan'), req('/analysis'), req('/actions'), req('/shares'),
    ]);
    setCompetitors(c || []);
    setBench(b);
    setPlan({ objectives: pl?.objectives || [], focus_areas: pl?.focus_areas || [], key_questions: pl?.key_questions || [], notes: pl?.notes || '' });
    setAnalysis(an?.analysis === null ? null : an);
    setActions(ac || []);
    setShares(sh || []);
  }, [req]);

  const load = useCallback(async () => {
    try {
      const st = await req('/status');
      setStatus(st);
      if (st.is_enterprise && st.is_owner) await refresh();
    } catch (e) { /* gate renders */ } finally { setLoading(false); }
  }, [req, refresh]);

  useEffect(() => { load(); }, [load]);

  // ---- Plan
  const savePlan = async () => {
    setBusy('plan');
    try { await req('/plan', { method: 'PUT', body: JSON.stringify(plan) }); toast.success('Intelligence plan saved'); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };
  const toggleFocus = (f) => setPlan((p) => ({ ...p, focus_areas: p.focus_areas.includes(f) ? p.focus_areas.filter((x) => x !== f) : [...p.focus_areas, f] }));

  // ---- Gather (competitors)
  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.url.trim()) { toast.error('Name and URL are required'); return; }
    setBusy('add');
    try {
      const c = await req('', { method: 'POST', body: JSON.stringify(addForm) });
      if (c.status === 'error' || c.status === 'empty') toast.warning(c.error || 'Added — add plans manually');
      else toast.success(`Extracted ${c.plans.length} plan(s) from ${c.name}`);
      setAddOpen(false); setAddForm({ name: '', url: '' });
      await refresh();
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };
  const handleRescan = async (id) => {
    setBusy(`rescan-${id}`);
    try { const r = await req(`/${id}/rescan`, { method: 'POST' }); toast.success(r.changes.length ? `${r.changes.length} price change(s) detected` : 'Rescanned — no changes'); await refresh(); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };
  const handleDelete = async (id) => {
    try { await req(`/${id}`, { method: 'DELETE' }); await refresh(); toast.success('Competitor removed'); }
    catch (e) { toast.error(e.message); }
  };
  const openEdit = (c) => { setEditComp(c); setEditPlans((c.plans || []).map((p) => ({ ...p }))); };
  const saveEdit = async () => {
    setBusy('edit');
    try { await req(`/${editComp.competitor_id}`, { method: 'PUT', body: JSON.stringify({ name: editComp.name, url: editComp.url, plans: editPlans }) }); toast.success('Competitor updated'); setEditComp(null); await refresh(); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };
  const openMyPricing = async () => {
    try { const d = await req('/my-pricing'); setMyPlans((d.plans || []).map((p) => ({ ...p }))); setMyOpen(true); }
    catch (e) { toast.error(e.message); }
  };
  const saveMyPricing = async () => {
    setBusy('my');
    try { await req('/my-pricing', { method: 'PUT', body: JSON.stringify({ plans: myPlans }) }); toast.success('Your pricing saved'); setMyOpen(false); await refresh(); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };

  // ---- Analyze
  const runAnalysis = async () => {
    setBusy('analyze');
    try { const a = await req('/analyze', { method: 'POST' }); setAnalysis(a); toast.success(a.ai_used ? 'AI analysis ready' : 'Benchmark analysis ready'); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };

  // ---- Share
  const copyReport = async () => {
    try { const r = await req('/report'); await navigator.clipboard.writeText(r.markdown); toast.success('Report copied to clipboard'); }
    catch (e) { toast.error('Copy failed — ' + e.message); }
  };
  const downloadReport = async () => {
    try {
      const r = await req('/report');
      const blob = new Blob([r.markdown], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `competitive-intel-${new Date().toISOString().slice(0, 10)}.md`;
      a.click(); URL.revokeObjectURL(a.href);
      toast.success('Report downloaded');
    } catch (e) { toast.error(e.message); }
  };
  const logShare = async () => {
    if (shareTeams.length === 0) { toast.error('Select at least one team'); return; }
    setBusy('share');
    try { await req('/shares', { method: 'POST', body: JSON.stringify({ teams: shareTeams, channel: 'export', note: shareNote }) }); toast.success('Distribution logged'); setShareTeams([]); setShareNote(''); const sh = await req('/shares'); setShares(sh || []); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };

  // ---- Act
  const generateActions = async () => {
    setBusy('gen-actions');
    try { const r = await req('/actions/generate', { method: 'POST' }); const ac = await req('/actions'); setActions(ac || []); toast.success(r.created.length ? `${r.created.length} action(s) recommended` : 'No new actions — you\u2019re on top of it'); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };
  const cycleActionStatus = async (a) => {
    const ns = nextStatus(a.status);
    setActions((prev) => prev.map((x) => x.action_id === a.action_id ? { ...x, status: ns } : x));
    try { await req(`/actions/${a.action_id}`, { method: 'PUT', body: JSON.stringify({ status: ns }) }); }
    catch (e) { toast.error(e.message); await refresh(); }
  };
  const deleteAction = async (id) => {
    setActions((prev) => prev.filter((x) => x.action_id !== id));
    try { await req(`/actions/${id}`, { method: 'DELETE' }); } catch (e) { toast.error(e.message); }
  };
  const addManualAction = async () => {
    if (!newAction.title.trim()) { toast.error('Action title required'); return; }
    setBusy('add-action');
    try { const a = await req('/actions', { method: 'POST', body: JSON.stringify(newAction) }); setActions((prev) => [a, ...prev]); setNewAction({ title: '', category: 'strategy' }); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const analyzedCount = analysis?.benchmark?.competitors?.length;
  const analysisStale = analysis && analyzedCount != null && analyzedCount !== competitors.length;

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="ci-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;

  if (!status?.is_enterprise || !status?.is_owner) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="ci-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Swords className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Competitor Intelligence</h2>
          <p className="text-zinc-400 text-sm max-w-md">{!status?.is_enterprise ? 'Run the full intelligence cycle — Plan, Gather, Analyze, Share and Act on competitor moves. Available on the Enterprise plan.' : 'Only the organization owner can manage competitor intelligence.'}</p>
        </div>
      </DashboardLayout>
    );
  }

  const step = STEPS[stage - 1];

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto" data-testid="competitor-intel-page">
        {/* Header */}
        <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Swords className="w-4 h-4" /> Competitor Intelligence</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6" style={{ fontFamily: 'Outfit' }}>The competitive intelligence cycle</h1>

        {/* Stepper */}
        <div className="grid grid-cols-5 gap-2 mb-6" data-testid="ci-stepper">
          {STEPS.map((s) => {
            const active = s.id === stage;
            const done = s.id < stage;
            return (
              <button key={s.id} onClick={() => setStage(s.id)} data-testid={`ci-step-${s.id}`}
                className={`relative rounded-xl border p-3 text-left transition-all ${active ? 'border-slate-400/60 bg-white/[0.06]' : done ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-slate-400/20 text-white' : done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-zinc-500'}`}>
                    {done ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-zinc-500 leading-none">Step {s.id}</div>
                    <div className={`text-sm font-semibold truncate ${active || done ? 'text-white' : 'text-zinc-400'}`}>{s.title}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Stage header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-slate-500/15 flex items-center justify-center shrink-0"><step.icon className="w-5 h-5 text-slate-300" /></div>
          <div>
            <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Outfit' }}>{step.title}</h2>
            <p className="text-zinc-400 text-sm max-w-2xl">{step.sub}</p>
          </div>
        </div>

        {/* ============================= STAGE 1: PLAN ============================= */}
        {stage === 1 && (
          <div className="space-y-5" data-testid="stage-plan">
            <div className={`rounded-2xl p-5 ${glass}`}>
              <Label className="text-white text-sm font-semibold">Intelligence objectives</Label>
              <p className="text-xs text-zinc-500 mb-3">What do you need to learn? e.g. "Track rivals' pricing changes", "Spot new product features".</p>
              <TagList items={plan.objectives} onAdd={(v) => setPlan((p) => ({ ...p, objectives: [...p.objectives, v] }))} onRemove={(i) => setPlan((p) => ({ ...p, objectives: p.objectives.filter((_, j) => j !== i) }))} placeholder="Add an objective and press Enter" testid="plan-objectives" />
            </div>

            <div className={`rounded-2xl p-5 ${glass}`}>
              <Label className="text-white text-sm font-semibold">Focus areas</Label>
              <p className="text-xs text-zinc-500 mb-3">Where should the team look?</p>
              <div className="flex flex-wrap gap-2" data-testid="plan-focus">
                {FOCUS_OPTIONS.map((f) => {
                  const on = plan.focus_areas.includes(f);
                  return (
                    <button key={f} onClick={() => toggleFocus(f)} data-testid={`plan-focus-${f.split(' ')[0].toLowerCase()}`}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? 'bg-slate-400/20 border-slate-400/50 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white'}`}>
                      {on && <Check className="w-3.5 h-3.5 inline mr-1" />}{f}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`rounded-2xl p-5 ${glass}`}>
              <Label className="text-white text-sm font-semibold">Key questions</Label>
              <p className="text-xs text-zinc-500 mb-3">Specific questions this cycle should answer.</p>
              <TagList items={plan.key_questions} onAdd={(v) => setPlan((p) => ({ ...p, key_questions: [...p.key_questions, v] }))} onRemove={(i) => setPlan((p) => ({ ...p, key_questions: p.key_questions.filter((_, j) => j !== i) }))} placeholder="Add a question and press Enter" testid="plan-questions" />
              <div className="mt-4">
                <Label className="text-zinc-400 text-xs">Notes</Label>
                <Textarea value={plan.notes} onChange={(e) => setPlan((p) => ({ ...p, notes: e.target.value }))} rows={2} maxLength={2000} placeholder="Cadence, owners, context…" className="bg-zinc-900 border-zinc-700 text-white text-sm mt-1" data-testid="plan-notes" />
              </div>
            </div>
            <Button onClick={savePlan} disabled={busy === 'plan'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="plan-save-btn">
              {busy === 'plan' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />} Save plan
            </Button>
          </div>
        )}

        {/* ============================= STAGE 2: GATHER ============================= */}
        {stage === 2 && (
          <div className="space-y-5" data-testid="stage-gather">
            <div className={`rounded-2xl p-4 ${glass}`}>
              <div className="text-xs text-zinc-500 mb-2">Public data sources to collect from (legal & public only):</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GATHER_SOURCES.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                    <s.icon className="w-4 h-4 text-slate-300 shrink-0" /><span className="text-xs text-zinc-300">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-zinc-400">Add a competitor + their pricing page — InFlow auto-extracts their public plans and tracks changes.</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button onClick={openMyPricing} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="my-pricing-btn"><DollarSign className="w-4 h-4 mr-1.5" /> Your Pricing</Button>
                <Button onClick={() => { setAddForm({ name: '', url: '' }); setAddOpen(true); }} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="add-competitor-btn"><Plus className="w-4 h-4 mr-1.5" /> Add Competitor</Button>
              </div>
            </div>

            {competitors.length === 0 ? (
              <div className={`rounded-2xl p-12 text-center ${glass}`} data-testid="no-competitors">
                <Swords className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">No competitors yet. Add one with their pricing-page URL to auto-extract their plans.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-5" data-testid="competitors-list">
                {competitors.map((c) => {
                  const cs = bench?.competitors?.find((x) => x.competitor_id === c.competitor_id);
                  return (
                    <div key={c.competitor_id} className={`rounded-2xl p-5 ${glass}`} data-testid={`competitor-card-${c.competitor_id}`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-slate-500/15 flex items-center justify-center flex-shrink-0"><Building2 className="w-4 h-4 text-slate-300" /></div>
                          <div className="min-w-0">
                            <div className="text-white font-semibold truncate">{c.name}</div>
                            <a href={c.url} target="_blank" rel="noreferrer" className="text-[11px] text-zinc-500 hover:text-slate-300 flex items-center gap-1 truncate"><Globe className="w-3 h-3" />{c.url.replace(/^https?:\/\//, '')}<ExternalLink className="w-2.5 h-2.5" /></a>
                          </div>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                      {c.error && <div className="flex items-start gap-1.5 text-xs text-amber-400/80 mb-3"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{c.error}</div>}
                      {c.positioning_summary && <p className="text-xs text-zinc-400 italic mb-3">{c.positioning_summary}</p>}
                      <div className="space-y-2 mb-3">
                        {(c.plans || []).map((p, i) => (
                          <div key={i} className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-white font-medium">{p.name || 'Plan'}</span>
                              <span className="text-sm text-slate-300 font-semibold">{p.price == null ? 'Custom' : `${money(p.price, p.currency)}`}<span className="text-[11px] text-zinc-500 font-normal">{p.price == null ? '' : p.period === 'monthly' ? '/mo' : p.period === 'yearly' ? '/yr' : ''}</span></span>
                            </div>
                            {(p.features || []).length > 0 && <div className="text-[11px] text-zinc-500 mt-1">{p.features.slice(0, 4).join(' · ')}</div>}
                          </div>
                        ))}
                        {(c.plans || []).length === 0 && <div className="text-xs text-zinc-600 py-2">No plans yet — edit to add manually.</div>}
                      </div>
                      {cs?.position_vs_you && (
                        <div className="text-xs mb-3">
                          <span className="text-zinc-500">vs you: </span>
                          <span className={cs.position_vs_you === 'you are cheaper' ? 'text-emerald-400' : cs.position_vs_you === 'you are pricier' ? 'text-amber-400' : 'text-sky-300'}>{cs.position_vs_you} (avg {money(cs.avg_price)})</span>
                        </div>
                      )}
                      {(c.history || []).length > 0 && (
                        <div className="rounded-lg bg-black/20 border border-white/5 px-3 py-2 mb-3">
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1"><History className="w-3 h-3" /> Recent changes</div>
                          {c.history.slice(0, 3).map((h, i) => (<div key={i} className="text-[11px] text-zinc-500">{h.changes.slice(0, 2).join(' · ')}</div>))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Button onClick={() => handleRescan(c.competitor_id)} disabled={busy === `rescan-${c.competitor_id}`} className="bg-white/10 hover:bg-white/20 text-white h-8 text-xs flex-1" data-testid={`rescan-btn-${c.competitor_id}`}>
                          {busy === `rescan-${c.competitor_id}` ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Rescan
                        </Button>
                        <Button onClick={() => openEdit(c)} variant="ghost" className="h-8 w-8 p-0 text-zinc-400 hover:text-white" data-testid={`edit-competitor-btn-${c.competitor_id}`}><Pencil className="w-4 h-4" /></Button>
                        <Button onClick={() => handleDelete(c.competitor_id)} variant="ghost" className="h-8 w-8 p-0 text-zinc-600 hover:text-red-400" data-testid={`delete-competitor-btn-${c.competitor_id}`}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================= STAGE 3: ANALYZE ============================= */}
        {stage === 3 && (
          <div className="space-y-5" data-testid="stage-analyze">
            {bench && (
              <div className={`rounded-2xl p-5 ${glass}`} data-testid="benchmark-strip">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><div className="text-zinc-500 text-xs mb-1">Your avg price</div><div className="text-2xl font-bold text-white">{money(bench.my_avg)}</div></div>
                  <div><div className="text-zinc-500 text-xs mb-1">Market avg</div><div className="text-2xl font-bold text-white">{money(bench.market_avg)}</div></div>
                  <div>
                    <div className="text-zinc-500 text-xs mb-1">Your position</div>
                    <div className="text-2xl font-bold flex items-center gap-1.5">
                      {bench.position === 'below' && <span className="text-emerald-400 flex items-center gap-1"><TrendingDown className="w-5 h-5" />Below</span>}
                      {bench.position === 'above' && <span className="text-amber-400 flex items-center gap-1"><TrendingUp className="w-5 h-5" />Above</span>}
                      {bench.position === 'inline' && <span className="text-sky-300 flex items-center gap-1"><Minus className="w-5 h-5" />In line</span>}
                      {!bench.position && <span className="text-zinc-500 text-base font-normal">Set your pricing</span>}
                    </div>
                  </div>
                  <div><div className="text-zinc-500 text-xs mb-1">Competitors</div><div className="text-2xl font-bold text-white">{competitors.length}</div></div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-zinc-400">{analysis?.generated_at ? <>Last analyzed {new Date(analysis.generated_at).toLocaleString()} {analysis.ai_used ? <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">AI</span> : <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">Rule-based</span>}</> : 'Run AI analysis on your gathered data.'}</div>
              <Button onClick={runAnalysis} disabled={busy === 'analyze' || competitors.length === 0} className="bg-white/10 hover:bg-white/20 text-white" data-testid="run-analysis-btn">
                {busy === 'analyze' ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Analyzing…</> : <><Sparkles className="w-4 h-4 mr-1.5" /> {analysis ? 'Re-run analysis' : 'Run analysis'}</>}
              </Button>
            </div>

            {analysisStale && (
              <div className="flex items-center gap-2 text-xs text-amber-400/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-lg px-3 py-2" data-testid="analysis-stale-hint">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Your competitor list changed since this analysis was run — re-run for up-to-date results.
              </div>
            )}

            {!analysis ? (
              <div className={`rounded-2xl p-12 text-center ${glass}`} data-testid="no-analysis">
                <Brain className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">{competitors.length === 0 ? 'Add competitors in the Gather step, then run analysis.' : 'No analysis yet — click "Run analysis" to turn your data into patterns.'}</p>
              </div>
            ) : (
              <div className="space-y-4" data-testid="analysis-result">
                {analysis.summary && (
                  <div className={`rounded-2xl p-5 ${glass}`}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2"><Sparkles className="w-4 h-4" /> Executive summary</div>
                    <p className="text-sm text-zinc-200 leading-relaxed" data-testid="analysis-summary">{analysis.summary}</p>
                  </div>
                )}
                {analysis.patterns?.length > 0 && (
                  <div className={`rounded-2xl p-5 ${glass}`}>
                    <Bullets title="Key patterns" items={analysis.patterns} icon={Brain} color="text-slate-300" />
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className={`rounded-2xl p-5 ${glass}`}>
                    <Bullets title="Opportunities" items={analysis.opportunities || []} icon={Lightbulb} color="text-emerald-400" />
                  </div>
                  <div className={`rounded-2xl p-5 ${glass}`}>
                    <Bullets title="Threats" items={analysis.threats || []} icon={ShieldAlert} color="text-red-400" />
                  </div>
                </div>
                {(analysis.your_strengths?.length > 0 || analysis.your_weaknesses?.length > 0) && (
                  <div className={`rounded-2xl p-5 ${glass}`}>
                    <div className="text-xs font-semibold text-white mb-3">You vs the market</div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Bullets title="Your strengths" items={analysis.your_strengths || []} icon={TrendingUp} color="text-emerald-400" />
                      <Bullets title="Your weaknesses" items={analysis.your_weaknesses || []} icon={TrendingDown} color="text-amber-400" />
                    </div>
                  </div>
                )}
                {analysis.competitors?.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-4" data-testid="competitor-swot">
                    {analysis.competitors.map((c, i) => (
                      <div key={i} className={`rounded-2xl p-5 ${glass}`}>
                        <div className="flex items-center gap-2 mb-3"><Building2 className="w-4 h-4 text-slate-300" /><span className="text-sm font-semibold text-white">{c.name}</span></div>
                        <div className="space-y-3">
                          <Bullets title="Strengths" items={c.strengths || []} icon={TrendingUp} color="text-emerald-400" />
                          <Bullets title="Weaknesses" items={c.weaknesses || []} icon={TrendingDown} color="text-amber-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================= STAGE 4: SHARE ============================= */}
        {stage === 4 && (
          <div className="space-y-5" data-testid="stage-share">
            <div className={`rounded-2xl p-5 ${glass}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-white">Insight report</div>
                <div className="flex items-center gap-2">
                  <Button onClick={copyReport} className="bg-white/10 hover:bg-white/20 text-white h-8 text-xs" data-testid="copy-report-btn"><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</Button>
                  <Button onClick={downloadReport} className="bg-white/10 hover:bg-white/20 text-white h-8 text-xs" data-testid="download-report-btn"><Download className="w-3.5 h-3.5 mr-1.5" /> Download .md</Button>
                </div>
              </div>
              <p className="text-xs text-zinc-500">A shareable summary compiled from your plan, benchmark, analysis and actions. Copy it into Slack/email or download it for leadership.</p>
            </div>

            <div className={`rounded-2xl p-5 ${glass}`}>
              <div className="text-sm font-semibold text-white mb-1">Distribute to teams</div>
              <p className="text-xs text-zinc-500 mb-3">Log which teams received this cycle's insights so nothing falls through the cracks.</p>
              <div className="flex flex-wrap gap-2 mb-3" data-testid="share-teams">
                {TEAMS.map((t) => {
                  const on = shareTeams.includes(t.key);
                  return (
                    <button key={t.key} onClick={() => setShareTeams((prev) => prev.includes(t.key) ? prev.filter((x) => x !== t.key) : [...prev, t.key])} data-testid={`share-team-${t.key}`}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${on ? 'bg-slate-400/20 border-slate-400/50 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white'}`}>
                      {on && <Check className="w-3.5 h-3.5 inline mr-1" />}{t.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Input value={shareNote} onChange={(e) => setShareNote(e.target.value)} placeholder="Optional note (e.g. 'discussed in Q3 GTM sync')" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm" data-testid="share-note-input" />
                <Button onClick={logShare} disabled={busy === 'share'} className="bg-white/10 hover:bg-white/20 text-white h-9 shrink-0" data-testid="log-share-btn">{busy === 'share' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Share2 className="w-4 h-4 mr-1.5" /> Log</>}</Button>
              </div>
            </div>

            <div className={`rounded-2xl p-5 ${glass}`}>
              <div className="text-sm font-semibold text-white mb-3">Distribution history</div>
              {shares.length === 0 ? <p className="text-xs text-zinc-600">No distributions logged yet.</p> : (
                <div className="space-y-2" data-testid="share-history">
                  {shares.map((s) => (
                    <div key={s.share_id} className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {s.teams.map((t) => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-300 capitalize">{t}</span>)}
                        {s.note && <span className="text-xs text-zinc-500">{s.note}</span>}
                      </div>
                      <span className="text-[11px] text-zinc-600">{new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================= STAGE 5: ACT ============================= */}
        {stage === 5 && (
          <div className="space-y-5" data-testid="stage-act">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-zinc-400">Turn insights into moves. Generate AI recommendations or add your own, then track them to done.</p>
              <Button onClick={generateActions} disabled={busy === 'gen-actions' || !analysis} className="bg-white/10 hover:bg-white/20 text-white" data-testid="generate-actions-btn">
                {busy === 'gen-actions' ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4 mr-1.5" /> Recommend actions</>}
              </Button>
            </div>
            {!analysis && <p className="text-xs text-amber-400/80 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Run the Analyze step first to unlock AI recommendations.</p>}

            {/* Add manual action */}
            <div className={`rounded-2xl p-4 ${glass}`}>
              <div className="flex gap-2">
                <Input value={newAction.title} onChange={(e) => setNewAction({ ...newAction, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') addManualAction(); }} placeholder="Add your own action…" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm" data-testid="new-action-input" />
                <select value={newAction.category} onChange={(e) => setNewAction({ ...newAction, category: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-9 px-2" data-testid="new-action-category">
                  <option value="strategy">Strategy</option>
                  <option value="pricing">Pricing</option>
                  <option value="product">Product</option>
                  <option value="messaging">Messaging</option>
                </select>
                <Button onClick={addManualAction} disabled={busy === 'add-action'} className="bg-white/10 hover:bg-white/20 text-white h-9 shrink-0" data-testid="add-action-btn"><Plus className="w-4 h-4" /></Button>
              </div>
            </div>

            {actions.length === 0 ? (
              <div className={`rounded-2xl p-12 text-center ${glass}`} data-testid="no-actions">
                <Rocket className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">No actions yet. Generate AI recommendations or add your own above.</p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="actions-list">
                {actions.map((a) => {
                  const cat = CAT_META[a.category] || CAT_META.strategy;
                  const st = STATUS_META[a.status] || STATUS_META.todo;
                  return (
                    <div key={a.action_id} className={`rounded-xl p-4 flex items-start gap-3 ${glass}`} data-testid={`action-${a.action_id}`}>
                      <button onClick={() => cycleActionStatus(a)} className="mt-0.5 shrink-0" title={`Mark ${nextStatus(a.status)}`} data-testid={`action-status-${a.action_id}`}>
                        {a.status === 'done' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : a.status === 'in_progress' ? <div className="w-5 h-5 rounded-full border-2 border-amber-500 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-amber-500" /></div> : <Circle className="w-5 h-5 text-zinc-600" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${cat.cls}`}><cat.icon className="w-3 h-3" />{a.category}</span>
                          <span className={`text-[10px] font-medium ${st.cls}`}>{st.label}</span>
                          {a.source === 'ai' && <span className="text-[10px] text-zinc-600 flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> AI</span>}
                        </div>
                        <div className={`text-sm font-medium ${a.status === 'done' ? 'text-zinc-500 line-through' : 'text-white'}`}>{a.title}</div>
                        {a.detail && <div className="text-xs text-zinc-500 mt-0.5">{a.detail}</div>}
                      </div>
                      <button onClick={() => deleteAction(a.action_id)} className="text-zinc-600 hover:text-red-400 shrink-0" data-testid={`delete-action-${a.action_id}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Nav footer */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/10">
          <Button variant="ghost" onClick={() => setStage((s) => Math.max(1, s - 1))} disabled={stage === 1} className="text-zinc-400 hover:text-white" data-testid="ci-prev-btn"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <span className="text-xs text-zinc-600">Step {stage} of 5</span>
          <Button onClick={() => setStage((s) => Math.min(5, s + 1))} disabled={stage === 5} className="bg-white/10 hover:bg-white/20 text-white" data-testid="ci-next-btn">Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>

      {/* Add competitor dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md" data-testid="add-competitor-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Add Competitor</DialogTitle>
            <DialogDescription className="text-zinc-400">Paste their public pricing page — we'll auto-extract the plans (verify before relying on it).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-zinc-400 text-xs">Competitor name</Label><Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Acme Analytics" className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="competitor-name-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Pricing page URL</Label><Input value={addForm.url} onChange={(e) => setAddForm({ ...addForm, url: e.target.value })} placeholder="https://competitor.com/pricing" className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="competitor-url-input" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} className="text-zinc-400">Cancel</Button>
            <Button onClick={handleAdd} disabled={busy === 'add'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="add-competitor-submit">
              {busy === 'add' ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Extracting…</> : 'Add & Extract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit competitor dialog */}
      <Dialog open={!!editComp} onOpenChange={(o) => { if (!o) setEditComp(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg max-h-[90vh] overflow-y-auto" data-testid="edit-competitor-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Edit Competitor</DialogTitle>
            <DialogDescription className="text-zinc-400">Correct the auto-extracted plans or add them manually.</DialogDescription>
          </DialogHeader>
          {editComp && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-zinc-400 text-xs">Name</Label><Input value={editComp.name} onChange={(e) => setEditComp({ ...editComp, name: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1 h-8 text-sm" /></div>
                <div><Label className="text-zinc-400 text-xs">URL</Label><Input value={editComp.url} onChange={(e) => setEditComp({ ...editComp, url: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1 h-8 text-sm" /></div>
              </div>
              <Label className="text-zinc-400 text-xs">Plans</Label>
              <PlanEditor plans={editPlans} setPlans={setEditPlans} testid="edit-plans" />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditComp(null)} className="text-zinc-400">Cancel</Button>
            <Button onClick={saveEdit} disabled={busy === 'edit'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="save-competitor-btn">{busy === 'edit' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Your pricing dialog */}
      <Dialog open={myOpen} onOpenChange={setMyOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg max-h-[90vh] overflow-y-auto" data-testid="my-pricing-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Your Pricing</DialogTitle>
            <DialogDescription className="text-zinc-400">Set your own plans to benchmark against competitors.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <PlanEditor plans={myPlans} setPlans={setMyPlans} testid="my-plans" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMyOpen(false)} className="text-zinc-400">Cancel</Button>
            <Button onClick={saveMyPricing} disabled={busy === 'my'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="save-my-pricing-btn">{busy === 'my' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
