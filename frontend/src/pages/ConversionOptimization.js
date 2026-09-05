import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  BarChart3, Activity, AlertTriangle, Lightbulb, FlaskConical, Rocket, Sparkles, Loader2,
  Plus, Trash2, Target, TrendingUp, TrendingDown, ArrowRight, ChevronLeft, ChevronRight,
  Check, CheckCircle2, Info, Gauge, Split,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { STAGE_COLOR_ARRAY } from '../constants/colors';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const glass = 'bg-white/[0.04] border border-white/10 backdrop-blur-xl';
const FUNNEL_COLORS = STAGE_COLOR_ARRAY;

const STEPS = [
  { id: 1, title: 'Analyze Data', sub: 'Track how visitors move through your funnel with analytics to find drop-off points.', icon: BarChart3 },
  { id: 2, title: 'Identify Friction', sub: 'Look for pain points like slow page speeds, confusing navigation, or long sign-up forms that cause users to leave.', icon: AlertTriangle },
  { id: 3, title: 'Formulate Hypotheses', sub: "Deduce a solution to fix it, such as \u201cshorter forms will lead to more email sign-ups\u201d.", icon: Lightbulb },
  { id: 4, title: 'Run Tests', sub: 'Compare the original against a new version with A/B testing to see which performs better.', icon: FlaskConical },
  { id: 5, title: 'Implement & Iterate', sub: 'Apply the winning changes permanently, then repeat the cycle to keep improving.', icon: Rocket },
];

