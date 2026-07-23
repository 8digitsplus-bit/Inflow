import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Telescope, ScanLine, Loader2, DollarSign, Flame, Users, Gauge, Mail, CalendarClock,
  Route, Beaker, Check, Copy, ChevronDown, ChevronUp, Link2, Settings2,
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

const CAT_STYLE = {
  Marketing: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  Sales: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Product: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};
const STATUS_STYLE = {
  new: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  assigned: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  contacted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  booked: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  sandbox: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  won: 'bg-emerald-500/25 text-emerald-200 border-emerald-500/40',
  dismissed: 'bg-zinc-600/15 text-zinc-400 border-zinc-600/30',
};
const glass = 'bg-white/[0.04] border border-white/10 backdrop-blur-xl';

export default function HighIntent() {
  const [status, setStatus] = useState(null);
  const [leads, setLeads] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [expanded, setExpanded] = useState(null);

  const [schedUrl, setSchedUrl] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  // outreach / booking email dialog
  const [action, setAction] = useState(null); // {mode, lead, draft, to, subject, body, booking_link}
  const [copied, setCopied] = useState(false);

  const [ft, setFt] = useState(null); // fast-track { lead, assignee_id, notify }
  const [sandbox, setSandbox] = useState(null); // { lead, data }

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
      setSchedUrl(st.scheduling_url || '');
      if (st.is_paid) {
        const [l, t] = await Promise.all([req('/leads'), req('/team')]);
        setLeads(l || []); setTeam(t || []);
      }
    } catch (e) { /* gate */ }
    finally { setLoading(false); }
  }, [req]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const open = leads.filter(l => l.status !== 'dismissed' && l.status !== 'won');
  const hot = open.filter(l => l.intent_score >= 60);
  const pipeline = open.reduce((s, l) => s + (l.value || 0), 0);

  const handleScan = async () => {
    setBusy('scan');
    try {
      const r = await req('/scan', { method: 'POST' });
      toast.success(`Scan complete — ${r.leads_found} buyer(s), ${r.hot_leads} hot`);
      setLeads(await req('/leads'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const saveUrl = async () => {
    setSavingUrl(true);
    try { await req('/settings', { method: 'PUT', body: JSON.stringify({ scheduling_url: schedUrl }) }); toast.success('Scheduling link saved'); setStatus(await req('/status')); }
    catch (e) { toast.error(e.message); }
    setSavingUrl(false);
  };

  const splitDraft = (text) => {
    const m = (text || '').match(/^\s*subject:\s*(.+)$/im);
    if (m) return { subject: m[1].trim(), body: (text || '').replace(/^\s*subject:\s*.+$/im, '').replace(/^\s+/, '') };
    return { subject: '', body: text || '' };
  };

  const openAction = async (lead, mode) => {
    setAction({ mode, lead, draft: null, to: lead.contact_email || '', subject: '', body: '', booking_link: '' });
    setCopied(false);
    try {
      const d = await req(`/leads/${lead.lead_id}/${mode}`, { method: 'POST', body: JSON.stringify({}) });
      const { subject, body } = splitDraft(d.draft);
      setAction(a => a && a.lead.lead_id === lead.lead_id ? { ...a, draft: d.draft, subject, body, booking_link: d.booking_link || '' } : a);
    } catch (e) { toast.error(e.message); setAction(null); }
  };

  const sendAction = async () => {
    if (!action.to || !action.to.includes('@')) { toast.error('Enter a valid recipient email'); return; }
    setBusy('send');
    try {
      await req('/send-email', {
        method: 'POST',
        body: JSON.stringify({ lead_id: action.lead.lead_id, to: action.to, subject: action.subject, body: action.body, mark_status: action.mode === 'booking' ? 'booked' : 'contacted' }),
      });
      toast.success(`Sent to ${action.to}`);
      setAction(null); setLeads(await req('/leads'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const doFastTrack = async () => {
    if (!ft.assignee_id) { toast.error('Pick an account executive'); return; }
    setBusy('ft');
    try {
      const r = await req(`/leads/${ft.lead.lead_id}/fast-track`, { method: 'POST', body: JSON.stringify({ assignee_id: ft.assignee_id, notify: ft.notify }) });
      toast.success(`Routed to ${r.assigned_name}${r.notified ? ' · notified' : ''}`);
      setFt(null); setLeads(await req('/leads'));
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const openSandbox = async (lead) => {
    if (lead.sandbox) { setSandbox({ lead, data: lead.sandbox }); return; }
    setSandbox({ lead, data: null });
    try {
      const d = await req(`/leads/${lead.lead_id}/sandbox`, { method: 'POST', body: JSON.stringify({}) });
      setSandbox(s => s && s.lead.lead_id === lead.lead_id ? { ...s, data: d } : s);
      setLeads(await req('/leads'));
      toast.success('Sandbox package ready');
    } catch (e) { toast.error(e.message); setSandbox(null); }
  };

  const dismissLead = async (l) => {
    try { await req(`/leads/${l.lead_id}`, { method: 'PATCH', body: JSON.stringify({ status: 'dismissed' }) }); setLeads(await req('/leads')); }
    catch (e) { toast.error(e.message); }
  };

  const copyBody = () => { navigator.clipboard.writeText(action.body || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const ownerHint = (el) => isOwner ? el : null;

  // -------- gates
  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="intent-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;
  if (!status?.is_paid) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="intent-paid-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Telescope className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>High-Intent Buyer Detection</h2>
          <p className="text-zinc-400 text-sm max-w-md">Discover who is most likely to buy. This feature is available on any active InFlow subscription — upgrade to surface hot buyers and route them to your team instantly.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="high-intent-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Telescope className="w-4 h-4" /> Revenue Execution · Discover</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>High-Intent Buyer Detection</h1>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">We watch buying-intent signals across your connected integrations — marketing, sales and product — and score every open opportunity so you can act on the hottest buyers first.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button onClick={handleScan} disabled={busy === 'scan'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-9 text-sm" data-testid="scan-buyers-btn">
              {busy === 'scan' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ScanLine className="w-4 h-4 mr-1.5" />} Scan for buyers
            </Button>
          </div>
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
            <div className="text-3xl font-bold text-white">{open.length}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{leads.length} detected total</div>
          </div>
          <div className={`rounded-2xl p-5 ${glass}`} data-testid="stat-pipeline">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><DollarSign className="w-4 h-4" /> Pipeline in play</div>
            <div className="text-3xl font-bold text-white">{money(pipeline)}</div>
            <div className="text-[11px] text-zinc-500 mt-1">{status?.usage_sources_connected?.length ? `Usage: ${status.usage_sources_connected.join(', ')}` : 'Sales + marketing signals'}</div>
          </div>
        </div>

        {/* Settings: scheduling link */}
        {isOwner && (
          <div className={`rounded-2xl ${glass} mb-8 p-5`} data-testid="intent-settings">
            <div className="flex items-center gap-2 mb-3"><Settings2 className="w-4 h-4 text-slate-400" /><h2 className="text-sm font-semibold text-white">Direct-booking link</h2><span className="text-xs text-zinc-500 hidden sm:inline">· your Calendly / Cal.com URL, personalized per lead</span></div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={schedUrl} onChange={(e) => setSchedUrl(e.target.value)} placeholder="https://calendly.com/your-team/demo" className="bg-zinc-900 border-zinc-700 text-white flex-1" data-testid="scheduling-url-input" />
              <Button onClick={saveUrl} disabled={savingUrl} className="bg-white/10 hover:bg-white/20 text-white" data-testid="save-scheduling-btn">{savingUrl ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Link2 className="w-4 h-4 mr-1.5" />} Save</Button>
            </div>
          </div>
        )}

        {/* Leads */}
        <div className={`rounded-2xl ${glass} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2"><Gauge className="w-4 h-4 text-slate-400" /><h2 className="text-sm font-semibold text-white">High-intent buyers</h2>{!isOwner && <span className="text-[11px] text-zinc-500 ml-auto">Actions are owner-only</span>}</div>
          {open.length === 0 ? (
            <div className="px-5 py-12 text-center text-zinc-500 text-sm" data-testid="no-leads">No buyers detected yet. Click <span className="text-white font-medium">Scan for buyers</span> to analyze your open opportunities for buying-intent signals.</div>
          ) : (
            <div className="divide-y divide-white/[0.05]" data-testid="leads-list">
              {open.map((l) => (
                <div key={l.lead_id} className="px-5 py-4" data-testid={`lead-row-${l.lead_id}`}>
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-medium truncate">{l.account}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${STATUS_STYLE[l.status] || STATUS_STYLE.new}`} data-testid={`lead-status-${l.lead_id}`}>{l.status}</span>
                        <span className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-md border ${l.intent_score >= 60 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-white/5 text-zinc-400 border-white/10'}`}><Flame className="w-3 h-3" /> {l.intent_score}/100</span>
                        {l.assigned_name && <span className="text-[10px] text-indigo-300 flex items-center gap-1"><Route className="w-3 h-3" /> {l.assigned_name}</span>}
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
                    <Button size="sm" disabled={!isOwner} onClick={() => setFt({ lead: l, assignee_id: '', notify: true })} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white disabled:opacity-40" data-testid={`fasttrack-${l.lead_id}`}><Route className="w-3.5 h-3.5 mr-1" /> Fast-track</Button>
                    <Button size="sm" disabled={!isOwner} onClick={() => openAction(l, 'outreach')} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white disabled:opacity-40" data-testid={`outreach-${l.lead_id}`}><Mail className="w-3.5 h-3.5 mr-1" /> Outreach</Button>
                    <Button size="sm" disabled={!isOwner} onClick={() => openAction(l, 'booking')} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white disabled:opacity-40" data-testid={`booking-${l.lead_id}`}><CalendarClock className="w-3.5 h-3.5 mr-1" /> Book demo</Button>
                    <Button size="sm" disabled={!isOwner} onClick={() => openSandbox(l)} className="h-8 text-xs bg-white/10 hover:bg-white/20 text-white disabled:opacity-40" data-testid={`sandbox-${l.lead_id}`}><Beaker className="w-3.5 h-3.5 mr-1" /> {l.sandbox ? 'View sandbox' : 'Build sandbox'}</Button>
                    <button onClick={() => setExpanded(expanded === l.lead_id ? null : l.lead_id)} className="h-8 text-xs text-zinc-400 hover:text-white flex items-center gap-1 px-2" data-testid={`activity-${l.lead_id}`}>{expanded === l.lead_id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Activity</button>
                    {ownerHint(<Button size="sm" variant="ghost" onClick={() => dismissLead(l)} className="h-8 text-xs text-zinc-500 hover:text-zinc-300 ml-auto" data-testid={`dismiss-${l.lead_id}`}>Dismiss</Button>)}
                  </div>
                  {expanded === l.lead_id && (
                    <div className="mt-3 rounded-lg bg-white/[0.02] border border-white/[0.06] p-3 space-y-1.5" data-testid={`activity-log-${l.lead_id}`}>
                      {(l.activity || []).slice().reverse().map((a, i) => (
                        <div key={i} className="text-xs text-zinc-400 flex items-center gap-2"><span className="text-zinc-600">{new Date(a.ts).toLocaleDateString()}</span><span className="text-zinc-500 capitalize">{a.type.replace('_', ' ')}:</span> {a.detail} <span className="text-zinc-600">· {a.by}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Outreach / Booking dialog */}
      <Dialog open={!!action} onOpenChange={(o) => { if (!o) setAction(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="intent-action-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2">
              {action?.mode === 'booking' ? <CalendarClock className="w-5 h-5 text-emerald-400" /> : <Mail className="w-5 h-5 text-sky-400" />}
              {action?.mode === 'booking' ? 'Send booking link' : 'Custom outreach'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">{action && <>{action.lead.account} — AI-drafted, tailored to their exact signals. Edit, then send.</>}</DialogDescription>
          </DialogHeader>
          {action && !action.draft ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /> <span className="ml-2 text-zinc-400 text-sm">Drafting with AI…</span></div>
          ) : action ? (
            <div className="space-y-3 py-1">
              <div><Label className="text-zinc-500 text-[11px]">To</Label><Input value={action.to} onChange={(e) => setAction({ ...action, to: e.target.value })} placeholder="buyer@company.com" className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="intent-to-input" /></div>
              <div><Label className="text-zinc-500 text-[11px]">Subject</Label><Input value={action.subject} onChange={(e) => setAction({ ...action, subject: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white h-9 text-sm mt-1" data-testid="intent-subject-input" /></div>
              <div><Label className="text-zinc-500 text-[11px]">Body</Label><Textarea value={action.body} onChange={(e) => setAction({ ...action, body: e.target.value })} rows={9} className="bg-zinc-900 border-zinc-700 text-white text-sm mt-1 leading-relaxed" data-testid="intent-body-input" /></div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={copyBody} className="border-zinc-700 text-zinc-300 hover:bg-white/5" data-testid="intent-copy-btn">{copied ? <Check className="w-4 h-4 mr-1 text-emerald-400" /> : <Copy className="w-4 h-4 mr-1" />} {copied ? 'Copied' : 'Copy'}</Button>
                <Button onClick={sendAction} disabled={busy === 'send'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="intent-send-btn">{busy === 'send' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />} Send</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Fast-track dialog */}
      <Dialog open={!!ft} onOpenChange={(o) => { if (!o) setFt(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md" data-testid="fasttrack-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><Route className="w-5 h-5 text-indigo-400" /> Fast-track to an AE</DialogTitle>
            <DialogDescription className="text-zinc-400">{ft && <>Route {ft.lead.account} ({ft.lead.intent_score}/100 intent) to an account executive for immediate outreach.</>}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div><Label className="text-zinc-400 text-xs">Account executive</Label>
              <select value={ft?.assignee_id || ''} onChange={(e) => setFt({ ...ft, assignee_id: e.target.value })} className="w-full bg-zinc-900 border border-zinc-700 rounded-md text-white text-sm h-9 mt-1 px-2" data-testid="fasttrack-assignee-select">
                <option value="">Select a teammate…</option>
                {team.map((m) => <option key={m.user_id} value={m.user_id}>{m.name || m.email}{m.role === 'owner' ? ' (owner)' : ''}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={ft?.notify || false} onChange={(e) => setFt({ ...ft, notify: e.target.checked })} className="accent-[#0052ff] w-4 h-4" data-testid="fasttrack-notify-check" /> Email the AE now with the lead details</label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFt(null)} className="text-zinc-400" data-testid="fasttrack-cancel-btn">Cancel</Button>
            <Button onClick={doFastTrack} disabled={busy === 'ft'} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="fasttrack-confirm-btn">{busy === 'ft' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Route className="w-4 h-4 mr-1.5" />} Route lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sandbox dialog */}
      <Dialog open={!!sandbox} onOpenChange={(o) => { if (!o) setSandbox(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg max-h-[90vh] overflow-y-auto" data-testid="sandbox-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Outfit' }} className="flex items-center gap-2"><Beaker className="w-5 h-5 text-violet-400" /> Personalized sandbox</DialogTitle>
            <DialogDescription className="text-zinc-400">{sandbox && <>{sandbox.lead.account} — a proof-of-concept environment pre-loaded with their data.</>}</DialogDescription>
          </DialogHeader>
          {sandbox && !sandbox.data ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /> <span className="ml-2 text-zinc-400 text-sm">Provisioning sandbox…</span></div>
          ) : sandbox ? (
            <div className="space-y-3 py-1">
              <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{sandbox.data.status}</span>
                <a href={sandbox.data.link} target="_blank" rel="noreferrer" className="text-[#4d8bff] hover:text-white text-xs truncate flex items-center gap-1" data-testid="sandbox-link"><Link2 className="w-3.5 h-3.5" /> {sandbox.data.link}</a>
              </div>
              <div><Label className="text-zinc-500 text-[11px]">Setup brief (pre-loaded data)</Label><Textarea readOnly value={sandbox.data.brief} rows={9} className="bg-zinc-900 border-zinc-700 text-zinc-200 text-sm mt-1 leading-relaxed" data-testid="sandbox-brief" /></div>
              <p className="text-[11px] text-zinc-500">Note: this generates a shareable POC package and setup brief. Wire the link to your real product's sandbox provisioning to make it live.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setSandbox(null)} className="bg-white/10 hover:bg-white/20 text-white" data-testid="sandbox-close-btn">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
