import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Flame, UserCheck, BrainCircuit, Crown, ArrowUpRight, RotateCcw, Mail, MessageSquare, Database, Check, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { api, money, timeAgo, fmtMs, eventIcon, Pill, ScoreRing, TIER_STYLE, CAT_STYLE, SOURCE_LABEL, DEST_LABEL } from './shared';
import { PushMenu } from './PushMenu';

const Card = ({ icon: Icon, title, right, children, testid }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid={testid}>
    <div className="flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-[#4d8bff]" /><span className="text-xs uppercase tracking-wider font-semibold text-slate-400">{title}</span><div className="ml-auto">{right}</div></div>
    {children}
  </div>
);

const Delivery = ({ k, v }) => {
  const Icon = k === 'email' ? Mail : k === 'slack' ? MessageSquare : Database;
  const name = k === 'crm' ? DEST_LABEL[v.provider] || 'CRM' : k === 'email' ? 'Email' : 'Slack';
  return <Pill className={v.ok ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' : 'bg-red-500/10 text-red-300 border-red-500/25'} title={v.error || ''}><Icon className="w-3 h-3" /> {name} {v.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}</Pill>;
};

const Assignment = ({ p, aes, isOwner, destinations, reload }) => {
  const [busy, setBusy] = useState('');
  const a = p.assignment;
  const act = async (kind, aeId) => {
    setBusy(kind);
    try {
      if (kind === 'assign') await api(`/intent/profiles/${p.lead_id}/assign`, { method: 'POST', body: JSON.stringify({ ae_id: aeId }) });
      else await api(`/intent/profiles/${p.lead_id}/reroute`, { method: 'POST' });
      toast.success(kind === 'assign' ? 'AE assigned and alerted' : 'Re-evaluating routing rules');
      setTimeout(reload, 900);
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };
  return (
    <Card icon={UserCheck} title="Speed-to-lead assignment" testid="drawer-assignment" right={a && <PushMenu leadId={p.lead_id} kind="assignment" destinations={destinations} disabled={!isOwner} testid="drawer-push-assignment" />}>
      {a ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between"><span className="text-white font-semibold" data-testid="drawer-ae-name">{a.ae_name}</span><span className="text-[11px] text-zinc-500">{a.ae_email}</span></div>
          <div className="text-xs text-zinc-400">{a.rule_name} · trigger: {a.trigger?.label}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill className="bg-[#0052ff]/15 text-[#7aa7ff] border-[#0052ff]/30" data-testid="drawer-latency">routed in {fmtMs(a.latency_ms)}</Pill>
            {Object.entries(a.deliveries || {}).map(([k, v]) => <Delivery key={k} k={k} v={v} />)}
          </div>
        </div>
      ) : <div className="text-sm text-zinc-500">Not routed yet — no rule has matched this profile.</div>}
      {isOwner && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
          <select defaultValue="" onChange={(e) => e.target.value && act('assign', e.target.value)} disabled={!!busy || !aes.length} className="flex-1 h-8 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 px-2" data-testid="drawer-assign-select">
            <option value="">{aes.length ? 'Assign to AE…' : 'Add AEs in Speed-to-Lead'}</option>
            {aes.map((ae) => <option key={ae.ae_id} value={ae.ae_id}>{ae.name}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => act('reroute')} disabled={!!busy} className="h-8 text-xs text-zinc-300 hover:bg-white/5" data-testid="drawer-reroute-btn">{busy === 'reroute' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />} Re-route</Button>
        </div>
      )}
    </Card>
  );
};

const Timeline = ({ events }) => (
  <div className="relative pl-5" data-testid="drawer-timeline">
    <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
    {events.map((e) => {
      const Icon = eventIcon(e.type);
      return (
        <div key={e.event_id} className="relative pb-4" data-testid={`timeline-event-${e.event_id}`}>
          <div className={`absolute -left-5 top-0.5 w-[15px] h-[15px] rounded-full border flex items-center justify-center ${CAT_STYLE[e.cat] || 'bg-white/5 border-white/10'}`}><Icon className="w-2.5 h-2.5" /></div>
          <div className="text-[13px] text-white">{e.label} <span className="text-zinc-500 text-[11px]">· {SOURCE_LABEL[e.source] || e.source}</span></div>
          <div className="text-[11px] text-zinc-500 truncate">{new Date(e.ts).toLocaleString()} {e.email ? `· ${e.email}` : ''} {e.url ? `· ${e.url.replace(/^https?:\/\/[^/]+/, '')}` : ''}</div>
        </div>
      );
    })}
  </div>
);

export const ProfileDrawer = ({ leadId, onClose, isOwner, destinations, onChanged, onBriefing }) => {
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [aes, setAes] = useState([]);

  const load = useCallback(async () => {
    if (!leadId) return;
    try {
      const [prof, list] = await Promise.all([api(`/intent/profiles/${leadId}`), api('/intent/aes')]);
      setP(prof); setAes(list.filter((a) => a.active));
    } catch (e) { toast.error(e.message); }
  }, [leadId]);
  useEffect(() => { setP(null); load(); }, [load]);

  const setStatus = async (st) => {
    try { await api(`/intent/profiles/${leadId}`, { method: 'PATCH', body: JSON.stringify({ status: st }) }); toast.success(`Marked ${st}`); load(); onChanged(); }
    catch (e) { toast.error(e.message); }
  };
  const reload = () => { load(); onChanged(); };

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="bg-[#07080c] border-l border-white/10 text-white w-full sm:max-w-xl overflow-y-auto" data-testid="profile-drawer">
        {!p ? <div className="flex justify-center py-20"><SheetTitle className="sr-only">Loading profile</SheetTitle><SheetDescription className="sr-only">Loading</SheetDescription><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div> : (
          <div className="space-y-4">
            <SheetHeader className="text-left">
              <div className="flex items-center gap-4">
                <ScoreRing score={p.intent_score} size={56} testid="drawer-score" />
                <div className="min-w-0">
                  <SheetTitle className="text-white text-xl" style={{ fontFamily: 'Outfit' }} data-testid="drawer-account">{p.account}</SheetTitle>
                  <SheetDescription className="text-zinc-500 text-xs">{[p.domain, p.region, `${p.event_count} signals`, `first seen ${timeAgo(p.first_seen_at)}`].filter(Boolean).join(' · ')}</SheetDescription>
                  <div className="flex gap-1.5 mt-1.5"><Pill className={TIER_STYLE[p.tier]}>{p.tier}</Pill>{p.surge && <Pill className="bg-red-500/15 text-red-300 border-red-500/30"><Flame className="w-3 h-3" /> surging</Pill>}</div>
                </div>
              </div>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-3 text-center">
              {[['Digital intent', `${p.digital_score}/70`], ['CRM + product', `${p.crm_score}/40`], ['Open pipeline', money(p.value)]].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] py-3"><div className="text-[10px] uppercase tracking-wider text-zinc-500">{k}</div><div className="text-base font-bold text-white mt-0.5">{v}</div></div>
              ))}
            </div>
            {p.contacts?.length > 0 && <div className="text-xs text-zinc-400" data-testid="drawer-contacts">Contacts: <span className="text-zinc-200">{p.contacts.join(', ')}</span></div>}

            <Assignment p={p} aes={aes} isOwner={isOwner} destinations={destinations} reload={reload} />

            <Card icon={BrainCircuit} title="Agent briefing" testid="drawer-briefing">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-300 line-clamp-2">{p.agent_briefing?.headline || 'Generate an AI briefing of this buyer\'s exact intent sequence plus a call script.'}</p>
                <Button size="sm" onClick={() => onBriefing(p.lead_id)} className="bg-[#0052ff] hover:bg-[#0047d6] h-8 text-xs flex-shrink-0" data-testid="drawer-open-briefing-btn">{p.agent_briefing ? 'Open briefing' : 'Generate'}</Button>
              </div>
            </Card>

            <Card icon={Crown} title="Red-carpet offer" testid="drawer-offer" right={p.offer && <PushMenu leadId={p.lead_id} kind="offer" destinations={destinations} disabled={!isOwner} testid="drawer-push-offer" />}>
              {p.offer ? (
                <div className="text-sm"><div className="text-white font-medium">{p.offer.headline}</div><div className="text-xs text-zinc-400 mt-1">{p.offer.discount_pct}% pre-approved · {p.offer.contract_terms || 'standard terms'}{p.offer.promo_code ? ` · code ${p.offer.promo_code}` : ''}</div></div>
              ) : <div className="text-sm text-zinc-500">No storefront rule matches this account yet.</div>}
            </Card>

            <div className="flex flex-wrap gap-2">
              {isOwner && ['contacted', 'won', 'lost', 'dismissed'].map((st) => (
                <Button key={st} size="sm" variant="outline" onClick={() => setStatus(st)} disabled={p.status === st} className="border-zinc-700 text-zinc-300 hover:bg-white/5 h-8 text-xs capitalize" data-testid={`drawer-status-${st}`}>{st === 'dismissed' ? 'Dismiss' : `Mark ${st}`}</Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => navigate(`/workspace/account/${p.lead_id}`)} className="border-[#0052ff]/40 text-[#7aa7ff] hover:bg-[#0052ff]/10 h-8 text-xs ml-auto" data-testid="drawer-manage-btn"><ArrowUpRight className="w-3.5 h-3.5 mr-1" /> Manage</Button>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3">Unified intent timeline</div>
              {p.events?.length ? <Timeline events={p.events} /> : <div className="text-sm text-zinc-500">No digital signals yet — this profile is CRM-derived.</div>}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