const STAGE_OPTS = [{ v: '', l: 'Any stage' }, { v: 'lead', l: 'Lead' }, { v: 'qualified', l: 'Qualified' }, { v: 'proposal', l: 'Proposal' }, { v: 'negotiation', l: 'Negotiation' }];
const FR_CATS = [{ v: 'speed', l: 'Page speed' }, { v: 'navigation', l: 'Navigation' }, { v: 'form', l: 'Form length' }, { v: 'copy', l: 'Copy / clarity' }, { v: 'trust', l: 'Trust signals' }, { v: 'other', l: 'Other' }];
const SEV = {
  high: 'bg-red-500/15 text-red-300 border-red-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};
const HYP_STATUS = {
  draft: 'bg-zinc-700 text-zinc-300', testing: 'bg-amber-500/15 text-amber-400',
  validated: 'bg-emerald-500/15 text-emerald-400', rejected: 'bg-red-500/15 text-red-400',
};

// client-side mirror of the backend A/B significance (for live feedback)
function erf(x) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const normCdf = (z) => 0.5 * (1 + erf(z / Math.sqrt(2)));
function abStats(cv, cc, vv, vc) {
  cv = +cv || 0; cc = +cc || 0; vv = +vv || 0; vc = +vc || 0;
  if (cv <= 0 || vv <= 0) return null;
  const p1 = cc / cv, p2 = vc / vv;
  const improvement = p1 > 0 ? ((p2 - p1) / p1) * 100 : (p2 > 0 ? 100 : 0);
  const pooled = (cc + vc) / (cv + vv);
  const se = pooled > 0 && pooled < 1 ? Math.sqrt(pooled * (1 - pooled) * (1 / cv + 1 / vv)) : 0;
  const conf = se === 0 ? 0 : (2 * normCdf(Math.abs(p2 - p1) / se) - 1) * 100;
  const winner = conf >= 90 && p1 !== p2 ? (p2 > p1 ? 'variant' : 'control') : 'inconclusive';
  return { control_rate: +(p1 * 100).toFixed(2), variant_rate: +(p2 * 100).toFixed(2), improvement: +improvement.toFixed(1), confidence: +conf.toFixed(1), winner };
}

const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const Metric = ({ label, value, sub, icon: Icon, color, testid }) => (
  <div className={`rounded-2xl p-4 sm:p-5 ${glass}`} data-testid={testid}>
    <div className="flex items-center justify-between mb-2"><span className="text-zinc-400 text-xs sm:text-sm">{label}</span><Icon className={`w-5 h-5 ${color}`} /></div>
    <div className={`text-xl sm:text-3xl font-bold ${color}`} style={{ fontFamily: 'Outfit' }}>{value}</div>
    {sub && <p className="text-xs text-zinc-500 mt-2">{sub}</p>}
  </div>
);

export default function ConversionOptimization() {
  const [stage, setStage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const [funnel, setFunnel] = useState(null);
  const [friction, setFriction] = useState([]);
  const [hypotheses, setHypotheses] = useState([]);
  const [tests, setTests] = useState([]);
  const [impls, setImpls] = useState([]);

  const [newFr, setNewFr] = useState({ title: '', stage: '', category: 'form', severity: 'medium', note: '' });
  const [newHy, setNewHy] = useState({ statement: '', metric: '', expected_lift: '', stage: '' });
  const [newTest, setNewTest] = useState({ name: '', metric: '', control_label: 'Original', variant_label: 'Variant', hypothesis_id: '' });

  const croReq = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api/cro${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }, []);

  const refresh = useCallback(async () => {
    const [fn, fr, hy, ts, im] = await Promise.all([
      fetch(`${API_URL}/api/analytics/cro`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null),
      croReq('/friction').catch(() => []), croReq('/hypotheses').catch(() => []),
      croReq('/tests').catch(() => []), croReq('/implementations').catch(() => []),
    ]);
    setFunnel(fn); setFriction(fr || []); setHypotheses(hy || []); setTests(ts || []); setImpls(im || []);
  }, [croReq]);

  useEffect(() => { refresh().finally(() => setLoading(false)); }, [refresh]);

  // Friction
  const addFriction = async () => {
    if (!newFr.title.trim()) { toast.error('Describe the friction point'); return; }
    setBusy('fr'); try { const f = await croReq('/friction', { method: 'POST', body: JSON.stringify(newFr) }); setFriction((p) => [f, ...p]); setNewFr({ title: '', stage: '', category: 'form', severity: 'medium', note: '' }); } catch (e) { toast.error(e.message); } setBusy('');
  };
  const suggestFriction = async () => {
    setBusy('fr-ai'); try { const r = await croReq('/friction/suggest', { method: 'POST' }); setFriction((p) => [...r.created, ...p]); toast.success(r.created.length ? `${r.created.length} friction point(s) added` : 'No new friction found'); } catch (e) { toast.error(e.message); } setBusy('');
  };
  const delFriction = async (id) => { setFriction((p) => p.filter((x) => x.friction_id !== id)); try { await croReq(`/friction/${id}`, { method: 'DELETE' }); } catch (e) { toast.error(e.message); refresh(); } };
  const logBottleneck = async (b) => {
    try { const f = await croReq('/friction', { method: 'POST', body: JSON.stringify({ title: `High drop-off at ${b.stage} stage`, stage: b.stage.toLowerCase(), category: 'other', severity: b.severity, note: `${b.drop_rate}% drop-off detected in funnel.` }) }); setFriction((p) => [f, ...p]); toast.success('Logged as friction'); } catch (e) { toast.error(e.message); }
  };

  // Hypotheses
  const addHypothesis = async () => {
    if (!newHy.statement.trim()) { toast.error('Write your hypothesis'); return; }
    setBusy('hy'); try { const h = await croReq('/hypotheses', { method: 'POST', body: JSON.stringify(newHy) }); setHypotheses((p) => [h, ...p]); setNewHy({ statement: '', metric: '', expected_lift: '', stage: '' }); } catch (e) { toast.error(e.message); } setBusy('');
  };
  const suggestHypotheses = async () => {
    setBusy('hy-ai'); try { const r = await croReq('/hypotheses/suggest', { method: 'POST' }); setHypotheses((p) => [...r.created, ...p]); toast.success(r.created.length ? `${r.created.length} hypothesis(es) added` : 'No new hypotheses'); } catch (e) { toast.error(e.message); } setBusy('');
  };
  const delHypothesis = async (id) => { setHypotheses((p) => p.filter((x) => x.hypothesis_id !== id)); try { await croReq(`/hypotheses/${id}`, { method: 'DELETE' }); } catch (e) { toast.error(e.message); refresh(); } };
  const startTestFrom = (h) => { setNewTest({ name: `Test: ${h.statement.slice(0, 60)}`, metric: h.metric || '', control_label: 'Original', variant_label: 'Variant', hypothesis_id: h.hypothesis_id }); setStage(4); toast.info('Prefilled a new test — set it up below'); };

  // Tests
  const addTest = async () => {
    if (!newTest.name.trim()) { toast.error('Name the test'); return; }
    setBusy('ts'); try { const t = await croReq('/tests', { method: 'POST', body: JSON.stringify(newTest) }); setTests((p) => [t, ...p]); setNewTest({ name: '', metric: '', control_label: 'Original', variant_label: 'Variant', hypothesis_id: '' }); if (newTest.hypothesis_id) await refresh(); } catch (e) { toast.error(e.message); } setBusy('');
  };
  const setTestField = (id, field, value) => setTests((p) => p.map((t) => t.test_id === id ? { ...t, [field]: value } : t));
  const saveTest = async (t) => {
    setBusy(`ts-${t.test_id}`);
    try {
      const upd = await croReq(`/tests/${t.test_id}`, { method: 'PUT', body: JSON.stringify({ status: t.status, control_visitors: +t.control_visitors || 0, control_conversions: +t.control_conversions || 0, variant_visitors: +t.variant_visitors || 0, variant_conversions: +t.variant_conversions || 0 }) });
      setTests((p) => p.map((x) => x.test_id === t.test_id ? upd : x)); toast.success('Test saved');
    } catch (e) { toast.error(e.message); } setBusy('');
  };
  const delTest = async (id) => { setTests((p) => p.filter((x) => x.test_id !== id)); try { await croReq(`/tests/${id}`, { method: 'DELETE' }); } catch (e) { toast.error(e.message); refresh(); } };
  const implementTest = async (t) => {
    const s = abStats(t.control_visitors, t.control_conversions, t.variant_visitors, t.variant_conversions);
    const win = s?.winner === 'variant' ? t.variant_label : s?.winner === 'control' ? t.control_label : 'winning variant';
    try { const im = await croReq('/implementations', { method: 'POST', body: JSON.stringify({ title: `Rolled out: ${t.name}`, test_id: t.test_id, hypothesis_id: t.hypothesis_id, impact: s ? `${s.improvement > 0 ? '+' : ''}${s.improvement}% ${t.metric || 'lift'}` : '', note: `Applied ${win}.` }) }); setImpls((p) => [im, ...p]); await refresh(); setStage(5); toast.success('Winning change logged as implemented'); } catch (e) { toast.error(e.message); }
  };

  // Implementations
  const delImpl = async (id) => { setImpls((p) => p.filter((x) => x.impl_id !== id)); try { await croReq(`/implementations/${id}`, { method: 'DELETE' }); } catch (e) { toast.error(e.message); refresh(); } };

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="cro-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;

  const step = STEPS[stage - 1];
  const worst = funnel?.bottlenecks?.[0];
  const validatedCount = hypotheses.filter((h) => h.status === 'validated').length;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto" data-testid="cro-page">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Gauge className="w-4 h-4" /> Conversion Rate Optimization</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-6" style={{ fontFamily: 'Outfit' }}>The CRO cycle</h1>

        {/* Stepper */}
        <div className="grid grid-cols-5 gap-2 mb-6" data-testid="cro-stepper">
          {STEPS.map((s) => {
            const active = s.id === stage, done = s.id < stage;
            return (
              <button key={s.id} onClick={() => setStage(s.id)} data-testid={`cro-step-${s.id}`}
                className={`rounded-xl border p-3 text-left transition-all ${active ? 'border-slate-400/60 bg-white/[0.06]' : done ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-slate-400/20 text-white' : done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-zinc-500'}`}>{done ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}</div>
                  <div className="min-w-0"><div className="text-[10px] text-zinc-500 leading-none">Step {s.id}</div><div className={`text-xs sm:text-sm font-semibold truncate ${active || done ? 'text-white' : 'text-zinc-400'}`}>{s.title}</div></div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-slate-500/15 flex items-center justify-center shrink-0"><step.icon className="w-5 h-5 text-slate-300" /></div>
          <div><h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Outfit' }}>{step.title}</h2><p className="text-zinc-400 text-sm max-w-2xl">{step.sub}</p></div>
        </div>

        {/* ===================== STAGE 1: ANALYZE ===================== */}
        {stage === 1 && (
          <div className="space-y-5" data-testid="stage-analyze">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Metric label="Overall conversion" value={`${funnel?.overall_conversion ?? 0}%`} sub="Lead → Closed Won" icon={Target} color="text-emerald-400" testid="metric-overall-conversion" />
              <Metric label="Opportunities" value={funnel?.total_opportunities ?? 0} sub="In the funnel" icon={TrendingUp} color="text-white" testid="metric-opportunities" />
              <Metric label="Won deals" value={funnel?.won_deals ?? 0} sub="Reached Closed Won" icon={CheckCircle2} color="text-white" testid="metric-won-deals" />
              <Metric label="Worst drop-off" value={`${worst?.drop_rate ?? 0}%`} sub={worst ? `${worst.stage} stage` : 'No bottleneck'} icon={AlertTriangle} color={worst ? 'text-amber-400' : 'text-zinc-500'} testid="metric-worst-dropoff" />
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
              <div className={`rounded-2xl p-5 ${glass}`} data-testid="funnel-chart">
                <div className="flex items-center gap-2 mb-4"><Target className="w-5 h-5 text-slate-400" /><span className="text-white font-semibold" style={{ fontFamily: 'Outfit' }}>Conversion funnel</span></div>
                <div className="space-y-3">
                  {(funnel?.funnel_data || []).map((d, i, arr) => {
                    const maxc = Math.max(...arr.map((x) => x.conversion), 1);
                    const w = Math.max((d.conversion / maxc) * 100, 22);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[11px] text-zinc-400 w-20 text-right shrink-0 truncate">{d.stage}</span>
                        <div className="flex-1"><div className="h-9 flex items-center justify-end pr-3 rounded-md transition-all duration-700" style={{ width: `${w}%`, backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} title={`${d.stage}: ${d.conversion}%`}><span className="text-xs font-semibold text-white">{d.conversion}%</span></div></div>
                      </div>
                    );
                  })}
                  {(!funnel?.funnel_data || funnel.funnel_data.length === 0) && <p className="text-sm text-zinc-500">No funnel data yet — add deals.</p>}
                </div>
              </div>

              <div className={`rounded-2xl p-5 ${glass}`} data-testid="stage-conversions">
                <div className="flex items-center gap-2 mb-4"><ArrowRight className="w-5 h-5 text-cyan-400" /><span className="text-white font-semibold" style={{ fontFamily: 'Outfit' }}>Stage-to-stage conversion</span></div>
                <div className="space-y-3">
                  {(funnel?.stage_conversions || []).map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm mb-1"><span className="text-zinc-400">{c.from_stage} → {c.to_stage}</span><span className={`font-medium ${c.rate >= 70 ? 'text-emerald-400' : c.rate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{c.rate}%</span></div>
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full rounded-full bg-slate-400/60" style={{ width: `${Math.min(c.rate, 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-zinc-500 bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2" data-testid="analyze-note">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              InFlow analyzes your pipeline funnel to find where deals drop off. For page-level heat maps and session recordings, connect a web-analytics tool — then bring those drop-off points into Step 2.
            </div>
          </div>
        )}

        {/* ===================== STAGE 2: FRICTION ===================== */}
        {stage === 2 && (
          <div className="space-y-5" data-testid="stage-friction">
            {funnel?.bottlenecks?.length > 0 && (
              <div className={`rounded-2xl p-5 ${glass}`} data-testid="auto-bottlenecks">
                <div className="text-sm font-semibold text-white mb-3">Auto-detected from your funnel</div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {funnel.bottlenecks.map((b, i) => (
                    <div key={i} className={`rounded-xl p-3 border ${b.severity === 'high' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                      <div className="flex items-center justify-between">
                        <div><div className="text-white font-medium text-sm">{b.stage} stage</div><div className={`text-xs ${b.severity === 'high' ? 'text-red-400' : 'text-amber-400'}`}>{b.drop_rate}% drop-off</div></div>
                        <Button onClick={() => logBottleneck(b)} className="bg-white/10 hover:bg-white/20 text-white h-7 text-xs" data-testid={`log-bottleneck-${i}`}><Plus className="w-3.5 h-3.5 mr-1" /> Log</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-zinc-400">Record the pain points causing drop-off.</p>
              <Button onClick={suggestFriction} disabled={busy === 'fr-ai'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="suggest-friction-btn">{busy === 'fr-ai' ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Analyzing…</> : <><Sparkles className="w-4 h-4 mr-1.5" /> Suggest friction (AI)</>}</Button>
            </div>

            <div className={`rounded-2xl p-4 ${glass} space-y-2`}>
              <Input value={newFr.title} onChange={(e) => setNewFr({ ...newFr, title: e.target.value })} placeholder="e.g. Sign-up form is too long (9 fields)" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm" data-testid="friction-title-input" />
              <div className="flex flex-wrap gap-2">
                <select value={newFr.stage} onChange={(e) => setNewFr({ ...newFr, stage: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-9 px-2" data-testid="friction-stage">{STAGE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                <select value={newFr.category} onChange={(e) => setNewFr({ ...newFr, category: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-9 px-2" data-testid="friction-category">{FR_CATS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                <select value={newFr.severity} onChange={(e) => setNewFr({ ...newFr, severity: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-9 px-2" data-testid="friction-severity"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
                <Button onClick={addFriction} disabled={busy === 'fr'} className="bg-white/10 hover:bg-white/20 text-white h-9 ml-auto" data-testid="add-friction-btn"><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </div>
            </div>

            {friction.length === 0 ? (
              <div className={`rounded-2xl p-10 text-center ${glass}`} data-testid="no-friction"><AlertTriangle className="w-8 h-8 text-zinc-600 mx-auto mb-2" /><p className="text-zinc-400 text-sm">No friction logged yet.</p></div>
            ) : (
              <div className="space-y-2" data-testid="friction-list">
                {friction.map((f) => (
                  <div key={f.friction_id} className={`rounded-xl p-4 flex items-start gap-3 ${glass}`} data-testid={`friction-${f.friction_id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${SEV[f.severity]}`}>{f.severity}</span>
                        <span className="text-[10px] text-zinc-500">{cap(f.category)}{f.stage ? ` · ${cap(f.stage)}` : ''}</span>
                        {f.source === 'ai' && <span className="text-[10px] text-zinc-600 flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> AI</span>}
                      </div>
                      <div className="text-sm font-medium text-white">{f.title}</div>
                      {f.note && <div className="text-xs text-zinc-500 mt-0.5">{f.note}</div>}
                    </div>
                    <button onClick={() => delFriction(f.friction_id)} className="text-zinc-600 hover:text-red-400 shrink-0" data-testid={`del-friction-${f.friction_id}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== STAGE 3: HYPOTHESES ===================== */}
        {stage === 3 && (
          <div className="space-y-5" data-testid="stage-hypotheses">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-zinc-400">Propose a fix for each friction — phrased as a testable prediction.</p>
              <Button onClick={suggestHypotheses} disabled={busy === 'hy-ai'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="suggest-hypotheses-btn">{busy === 'hy-ai' ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Thinking…</> : <><Sparkles className="w-4 h-4 mr-1.5" /> Suggest hypotheses (AI)</>}</Button>
            </div>

            <div className={`rounded-2xl p-4 ${glass} space-y-2`}>
              <Textarea value={newHy.statement} onChange={(e) => setNewHy({ ...newHy, statement: e.target.value })} rows={2} placeholder="Shortening the sign-up form will increase email sign-ups" className="bg-zinc-900 border-zinc-700 text-white text-sm" data-testid="hypothesis-input" />
              <div className="flex flex-wrap gap-2">
                <Input value={newHy.metric} onChange={(e) => setNewHy({ ...newHy, metric: e.target.value })} placeholder="Metric (e.g. email sign-ups)" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm flex-1 min-w-[140px]" data-testid="hypothesis-metric" />
                <Input value={newHy.expected_lift} onChange={(e) => setNewHy({ ...newHy, expected_lift: e.target.value })} placeholder="Expected lift (+15%)" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm w-40" data-testid="hypothesis-lift" />
                <select value={newHy.stage} onChange={(e) => setNewHy({ ...newHy, stage: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-9 px-2">{STAGE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                <Button onClick={addHypothesis} disabled={busy === 'hy'} className="bg-white/10 hover:bg-white/20 text-white h-9" data-testid="add-hypothesis-btn"><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </div>
            </div>

            {hypotheses.length === 0 ? (
              <div className={`rounded-2xl p-10 text-center ${glass}`} data-testid="no-hypotheses"><Lightbulb className="w-8 h-8 text-zinc-600 mx-auto mb-2" /><p className="text-zinc-400 text-sm">No hypotheses yet.</p></div>
            ) : (
              <div className="space-y-2" data-testid="hypotheses-list">
                {hypotheses.map((h) => (
                  <div key={h.hypothesis_id} className={`rounded-xl p-4 flex items-start gap-3 ${glass}`} data-testid={`hypothesis-${h.hypothesis_id}`}>
                    <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${HYP_STATUS[h.status] || HYP_STATUS.draft}`}>{cap(h.status)}</span>
                        {h.metric && <span className="text-[10px] text-zinc-500">{h.metric}{h.expected_lift ? ` · ${h.expected_lift}` : ''}</span>}
                        {h.source === 'ai' && <span className="text-[10px] text-zinc-600 flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> AI</span>}
                      </div>
                      <div className="text-sm font-medium text-white">{h.statement}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button onClick={() => startTestFrom(h)} className="bg-white/10 hover:bg-white/20 text-white h-7 text-xs" data-testid={`start-test-${h.hypothesis_id}`}><FlaskConical className="w-3.5 h-3.5 mr-1" /> Test</Button>
                      <button onClick={() => delHypothesis(h.hypothesis_id)} className="text-zinc-600 hover:text-red-400 px-1" data-testid={`del-hypothesis-${h.hypothesis_id}`}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== STAGE 4: TESTS ===================== */}
        {stage === 4 && (
          <div className="space-y-5" data-testid="stage-tests">
            <div className={`rounded-2xl p-4 ${glass} space-y-2`}>
              <div className="text-sm font-semibold text-white flex items-center gap-2"><Split className="w-4 h-4 text-purple-400" /> New A/B test</div>
              <Input value={newTest.name} onChange={(e) => setNewTest({ ...newTest, name: e.target.value })} placeholder="Test name (e.g. Short vs long sign-up form)" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm" data-testid="test-name-input" />
              <div className="flex flex-wrap gap-2">
                <Input value={newTest.metric} onChange={(e) => setNewTest({ ...newTest, metric: e.target.value })} placeholder="Metric" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm w-36" data-testid="test-metric-input" />
                <Input value={newTest.control_label} onChange={(e) => setNewTest({ ...newTest, control_label: e.target.value })} placeholder="Control label" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm w-36" />
                <Input value={newTest.variant_label} onChange={(e) => setNewTest({ ...newTest, variant_label: e.target.value })} placeholder="Variant label" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm w-36" />
                <select value={newTest.hypothesis_id} onChange={(e) => setNewTest({ ...newTest, hypothesis_id: e.target.value })} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-9 px-2 max-w-[200px]" data-testid="test-hypothesis-select">
                  <option value="">No linked hypothesis</option>
                  {hypotheses.map((h) => <option key={h.hypothesis_id} value={h.hypothesis_id}>{h.statement.slice(0, 40)}</option>)}
                </select>
                <Button onClick={addTest} disabled={busy === 'ts'} className="bg-white/10 hover:bg-white/20 text-white h-9 ml-auto" data-testid="add-test-btn"><Plus className="w-4 h-4 mr-1" /> Create</Button>
              </div>
            </div>

            {tests.length === 0 ? (
              <div className={`rounded-2xl p-10 text-center ${glass}`} data-testid="no-tests"><FlaskConical className="w-8 h-8 text-zinc-600 mx-auto mb-2" /><p className="text-zinc-400 text-sm">No tests yet. Create one above or start from a hypothesis.</p></div>
            ) : (
              <div className="space-y-3" data-testid="tests-list">
                {tests.map((t) => {
                  const live = abStats(t.control_visitors, t.control_conversions, t.variant_visitors, t.variant_conversions);
                  return (
                    <div key={t.test_id} className={`rounded-2xl p-4 ${glass}`} data-testid={`test-${t.test_id}`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0"><div className="text-white font-semibold truncate">{t.name}</div>{t.metric && <div className="text-[11px] text-zinc-500">Metric: {t.metric}</div>}</div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <select value={t.status} onChange={(e) => setTestField(t.test_id, 'status', e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-md text-white text-xs h-8 px-2" data-testid={`test-status-${t.test_id}`}><option value="planned">Planned</option><option value="running">Running</option><option value="completed">Completed</option></select>
                          <button onClick={() => delTest(t.test_id)} className="text-zinc-600 hover:text-red-400 px-1" data-testid={`del-test-${t.test_id}`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 mb-3">
                        {[['control', t.control_label], ['variant', t.variant_label]].map(([k, label]) => (
                          <div key={k} className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
                            <div className="text-xs text-zinc-400 mb-2">{label}</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1"><label className="text-[10px] text-zinc-500">Visitors</label><Input type="number" value={t[`${k}_visitors`] ?? 0} onChange={(e) => setTestField(t.test_id, `${k}_visitors`, e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-8 text-sm" data-testid={`test-${k}-visitors-${t.test_id}`} /></div>
                              <div className="flex-1"><label className="text-[10px] text-zinc-500">Conversions</label><Input type="number" value={t[`${k}_conversions`] ?? 0} onChange={(e) => setTestField(t.test_id, `${k}_conversions`, e.target.value)} className="bg-zinc-900 border-zinc-700 text-white h-8 text-sm" data-testid={`test-${k}-conversions-${t.test_id}`} /></div>
                            </div>
                            {live && <div className="text-[11px] text-slate-300 mt-1.5">Rate: {k === 'control' ? live.control_rate : live.variant_rate}%</div>}
                          </div>
                        ))}
                      </div>
                      {live ? (
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs mb-3" data-testid={`test-stats-${t.test_id}`}>
                          <span className="text-zinc-400">Lift: <span className={live.improvement >= 0 ? 'text-emerald-400' : 'text-red-400'}>{live.improvement > 0 ? '+' : ''}{live.improvement}%</span></span>
                          <span className="text-zinc-400">Confidence: <span className={live.confidence >= 90 ? 'text-emerald-400' : 'text-amber-400'}>{live.confidence}%</span></span>
                          <span className="text-zinc-400">Winner: <span className={live.winner === 'inconclusive' ? 'text-zinc-400' : 'text-emerald-400'}>{live.winner === 'variant' ? t.variant_label : live.winner === 'control' ? t.control_label : 'Inconclusive'}</span></span>
                        </div>
                      ) : <div className="text-[11px] text-zinc-500 mb-3">Enter visitors & conversions for both variants to compute significance.</div>}
                      <div className="flex items-center gap-2">
                        <Button onClick={() => saveTest(t)} disabled={busy === `ts-${t.test_id}`} className="bg-white/10 hover:bg-white/20 text-white h-8 text-xs" data-testid={`save-test-${t.test_id}`}>{busy === `ts-${t.test_id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save results'}</Button>
                        {live && live.winner !== 'inconclusive' && <Button onClick={() => implementTest(t)} className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 h-8 text-xs border border-emerald-500/30" data-testid={`implement-test-${t.test_id}`}><Rocket className="w-3.5 h-3.5 mr-1" /> Implement winner</Button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================== STAGE 5: IMPLEMENT ===================== */}
        {stage === 5 && (
          <div className="space-y-5" data-testid="stage-implement">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Metric label="Changes shipped" value={impls.length} icon={Rocket} color="text-emerald-400" testid="metric-shipped" />
              <Metric label="Validated hypotheses" value={validatedCount} icon={CheckCircle2} color="text-white" testid="metric-validated" />
              <Metric label="Tests completed" value={tests.filter((t) => t.status === 'completed').length} icon={FlaskConical} color="text-white" testid="metric-tests-completed" />
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm text-zinc-400">Ship the winners, record the impact, then start the cycle again.</p>
              <Button onClick={() => setStage(1)} className="bg-white/10 hover:bg-white/20 text-white" data-testid="iterate-btn"><Activity className="w-4 h-4 mr-1.5" /> Start next cycle</Button>
            </div>

            {impls.length === 0 ? (
              <div className={`rounded-2xl p-10 text-center ${glass}`} data-testid="no-impls"><Rocket className="w-8 h-8 text-zinc-600 mx-auto mb-2" /><p className="text-zinc-400 text-sm">No changes shipped yet. Complete a winning test in Step 4 and click "Implement winner".</p></div>
            ) : (
              <div className="space-y-2" data-testid="impls-list">
                {impls.map((im) => (
                  <div key={im.impl_id} className={`rounded-xl p-4 flex items-start gap-3 ${glass}`} data-testid={`impl-${im.impl_id}`}>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white">{im.title}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {im.impact && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">{im.impact}</span>}
                        {im.stage && <span className="text-[10px] text-zinc-500">{cap(im.stage)}</span>}
                        <span className="text-[10px] text-zinc-600">{new Date(im.implemented_at).toLocaleDateString()}</span>
                      </div>
                      {im.note && <div className="text-xs text-zinc-500 mt-0.5">{im.note}</div>}
                    </div>
                    <button onClick={() => delImpl(im.impl_id)} className="text-zinc-600 hover:text-red-400 shrink-0" data-testid={`del-impl-${im.impl_id}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Nav footer */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/10">
          <Button variant="ghost" onClick={() => setStage((s) => Math.max(1, s - 1))} disabled={stage === 1} className="text-zinc-400 hover:text-white" data-testid="cro-prev-btn"><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
          <span className="text-xs text-zinc-600">Step {stage} of 5</span>
          <Button onClick={() => setStage((s) => Math.min(5, s + 1))} disabled={stage === 5} className="bg-white/10 hover:bg-white/20 text-white" data-testid="cro-next-btn">Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
