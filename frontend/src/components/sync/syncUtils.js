export const API_URL = process.env.REACT_APP_BACKEND_URL;

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const browserTimezone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

export const timezones = () => {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC']; }
};

export const formatWhen = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export const relative = (iso) => {
  if (!iso) return '';
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  const abs = Math.abs(mins);
  const txt = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} d`;
  return mins >= 0 ? `in ${txt}` : `${txt} ago`;
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
  weekly: 'Upgrade to Pro for a daily sync at a time you choose, or Enterprise for real-time syncing.',
  daily: 'Upgrade to Enterprise for real-time syncing every 15 minutes.',
  off: 'Automatic sync needs an active plan. You can still sync manually.',
};
