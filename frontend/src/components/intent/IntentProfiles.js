import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Activity, DollarSign, Zap, Search, RefreshCw, CloudDownload, Loader2, Radio, ArrowUpRight, Building2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { api, money, timeAgo, eventIcon, Kpi, Section, Pill, ScoreRing, TIER_STYLE, CAT_STYLE, STATUS_STYLE, SOURCE_LABEL } from './shared';
import { ProfileDrawer } from './ProfileDrawer';

const FILTERS = ['all', 'hot', 'warm', 'cool'];

const FeedItem = ({ e }) => {
  const Icon = eventIcon(e.type);
  return (
    <div className="flex items-start gap-3 px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-500" data-testid={`feed-item-${e.event_id}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${CAT_STYLE[e.cat] || 'bg-white/5 border-white/10 text-zinc-300'}`}><Icon className="w-4 h-4" /></div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-white truncate"><span className="font-semibold">{e.account}</span> · {e.label}</div>
        <div className="text-[11px] text-zinc-500 truncate">{e.email || 'anonymous visitor'} · {SOURCE_LABEL[e.source] || e.source}</div>
      </div>
      <span className="text-[10px] text-zinc-500 flex-shrink-0 mt-0.5">{timeAgo(e.received_at)}</span>
    </div>
  );
};

const ProfileRow = ({ p, onOpen, onManage }) => (
  <div className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => onOpen(p.lead_id)} data-testid={`profile-row-${p.lead_id}`}>
    <ScoreRing score={p.intent_score} testid={`profile-score-${p.lead_id}`} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-white font-medium truncate">{p.account}</span>
        <Pill className={TIER_STYLE[p.tier]}>{p.tier}</Pill>
        {p.surge && <Pill className="bg-red-500/15 text-red-300 border-red-500/30" data-testid={`profile-surge-${p.lead_id}`}><Flame className="w-3 h-3" /> surging</Pill>}
        <Pill className={STATUS_STYLE[p.status] || STATUS_STYLE.new}>{p.status}</Pill>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {(p.signals || []).filter((s) => s.weight > 0).slice(0, 4).map((s) => (
          <Pill key={s.key} className={CAT_STYLE[s.cat]}>{s.label} · {s.detail}</Pill>
        ))}
      </div>
    </div>
    <div className="flex items-center gap-5 md:flex-shrink-0">
      <div className="text-right">
        <div className="text-sm font-semibold text-white">{money(p.value)}</div>
        <div className="text-[11px] text-zinc-500">{p.event_count} signals · {timeAgo(p.last_event_at)}</div>
      </div>
      <div className="w-32 text-right">
        {p.assignment ? <div className="text-xs text-[#7aa7ff] truncate" data-testid={`profile-ae-${p.lead_id}`}>{p.assignment.ae_name}</div> : <div className="text-xs text-zinc-500">Unassigned</div>}
        <div className="text-[10px] text-zinc-600">{p.assignment ? `routed ${timeAgo(p.assignment.assigned_at)}` : p.region || '—'}</div>
      </div>
      <button onClick={(ev) => { ev.stopPropagation(); onManage(p.lead_id); }} className="text-zinc-500 hover:text-white p-1.5 rounded-md hover:bg-white/5" title="Open deal room" data-testid={`profile-manage-${p.lead_id}`}><ArrowUpRight className="w-4 h-4" /></button>
    </div>
  </div>
);

export const IntentProfiles = ({ status, isOwner, destinations, tick, refresh, go }) => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([api('/intent/profiles'), api('/intent/feed?limit=30')]);
      setProfiles(p); setFeed(f);
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) load(); }, 6000);
    return () => clearInterval(id);
  }, [load]);

  const open = profiles.filter((p) => !['dismissed', 'lost'].includes(p.status));
  const shown = useMemo(() => open.filter((p) => (filter === 'all' || p.tier === filter) && p.account.toLowerCase().includes(q.toLowerCase())), [open, filter, q]);
  const hot = open.filter((p) => p.tier === 'hot');

  const run = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'rebuild') {
        const r = await api('/intent/rebuild', { method: 'POST' });
        toast.success(`Unified ${r.profiles} profiles from ${r.accounts_analyzed} accounts`);
      } else {
        const r = await api('/intent/sync-analytics', { method: 'POST' });
        r.results.forEach((x) => (x.error ? toast.error(`${x.platform}: ${x.error}`) : toast.success(`${x.platform}: ${x.accepted} signals ingested`)));
      }
      await load();
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;

  return (
    <div className="space-y-6" data-testid="intent-profiles-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Flame} label="Hot accounts" value={hot.length} sub="intent score ≥ 70" testid="kpi-hot" />
        <Kpi icon={Activity} label="High-intent signals · 24h" value={open.reduce((s, p) => s + (p.events_24h || 0), 0)} sub={`${open.length} unified profiles`} testid="kpi-signals" />
        <Kpi icon={DollarSign} label="Hot pipeline" value={money(hot.reduce((s, p) => s + (p.value || 0), 0))} sub="open value on hot accounts" testid="kpi-pipeline" />
        <Kpi icon={Zap} label="Routed to AEs" value={open.filter((p) => p.assignment).length} sub="via speed-to-lead" testid="kpi-routed" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Section icon={Building2} title="Unified account profiles" className="xl:col-span-2" testid="profiles-section"
          right={<>
            {status.analytics_connected.length > 0 && isOwner && <Button size="sm" variant="ghost" onClick={() => run('sync')} disabled={!!busy} className="h-8 text-xs text-zinc-300 hover:bg-white/5" data-testid="sync-analytics-btn">{busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5 mr-1" />} Pull analytics</Button>}
            <Button size="sm" variant="ghost" onClick={() => run('rebuild')} disabled={!!busy} className="h-8 text-xs text-zinc-300 hover:bg-white/5" data-testid="rebuild-profiles-btn">{busy === 'rebuild' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />} Rebuild</Button>
          </>}>
          <div className="px-5 py-3 border-b border-white/[0.06] flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1"><Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accounts" className="pl-9 h-9 bg-zinc-900/60 border-zinc-800 text-white text-sm" data-testid="profiles-search" /></div>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-3 h-9 rounded-lg text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`} data-testid={`profiles-filter-${f}`}>{f}</button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="px-5 py-14 text-center text-zinc-500 text-sm" data-testid="no-profiles">No profiles yet. Install the tracking snippet, send events through the Events API, or click <span className="text-white">Rebuild</span> to unify CRM accounts.</div>
          ) : (
            <div className="divide-y divide-white/[0.05]" data-testid="profiles-list">
              {shown.map((p) => <ProfileRow key={p.lead_id} p={p} onOpen={setOpenId} onManage={(id) => navigate(`/workspace/account/${id}`)} />)}
            </div>
          )}
        </Section>

        <Section icon={Radio} title="Live signal feed" testid="feed-section" right={<span className="flex items-center gap-1.5 text-[10px] text-emerald-300"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> real-time</span>}>
          {feed.length === 0 ? <div className="px-5 py-12 text-center text-zinc-500 text-sm" data-testid="feed-empty">Signals appear here the second they land.</div> : (
            <div className="divide-y divide-white/[0.04] max-h-[640px] overflow-y-auto" data-testid="feed-list">{feed.map((e) => <FeedItem key={e.event_id} e={e} />)}</div>
          )}
        </Section>
      </div>

      <ProfileDrawer leadId={openId} onClose={() => setOpenId(null)} isOwner={isOwner} destinations={destinations}
        onChanged={load} onBriefing={(id) => go('briefings', { lead: id })} />
    </div>
  );
};
