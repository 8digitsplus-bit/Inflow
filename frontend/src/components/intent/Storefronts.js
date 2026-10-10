import { useState, useEffect, useCallback } from 'react';
import { Crown, Eye, FileSignature, Users, Plus, Pencil, Trash2, Loader2, CreditCard, Link2, ExternalLink, Ban, Inbox } from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { api, timeAgo, Kpi, Section, Pill, ScoreRing, TIER_STYLE, copyText } from './shared';
import { PushMenu } from './PushMenu';
import { StorefrontDialog, RedCarpetBanner } from './StorefrontDialog';

const StripeBox = ({ r, isOwner, stripeConnected, reload }) => {
  const [busy, setBusy] = useState(false);
  const promo = r.stripe;
  const run = async (method) => {
    setBusy(true);
    try {
      await api(`/storefronts/${r.rule_id}/stripe-promo`, method === 'POST' ? { method, body: JSON.stringify({ max_redemptions: 25 }) } : { method });
      toast.success(method === 'POST' ? 'Promo code created in your Stripe account' : 'Promo code deactivated in Stripe');
      reload();
    } catch (e) { toast.error(e.message); }
    setBusy(false);
  };
  if (promo?.active) return (
    <div className="flex items-center gap-2 text-xs" data-testid={`sf-stripe-active-${r.rule_id}`}>
      <CreditCard className="w-3.5 h-3.5 text-emerald-400" /><span className="font-mono text-white bg-white/5 border border-white/10 px-1.5 py-0.5 rounded" data-testid={`sf-promo-code-${r.rule_id}`}>{promo.code}</span>
      <span className="text-zinc-500">Stripe {promo.livemode ? 'live' : 'test'} · {promo.max_redemptions} uses</span>
      {isOwner && <button onClick={() => run('DELETE')} disabled={busy} className="text-zinc-500 hover:text-red-300 flex items-center gap-1" data-testid={`sf-stripe-deactivate-${r.rule_id}`}><Ban className="w-3.5 h-3.5" /> Deactivate</button>}
    </div>
  );
  return (
    <Button size="sm" variant="outline" onClick={() => run('POST')} disabled={!isOwner || busy || !r.discount_pct || !stripeConnected}
      title={stripeConnected ? '' : 'Connect Stripe on the Integrations page'} className="border-zinc-700 text-zinc-300 hover:bg-white/5 h-8 text-xs" data-testid={`sf-stripe-create-${r.rule_id}`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CreditCard className="w-3.5 h-3.5 mr-1" />} {stripeConnected ? 'Push discount to Stripe' : 'Stripe not connected'}
    </Button>
  );
};

const RuleRow = ({ r, isOwner, stripeConnected, onEdit, onDelete, onToggle, reload }) => (
  <div className={`p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 ${r.enabled ? '' : 'opacity-50'}`} data-testid={`sf-rule-${r.rule_id}`}>
    <div className="space-y-2.5">
      <div className="flex items-center gap-2"><span className="text-white font-medium">{r.name}</span><Pill className="bg-white/5 text-zinc-400 border-white/10">P{r.priority}</Pill>
        {isOwner && <div className="ml-auto flex items-center gap-1.5">
          <Switch checked={r.enabled} onCheckedChange={() => onToggle(r)} data-testid={`sf-toggle-${r.rule_id}`} />
          <button onClick={() => onEdit(r)} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5" data-testid={`sf-edit-${r.rule_id}`}><Pencil className="w-4 h-4" /></button>
          <button onClick={() => onDelete(r)} className="p-1.5 rounded-md text-zinc-500 hover:text-red-300 hover:bg-red-500/10" data-testid={`sf-delete-${r.rule_id}`}><Trash2 className="w-4 h-4" /></button>
        </div>}
      </div>
      <div className="text-xs text-zinc-400">Audience: score ≥ {r.min_score}{r.event_types?.length ? ` · showed ${r.event_types.map((e) => e.replace(/_/g, ' ')).join(' / ')}` : ''}{r.accounts?.length ? ` · ${r.accounts.join(', ')}` : ''}</div>
      <div className="text-xs text-zinc-400">Offer: <span className="text-white">{r.discount_pct}% pre-approved</span>{r.contract_terms ? ` · ${r.contract_terms}` : ''} · {r.expires_days}d validity</div>
      <div className="flex items-center gap-4 text-[11px] text-zinc-500"><span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {r.impressions || 0} impressions</span><span className="flex items-center gap-1"><FileSignature className="w-3.5 h-3.5" /> {r.quote_requests || 0} quote requests</span></div>
      <StripeBox r={r} isOwner={isOwner} stripeConnected={stripeConnected} reload={reload} />
    </div>
    <RedCarpetBanner offer={{ ...r, promo_code: r.stripe?.active ? r.stripe.code : '' }} testid={`sf-preview-${r.rule_id}`} />
  </div>
);

const MatchRow = ({ m, isOwner, destinations, onLink, linking }) => (
  <div className="px-5 py-3 flex flex-col md:flex-row md:items-center gap-3" data-testid={`sf-match-${m.lead_id}`}>
    <ScoreRing score={m.intent_score} size={34} />
    <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-white text-sm">{m.account}</span><Pill className={TIER_STYLE[m.tier]}>{m.tier}</Pill></div>
      <div className="text-[11px] text-zinc-500">{m.offer.name} · {m.offer.discount_pct}% · {m.offer.contract_terms || 'standard terms'}</div></div>
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => onLink(m)} disabled={!isOwner || linking === m.lead_id} className="bg-[#0052ff] hover:bg-[#0047d6] h-8 text-xs" data-testid={`sf-link-btn-${m.lead_id}`}>{linking === m.lead_id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1" />} Quote page</Button>
      <PushMenu leadId={m.lead_id} kind="offer" destinations={destinations} disabled={!isOwner} testid={`sf-push-offer-${m.lead_id}`} />
    </div>
  </div>
);

