import {
  FileSignature, CalendarClock, Rocket, Tag, Video, FileDown, BookOpen, ClipboardList, BookMarked, MousePointerClick, Radio,
} from 'lucide-react';

export const API_URL = process.env.REACT_APP_BACKEND_URL;
export const glass = 'bg-white/[0.04] border border-white/10 backdrop-blur-xl';
export const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

export async function api(path, opts = {}) {
  const res = await fetch(`${API_URL}/api${path}`, {
    credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Request failed');
  return data;
}

export const timeAgo = (iso) => {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export const fmtMs = (ms) => (ms == null ? '—' : ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60000)}m`);

export const EVENT_ICON = {
  quote_request: FileSignature, demo_request: CalendarClock, trial_signup: Rocket, pricing_view: Tag,
  webinar_attended: Video, webinar_registered: Video, whitepaper_download: FileDown, case_study_view: BookOpen,
  form_submit: ClipboardList, docs_view: BookMarked, page_view: MousePointerClick,
};
export const eventIcon = (t) => EVENT_ICON[t] || Radio;

export const TIER_STYLE = {
  hot: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  warm: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  cool: 'bg-white/5 text-zinc-400 border-white/10',
};
export const CAT_STYLE = {
  Marketing: 'bg-sky-500/10 text-sky-300 border-sky-500/25',
  Sales: 'bg-violet-500/10 text-violet-300 border-violet-500/25',
  Product: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
};
export const STATUS_STYLE = {
  new: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  routed: 'bg-[#0052ff]/20 text-[#7aa7ff] border-[#0052ff]/40',
  contacted: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  won: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  lost: 'bg-red-500/15 text-red-300 border-red-500/30',
  dismissed: 'bg-zinc-600/15 text-zinc-400 border-zinc-600/30',
};
export const SOURCE_LABEL = {
  snippet: 'Website', api: 'Events API', sample: 'Sample', test: 'Test', storefront: 'Storefront',
  posthog: 'PostHog', mixpanel: 'Mixpanel', amplitude: 'Amplitude', ga4: 'GA4',
};
export const DEST_LABEL = { hubspot: 'HubSpot', salesforce: 'Salesforce', pipedrive: 'Pipedrive', zoho: 'Zoho CRM', slack: 'Slack' };

export function Pill({ className = '', children, ...rest }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${className}`} {...rest}>{children}</span>;
}

export function ScoreRing({ score = 0, size = 40, testid }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? '#f59e0b' : score >= 40 ? '#4d8bff' : '#71717a';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} data-testid={testid}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="3" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * Math.min(100, score)) / 100} style={{ transition: 'stroke-dashoffset 600ms ease' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white">{score}</span>
    </div>
  );
}

export function Kpi({ icon: Icon, label, value, sub, testid }) {
  return (
    <div className={`rounded-2xl p-5 ${glass}`} data-testid={testid}>
      <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2"><Icon className="w-4 h-4" /> {label}</div>
      <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ fontFamily: 'Outfit' }}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

export function Section({ icon: Icon, title, right, children, className = '', testid }) {
  return (
    <div className={`rounded-2xl ${glass} overflow-hidden ${className}`} data-testid={testid}>
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
      {children}
    </div>
  );
}

export async function copyText(text, toast) {
  try {
    await navigator.clipboard.writeText(text || '');
    toast.success('Copied');
  } catch (e) {
    toast.error('Clipboard unavailable — select the text and copy manually');
  }
}
