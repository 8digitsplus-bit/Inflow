import { useState, useEffect } from 'react';
import { Code2, Copy, RefreshCw, Loader2, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { api, API_URL, copyText, timeAgo } from './shared';

const PATTERN_LABELS = {
  quote_request: 'Request-a-quote', demo_request: 'Demo request', trial_signup: 'Trial signup', pricing_view: 'Pricing page',
  webinar_attended: 'Webinar', whitepaper_download: 'Whitepaper / eBook', case_study_view: 'Case study', docs_view: 'Product docs',
};

const Code = ({ text, testid }) => (
  <div className="relative group">
    <pre className="bg-black/60 border border-white/10 rounded-lg p-3 text-[11px] text-zinc-300 font-mono whitespace-pre-wrap break-all" data-testid={testid}>{text}</pre>
    <button onClick={() => copyText(text, toast)} className="absolute top-2 right-2 p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-zinc-400" data-testid={`${testid}-copy`}><Copy className="w-3.5 h-3.5" /></button>
  </div>
);

export const TrackingDialog = ({ open, onOpenChange, isOwner }) => {
  const [t, setT] = useState(null);
  const [pats, setPats] = useState({});
  const [busy, setBusy] = useState('');

  const apply = (d) => { setT(d); setPats(Object.fromEntries(Object.keys(PATTERN_LABELS).map((k) => [k, (d.patterns[k] || []).join(', ')]))); };
  useEffect(() => { if (open) api('/intent/tracking').then(apply).catch((e) => toast.error(e.message)); }, [open]);

  const save = async () => {
    setBusy('save');
    try {
      const patterns = Object.fromEntries(Object.entries(pats).map(([k, v]) => [k, v.split(',').map((s) => s.trim()).filter(Boolean)]));
      apply(await api('/intent/tracking/patterns', { method: 'PUT', body: JSON.stringify({ patterns }) }));
      toast.success('URL patterns saved — the snippet picks them up within 5 minutes');
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };
  const rotate = async () => {
    if (!window.confirm('Rotate the ingest key? Your current snippet and Events API calls will stop working until updated.')) return;
    setBusy('rotate');
    try { apply(await api('/intent/tracking/rotate', { method: 'POST' })); toast.success('Ingest key rotated'); } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  const snippetUrl = t ? `${API_URL}/api/public/intent/${t.ingest_key}/snippet.js` : '';
  const snippet = `<script async src="${snippetUrl}"></script>`;
  const curl = t ? `curl -X POST ${API_URL}/api/public/intent/events \\\n  -H "X-InFlow-Key: ${t.ingest_key}" -H "Content-Type: application/json" \\\n  -d '{"events":[{"type":"webinar_attended","email":"jane@acme.com","company":"Acme","url":"/webinar/q3"}]}'` : '';
  const slots = `<!-- optional storefront slots on your pricing page / quote form -->\n<h2 data-inflow-headline></h2>  <p data-inflow-terms></p>\n<span data-inflow-price="499">$499</span>  <code data-inflow-promo></code>\n<input type="hidden" name="inflow_promo" />\n<script>inflow.identify({ email: "jane@acme.com", company: "Acme" })</script>`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="tracking-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: 'Outfit' }}><Code2 className="w-5 h-5 text-[#4d8bff]" /> Install intent tracking</DialogTitle>
          <DialogDescription className="text-zinc-400">Three ways signals reach your intent data cloud: the website snippet, the Events API, and pulls from connected GA4 / Mixpanel / Amplitude / PostHog.</DialogDescription>
        </DialogHeader>
        {!t ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div> : (
          <div className="space-y-5 text-sm">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Ingest key <span className="font-mono text-zinc-300" data-testid="tracking-ingest-key">{t.ingest_key}</span></span>
              <span data-testid="tracking-last-event">Last signal {timeAgo(t.last_event_at)}</span>
            </div>
            <div><div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">1 · Website snippet (paste before &lt;/head&gt;)</div><Code text={snippet} testid="tracking-snippet" />
              <p className="text-[11px] text-zinc-500 mt-1.5">Auto-tracks page views by URL pattern, PDF/whitepaper clicks, form submits (captures the email) and <span className="font-mono">data-inflow-event</span> clicks. It also renders red-carpet offers for qualifying visitors.</p></div>
            <div><div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">2 · Events API (server-to-server)</div><Code text={curl} testid="tracking-curl" /></div>
            <div><div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Storefront slots (optional)</div><Code text={slots} testid="tracking-slots" /></div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">URL → intent patterns</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(PATTERN_LABELS).map(([k, label]) => (
                  <div key={k}><div className="text-[11px] text-zinc-500 mb-1">{label}</div>
                    <Input value={pats[k] || ''} onChange={(e) => setPats((p) => ({ ...p, [k]: e.target.value }))} disabled={!isOwner} className="bg-zinc-900 border-zinc-700 text-white h-8 text-xs font-mono" data-testid={`pattern-input-${k}`} /></div>
                ))}
              </div>
              {isOwner && (
                <div className="flex justify-between mt-3">
                  <Button size="sm" variant="ghost" onClick={rotate} disabled={!!busy} className="text-zinc-400 hover:bg-white/5 h-8 text-xs" data-testid="rotate-key-btn"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Rotate key</Button>
                  <Button size="sm" onClick={save} disabled={!!busy} className="bg-[#0052ff] hover:bg-[#0047d6] h-8 text-xs" data-testid="save-patterns-btn">{busy === 'save' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />} Save patterns</Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
