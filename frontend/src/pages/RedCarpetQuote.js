import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Crown, Loader2, Copy, Check, CalendarClock, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const input = 'w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 px-4 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#0052ff]/60 transition-colors';

const daysLeft = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

export default function RedCarpetQuote() {
  const { token } = useParams();
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', email: '', seats: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/public/storefront/${token}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'This offer is no longer available.');
      setO(d);
    }).catch((e) => setErr(e.message));
  }, [token]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/public/storefront/${token}/quote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, seats: form.seats ? Number(form.seats) : null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'Could not send your request');
      setSent(true);
    } catch (e2) { toast.error(e2.message); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(o.promo_code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (e2) { toast.error('Copy the code manually'); }
  };

  if (err) return <div className="min-h-screen bg-[#050507] flex items-center justify-center px-6 text-center" data-testid="rc-error"><div><Crown className="w-10 h-10 text-zinc-600 mx-auto mb-4" /><p className="text-zinc-300">{err}</p></div></div>;
  if (!o) return <div className="min-h-screen bg-[#050507] flex items-center justify-center" data-testid="rc-loading"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#050507] text-white relative overflow-hidden" data-testid="redcarpet-page">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-[#0052ff]/20 blur-[140px] pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#7aa7ff] font-semibold mb-5 animate-in fade-in slide-in-from-bottom-2 duration-700"><Crown className="w-4 h-4" /> Prepared exclusively for {o.account}</div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] max-w-3xl animate-in fade-in slide-in-from-bottom-3 duration-700" style={{ fontFamily: 'Outfit' }} data-testid="rc-headline">{o.headline}</h1>
        {o.message && <p className="text-zinc-400 text-base mt-5 max-w-2xl animate-in fade-in duration-1000" data-testid="rc-message">{o.message}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-12">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-3xl border border-[#0052ff]/40 bg-white/[0.04] backdrop-blur-xl p-6 shadow-[0_30px_80px_-30px_rgba(0,82,255,0.6)]">
              <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1">Pre-approved for you</div>
              <div className="text-6xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }} data-testid="rc-discount">{o.discount_pct}<span className="text-3xl text-[#7aa7ff]">% off</span></div>
              {o.promo_code && (
                <button onClick={copy} className="mt-5 w-full flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 h-12 hover:border-[#0052ff]/50 transition-colors" data-testid="rc-promo-code">
                  <span className="font-mono tracking-widest text-sm">{o.promo_code}</span>{copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                </button>
              )}
              <div className="flex items-center gap-2 text-xs text-zinc-400 mt-4" data-testid="rc-expiry"><CalendarClock className="w-4 h-4" /> Reserved for {daysLeft(o.expires_at)} more day{daysLeft(o.expires_at) === 1 ? '' : 's'}</div>
            </div>
            {o.contract_terms && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6" data-testid="rc-terms">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-400 mb-3"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Custom contract terms</div>
                <ul className="space-y-2">{o.contract_terms.split('·').map((t) => t.trim()).filter(Boolean).map((t) => <li key={t} className="text-sm text-zinc-200 flex gap-2"><Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />{t}</li>)}</ul>
              </div>
            )}
            {o.cta_url && <a href={o.cta_url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 h-12 rounded-full bg-[#0052ff] hover:bg-[#0047d6] text-sm font-semibold transition-colors" data-testid="rc-cta">{o.cta_label} <ArrowRight className="w-4 h-4" /></a>}
          </div>

          <div className="lg:col-span-3 rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-8">
            {sent ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12" data-testid="rc-success">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4"><Sparkles className="w-7 h-7 text-emerald-300" /></div>
                <h2 className="text-2xl font-bold" style={{ fontFamily: 'Outfit' }}>Your quote is on its way</h2>
                <p className="text-zinc-400 text-sm mt-2 max-w-sm">{o.ae?.name ? `${o.ae.name} has been alerted` : 'Your account executive has been alerted'} and will reply with a tailored quote at your pre-approved terms — usually within minutes.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4" data-testid="rc-quote-form">
                <div><h2 className="text-xl font-semibold" style={{ fontFamily: 'Outfit' }}>Request your tailored quote</h2>
                  <p className="text-zinc-500 text-sm mt-1">{o.seller} will lock these terms in for {o.account}{o.ae?.name ? ` · your AE is ${o.ae.name}` : ''}.</p></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input required value={form.name} onChange={set('name')} placeholder="Full name" className={input} data-testid="rc-name-input" />
                  <input required type="email" value={form.email} onChange={set('email')} placeholder="Work email" className={input} data-testid="rc-email-input" />
                </div>
                <input type="number" min="1" value={form.seats} onChange={set('seats')} placeholder="Seats / licenses needed" className={input} data-testid="rc-seats-input" />
                <textarea value={form.message} onChange={set('message')} rows={4} placeholder="Anything we should include? (security review, SSO, rollout timeline…)" className={`${input} h-auto py-3 resize-none`} data-testid="rc-message-input" />
                <button type="submit" disabled={busy} className="w-full h-12 rounded-full bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-60" data-testid="rc-submit-btn">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Request my quote</button>
              </form>
            )}
          </div>
        </div>
        <div className="text-[11px] text-zinc-600 mt-10">Offer powered by InFlow · terms reserved for {o.account}</div>
      </div>
    </div>
  );
}
