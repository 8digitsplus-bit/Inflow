import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import { AIResponseRenderer } from '../components/AIResponseRenderer';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft, Shield, ShieldCheck, Mail, Gift, LifeBuoy, Workflow, Loader2,
  Sparkles, Copy, Check, Send, DollarSign, Activity, Clock, AlertTriangle, RotateCcw
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v || 0);

const RISK_STYLES = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};
const STATUS_STYLES = {
  open: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  in_progress: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  saved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  lost: 'bg-red-500/15 text-red-300 border-red-500/30',
};
const TOOL_META = {
  outreach: { icon: Mail, label: 'Personalized outreach', color: 'text-sky-400', blurb: 'AI-draft a warm, specific email to re-engage this account — then edit and send it.' },
  offer: { icon: Gift, label: 'Special offer', color: 'text-emerald-400', blurb: 'Build a targeted save offer (discount, term, added value) with ROI guardrails.' },
  support: { icon: LifeBuoy, label: 'Support engagement', color: 'text-amber-400', blurb: 'Draft a proactive health-check plan to remove friction before it churns.' },
  workflow: { icon: Workflow, label: 'Retention workflow', color: 'text-purple-400', blurb: 'Generate a multi-step play combining outreach, value, support and an offer.' },
};

const OFFER_TYPES = [
  { key: 'percent_discount', label: '% discount' },
  { key: 'fixed_discount', label: '$ off' },
  { key: 'free_months', label: 'Free months' },
  { key: 'added_value', label: 'Added value' },
  { key: 'price_freeze', label: 'Price freeze' },
  { key: 'pause', label: 'Pause plan' },
];
const OFFER_TERMS = ['next renewal', '3 months', '6 months', '12 months'];
const OFFER_EXPIRIES = ['7 days', '14 days', '30 days'];

function offerCost(offer, dealValue) {
  const v = dealValue || 0;
  switch (offer.type) {
    case 'percent_discount': return Math.round(v * (Number(offer.percent) || 0) / 100);
    case 'fixed_discount': return Math.round(Number(offer.amount) || 0);
    case 'free_months': return Math.round((v / 12) * (Number(offer.months) || 0));
    default: return 0;
  }
}
function offerLabel(offer) {
  switch (offer.type) {
    case 'percent_discount': return `${offer.percent}% discount · ${offer.term} · expires ${offer.expiry}`;
    case 'fixed_discount': return `$${Number(offer.amount || 0).toLocaleString()} off · ${offer.term} · expires ${offer.expiry}`;
    case 'free_months': return `${offer.months} free month(s) · expires ${offer.expiry}`;
    case 'added_value': return `Added value: ${offer.perk || 'perk'} · expires ${offer.expiry}`;
    case 'price_freeze': return `Price freeze · ${offer.term} · expires ${offer.expiry}`;
    case 'pause': return `Pause plan · ${offer.months} month(s) · expires ${offer.expiry}`;
    default: return 'Custom offer';
  }
}

function splitEmail(content) {
  const text = content || '';
  const m = text.match(/^\s*subject:\s*(.+)$/im);
  if (m) {
    const subject = m[1].trim();
    const body = text.replace(/^\s*subject:\s*.+$/im, '').replace(/^\s+/, '');
    return { subject, body };
  }
  return { subject: '', body: text };
}

