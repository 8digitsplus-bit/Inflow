import { Link } from 'react-router-dom';
import { Plug, History } from 'lucide-react';
import { formatWhen, relative, STATUS_STYLE, STATUS_LABEL } from './syncUtils';

const card = 'rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur';

export const StatusPill = ({ status, testId }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status] || STATUS_STYLE.nothing}`} data-testid={testId}>
    {STATUS_LABEL[status] || status || '—'}
  </span>
);

export const SyncConnections = ({ connections }) => (
  <div className={card} data-testid="sync-connections-card">
    <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Plug className="w-4 h-4 text-[#7aa6ff]" /> Connected integrations</h2>
    <p className="mt-0.5 mb-4 text-xs text-zinc-500">Everything below is refreshed on every sync.</p>
    {connections.length === 0 ? (
      <p className="text-sm text-zinc-400" data-testid="sync-no-connections">
        Nothing connected yet. <Link to="/connect-business" className="text-[#7aa6ff] hover:underline">Connect an integration</Link>
      </p>
    ) : (
      <ul className="divide-y divide-white/5">
        {connections.map((c) => (
          <li key={`${c.platform}-${c.label}`} className="flex items-center justify-between gap-3 py-2.5" data-testid={`sync-connection-${c.platform}`}>
            <span className="text-sm text-zinc-200 truncate">{c.label}</span>
            <span className="text-xs text-zinc-500 whitespace-nowrap">
              {c.last_synced ? `${relative(c.last_synced)} · ${c.records_synced ?? 0} records` : 'Not synced yet'}
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const SyncHistory = ({ runs }) => (
  <div className={card} data-testid="sync-history-card">
    <h2 className="text-sm font-semibold text-white flex items-center gap-2"><History className="w-4 h-4 text-[#7aa6ff]" /> Recent syncs</h2>
    <p className="mt-0.5 mb-4 text-xs text-zinc-500">The last 10 syncs.</p>
    {runs.length === 0 ? <p className="text-sm text-zinc-400" data-testid="sync-no-runs">No syncs yet.</p> : (
      <ul className="space-y-2">
        {runs.map((r) => {
          const failed = (r.results || []).filter((x) => !x.ok);
          return (
            <li key={r.run_id} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5" data-testid={`sync-run-${r.run_id}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-300">
                  {formatWhen(r.started_at)} · <span className="text-zinc-500">{r.trigger === 'manual' ? 'Manual' : 'Scheduled'}</span>
                </span>
                <StatusPill status={r.status} testId={`sync-run-status-${r.run_id}`} />
              </div>
              {failed.length > 0 && (
                <p className="mt-1.5 text-[11px] text-red-300/90">{failed.map((f) => `${f.label}: ${f.error}`).join(' · ')}</p>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </div>
);
