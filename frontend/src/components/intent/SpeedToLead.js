import { useState, useEffect, useCallback } from 'react';
import { Timer, Zap, ShieldCheck, ListChecks, Users, Plus, Pencil, Trash2, Loader2, MessageSquare, History, Mail, Database, Check, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { api, money, timeAgo, fmtMs, Kpi, Section, Pill, DEST_LABEL } from './shared';
import { RuleDialog, AeDialog } from './RoutingDialogs';

const TRIGGER_LABEL = { quote_request: 'quote', demo_request: 'demo', pricing_view: 'pricing', trial_signup: 'trial', webinar_attended: 'webinar', whitepaper_download: 'whitepaper', docs_view: 'docs', case_study_view: 'case study' };

const RuleCard = ({ r, aes, isOwner, onEdit, onToggle, onDelete }) => {
  const pool = r.ae_ids?.length ? aes.filter((a) => r.ae_ids.includes(a.ae_id)).map((a) => a.name).join(', ') : 'Whole roster';
  const alerts = [r.actions?.email && 'email', r.actions?.slack && 'Slack', r.actions?.crm && DEST_LABEL[r.actions.crm], r.actions?.briefing && 'AI briefing'].filter(Boolean);
  return (
    <div className={`px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 ${r.enabled ? '' : 'opacity-50'}`} data-testid={`rule-card-${r.rule_id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><span className="text-white font-medium">{r.name}</span><Pill className="bg-white/5 text-zinc-400 border-white/10">P{r.priority}</Pill></div>
        <div className="text-xs text-zinc-400 mt-1">IF {r.event_types?.length ? r.event_types.map((e) => TRIGGER_LABEL[e] || e).join(' / ') : 'any signal'} within {r.window_hours}h · score ≥ {r.min_score}{r.min_value ? ` · value ≥ ${money(r.min_value)}` : ''}</div>
        <div className="text-xs text-zinc-500 mt-0.5">THEN round-robin → {pool} · alert via {alerts.join(', ') || 'nothing'}</div>
      </div>
      {isOwner && (
        <div className="flex items-center gap-2">
          <Switch checked={r.enabled} onCheckedChange={() => onToggle(r)} data-testid={`rule-toggle-${r.rule_id}`} />
          <button onClick={() => onEdit(r)} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5" data-testid={`rule-edit-${r.rule_id}`}><Pencil className="w-4 h-4" /></button>
          <button onClick={() => onDelete(r)} className="p-1.5 rounded-md text-zinc-500 hover:text-red-300 hover:bg-red-500/10" data-testid={`rule-delete-${r.rule_id}`}><Trash2 className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};

const DeliveryIcons = ({ d = {} }) => (
  <div className="flex gap-1">
    {Object.entries(d).map(([k, v]) => {
      const Icon = k === 'email' ? Mail : k === 'slack' ? MessageSquare : Database;
      return <span key={k} title={v.error || `${k} delivered`} className={`w-6 h-6 rounded-md flex items-center justify-center border ${v.ok ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : 'border-red-500/30 text-red-300 bg-red-500/10'}`}><Icon className="w-3 h-3" /></span>;
    })}
  </div>
);

const SlackCard = ({ isOwner }) => {
  const [cfg, setCfg] = useState(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { api('/intent/slack-config').then((c) => { setCfg(c); setLabel(c.channel_label || ''); }).catch(() => {}); }, []);
  const save = async () => {
    setBusy('save');
    try { setCfg(await api('/intent/slack-config', { method: 'PUT', body: JSON.stringify({ webhook_url: url, channel_label: label }) })); setUrl(''); toast.success('Slack connected'); }
    catch (e) { toast.error(e.message); }
    setBusy('');
  };
  const test = async () => {
    setBusy('test');
    try { await api('/intent/slack-test', { method: 'POST' }); toast.success('Test alert sent to Slack'); } catch (e) { toast.error(e.message); }
    setBusy('');
  };
  return (
    <Section icon={MessageSquare} title="Slack alert channel" testid="slack-card" right={cfg?.configured && <Pill className="bg-emerald-500/10 text-emerald-300 border-emerald-500/25" data-testid="slack-connected-pill"><Check className="w-3 h-3" /> connected{cfg.channel_label ? ` · ${cfg.channel_label}` : ''}</Pill>}>
      <div className="p-5 space-y-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={!isOwner} placeholder={cfg?.configured ? 'Replace webhook (https://hooks.slack.com/…)' : 'https://hooks.slack.com/services/…'} className="bg-zinc-900 border-zinc-700 text-white h-9 text-xs" data-testid="slack-webhook-input" />
        <div className="flex gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} disabled={!isOwner} placeholder="#hot-leads" className="bg-zinc-900 border-zinc-700 text-white h-9 text-xs" data-testid="slack-channel-input" />
          <Button size="sm" onClick={save} disabled={!isOwner || !url || !!busy} className="bg-[#0052ff] hover:bg-[#0047d6] h-9 text-xs" data-testid="slack-save-btn">{busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Connect'}</Button>
          <Button size="sm" variant="outline" onClick={test} disabled={!isOwner || !cfg?.configured || !!busy} className="border-zinc-700 text-zinc-300 hover:bg-white/5 h-9 text-xs" data-testid="slack-test-btn">Test</Button>
        </div>
      </div>
    </Section>
  );
};

export const SpeedToLead = ({ isOwner, destinations, tick }) => {
  const [rules, setRules] = useState([]);
  const [aes, setAes] = useState([]);
  const [log, setLog] = useState({ logs: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [ruleDlg, setRuleDlg] = useState({ open: false, rule: null });
  const [aeDlg, setAeDlg] = useState({ open: false, ae: null });

  const load = useCallback(async () => {
    try {
      const [r, a, l] = await Promise.all([api('/intent/routing-rules'), api('/intent/aes'), api('/intent/routing-log')]);
      setRules(r); setAes(a); setLog(l);
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) load(); }, 8000); return () => clearInterval(id); }, [load]);

  const toggleRule = async (r) => {
    try { await api(`/intent/routing-rules/${r.rule_id}`, { method: 'PUT', body: JSON.stringify({ ...r, enabled: !r.enabled }) }); load(); }
    catch (e) { toast.error(e.message); }
  };
  const del = async (path, what) => {
    if (!window.confirm(`Delete this ${what}?`)) return;
    try { await api(path, { method: 'DELETE' }); toast.success(`${what[0].toUpperCase() + what.slice(1)} deleted`); load(); } catch (e) { toast.error(e.message); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;
  const s = log.stats || {};

  return (
    <div className="space-y-6" data-testid="speed-to-lead-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Timer} label="Median speed-to-lead" value={fmtMs(s.median_latency_ms)} sub="trigger → AE assigned" testid="kpi-median-latency" />
        <Kpi icon={Zap} label="Routed · 24h" value={s.routed_24h ?? 0} sub={`${s.total ?? 0} all-time`} testid="kpi-routed-24h" />
        <Kpi icon={ShieldCheck} label="Alerted within 5 min" value={s.sla_pct == null ? '—' : `${s.sla_pct}%`} sub="SLA hit rate" testid="kpi-sla" />
        <Kpi icon={ListChecks} label="Active rules" value={s.active_rules ?? 0} sub={`${aes.filter((a) => a.active).length} AEs on roster`} testid="kpi-active-rules" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Section icon={Zap} title="Routing rules" testid="rules-section" right={isOwner && <Button size="sm" onClick={() => setRuleDlg({ open: true, rule: null })} className="bg-[#0052ff] hover:bg-[#0047d6] h-8 text-xs" data-testid="new-rule-btn"><Plus className="w-3.5 h-3.5 mr-1" /> New rule</Button>}>
            {rules.length === 0 ? <div className="px-5 py-10 text-center text-zinc-500 text-sm" data-testid="no-rules">No rules yet — create one to start routing hot prospects in seconds.</div> : (
              <div className="divide-y divide-white/[0.05]">{rules.map((r) => <RuleCard key={r.rule_id} r={r} aes={aes} isOwner={isOwner} onEdit={(x) => setRuleDlg({ open: true, rule: x })} onToggle={toggleRule} onDelete={(x) => del(`/intent/routing-rules/${x.rule_id}`, 'rule')} />)}</div>
            )}
          </Section>

          <Section icon={History} title="Routing log" testid="routing-log-section">
            {log.logs.length === 0 ? <div className="px-5 py-10 text-center text-zinc-500 text-sm" data-testid="routing-log-empty">Assignments appear here the instant a rule fires.</div> : (
              <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="routing-log-table">
                <thead><tr className="text-[11px] uppercase tracking-wider text-zinc-500 text-left"><th className="px-5 py-2.5 font-medium">Account</th><th className="px-3 py-2.5 font-medium">AE</th><th className="px-3 py-2.5 font-medium">Trigger</th><th className="px-3 py-2.5 font-medium">Speed</th><th className="px-3 py-2.5 font-medium">Alerts</th><th className="px-5 py-2.5 font-medium text-right">When</th></tr></thead>
                <tbody className="divide-y divide-white/[0.04]">{log.logs.map((l) => (
                  <tr key={l.log_id} data-testid={`routing-log-row-${l.log_id}`}>
                    <td className="px-5 py-3"><div className="text-white">{l.account}</div><div className="text-[11px] text-zinc-500">{l.intent_score}/100 · {money(l.value)}</div></td>
                    <td className="px-3 py-3 text-zinc-300">{l.ae_name}{l.manual && <span className="text-[10px] text-zinc-500 ml-1">(manual)</span>}</td>
                    <td className="px-3 py-3 text-zinc-400 text-xs">{l.trigger?.label}</td>
                    <td className="px-3 py-3"><span className="text-[#7aa7ff] font-semibold">{fmtMs(l.latency_ms)}</span></td>
                    <td className="px-3 py-3"><DeliveryIcons d={l.deliveries} /></td>
                    <td className="px-5 py-3 text-right text-xs text-zinc-500">{timeAgo(l.created_at)}</td>
                  </tr>))}</tbody>
              </table></div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section icon={Users} title="AE roster" testid="ae-roster-section" right={isOwner && <Button size="sm" variant="outline" onClick={() => setAeDlg({ open: true, ae: null })} className="border-zinc-700 text-zinc-300 hover:bg-white/5 h-8 text-xs" data-testid="add-ae-btn"><Plus className="w-3.5 h-3.5 mr-1" /> Add AE</Button>}>
            {aes.length === 0 ? <div className="px-5 py-10 text-center text-zinc-500 text-sm" data-testid="no-aes">Add the account executives who should catch hot leads.</div> : (
              <div className="divide-y divide-white/[0.05]">{aes.map((a) => (
                <div key={a.ae_id} className={`px-5 py-3 flex items-center gap-3 ${a.active ? '' : 'opacity-50'}`} data-testid={`ae-row-${a.ae_id}`}>
                  <div className="w-8 h-8 rounded-full bg-[#0052ff]/20 text-[#9dbcff] flex items-center justify-center text-xs font-bold flex-shrink-0">{a.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{a.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">{(a.territories || []).join('/') || 'any territory'} · {a.min_deal || a.max_deal ? `${a.min_deal ? money(a.min_deal) : '$0'}–${a.max_deal ? money(a.max_deal) : '∞'}` : 'any size'} · {a.assigned_count || 0} routed</div>
                  </div>
                  {isOwner && <>
                    <button onClick={() => setAeDlg({ open: true, ae: a })} className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5" data-testid={`ae-edit-${a.ae_id}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(`/intent/aes/${a.ae_id}`, 'AE')} className="p-1.5 rounded-md text-zinc-500 hover:text-red-300 hover:bg-red-500/10" data-testid={`ae-delete-${a.ae_id}`}><X className="w-3.5 h-3.5" /></button>
                  </>}
                </div>))}</div>
            )}
          </Section>
          <SlackCard isOwner={isOwner} />
        </div>
      </div>

      <RuleDialog open={ruleDlg.open} rule={ruleDlg.rule} aes={aes} destinations={destinations} onOpenChange={(o) => setRuleDlg((d) => ({ ...d, open: o }))} onSaved={() => setTimeout(load, 800)} />
      <AeDialog open={aeDlg.open} ae={aeDlg.ae} onOpenChange={(o) => setAeDlg((d) => ({ ...d, open: o }))} onSaved={load} />
    </div>
  );
};