const RetentionWorkspace = () => {
  const { dealId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [deal, setDeal] = useState(location.state?.deal || null);
  const [plays, setPlays] = useState([]);
  const [protectedVal, setProtectedVal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [drafts, setDrafts] = useState({});
  const [playIds, setPlayIds] = useState({});
  const [genLoading, setGenLoading] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/retention/deal/${dealId}`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setDeal(d.deal);
        setPlays(d.plays || []);
        setProtectedVal(d.protected || 0);
      }
    } catch (e) { console.error('Failed to load deal:', e); }
    finally { setLoading(false); }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const generate = async (actionType) => {
    if (!deal) return;
    setGenLoading(actionType);
    try {
      const r = await fetch(`${API_URL}/api/retention/plays`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ action_type: actionType, deal }),
      });
      if (r.ok) {
        const p = await r.json();
        setPlayIds((m) => ({ ...m, [actionType]: p.play_id }));
        if (actionType === 'outreach') {
          const { subject, body } = splitEmail(p.content);
          setEmailSubject(subject);
          setDrafts((d) => ({ ...d, outreach: body }));
        } else {
          setDrafts((d) => ({ ...d, [actionType]: p.content }));
        }
        toast.success('Draft ready');
        load();
      } else {
        toast.error((await r.json().catch(() => ({}))).detail || 'Failed to generate');
      }
    } catch { toast.error('Failed to generate'); }
    finally { setGenLoading(null); }
  };

  const updatePlay = async (playId, status) => {
    try {
      const r = await fetch(`${API_URL}/api/retention/plays/${playId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ status }),
      });
      if (r.ok) {
        toast.success(status === 'saved' ? 'Marked as saved — recurring revenue protected' : `Marked ${status.replace('_', ' ')}`);
        load();
      } else { toast.error('Failed to update play'); }
    } catch { toast.error('Failed to update play'); }
  };

  const sendEmail = async () => {
    if (!emailTo || !emailTo.includes('@')) { toast.error('Enter a valid recipient email'); return; }
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/api/retention/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ to: emailTo, subject: emailSubject, body: drafts.outreach || '', deal_name: deal?.name, play_id: playIds.outreach }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { toast.success(`Email sent to ${emailTo}`); load(); }
      else { toast.error(d.detail || 'Failed to send email'); }
    } catch { toast.error('Failed to send email'); }
    finally { setSending(false); }
  };

  const copy = (key, text) => {
    navigator.clipboard.writeText(text || '');
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const renderGenericTool = (actionType) => {
    const meta = TOOL_META[actionType];
    const Icon = meta.icon;
    const content = drafts[actionType];
    const pid = playIds[actionType];
    const busy = genLoading === actionType;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white/5"><Icon className={`w-5 h-5 ${meta.color}`} /></div>
          <div>
            <h3 className="text-white font-semibold" style={{ fontFamily: 'Outfit' }}>{meta.label}</h3>
            <p className="text-zinc-400 text-sm">{meta.blurb}</p>
          </div>
        </div>
        {!content ? (
          <Button onClick={() => generate(actionType)} disabled={busy}
            className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid={`generate-${actionType}`}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {busy ? 'Drafting…' : 'Generate with AI'}
          </Button>
        ) : (
          <>
            <Textarea value={content} onChange={(e) => setDrafts((d) => ({ ...d, [actionType]: e.target.value }))}
              className="min-h-[300px] bg-zinc-950/60 border-zinc-800 text-zinc-200 text-sm font-mono leading-relaxed"
              data-testid={`draft-${actionType}`} />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-white/5"
                onClick={() => copy(actionType, content)} data-testid={`copy-${actionType}`}>
                {copiedKey === actionType ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copiedKey === actionType ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-white/5"
                onClick={() => generate(actionType)} disabled={busy} data-testid={`regenerate-${actionType}`}>
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />} Regenerate
              </Button>
              {pid && (
                <>
                  <Button size="sm" className="bg-sky-600/80 hover:bg-sky-600 text-white" onClick={() => updatePlay(pid, 'in_progress')} data-testid={`progress-${actionType}`}>Mark in progress</Button>
                  <Button size="sm" className="bg-emerald-600/80 hover:bg-emerald-600 text-white" onClick={() => updatePlay(pid, 'saved')} data-testid={`save-${actionType}`}>Mark saved</Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderOutreach = () => {
    const content = drafts.outreach;
    const busy = genLoading === 'outreach';
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white/5"><Mail className="w-5 h-5 text-sky-400" /></div>
          <div>
            <h3 className="text-white font-semibold" style={{ fontFamily: 'Outfit' }}>Personalized outreach</h3>
            <p className="text-zinc-400 text-sm">{TOOL_META.outreach.blurb}</p>
          </div>
        </div>
        {!content ? (
          <Button onClick={() => generate('outreach')} disabled={busy} className="bg-[#0052ff] hover:bg-[#0047d6] text-white" data-testid="generate-outreach">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {busy ? 'Drafting email…' : 'Draft email with AI'}
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Recipient email</label>
              <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="contact@company.com"
                className="bg-zinc-950/60 border-zinc-800 text-zinc-200" data-testid="email-to" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Subject</label>
              <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)}
                className="bg-zinc-950/60 border-zinc-800 text-zinc-200" data-testid="email-subject" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Body</label>
              <Textarea value={content} onChange={(e) => setDrafts((d) => ({ ...d, outreach: e.target.value }))}
                className="min-h-[240px] bg-zinc-950/60 border-zinc-800 text-zinc-200 text-sm leading-relaxed" data-testid="email-body" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="bg-[#0052ff] hover:bg-[#0047d6] text-white" onClick={sendEmail} disabled={sending} data-testid="send-email-btn">
                {sending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />} {sending ? 'Sending…' : 'Send email'}
              </Button>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-white/5" onClick={() => copy('outreach', `Subject: ${emailSubject}\n\n${content}`)} data-testid="copy-outreach">
                {copiedKey === 'outreach' ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 mr-1" />} {copiedKey === 'outreach' ? 'Copied' : 'Copy'}
              </Button>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-white/5" onClick={() => generate('outreach')} disabled={busy} data-testid="regenerate-outreach">
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />} Regenerate
              </Button>
              {playIds.outreach && (
                <Button size="sm" className="bg-emerald-600/80 hover:bg-emerald-600 text-white" onClick={() => updatePlay(playIds.outreach, 'saved')} data-testid="save-outreach">Mark saved</Button>
              )}
            </div>
            <p className="text-zinc-500 text-xs">Sends from your configured sender via Resend. If email isn't set up yet, use Copy and send from your own inbox.</p>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-[#0052ff]" /></div>
      </DashboardLayout>
    );
  }

  if (!deal) {
    return (
      <DashboardLayout>
        <div className="text-center py-24">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
          <p className="text-zinc-300">We couldn't find this deal.</p>
          <Button variant="outline" className="mt-4 border-zinc-700 text-zinc-300" onClick={() => navigate('/churn')} data-testid="back-to-churn">Back to Churn</Button>
        </div>
      </DashboardLayout>
    );
  }

  const signals = [
    { label: 'Value at risk', value: fmt(deal.value), icon: DollarSign, color: 'text-red-400' },
    { label: 'Win probability', value: `${deal.probability}%`, icon: Activity, color: 'text-sky-400' },
    { label: 'Engagement', value: `${deal.engagement_score}%`, icon: Activity, color: 'text-amber-400' },
    { label: 'Days inactive', value: deal.days_inactive, icon: Clock, color: 'text-zinc-300' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="workspace-page">
        <button onClick={() => navigate('/churn')} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors" data-testid="back-to-churn">
          <ArrowLeft className="w-4 h-4" /> Back to Churn &amp; Retention
        </button>

        {/* Deal header */}
        <Card className="bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 border-white/10 overflow-hidden relative">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-[#0052ff]/10 blur-3xl" />
          <CardContent className="p-6 relative">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Shield className="w-5 h-5 text-[#0052ff]" />
                  <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="ws-deal-name">{deal.name}</h1>
                  <Badge variant="outline" className={`capitalize ${RISK_STYLES[deal.risk_level] || RISK_STYLES.medium}`}>{deal.risk_level} risk</Badge>
                </div>
                <p className="text-zinc-400 text-sm">{deal.company} · {deal.stage?.replace('_', ' ')} · Protect this account to defend recurring revenue.</p>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-zinc-500 uppercase tracking-wide">Revenue Protected</div>
                <div className="text-2xl font-bold font-mono text-emerald-400" data-testid="ws-revenue-protected">{fmt(protectedVal)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
              {signals.map((s, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1"><s.icon className={`w-3.5 h-3.5 ${s.color}`} /> {s.label}</div>
                  <div className="text-white font-semibold font-mono">{s.value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Tools */}
          <Card className="bg-zinc-950/50 border-white/10 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Sparkles className="w-5 h-5 text-[#0052ff]" /> Retention toolkit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="outreach">
                <TabsList className="bg-zinc-900/60 border border-white/10 flex-wrap h-auto">
                  <TabsTrigger value="outreach" data-testid="tab-outreach"><Mail className="w-3.5 h-3.5 mr-1.5" /> Outreach</TabsTrigger>
                  <TabsTrigger value="offer" data-testid="tab-offer"><Gift className="w-3.5 h-3.5 mr-1.5" /> Offer</TabsTrigger>
                  <TabsTrigger value="support" data-testid="tab-support"><LifeBuoy className="w-3.5 h-3.5 mr-1.5" /> Support</TabsTrigger>
                  <TabsTrigger value="workflow" data-testid="tab-workflow"><Workflow className="w-3.5 h-3.5 mr-1.5" /> Workflow</TabsTrigger>
                </TabsList>
                <TabsContent value="outreach" className="mt-5">{renderOutreach()}</TabsContent>
                <TabsContent value="offer" className="mt-5">{renderGenericTool('offer')}</TabsContent>
                <TabsContent value="support" className="mt-5">{renderGenericTool('support')}</TabsContent>
                <TabsContent value="workflow" className="mt-5">{renderGenericTool('workflow')}</TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Activity timeline */}
          <Card className="bg-zinc-950/50 border-white/10">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <ShieldCheck className="w-5 h-5 text-emerald-400" /> Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {plays.length > 0 ? (
                <div className="space-y-2" data-testid="ws-activity-list">
                  {plays.map((p) => {
                    const meta = TOOL_META[p.action_type] || {};
                    const Icon = meta.icon || Shield;
                    const isActive = p.status === 'open' || p.status === 'in_progress';
                    return (
                      <div key={p.play_id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3" data-testid={`activity-play-${p.play_id}`}>
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 flex-shrink-0 ${meta.color || 'text-zinc-400'}`} />
                          <span className="text-white text-sm font-medium flex-1 truncate">{meta.label || p.action_label}</span>
                          <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_STYLES[p.status] || ''}`}>{p.status.replace('_', ' ')}</Badge>
                        </div>
                        {p.note ? <p className="text-zinc-500 text-xs mt-1 ml-6">{p.note}</p> : null}
                        {isActive && (
                          <div className="flex gap-2 mt-2 ml-6">
                            <Button size="sm" className="h-6 px-2 text-[11px] bg-emerald-600/80 hover:bg-emerald-600 text-white" onClick={() => updatePlay(p.play_id, 'saved')} data-testid={`ws-save-${p.play_id}`}>Saved</Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] border-zinc-700 text-zinc-400 hover:bg-white/5" onClick={() => updatePlay(p.play_id, 'lost')} data-testid={`ws-lost-${p.play_id}`}>Lost</Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-zinc-500">
                  <Shield className="w-9 h-9 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No actions yet. Use a tool to launch your first retention play.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default RetentionWorkspace;
