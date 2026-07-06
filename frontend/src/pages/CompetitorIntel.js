import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Swords, Plus, Trash2, RefreshCw, Pencil, Loader2, Globe, TrendingUp, TrendingDown,
  Minus, ExternalLink, AlertTriangle, History, Building2, DollarSign,
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
const emptyPlan = () => ({ name: '', price: '', period: 'monthly', currency: 'USD', features: [] });

// Reusable plan editor (used for competitor plans + your own pricing)
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

export default function CompetitorIntel() {
  const [status, setStatus] = useState(null);
  const [competitors, setCompetitors] = useState([]);
  const [bench, setBench] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', url: '' });
  const [editComp, setEditComp] = useState(null);
  const [editPlans, setEditPlans] = useState([]);
  const [myOpen, setMyOpen] = useState(false);
  const [myPlans, setMyPlans] = useState([]);

  const req = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api/competitors${path}`, {
      credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
  }, []);

  const refresh = useCallback(async () => {
    const [c, b] = await Promise.all([req('/'), req('/benchmark')]);
    setCompetitors(c || []);
    setBench(b);
  }, [req]);

  const load = useCallback(async () => {
    try {
      const st = await req('/status');
      setStatus(st);
      if (st.is_enterprise && st.is_owner) await refresh();
    } catch (e) { /* gate renders */ } finally { setLoading(false); }
  }, [req, refresh]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.url.trim()) { toast.error('Name and URL are required'); return; }
    setBusy('add');
    try {
      const c = await req('/', { method: 'POST', body: JSON.stringify(addForm) });
      if (c.status === 'error' || c.status === 'empty') toast.warning(c.error || 'Added — add plans manually');
      else toast.success(`Extracted ${c.plans.length} plan(s) from ${c.name}`);
      setAddOpen(false); setAddForm({ name: '', url: '' });
      await refresh();
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleRescan = async (id) => {
    setBusy(`rescan-${id}`);
    try {
      const r = await req(`/${id}/rescan`, { method: 'POST' });
      toast.success(r.changes.length ? `${r.changes.length} price change(s) detected` : 'Rescanned — no changes');
      await refresh();
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleDelete = async (id) => {
    try { await req(`/${id}`, { method: 'DELETE' }); await refresh(); toast.success('Competitor removed'); }
    catch (e) { toast.error(e.message); }
  };

  const openEdit = (c) => { setEditComp(c); setEditPlans((c.plans || []).map((p) => ({ ...p }))); };
  const saveEdit = async () => {
    setBusy('edit');
    try {
      await req(`/${editComp.competitor_id}`, { method: 'PUT', body: JSON.stringify({ name: editComp.name, url: editComp.url, plans: editPlans }) });
      toast.success('Competitor updated'); setEditComp(null); await refresh();
    } catch (e) { toast.error(e.message); }
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

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="ci-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;

  if (!status?.is_enterprise || !status?.is_owner) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="ci-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Swords className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Competitor Intelligence</h2>
          <p className="text-zinc-400 text-sm max-w-md">{!status?.is_enterprise ? 'Track competitors\u2019 public pricing over time and benchmark against your own. Available on the Enterprise plan.' : 'Only the organization owner can manage competitor intelligence.'}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto" data-testid="competitor-intel-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Swords className="w-4 h-4" /> Competitor Intelligence</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Track the market, price with confidence</h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">Add a competitor + their pricing page — InFlow auto-extracts their public plans, tracks changes over time, and benchmarks them against your own pricing.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={openMyPricing} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="my-pricing-btn"><DollarSign className="w-4 h-4 mr-1.5" /> Your Pricing</Button>
            <Button onClick={() => { setAddForm({ name: '', url: '' }); setAddOpen(true); }} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="add-competitor-btn"><Plus className="w-4 h-4 mr-1.5" /> Add Competitor</Button>
          </div>
        </div>

        {/* Benchmark strip */}
        {bench && (
          <div className={`rounded-2xl p-5 mb-8 ${glass}`} data-testid="benchmark-strip">
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

        {/* Competitor list */}
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

                  {/* Plans */}
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
                      <span className={cs.position_vs_you === 'you are cheaper' ? 'text-emerald-400' : cs.position_vs_you === 'you are pricier' ? 'text-amber-400' : 'text-sky-300'}>
                        {cs.position_vs_you} (avg {money(cs.avg_price)})
                      </span>
                    </div>
                  )}

                  {/* Change history */}
                  {(c.history || []).length > 0 && (
                    <div className="rounded-lg bg-black/20 border border-white/5 px-3 py-2 mb-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1"><History className="w-3 h-3" /> Recent changes</div>
                      {c.history.slice(0, 3).map((h, i) => (
                        <div key={i} className="text-[11px] text-zinc-500">{h.changes.slice(0, 2).join(' · ')}</div>
                      ))}
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

      {/* Add competitor dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md" data-testid="add-competitor-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Add Competitor</DialogTitle>
            <DialogDescription className="text-zinc-400">Paste their public pricing page — we\u2019ll auto-extract the plans (verify before relying on it).</DialogDescription>
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
