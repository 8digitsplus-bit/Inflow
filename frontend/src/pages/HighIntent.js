import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { Telescope, Loader2, Radar, Zap, BrainCircuit, Crown, Code2, FlaskConical } from 'lucide-react';
import { Button } from '../components/ui/button';
import { api } from '../components/intent/shared';
import { IntentProfiles } from '../components/intent/IntentProfiles';
import { SpeedToLead } from '../components/intent/SpeedToLead';
import { AgentBriefings } from '../components/intent/AgentBriefings';
import { Storefronts } from '../components/intent/Storefronts';
import { TrackingDialog } from '../components/intent/TrackingDialog';
import { SimulateDialog } from '../components/intent/SimulateDialog';

const TABS = [
  { key: 'profiles', label: 'Intent Profiles', icon: Radar },
  { key: 'routing', label: 'Speed-to-Lead', icon: Zap },
  { key: 'briefings', label: 'Agent Briefings', icon: BrainCircuit },
  { key: 'storefronts', label: 'Red-Carpet Storefronts', icon: Crown },
];

export default function HighIntent() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'profiles';
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [simulate, setSimulate] = useState(false);
  const [tick, setTick] = useState(0);

  const loadStatus = useCallback(async () => {
    try { setStatus(await api('/intent/status')); } catch (e) { /* gate */ }
    setLoading(false);
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const go = (key, extra = {}) => setParams({ tab: key, ...extra });
  const refresh = () => setTick((t) => t + 1);

  if (loading) return <DashboardLayout><div className="flex items-center justify-center min-h-[70vh]" data-testid="intent-loading"><Loader2 className="w-6 h-6 text-slate-400 animate-spin" /></div></DashboardLayout>;
  if (!status?.is_paid) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center" data-testid="intent-paid-gate">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center mb-5"><Telescope className="w-7 h-7 text-slate-400" /></div>
          <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Outfit' }}>High-Intent Buyers</h2>
          <p className="text-zinc-400 text-sm max-w-md">Unify buying signals, route hot prospects in seconds and roll out the red carpet. Available on any active InFlow subscription.</p>
        </div>
      </DashboardLayout>
    );
  }

  const shared = { status, isOwner: status.is_owner, destinations: status.destinations, tick, refresh, go };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto" data-testid="high-intent-page">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-7">
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2"><Telescope className="w-4 h-4" /> Revenue Execution · High-Intent</div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight" style={{ fontFamily: 'Outfit' }}>High-Intent Buyers</h1>
            <p className="text-zinc-400 text-sm mt-2 max-w-2xl">Every pricing visit, download, docs view and webinar unified into one live profile per account — routed to an AE in seconds, briefed by AI, and greeted with a red-carpet offer. <span className="text-white">Pushed straight to your CRM.</span></p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${status.tracking_live ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : 'border-white/10 text-zinc-400'}`} data-testid="tracking-status-pill">
              <span className={`w-1.5 h-1.5 rounded-full ${status.tracking_live ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} /> {status.tracking_live ? 'Signals live' : 'Awaiting signals'}
            </span>
            {status.is_owner && <Button variant="outline" onClick={() => setSimulate(true)} className="border-white/15 text-zinc-200 hover:bg-white/5 h-9 text-sm" data-testid="open-simulate-btn"><FlaskConical className="w-4 h-4 mr-1.5" /> Test signal</Button>}
            <Button onClick={() => setTracking(true)} className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-9 text-sm" data-testid="open-tracking-btn"><Code2 className="w-4 h-4 mr-1.5" /> Install tracking</Button>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/10 w-full overflow-x-auto mb-7" role="tablist" data-testid="intent-tabs">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => go(key)}
              className={`flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${tab === key ? 'bg-[#0052ff] text-white shadow-[0_8px_24px_-8px_rgba(0,82,255,0.7)]' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
              data-testid={`intent-tab-${key}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'profiles' && <IntentProfiles {...shared} />}
        {tab === 'routing' && <SpeedToLead {...shared} />}
        {tab === 'briefings' && <AgentBriefings {...shared} initialLeadId={params.get('lead')} />}
        {tab === 'storefronts' && <Storefronts {...shared} />}
      </div>

      <TrackingDialog open={tracking} onOpenChange={setTracking} isOwner={status.is_owner} />
      <SimulateDialog open={simulate} onOpenChange={setSimulate} onDone={() => { refresh(); loadStatus(); }} />
    </DashboardLayout>
  );
}
