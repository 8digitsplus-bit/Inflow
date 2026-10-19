export const API_URL = process.env.REACT_APP_BACKEND_URL;

export const intervalLabel = (n) => (n === 1 ? 'Every hour' : `Every ${n} hours`);

export const gridPreview = (n) => {
  if (n === 1) return 'Runs at the top of every hour';
  const times = Array.from({ length: 24 / n }, (_, i) => `${String(i * n).padStart(2, '0')}:00`);
  return `Runs at ${times.slice(0, 4).join(', ')}${times.length > 4 ? ' …' : ''}`;
};

export const browserTimezone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

// Browsers omit 'UTC' and some canonical names (e.g. Asia/Kolkata), so always include the current value.
export const timezones = (current) => {
  let list = [];
  try { list = Intl.supportedValuesOf('timeZone'); } catch { /* old browser */ }
  return Array.from(new Set(['UTC', current, ...list].filter(Boolean)));
};

export const formatWhen = (iso, timeZone) => {
  if (!iso) return '—';
  const opts = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return new Date(iso).toLocaleString(undefined, timeZone ? { ...opts, timeZone, timeZoneName: 'short' } : opts);
  } catch { return new Date(iso).toLocaleString(undefined, opts); }
};

export const relative = (iso) => {
  if (!iso) return '';
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  const abs = Math.abs(mins);
  if (abs < 1) return 'just now';
  const txt = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return mins > 0 ? `in ${txt}` : `${txt} ago`;
};

export const STATUS_STYLE = {
  ok: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  partial: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
  failed: 'text-red-300 bg-red-500/10 border-red-500/25',
  interrupted: 'text-red-300 bg-red-500/10 border-red-500/25',
  running: 'text-[#7aa6ff] bg-[#0052ff]/10 border-[#0052ff]/30',
  nothing: 'text-zinc-400 bg-white/5 border-white/10',
};

export const STATUS_LABEL = {
  ok: 'Synced', partial: 'Partly synced', failed: 'Failed', interrupted: 'Interrupted', running: 'Syncing…', nothing: 'Nothing to sync',
};

export const PLAN_HINT = {
  daily: 'Upgrade to Pro to sync as often as every hour, or Enterprise for real-time syncing.',
  hourly: 'Upgrade to Enterprise for real-time syncing every 15 minutes.',
  off: 'Automatic sync needs an active plan.',
};