export const Storefronts = ({ isOwner, destinations, tick }) => {
  const [data, setData] = useState(null);
  const [matches, setMatches] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [dlg, setDlg] = useState({ open: false, rule: null });
  const [linking, setLinking] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, m, q] = await Promise.all([api('/storefronts'), api('/storefronts/matches'), api('/storefronts/quote-requests')]);
      setData(d); setMatches(m); setQuotes(q);
    } catch (e) { toast.error(e.message); }
  }, []);
  useEffect(() => { load(); }, [load, tick]);

  const toggle = async (r) => {
    try { await api(`/storefronts/${r.rule_id}`, { method: 'PUT', body: JSON.stringify({ ...r, enabled: !r.enabled }) }); load(); } catch (e) { toast.error(e.message); }
  };
  const del = async (r) => {
    if (!window.confirm('Delete this storefront rule?')) return;
    try { await api(`/storefronts/${r.rule_id}`, { method: 'DELETE' }); toast.success('Storefront deleted'); load(); } catch (e) { toast.error(e.message); }
  };
  const link = async (m) => {
    setLinking(m.lead_id);
    try {
      const r = await api(`/storefronts/${m.offer.rule_id}/link`, { method: 'POST', body: JSON.stringify({ lead_id: m.lead_id }) });
      const url = `${window.location.origin}${r.path}`;
      await copyText(url, toast);
      window.open(url, '_blank', 'noopener');
      load();
    } catch (e) { toast.error(e.message); }
    setLinking('');
  };

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="storefronts-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Crown} label="Live storefronts" value={data.rules.filter((r) => r.enabled).length} sub={`${data.rules.length} configured`} testid="kpi-sf-live" />
        <Kpi icon={Users} label="Qualified accounts" value={matches.length} sub="seeing a red-carpet offer" testid="kpi-sf-qualified" />
        <Kpi icon={Eye} label="Offer impressions" value={data.impressions} sub="snippet + hosted pages" testid="kpi-sf-impressions" />
        <Kpi icon={FileSignature} label="Quote requests" value={data.quote_requests} sub="from red-carpet pages" testid="kpi-sf-quotes" />
      </div>

      <Section icon={Crown} title="Storefront rules" testid="sf-rules-section" right={isOwner && <Button size="sm" onClick={() => setDlg({ open: true, rule: null })} className="bg-[#0052ff] hover:bg-[#0047d6] h-8 text-xs" data-testid="new-storefront-btn"><Plus className="w-3.5 h-3.5 mr-1" /> New storefront</Button>}>
        {data.rules.length === 0 ? <div className="px-5 py-10 text-center text-zinc-500 text-sm" data-testid="no-storefronts">No storefronts yet — create one to show pre-approved terms to your hottest visitors.</div> : (
          <div className="divide-y divide-white/[0.05]">{data.rules.map((r) => <RuleRow key={r.rule_id} r={r} isOwner={isOwner} stripeConnected={data.stripe_connected} onEdit={(x) => setDlg({ open: true, rule: x })} onDelete={del} onToggle={toggle} reload={load} />)}</div>
        )}
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section icon={Users} title="Qualified accounts" testid="sf-matches-section">
          {matches.length === 0 ? <div className="px-5 py-10 text-center text-zinc-500 text-sm" data-testid="no-matches">No account qualifies for a storefront yet.</div> : (
            <div className="divide-y divide-white/[0.05]">{matches.map((m) => <MatchRow key={m.lead_id} m={m} isOwner={isOwner} destinations={destinations} onLink={link} linking={linking} />)}</div>
          )}
        </Section>
        <Section icon={Inbox} title="Quote requests" testid="sf-quotes-section">
          {quotes.length === 0 ? <div className="px-5 py-10 text-center text-zinc-500 text-sm" data-testid="no-quotes">Requests submitted on hosted quote pages land here — and alert the assigned AE.</div> : (
            <div className="divide-y divide-white/[0.05]">{quotes.map((q) => (
              <div key={q.request_id} className="px-5 py-3" data-testid={`sf-quote-${q.request_id}`}>
                <div className="flex items-center justify-between"><span className="text-sm text-white">{q.name} · {q.account}</span><span className="text-[11px] text-zinc-500">{timeAgo(q.created_at)}</span></div>
                <div className="text-[11px] text-zinc-400">{q.email} · {q.seats ? `${q.seats} seats · ` : ''}{q.discount_pct}% offer{q.promo_code ? ` · ${q.promo_code}` : ''}</div>
                {q.message && <div className="text-xs text-zinc-500 mt-1">“{q.message}”</div>}
              </div>))}</div>
          )}
        </Section>
      </div>

      <div className="text-[11px] text-zinc-500 flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Your own pricing page personalizes automatically once the tracking snippet is installed — use <span className="font-mono text-zinc-400">data-inflow-*</span> slots for full control.</div>

      <StorefrontDialog open={dlg.open} rule={dlg.rule} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} onSaved={load} />
    </div>
  );
};
