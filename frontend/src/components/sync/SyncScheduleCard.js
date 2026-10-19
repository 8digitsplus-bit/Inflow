import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, CalendarClock, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { API_URL, WEEKDAYS, browserTimezone, timezones, formatWhen, relative, PLAN_HINT } from './syncUtils';

const card = 'rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur';

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium text-zinc-300">{label}</Label>
    {children}
  </div>
);

export const SyncScheduleCard = ({ data, onSaved }) => {
  const s = data.schedule;
  const mode = s.mode;
  const [form, setForm] = useState({ enabled: s.enabled, weekday: s.weekday, time: s.time, timezone: s.timezone });
  const [saving, setSaving] = useState(false);
  const [tzPrefilled, setTzPrefilled] = useState(false);
  const dirty = ['enabled', 'weekday', 'time', 'timezone'].some((k) => form[k] !== s[k]);
  const locked = !data.can_edit || mode === 'off';
  const scheduled = mode === 'weekly' || mode === 'daily';

  useEffect(() => {
    // First visit: suggest the browser's timezone if the schedule is still on the UTC default.
    if (scheduled && data.can_edit && s.timezone === 'UTC' && browserTimezone() !== 'UTC') {
      setForm((f) => ({ ...f, timezone: browserTimezone() }));
      setTzPrefilled(true);
    }
  }, [scheduled, data.can_edit, s.timezone]);

  const save = async (patch) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/sync/settings`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch || form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Could not save');
      toast.success('Sync schedule saved');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className={card} data-testid="sync-schedule-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            {mode === 'realtime' ? <Zap className="w-4 h-4 text-[#7aa6ff]" /> : <CalendarClock className="w-4 h-4 text-[#7aa6ff]" />}
            Automatic sync
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">InFlow refreshes every connected integration on this schedule.</p>
        </div>
        <Switch checked={mode !== 'off' && !!form.enabled} disabled={locked || saving}
          onCheckedChange={(v) => (mode === 'realtime' ? save({ enabled: v }) : setForm({ ...form, enabled: v }))}
          className="data-[state=checked]:bg-[#0052ff]" data-testid="sync-enabled-toggle" />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {mode === 'weekly' && (
          <Field label="Day">
            <Select value={String(form.weekday)} disabled={locked || !form.enabled} onValueChange={(v) => setForm({ ...form, weekday: Number(v) })}>
              <SelectTrigger className="bg-black/40 border-white/10 text-white" data-testid="sync-weekday-select"><SelectValue /></SelectTrigger>
              <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={d} value={String(i)} data-testid={`sync-weekday-${i}`}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
        {(mode === 'weekly' || mode === 'daily') && (
          <Field label="Time">
            <Input type="time" value={form.time} disabled={locked || !form.enabled}
              onChange={(e) => e.target.value && setForm({ ...form, time: e.target.value })}
              className="bg-black/40 border-white/10 text-white [color-scheme:dark]" data-testid="sync-time-input" />
          </Field>
        )}
        {scheduled && (
          <Field label="Timezone">
            <Select value={form.timezone} disabled={locked || !form.enabled} onValueChange={(v) => setForm({ ...form, timezone: v })}>
              <SelectTrigger className="bg-black/40 border-white/10 text-white" data-testid="sync-timezone-select"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">{timezones().map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        )}
        {mode === 'realtime' && (
          <p className="sm:col-span-3 text-sm text-zinc-300" data-testid="sync-realtime-note">
            Your data syncs automatically every {data.realtime_minutes} minutes, around the clock.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
        <p className="text-xs text-zinc-400" data-testid="sync-next-run">
          {s.enabled && s.next_run_at ? <>Next sync <span className="text-zinc-200">{formatWhen(s.next_run_at)}</span> ({relative(s.next_run_at)})</> : 'Automatic sync is off'}
        </p>
        {data.can_edit && scheduled && (
          <Button size="sm" onClick={() => save()} disabled={!dirty || saving} className="bg-[#0052ff] hover:bg-[#1a63ff] text-white" data-testid="sync-save-btn">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />} Save schedule
          </Button>
        )}
      </div>
      {tzPrefilled && dirty && (
        <p className="mt-2 text-xs text-amber-300/80" data-testid="sync-tz-prefill-note">We've set the timezone to yours ({form.timezone}). Save to apply it.</p>
      )}
      {!data.can_edit && <p className="mt-2 text-xs text-zinc-500">Only the workspace owner can change the schedule.</p>}
      {PLAN_HINT[mode] && (
        <p className="mt-3 text-xs text-zinc-500" data-testid="sync-plan-hint">
          {PLAN_HINT[mode]} <Link to="/choose-plan" className="text-[#7aa6ff] hover:underline" data-testid="sync-see-plans-link">See plans</Link>
        </p>
      )}
    </div>
  );
};
