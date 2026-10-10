import { useState, useEffect, useCallback, useRef } from 'react';
import { BrainCircuit, Loader2, Sparkles, Copy, MessageCircleQuestion, Target, ShieldAlert, PhoneCall, Gift, Footprints } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { api, glass, money, eventIcon, Pill, ScoreRing, TIER_STYLE, copyText } from './shared';
import { PushMenu } from './PushMenu';

const STAGE_STYLE = {
  ready_to_buy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  evaluating: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  researching: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
};

const Block = ({ icon: Icon, title, children, testid }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid={testid}>
    <div className="flex items-center gap-2 mb-2.5 text-[11px] uppercase tracking-wider font-semibold text-slate-400"><Icon className="w-3.5 h-3.5 text-[#4d8bff]" /> {title}</div>
    {children}
  </div>
);

const Sequence = ({ steps }) => (
  <ol className="relative pl-6 space-y-3" data-testid="briefing-sequence">
    <div className="absolute left-[11px] top-1 bottom-1 w-px bg-gradient-to-b from-[#0052ff]/60 to-white/5" />
    {steps.map((s, i) => {
      const Icon = eventIcon(s.type);
      return (
        <li key={i} className="relative" data-testid={`sequence-step-${i}`}>
          <span className="absolute -left-6 top-0 w-[22px] h-[22px] rounded-full bg-[#07080c] border border-[#0052ff]/40 flex items-center justify-center"><Icon className="w-3 h-3 text-[#7aa7ff]" /></span>
          <div className="text-[13px] text-white">{s.label}{s.count > 1 ? <span className="text-zinc-500"> ×{s.count}</span> : ''}</div>
          <div className="text-[11px] text-zinc-500 truncate">{new Date(s.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}{s.detail ? ` · ${s.detail}` : ''}{s.who ? ` · ${s.who}` : ''}</div>
        </li>
      );
    })}
  </ol>
);

const scriptText = (b) => {
  const s = b.script;
  return [`OPENER\n${s.opener}`, `DISCOVERY\n${s.discovery_questions.map((q) => `- ${q}`).join('\n')}`,
    `VALUE POINTS\n${s.value_points.map((v) => `- ${v}`).join('\n')}`,
    `OBJECTIONS\n${s.objection_handling.map((o) => `- ${o.objection}: ${o.response}`).join('\n')}`, `CLOSE\n${s.close}`].join('\n\n');
};

const BriefingView = ({ p, isOwner, destinations, generating, onGenerate }) => {
  const b = p.briefing;
  if (generating) return <div className="flex flex-col items-center justify-center py-24 text-zinc-400 text-sm gap-3" data-testid="briefing-generating"><Loader2 className="w-6 h-6 animate-spin text-[#4d8bff]" /> Reading {p.account}'s exact intent sequence and writing the call script…</div>;
  if (!b) return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-6" data-testid="briefing-empty">
      <BrainCircuit className="w-10 h-10 text-zinc-600 mb-3" />
      <div className="text-white font-medium mb-1">No briefing for {p.account} yet</div>
      <p className="text-zinc-500 text-sm max-w-sm mb-4">AI turns every signal this buyer left into a play-by-play summary plus a personalized outreach script — ready before the rep dials.</p>
      <Button onClick={onGenerate} className="bg-[#0052ff] hover:bg-[#0047d6]" data-testid="briefing-generate-btn"><Sparkles className="w-4 h-4 mr-1.5" /> Generate briefing</Button>
    </div>
  );
  return (
    <div className="p-5 space-y-4" data-testid="briefing-view">
      <div className="flex flex-col md:flex-row md:items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5"><Pill className={STAGE_STYLE[b.buying_stage]} data-testid="briefing-stage">{b.buying_stage.replace(/_/g, ' ')}</Pill>{!b.ai_used && <Pill className="bg-white/5 text-zinc-400 border-white/10">template</Pill>}</div>
          <h3 className="text-lg font-semibold text-white leading-snug" style={{ fontFamily: 'Outfit' }} data-testid="briefing-headline">{b.headline}</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" variant="ghost" onClick={() => copyText(scriptText(b), toast)} className="h-8 text-xs text-zinc-300 hover:bg-white/5" data-testid="briefing-copy-btn"><Copy className="w-3.5 h-3.5 mr-1" /> Copy script</Button>
          <Button size="sm" variant="ghost" onClick={onGenerate} className="h-8 text-xs text-zinc-300 hover:bg-white/5" data-testid="briefing-regenerate-btn"><Sparkles className="w-3.5 h-3.5 mr-1" /> Regenerate</Button>
          <PushMenu leadId={p.lead_id} kind="briefing" destinations={destinations} disabled={!isOwner} testid="briefing-push-btn" />
        </div>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed" data-testid="briefing-summary">{b.summary}</p>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2"><Block icon={Footprints} title="Exact intent sequence" testid="briefing-sequence-block">{b.sequence?.length ? <Sequence steps={b.sequence} /> : <div className="text-sm text-zinc-500">CRM-only profile — no digital trail yet.</div>}</Block></div>
        <div className="lg:col-span-3 space-y-3">
          <Block icon={PhoneCall} title="Opener" testid="briefing-opener"><p className="text-sm text-white leading-relaxed">{b.script.opener}</p></Block>
          <Block icon={MessageCircleQuestion} title="Discovery questions" testid="briefing-discovery"><ul className="space-y-1.5">{b.script.discovery_questions.map((q, i) => <li key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-[#4d8bff]">{i + 1}.</span>{q}</li>)}</ul></Block>
          <Block icon={Target} title="Value points" testid="briefing-value"><ul className="space-y-1.5">{b.script.value_points.map((v, i) => <li key={i} className="text-sm text-zinc-300">• {v}</li>)}</ul></Block>
          <Block icon={ShieldAlert} title="Objection handling" testid="briefing-objections"><div className="space-y-2">{b.script.objection_handling.map((o, i) => <div key={i}><div className="text-sm text-white">“{o.objection}”</div><div className="text-sm text-zinc-400">{o.response}</div></div>)}</div></Block>
          <Block icon={Gift} title="Close + offer" testid="briefing-close"><p className="text-sm text-white">{b.script.close}</p><p className="text-xs text-zinc-400 mt-1.5">{b.recommended_offer}</p></Block>
        </div>
      </div>
    </div>
  );
};

export const AgentBriefings = ({ isOwner, destinations, tick, initialLeadId }) => {
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(initialLeadId || '');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState('');
  const autoTried = useRef('');

  const load = useCallback(async () => {
    try {
      const list = await api('/intent/briefings');
      setItems(list);
      setSel((s) => s || list[0]?.lead_id || '');
    } catch (e) { toast.error(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, tick]);
  useEffect(() => { if (initialLeadId) setSel(initialLeadId); }, [initialLeadId]);

  const current = items.find((i) => i.lead_id === sel);
  const generate = useCallback(async (id) => {
    setGenerating(id);
    try {
      const b = await api(`/intent/profiles/${id}/briefing`, { method: 'POST' });
      setItems((xs) => xs.map((x) => (x.lead_id === id ? { ...x, briefing: b, briefing_ready: true, briefing_headline: b.headline } : x)));
      toast.success('Agent briefing ready');
    } catch (e) { toast.error(e.message); }
    setGenerating('');
  }, []);

  useEffect(() => {
    if (initialLeadId && current?.lead_id === initialLeadId && !current.briefing && autoTried.current !== initialLeadId) {
      autoTried.current = initialLeadId;
      generate(initialLeadId);
    }
  }, [initialLeadId, current, generate]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div>;
  if (!items.length) return <div className={`rounded-2xl ${glass} px-5 py-16 text-center text-zinc-500 text-sm`} data-testid="briefings-empty">No profiles yet — signals create them automatically.</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6" data-testid="agent-briefings-tab">
      <div className={`rounded-2xl ${glass} overflow-hidden h-fit`}>
        <div className="px-4 py-3 border-b border-white/[0.06] text-[11px] uppercase tracking-wider font-semibold text-slate-400">Buyers to brief</div>
        <div className="divide-y divide-white/[0.04] max-h-[720px] overflow-y-auto" data-testid="briefings-list">
          {items.map((i) => (
            <button key={i.lead_id} onClick={() => setSel(i.lead_id)} className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${sel === i.lead_id ? 'bg-[#0052ff]/10 border-l-2 border-[#0052ff]' : 'hover:bg-white/[0.03] border-l-2 border-transparent'}`} data-testid={`briefing-item-${i.lead_id}`}>
              <ScoreRing score={i.intent_score} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><span className="text-sm text-white truncate">{i.account}</span><Pill className={TIER_STYLE[i.tier]}>{i.tier}</Pill></div>
                <div className="text-[11px] text-zinc-500 truncate">{i.briefing_ready ? i.briefing_headline : `${money(i.value)} · no briefing yet`}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className={`rounded-2xl ${glass} min-h-[480px]`}>
        {current && <BriefingView p={current} isOwner={isOwner} destinations={destinations} generating={generating === current.lead_id} onGenerate={() => generate(current.lead_id)} />}
      </div>
    </div>
  );
};
