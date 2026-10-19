import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { API_URL, formatWhen } from './syncUtils';

// Compact "Data sync" summary for the Settings page.
export const SyncSettingsCard = ({ className }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/sync/settings`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);

  const s = data?.schedule;
  return (
    <div className={className} data-testid="settings-sync-card">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2"><RefreshCw className="w-4 h-4 text-[#7aa6ff]" /> Data sync</h2>
      <p className="mb-4 mt-0.5 text-xs text-zinc-500">How often InFlow refreshes your connected integrations.</p>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-zinc-200" data-testid="settings-sync-mode">{data ? data.mode_label : '…'}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{s?.enabled && s?.next_run_at ? `Next: ${formatWhen(s.next_run_at)}` : 'Automatic sync is off'}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate('/sync')}
          className="border-white/10 text-zinc-200 hover:bg-[#0052ff]/10 hover:text-white" data-testid="settings-manage-sync-btn">
          Manage sync
        </Button>
      </div>
    </div>
  );
};
