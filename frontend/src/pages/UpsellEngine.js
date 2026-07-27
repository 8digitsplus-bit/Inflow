import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Rocket, TrendingUp, ScanLine, Plus, Trash2, DollarSign, Users, Loader2, Sparkles,
  Mail, Tag, Megaphone, BellRing, Check, Copy, Gauge, Layers, RefreshCw,
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

const SIGNAL_STYLE = {
  heavy_usage: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  team_growth: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  frequent_logins: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  plan_limit: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high_value: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  multi_product: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  loyal: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
};
const STATUS_STYLE = {
  open: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  emailed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  offered: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  notified: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  won: 'bg-emerald-500/25 text-emerald-200 border-emerald-500/40',
  dismissed: 'bg-zinc-600/15 text-zinc-400 border-zinc-600/30',
};

const glass = 'bg-white/[0.04] border border-white/10 backdrop-blur-xl';
const emptyPlan = { name: '', price: '', period: 'monthly', upgrade_url: '', description: '' };

export default function UpsellEngine() {
  const [status, setStatus] = useState(null);
  const [plans, setPlans] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState(emptyPlan);

  // unified action dialog (upgrade email / discount offer)
  const [action, setAction] = useState(null); // { mode:'email'|'offer', candidate, draft, to, subject, body, plan }
  const [copied, setCopied] = useState(false);

  // notify sales dialog
  const [notify, setNotify] = useState(null); // { candidate, to }

  // campaign dialog
  const [selected, setSelected] = useState([]);
  const [campOpen, setCampOpen] = useState(false);
  const [campForm, setCampForm] = useState({ name: '', target_plan_id: '' });

  const req = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api/upsell${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const st = await req('/status');
      setStatus(st);
      if (st.is_enterprise && st.is_owner) {
        const [p, c, cm] = await Promise.all([req('/plans'), req('/candidates'), req('/campaigns')]);
        setPlans(p || []); setCandidates(c || []); setCampaigns(cm || []);
      }
    } catch (e) { /* gate renders */ }
    finally { setLoading(false); }
  }, [req]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openCandidates = candidates.filter(c => c.status !== 'dismissed');
  const totalPotential = openCandidates.reduce((s, c) => s + (c.est_expansion_value || 0), 0);

  const handleScan = async () => {
    setBusy('scan');
    try {
      const r = await req('/scan', { method: 'POST' });
      toast.success(`Scan complete — ${r.candidates_found} candidate(s) from ${r.accounts_analyzed} account(s)`);
      setCandidates(await req('/candidates'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleSync = async () => {
    setBusy('sync');
    try {
      const r = await req('/sync', { method: 'POST' });
      toast.success(r.message || 'Usage synced');
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleAddPlan = async () => {
    if (!planForm.name.trim()) { toast.error('Plan name is required'); return; }
    setBusy('plan');
    try {
      await req('/plans', { method: 'POST', body: JSON.stringify({ ...planForm, price: parseFloat(planForm.price || 0) }) });
      toast.success('Plan added');
      setPlanOpen(false); setPlanForm(emptyPlan);
      setPlans(await req('/plans'));
      setStatus(await req('/status'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleDeletePlan = async (id) => {
    try { await req(`/plans/${id}`, { method: 'DELETE' }); setPlans(await req('/plans')); toast.success('Plan removed'); }
    catch (e) { toast.error(e.message); }
  };

  const splitDraft = (text) => {
    const m = (text || '').match(/^\s*subject:\s*(.+)$/im);
    if (m) return { subject: m[1].trim(), body: (text || '').replace(/^\s*subject:\s*.+$/im, '').replace(/^\s+/, '') };
    return { subject: '', body: text || '' };
  };

  const openAction = async (candidate, mode) => {
    setAction({ mode, candidate, draft: null, to: candidate.contact_email || '', subject: '', body: '', plan: null });
    setCopied(false);
    try {
      const path = mode === 'email' ? 'email' : 'offer';
      const d = await req(`/candidates/${candidate.candidate_id}/${path}`, { method: 'POST', body: JSON.stringify({}) });
      const { subject, body } = splitDraft(d.draft);
      setAction(a => a && a.candidate.candidate_id === candidate.candidate_id
        ? { ...a, draft: d.draft, subject, body, plan: d.plan } : a);
    } catch (e) { toast.error(e.message); setAction(null); }
  };

  const sendAction = async () => {
    if (!action.to || !action.to.includes('@')) { toast.error('Enter a valid recipient email'); return; }
    setBusy('send');
    try {
      await req('/send-email', {
        method: 'POST',
        body: JSON.stringify({
          candidate_id: action.candidate.candidate_id, to: action.to,
          subject: action.subject, body: action.body,
          mark_status: action.mode === 'offer' ? 'offered' : 'emailed',
        }),
      });
      toast.success(`Sent to ${action.to}`);
      setAction(null);
      setCandidates(await req('/candidates'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const doNotify = async () => {
    if (!notify.to || !notify.to.includes('@')) { toast.error('Enter a valid recipient email'); return; }
    setBusy('notify');
    try {
      await req(`/candidates/${notify.candidate.candidate_id}/notify-sales`, { method: 'POST', body: JSON.stringify({ to: notify.to }) });
      toast.success(`Sales notified at ${notify.to}`);
      setNotify(null);
      setCandidates(await req('/candidates'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const dismissCandidate = async (c) => {
    try {
      await req(`/candidates/${c.candidate_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) });
      setCandidates(await req('/candidates'));
    } catch (e) { toast.error(e.message); }
  };

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const createCampaign = async () => {
    if (!campForm.name.trim()) { toast.error('Campaign name is required'); return; }
    setBusy('camp');
    try {
      await req('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name: campForm.name, target_plan_id: campForm.target_plan_id || null, candidate_ids: selected }),
      });
      toast.success('Upgrade campaign created');
      setCampOpen(false); setCampForm({ name: '', target_plan_id: '' }); setSelected([]);
      setCampaigns(await req('/campaigns'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const launchCampaign = async (c) => {
    try {
      await req(`/campaigns/${c.campaign_id}`, { method: 'PATCH', body: JSON.stringify({ status: c.status === 'launched' ? 'completed' : 'launched' }) });
      setCampaigns(await req('/campaigns'));
      toast.success(c.status === 'launched' ? 'Campaign marked complete' : 'Campaign launched');
    } catch (e) { toast.error(e.message); }
  };

  const deleteCampaign = async (c) => {
    try { await req(`/campaigns/${c.campaign_id}`, { method: 'DELETE' }); setCampaigns(await req('/campaigns')); }
    catch (e) { toast.error(e.message); }
  };

  const copyDraft = () => { navigator.clipboard.writeText(action.body || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  // ------- gates
  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="upsell-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;
  }
  if (!status?.is_enterprise) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="upsell-enterprise-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Rocket className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>High-Intent Buyer Detection</h2>
          <p className="text-zinc-400 text-sm max-w-md">Find the accounts showing the strongest buying intent. High-Intent Buyer Detection is an Enterprise feature — upgrade to surface your hottest opportunities and act on them.</p>
        </div>
      </DashboardLayout>
    );
  }
  if (!status?.is_owner) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="upsell-owner-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Rocket className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Owner access required</h2>
          <p className="text-zinc-400 text-sm max-w-md">Only the organization owner can run High-Intent Buyer Detection and contact customers.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="upsell-engine-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">
              <Rocket className="w-4 h-4" /> Revenue Execution · Discover
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>High-Intent Buyer Detection</h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">We read signals from your connected integrations to surface the accounts showing the strongest intent — then help you act with a tailored email, an offer, a sales handoff, or a full campaign.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {status?.usage_sources_connected?.length > 0 && (
              <Button onClick={handleSync} disabled={busy === 'sync'} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="sync-usage-btn">
                {busy === 'sync' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Sync usage
              </Button>
            )}
            <Button onClick={handleScan} disabled={busy === 'scan'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-9 text-sm" data-testid="scan-candidates-btn">
              {busy === 'scan' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ScanLine className="w-4 h-4 mr-1.5" />} Scan for candidates
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-potential">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><DollarSign className="w-4 h-4" /> Expansion potential</div>
            <div className="text-3xl font-bold text-white">{money(totalPotential)}<span className="text-sm text-zinc-500 font-normal">/yr</span></div>
            <div className="text-[11px] text-zinc-500 mt-1">across open candidates</div>
          </div>
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-candidates">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><TrendingUp className="w-4 h-4" /> High-intent accounts</div>
            <div className="text-3xl font-bold text-white">{openCandidates.length}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{candidates.length} detected total</div>
          </div>
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-plans">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><Layers className="w-4 h-4" /> Your upgrade plans</div>
            <div className="text-3xl font-bold text-white">{plans.length}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{status?.usage_sources_connected?.length ? `Usage: ${status.usage_sources_connected.join(', ')}` : 'Revenue/account data'}</div>
          </div>
        </div>

        {/* Your plans */}
        <div className={`rounded-2xl ${glass} mb-8 overflow-hidden`}>
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-slate-400" /><h2 className="text-sm font-semibold text-white">Your upgrade plans</h2><span className="text-xs text-zinc-500 hidden sm:inline">· the plans & links you send to customers</span></div>
            <Button onClick={() => { setPlanForm(emptyPlan); setPlanOpen(true); }} className="bg-white/10 hover:bg-white/20 text-white h-8 text-xs" data-testid="add-plan-btn"><Plus className="w-4 h-4 mr-1" /> Add plan</Button>
          </div>
          {plans.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-500 text-sm" data-testid="no-plans">Add your product's upgrade plans and their pricing/upgrade links. Generated emails and offers will point customers here.</div>
          ) : (
            <div className="divide-y divide-white/[0.05]" data-testid="plans-list">
              {plans.map((p) => (
                <div key={p.plan_id} className="px-5 py-3 flex items-center gap-3" data-testid={`plan-row-${p.plan_id}`}>
                  <div className="w-8 h-8 rounded-lg bg-slate-500/15 flex items-center justify-center flex-shrink-0"><Tag className="w-4 h-4 text-slate-300" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{p.name} <span className="text-zinc-500 font-normal">· {money(p.price)}/{p.period}</span></div>
                    <div className="text-xs text-zinc-500 truncate">{p.upgrade_url || 'no upgrade link set'}{p.description ? ` · ${p.description}` : ''}</div>
                  </div>
                  <Button onClick={() => handleDeletePlan(p.plan_id)} variant="ghost" className="h-8 w-8 p-0 text-zinc-600 hover:text-red-400" data-testid={`delete-plan-${p.plan_id}`}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Candidates */}
        <div className={`rounded-2xl ${glass} mb-8 overflow-hidden`}>
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2"><Gauge className="w-4 h-4 text-slate-400" /><h2 className="text-sm font-semibold text-white">High-intent accounts</h2></div>
            {selected.length > 0 && (
              <Button onClick={() => setCampOpen(true)} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-8 text-xs" data-testid="new-campaign-btn"><Megaphone className="w-4 h-4 mr-1" /> Campaign ({selected.length})</Button>
            )}
          </div>
          {openCandidates.length === 0 ? (
            <div className="px-5 py-12 text-center text-zinc-500 text-sm" data-testid="no-candidates">No candidates yet. Click <span className="text-white font-medium">Scan for candidates</span> to analyze your customer accounts for expansion signals.</div>
          ) : (
            <div className="divide-y divide-white/[0.05]" data-testid="candidates-list">
              {openCandidates.map((c) => (
                <div key={c.candidate_id} className="px-5 py-4" data-testid={`candidate-row-${c.candidate_id}`}>
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input type="checkbox" checked={selected.includes(c.candidate_id)} onChange={() => toggleSelect(c.candidate_id)} className="mt-1.5 accent-[#0052ff] w-4 h-4" data-testid={`select-candidate-${c.candidate_id}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium truncate">{c.account}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${STATUS_STYLE[c.status] || STATUS_STYLE.open}`} data-testid={`candidate-status-${c.candidate_id}`}>{c.status}</span>
                          <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Gauge className="w-3 h-3" /> {c.expansion_score}/100</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(c.signals || []).map((s) => (
                            <span key={s.key} className={`px-2 py-0.5 rounded-md text-[10px] border ${SIGNAL_STYLE[s.key] || 'bg-white/5 text-zinc-300 border-white/10'}`} title={s.detail}>{s.label} · {s.detail}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between lg:justify-end gap-4 lg:flex-shrink-0">
                      <div className="text-right">
                        <div className="text-lg font-bold text-emerald-400">{money(c.est_expansion_value)}<span className="text-xs text-zinc-500 font-normal">/yr</span></div>
                        <div className="text-[11px] text-zinc-500">now {money(c.current_value)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 lg:pl-7">
                    <Button size="sm" onClick={() => openAction(c, 'email')} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white" data-testid={`email-candidate-${c.candidate_id}`}><Mail className="w-3.5 h-3.5 mr-1" /> Upgrade email</Button>
                    <Button size="sm" onClick={() => openAction(c, 'offer')} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white" data-testid={`offer-candidate-${c.candidate_id}`}><Tag className="w-3.5 h-3.5 mr-1" /> Create offer</Button>
                    <Button size="sm" onClick={() => setNotify({ candidate: c, to: status?.owner_email || '' })} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white" data-testid={`notify-candidate-${c.candidate_id}`}><BellRing className="w-3.5 h-3.5 mr-1" /> Notify sales</Button>
                    <Button size="sm" variant="ghost" onClick={() => dismissCandidate(c)} className="h-8 text-xs text-zinc-500 hover:text-zinc-300" data-testid={`dismiss-candidate-${c.candidate_id}`}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campaigns */}
        <div className={`rounded-2xl ${glass} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2"><Megaphone className="w-4 h-4 text-slate-400" /><h2 className="text-sm font-semibold text-white">Upgrade campaigns</h2></div>
          {campaigns.length === 0 ? (
            <div className="px-5 py-10 text-center text-zinc-500 text-sm" data-testid="no-campaigns">No campaigns yet. Select candidates above and launch a focused upgrade campaign.</div>
          ) : (
            <div className="divide-y divide-white/[0.05]" data-testid="campaigns-list">
              {campaigns.map((c) => (
                <div key={c.campaign_id} className="px-5 py-4" data-testid={`campaign-row-${c.campaign_id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium truncate">{c.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${STATUS_STYLE[c.status === 'launched' ? 'emailed' : c.status === 'completed' ? 'won' : 'open']}`}>{c.status}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{c.candidate_count} account(s) · {money(c.total_potential)}/yr potential{c.target_plan_name ? ` · → ${c.target_plan_name}` : ''}</div>
                      {c.message && <p className="text-zinc-400 text-xs mt-2 whitespace-pre-wrap line-clamp-4">{c.message}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" onClick={() => launchCampaign(c)} className="h-8 text-xs bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid={`launch-campaign-${c.campaign_id}`}>{c.status === 'launched' ? 'Mark complete' : c.status === 'completed' ? 'Completed' : 'Launch'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteCampaign(c)} className="h-8 w-8 p-0 text-zinc-600 hover:text-red-400" data-testid={`delete-campaign-${c.campaign_id}`}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add plan dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="add-plan-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Add upgrade plan</DialogTitle>
            <DialogDescription className="text-zinc-400">Define one of your product's plans. Emails/offers will reference it and link to its upgrade URL.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Plan name</Label><Input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" placeholder="Pro / Premium / Growth" data-testid="plan-name-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Price ($)</Label><Input type="number" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" placeholder="149" data-testid="plan-price-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Billing period</Label>
              <select value={planForm.period} onChange={(e) => setPlanForm({ ...planForm, period: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm h-9 mt-1 px-2" data-testid="plan-period-select">
                <option value="monthly">monthly</option><option value="yearly">yearly</option><option value="one-time">one-time</option>
              </select>
            </div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Upgrade link (URL customers click)</Label><Input value={planForm.upgrade_url} onChange={(e) => setPlanForm({ ...planForm, upgrade_url: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" placeholder="https://yourapp.com/upgrade?plan=pro" data-testid="plan-url-input" /></div>
            <div className="col-span-2"><Label className="text-zinc-400 text-xs">Short description (optional)</Label><Input value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" placeholder="Unlimited seats, priority support" data-testid="plan-desc-input" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanOpen(false)} className="text-zinc-400" data-testid="plan-cancel-btn">Cancel</Button>
            <Button onClick={handleAddPlan} disabled={busy === 'plan'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="plan-save-btn">{busy === 'plan' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Save plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action dialog (email / offer) */}
      <Dialog open={!!action} onOpenChange={(o) => { if (!o) setAction(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="action-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2">
              {action?.mode === 'offer' ? <Tag className="w-5 h-5 text-violet-400" /> : <Mail className="w-5 h-5 text-sky-400" />}
              {action?.mode === 'offer' ? 'Discount offer' : 'Upgrade email'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">{action && <>{action.candidate.account} — {action.mode === 'offer' ? 'AI-drafted upgrade offer' : 'AI-drafted upgrade email'}{action.plan ? ` → ${action.plan.name}` : ''}. Edit, then send.</>}</DialogDescription>
          </DialogHeader>
          {action && !action.draft ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /> <span className="ml-2 text-zinc-400 text-sm">Drafting with AI…</span></div>
          ) : action ? (
            <div className="space-y-3 py-1">
              <div><Label className="text-zinc-500 text-[11px]">To</Label><Input value={action.to} onChange={(e) => setAction({ ...action, to: e.target.value })} placeholder="contact@customer.com" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="action-to-input" /></div>
              <div><Label className="text-zinc-500 text-[11px]">Subject</Label><Input value={action.subject} onChange={(e) => setAction({ ...action, subject: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="action-subject-input" /></div>
              <div><Label className="text-zinc-500 text-[11px]">Body</Label><Textarea value={action.body} onChange={(e) => setAction({ ...action, body: e.target.value })} rows={9} className="bg-zinc-900 border-zinc-700 text-white text-sm mt-1 leading-relaxed" data-testid="action-body-input" /></div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={copyDraft} className="border-zinc-700 text-zinc-300 hover:bg-white/5" data-testid="action-copy-btn">{copied ? <Check className="w-4 h-4 mr-1 text-emerald-400" /> : <Copy className="w-4 h-4 mr-1" />} {copied ? 'Copied' : 'Copy'}</Button>
                <Button onClick={sendAction} disabled={busy === 'send'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="action-send-btn">{busy === 'send' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />} Send</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Notify sales dialog */}
      <Dialog open={!!notify} onOpenChange={(o) => { if (!o) setNotify(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md" data-testid="notify-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><BellRing className="w-5 h-5 text-amber-400" /> Notify sales team</DialogTitle>
            <DialogDescription className="text-zinc-400">{notify && <>Send the {notify.candidate.account} expansion opportunity ({money(notify.candidate.est_expansion_value)}/yr) to your sales team.</>}</DialogDescription>
          </DialogHeader>
          <div className="py-1"><Label className="text-zinc-500 text-[11px]">Recipient</Label><Input value={notify?.to || ''} onChange={(e) => setNotify({ ...notify, to: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="notify-to-input" /></div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotify(null)} className="text-zinc-400" data-testid="notify-cancel-btn">Cancel</Button>
            <Button onClick={doNotify} disabled={busy === 'notify'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="notify-send-btn">{busy === 'notify' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <BellRing className="w-4 h-4 mr-1.5" />} Notify</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign dialog */}
      <Dialog open={campOpen} onOpenChange={setCampOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="campaign-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-[#0052ff]" /> Launch upgrade campaign</DialogTitle>
            <DialogDescription className="text-zinc-400">A focused effort to move {selected.length} selected account(s) to a higher plan. We'll draft the campaign brief with AI.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-zinc-400 text-xs">Campaign name</Label><Input value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" placeholder="Q3 Power-User Upgrade Push" data-testid="campaign-name-input" /></div>
            <div><Label className="text-zinc-400 text-xs">Target plan</Label>
              <select value={campForm.target_plan_id} onChange={(e) => setCampForm({ ...campForm, target_plan_id: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm h-9 mt-1 px-2" data-testid="campaign-plan-select">
                <option value="">Auto (highest plan)</option>
                {plans.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.name} — {money(p.price)}/{p.period}</option>)}
              </select>
            </div>
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-xs text-zinc-400 flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#0052ff]" /> {selected.length} account(s) selected. Add plans first for upgrade links in follow-ups.</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCampOpen(false)} className="text-zinc-400" data-testid="campaign-cancel-btn">Cancel</Button>
            <Button onClick={createCampaign} disabled={busy === 'camp'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="campaign-create-btn">{busy === 'camp' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Megaphone className="w-4 h-4 mr-1.5" />} Create campaign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
