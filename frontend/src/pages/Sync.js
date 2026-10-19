import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '../components/DashboardLayout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { SyncScheduleCard } from '../components/sync/SyncScheduleCard';
import { SyncConnections, SyncHistory, StatusPill } from '../components/sync/SyncActivity';
import { API_URL, formatWhen } from '../components/sync/syncUtils';

export default function Sync() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/sync/settings`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch { setError(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const running = data?.schedule?.last_status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  const runNow = async () => {
    setStarting(true);
    try {
      const res = await fetch(`${API_URL}/api/sync/run-now`, { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Could not start sync');
      toast.success('Sync started');
      await load();
    } catch (e) { toast.error(e.message); } finally { setStarting(false); }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl" data-testid="sync-page">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-zinc-400">Data</div>
            <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl" style={{ fontFamily: 'Outfit' }}>Sync</h1>
            <p className="mt-2 text-sm text-zinc-400">Choose when InFlow refreshes your connected data, or sync everything now.</p>
          </div>
          {data && (
            <div className="flex items-center gap-3">
              <Badge className="rounded-full border border-[#0052ff]/30 bg-[#0052ff]/10 px-3 py-1.5 text-xs text-[#9cc0ff]" data-testid="sync-mode-badge">{data.mode_label}</Badge>
              {data.can_edit && (
                <Button onClick={runNow} disabled={starting || running} className="bg-[#0052ff] hover:bg-[#1a63ff] text-white" data-testid="sync-run-now-btn">
                  {starting || running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  {running ? 'Syncing…' : 'Sync now'}
                </Button>
              )}
            </div>
          )}
        </div>

        {!data && error ? (
          <div className="flex flex-col items-center gap-3 py-20 text-sm text-zinc-400" data-testid="sync-load-error">
            Couldn't load your sync settings.
            <Button size="sm" variant="outline" onClick={load} className="border-white/10 text-zinc-200" data-testid="sync-retry-btn">Try again</Button>
          </div>
        ) : !data ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#7aa6ff]" /></div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-6">
              <SyncScheduleCard key={`${data.schedule.mode}-${data.schedule.timezone}-${data.schedule.time}-${data.schedule.weekday}-${data.schedule.enabled}`} data={data} onSaved={load} />
              <SyncHistory runs={data.runs} />
            </div>
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur" data-testid="sync-last-run-card">
                <h2 className="text-sm font-semibold text-white">Last sync</h2>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-sm text-zinc-300" data-testid="sync-last-run-at">{formatWhen(data.schedule.last_run_at)}</span>
                  {data.schedule.last_status && <StatusPill status={data.schedule.last_status} testId="sync-last-status" />}
                </div>
              </div>
              <SyncConnections connections={data.connections} />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
