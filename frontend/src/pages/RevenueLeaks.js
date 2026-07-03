import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import {
  Radar, RefreshCw, ScanLine, Plus, Trash2, AlertTriangle, TrendingUp,
  FileText, Mail, GitBranch, Check, X, DollarSign, Users, Building2, Loader2,
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

const money = (n, cur = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: (cur || 'usd').toUpperCase(), maximumFractionDigits: 0 }).format(n || 0);

const STATUS_STYLE = {
  open: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  recovered: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  dismissed: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  resolved: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const emptyContract = {
  customer_name: '', account_key: '', stripe_customer_id: '', usage_source: 'mixpanel',
  contracted_seats: '', unit_price_per_seat: '', currency: 'usd', am_email: '',
};

export default function RevenueLeaks() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [leaks, setLeaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyContract);
  const [reviewLeak, setReviewLeak] = useState(null);
  const [draft, setDraft] = useState(null);
  const [emailEdit, setEmailEdit] = useState({ to: '', subject: '', body: '' });
  const [approveResult, setApproveResult] = useState(null);

  const req = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}/api/telemetry${path}`, {
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
        const [c, l] = await Promise.all([req('/contracts'), req('/leaks')]);
        setContracts(c || []);
        setLeaks(l || []);
      }
    } catch (e) {
      // status still renders gate
    } finally {
      setLoading(false);
    }
  }, [req]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const totalUnbilled = leaks.filter(l => l.status === 'open').reduce((s, l) => s + (l.est_unbilled_amount || 0), 0);
  const openCount = leaks.filter(l => l.status === 'open').length;

  const handleSync = async () => {
    setBusy('sync');
    try {
      const r = await req('/sync', { method: 'POST', body: JSON.stringify({ account_property: 'company', usage_event: '' }) });
      toast.success(r.message || 'Usage synced');
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleScan = async () => {
    setBusy('scan');
    try {
      const r = await req('/scan', { method: 'POST' });
      toast.success(`Scan complete — ${r.leaks_found} leak(s) across ${r.contracts_scanned} contract(s)`);
      setLeaks(await req('/leaks'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleAddContract = async () => {
    if (!form.customer_name.trim() || !form.account_key.trim()) {
      toast.error('Customer name and account key are required'); return;
    }
    setBusy('add');
    try {
      await req('/contracts', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          contracted_seats: parseInt(form.contracted_seats || 0, 10),
          unit_price_per_seat: parseFloat(form.unit_price_per_seat || 0),
        }),
      });
      toast.success('Contract added');
      setAddOpen(false);
      setForm(emptyContract);
      setContracts(await req('/contracts'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleDeleteContract = async (id) => {
    try {
      await req(`/contracts/${id}`, { method: 'DELETE' });
      setContracts(await req('/contracts'));
      setLeaks(await req('/leaks'));
      toast.success('Contract removed');
    } catch (e) { toast.error(e.message); }
  };

  const openReview = async (leak) => {
    setReviewLeak(leak);
    setDraft(null);
    setApproveResult(null);
    setBusy('draft');
    try {
      const d = await req(`/leaks/${leak.leak_id}/draft`, { method: 'POST' });
      setDraft(d);
      setEmailEdit({ to: d.email.to || '', subject: d.email.subject || '', body: d.email.body || '' });
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleApprove = async () => {
    setBusy('approve');
    try {
      const r = await req(`/leaks/${reviewLeak.leak_id}/approve`, {
        method: 'POST', body: JSON.stringify(emailEdit),
      });
      setApproveResult(r.actions);
      toast.success('Recovery executed — invoice drafted, CRM opportunity created');
      setLeaks(await req('/leaks'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const handleDismiss = async (leak) => {
    try {
      await req(`/leaks/${leak.leak_id}/dismiss`, { method: 'POST' });
      setLeaks(await req('/leaks'));
      toast.success('Leak dismissed');
      if (reviewLeak?.leak_id === leak.leak_id) setReviewLeak(null);
    } catch (e) { toast.error(e.message); }
  };

  // -------- gates
  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="leaks-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;
  }
  if (!status?.is_enterprise) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="leaks-enterprise-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Radar className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Multi-Platform Telemetry Sync</h2>
          <p className="text-zinc-400 text-sm max-w-md">Revenue-leak detection is an Enterprise feature. Upgrade to cross-reference product usage against billing contracts and recover unbilled revenue automatically.</p>
        </div>
      </DashboardLayout>
    );
  }
  if (!status?.is_owner) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="leaks-owner-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Radar className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Owner access required</h2>
          <p className="text-zinc-400 text-sm max-w-md">Only the organization owner can manage contracts and recover revenue leaks.</p>
        </div>
      </DashboardLayout>
    );
  }

  const glass = 'bg-white/[0.04] border border-white/10 backdrop-blur-xl';

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="revenue-leaks-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">
              <Radar className="w-4 h-4" /> Telemetry Sync
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Revenue Leak Detection</h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">Cross-reference live product usage against billing contracts. When customers exceed their entitlements, recover the unbilled revenue in one click.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={handleSync} disabled={busy === 'sync'} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="sync-usage-btn">
              {busy === 'sync' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Sync Usage
            </Button>
            <Button onClick={handleScan} disabled={busy === 'scan'} className="bg-white/10 hover:bg-white/20 text-white h-9 text-sm" data-testid="scan-leaks-btn">
              {busy === 'scan' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ScanLine className="w-4 h-4 mr-1.5" />} Scan for Leaks
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-unbilled">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><DollarSign className="w-4 h-4" /> Unbilled / month</div>
            <div className="text-3xl font-bold text-white">{money(totalUnbilled)}</div>
            <div className="text-[11px] text-zinc-500 mt-1">≈ {money(totalUnbilled * 12)} annualized</div>
          </div>
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-open-leaks">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><AlertTriangle className="w-4 h-4" /> Open leaks</div>
            <div className="text-3xl font-bold text-white">{openCount}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{leaks.length} detected total</div>
          </div>
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-contracts">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><FileText className="w-4 h-4" /> Contracts tracked</div>
            <div className="text-3xl font-bold text-white">{contracts.length}</div>
            <div className="text-[11px] text-zinc-500 mt-1">
              {status?.usage_sources_connected?.length ? `Usage: ${status.usage_sources_connected.join(', ')}` : 'No usage source connected'}
            </div>
          </div>
        </div>

        {/* Leaks */}
        <div className={`rounded-2xl ${glass} mb-8 overflow-hidden`}>
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Detected Leaks</h2>
          </div>
          {leaks.length === 0 ? (
            <div className="px-5 py-12 text-center text-zinc-500 text-sm" data-testid="no-leaks">
              No leaks yet. Add a contract, sync usage, then run a scan.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]" data-testid="leaks-list">
              {leaks.map((l) => (
                <div key={l.leak_id} className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 hover:bg-white/[0.02]" data-testid={`leak-row-${l.leak_id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate">{l.customer_name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${STATUS_STYLE[l.status] || STATUS_STYLE.open}`} data-testid={`leak-status-${l.leak_id}`}>{l.status}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 mt-1">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {l.used_seats} used / {l.contracted_seats} contracted</span>
                      <span className="text-amber-300">+{l.overage_seats} over</span>
                      {l.usage_source && <span className="text-zinc-600">via {l.usage_source}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-white">{money(l.est_unbilled_amount, l.currency)}<span className="text-xs text-zinc-500 font-normal">/mo</span></div>
                    <div className="text-[11px] text-zinc-500">unbilled</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.status === 'open' ? (
                      <>
                        <Button onClick={() => openReview(l)} className="bg-white/10 hover:bg-white/20 text-white h-8 text-xs" data-testid={`review-leak-btn-${l.leak_id}`}>Review &amp; Recover</Button>
                        <Button onClick={() => handleDismiss(l)} variant="ghost" className="h-8 text-xs text-zinc-500 hover:text-zinc-300" data-testid={`dismiss-leak-btn-${l.leak_id}`}>Dismiss</Button>
                      </>
                    ) : (
                      <Button onClick={() => openReview(l)} variant="ghost" className="h-8 text-xs text-zinc-400 hover:text-white" data-testid={`view-leak-btn-${l.leak_id}`}>View</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contracts */}
        <div className={`rounded-2xl ${glass} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-white">Contracts</h2>
            </div>
            <Button onClick={() => { setForm(emptyContract); setAddOpen(true); }} className="bg-white/10 hover:bg-white/20 text-white h-8 text-xs" data-testid="add-contract-btn">
              <Plus className="w-4 h-4 mr-1" /> Add Contract
            </Button>
          </div>
          {contracts.length === 0 ? (
            <div className="px-5 py-12 text-center text-zinc-500 text-sm" data-testid="no-contracts">No contracts yet. Add one to start tracking entitlements.</div>
          ) : (
            <div className="divide-y divide-white/[0.05]" data-testid="contracts-list">
              {contracts.map((c) => (
                <div key={c.contract_id} className="px-5 py-4 flex items-center gap-3" data-testid={`contract-row-${c.contract_id}`}>
                  <div className="w-9 h-9 rounded-lg bg-slate-500/15 flex items-center justify-center flex-shrink-0"><Building2 className="w-4 h-4 text-slate-300" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{c.customer_name}</div>
                    <div className="text-xs text-zinc-500">key: {c.account_key} · {c.contracted_seats} seats · {money(c.unit_price_per_seat, c.currency)}/seat{c.usage_source ? ` · ${c.usage_source}` : ''}</div>
                  </div>
                  <Button onClick={() => handleDeleteContract(c.contract_id)} variant="ghost" className="h-8 w-8 p-0 text-zinc-600 hover:text-red-400" data-testid={`delete-contract-btn-${c.contract_id}`}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Contract Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg" data-testid="add-contract-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Add Contract</DialogTitle>
            <DialogDescription className="text-zinc-400">Define a customer's contracted entitlements to detect overage.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label className="text-zinc-400 text-xs">Customer name</Label>
              <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="contract-customer-input" placeholder="Acme Corp" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Account key (usage property value)</Label>
              <Input value={form.account_key} onChange={(e) => setForm({ ...form, account_key: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="contract-accountkey-input" placeholder="Acme Corp" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Stripe customer ID</Label>
              <Input value={form.stripe_customer_id} onChange={(e) => setForm({ ...form, stripe_customer_id: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="contract-stripe-input" placeholder="cus_..." />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Contracted seats</Label>
              <Input type="number" value={form.contracted_seats} onChange={(e) => setForm({ ...form, contracted_seats: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="contract-seats-input" placeholder="100" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Price / seat ($)</Label>
              <Input type="number" value={form.unit_price_per_seat} onChange={(e) => setForm({ ...form, unit_price_per_seat: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="contract-price-input" placeholder="139" />
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">Usage source</Label>
              <select value={form.usage_source} onChange={(e) => setForm({ ...form, usage_source: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm h-9 mt-1 px-2" data-testid="contract-source-select">
                <option value="mixpanel">Mixpanel</option>
                <option value="amplitude">Amplitude</option>
                <option value="">Any</option>
              </select>
            </div>
            <div>
              <Label className="text-zinc-400 text-xs">AM email (alert)</Label>
              <Input value={form.am_email} onChange={(e) => setForm({ ...form, am_email: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white mt-1" data-testid="contract-amemail-input" placeholder="am@company.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} className="text-zinc-400" data-testid="contract-cancel-btn">Cancel</Button>
            <Button onClick={handleAddContract} disabled={busy === 'add'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="contract-save-btn">
              {busy === 'add' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Save Contract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review & Recover Dialog */}
      <Dialog open={!!reviewLeak} onOpenChange={(o) => { if (!o) { setReviewLeak(null); setDraft(null); setApproveResult(null); } }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="review-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }}>Recover Unbilled Revenue</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {reviewLeak && <>{reviewLeak.customer_name} — {reviewLeak.overage_seats} seats over contract ({money(reviewLeak.est_unbilled_amount, reviewLeak.currency)}/mo). Review the drafted package, then approve.</>}
            </DialogDescription>
          </DialogHeader>

          {busy === 'draft' && !draft ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : approveResult ? (
            <div className="py-4 space-y-3" data-testid="approve-result">
              <div className="flex items-center gap-2 text-emerald-400"><Check className="w-5 h-5" /> <span className="font-medium">Recovery executed</span></div>
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-sm text-zinc-300 space-y-2">
                <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-slate-400" /> Invoice: <span className="text-zinc-400">{approveResult.invoice?.mode === 'live_draft' ? `Live draft ${approveResult.invoice.invoice_id}` : approveResult.invoice?.mode === 'simulated' ? `Simulated draft (${money(approveResult.invoice.amount, approveResult.invoice.currency)})` : `Error: ${approveResult.invoice?.error}`}</span></div>
                <div className="flex items-center gap-2"><GitBranch className="w-4 h-4 text-slate-400" /> CRM: <span className="text-zinc-400">Expansion opportunity created in pipeline</span></div>
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /> AM email: <span className="text-zinc-400">{approveResult.email?.sent ? `Sent to ${approveResult.email.to}` : `Not sent (${approveResult.email?.reason || 'no recipient'})`}</span></div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setReviewLeak(null); setDraft(null); setApproveResult(null); }} className="bg-white/10 hover:bg-white/20 text-white" data-testid="review-close-btn">Done</Button>
              </DialogFooter>
            </div>
          ) : draft ? (
            <div className="py-2 space-y-4">
              {/* Invoice */}
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4" data-testid="draft-invoice">
                <div className="flex items-center gap-2 text-sm font-medium text-white mb-2"><FileText className="w-4 h-4 text-slate-400" /> Unbilled-Usage Invoice (draft)</div>
                <div className="text-xs text-zinc-400">{draft.invoice.description}</div>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span className="text-zinc-400">{draft.invoice.quantity} × {money(draft.invoice.unit_amount, draft.invoice.currency)}</span>
                  <span className="text-white font-bold">{money(draft.invoice.amount, draft.invoice.currency)}</span>
                </div>
                {!status?.stripe_live && <div className="text-[11px] text-amber-400/80 mt-2">Sandbox mode — a real Stripe key will create a live draft invoice.</div>}
              </div>
              {/* CRM */}
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4" data-testid="draft-crm">
                <div className="flex items-center gap-2 text-sm font-medium text-white mb-2"><GitBranch className="w-4 h-4 text-slate-400" /> CRM Expansion Opportunity</div>
                <div className="text-xs text-zinc-400">{draft.crm_deal.name} · {money(draft.crm_deal.value)} (annualized) · stage: {draft.crm_deal.stage}</div>
              </div>
              {/* Email */}
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4" data-testid="draft-email">
                <div className="flex items-center gap-2 text-sm font-medium text-white mb-3"><Mail className="w-4 h-4 text-slate-400" /> Account Manager Alert (editable)</div>
                <div className="space-y-2">
                  <div><Label className="text-zinc-500 text-[11px]">To</Label><Input value={emailEdit.to} onChange={(e) => setEmailEdit({ ...emailEdit, to: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs mt-1" data-testid="email-to-input" /></div>
                  <div><Label className="text-zinc-500 text-[11px]">Subject</Label><Input value={emailEdit.subject} onChange={(e) => setEmailEdit({ ...emailEdit, subject: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs mt-1" data-testid="email-subject-input" /></div>
                  <div><Label className="text-zinc-500 text-[11px]">Body</Label><Textarea value={emailEdit.body} onChange={(e) => setEmailEdit({ ...emailEdit, body: e.target.value })} rows={6} className="bg-zinc-900 border-zinc-700 text-white text-xs mt-1" data-testid="email-body-input" /></div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => handleDismiss(reviewLeak)} className="text-zinc-400" data-testid="review-dismiss-btn"><X className="w-4 h-4 mr-1" /> Dismiss</Button>
                <Button onClick={handleApprove} disabled={busy === 'approve'} className="bg-white/10 hover:bg-white/20 text-white" data-testid="approve-recovery-btn">
                  {busy === 'approve' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />} Approve &amp; Recover
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-6 text-center text-zinc-500 text-sm">No draft available.</div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
