import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import ConnectDataCTA from '../components/ConnectDataCTA';
import { InsightCards } from '../components/AiInsightCards';
import { ChartCard, AreaTrend, DonutBreakdown, KpiCard } from '../components/charts/LayroCharts';
import {
  TrendingUp,
  DollarSign,
  Target,
  Wallet,
  Sparkles,
  ArrowRight,
  BarChart3,
  Heart,
  AlertTriangle,
  Zap,
  PieChart,
  Clock,
  Lock,
  Filter,
  ChevronDown,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { STAGE_COLORS } from '../constants/colors';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '../components/ui/dropdown-menu';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TIER_ACCESS = {
  trial: ['metrics', 'revenue_chart', 'pipeline_dist', 'recent_deals', 'quick_actions'],
  expired: ['metrics'],
  cancelled: ['metrics'],
  free: ['metrics', 'revenue_chart', 'pipeline_dist', 'recent_deals', 'quick_actions'],
  essential_monthly: ['metrics', 'revenue_chart', 'pipeline_dist', 'churn_widget', 'recent_deals', 'quick_actions'],
  essential_yearly: ['metrics', 'revenue_chart', 'pipeline_dist', 'churn_widget', 'recent_deals', 'quick_actions'],
  pro_monthly: ['metrics', 'revenue_chart', 'pipeline_dist', 'churn_widget', 'cro_widget', 'ai_insights', 'recent_deals', 'quick_actions'],
  pro_yearly: ['metrics', 'revenue_chart', 'pipeline_dist', 'churn_widget', 'cro_widget', 'ai_insights', 'recent_deals', 'quick_actions'],
  enterprise_monthly: ['metrics', 'revenue_chart', 'pipeline_dist', 'churn_widget', 'cro_widget', 'ai_insights', 'recent_deals', 'quick_actions'],
  enterprise_yearly: ['metrics', 'revenue_chart', 'pipeline_dist', 'churn_widget', 'cro_widget', 'ai_insights', 'recent_deals', 'quick_actions'],
};

const fmtFull = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const moneyShort = (v) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
const cap = (s) => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);

const Dashboard = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [churnData, setChurnData] = useState(null);
  const [croData, setCroData] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [connectedSources, setConnectedSources] = useState([]);
  const [selectedSources, setSelectedSources] = useState([]);

  const tier = user?.subscription_tier || 'trial';
  const userGoals = user?.goals || [];
  const access = TIER_ACCESS[tier] || TIER_ACCESS.trial;
  const trialDaysLeft = user?.trial_days_left ?? 0;
  const isTrial = tier === 'trial';
  const isExpired = tier === 'expired';
  const isCancelled = tier === 'cancelled';
  const hasAccess = (section) => access.includes(section);
  const tierLabel = isTrial ? 'Trial' : isExpired ? 'Expired' : isCancelled ? 'Cancelled' : tier.split('_')[0];
  const isEssential = tier.includes('essential');
  const isPro = tier.includes('pro');
  const isEnterprise = tier.includes('enterprise');

  useEffect(() => {
    fetchAllData();
    fetchConnectedSources();
  }, [selectedSources]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchConnectedSources = async () => {
    try {
      const r = await fetch(`${API_URL}/api/business/platforms`, { credentials: 'include' });
      if (r.ok) setConnectedSources((await r.json()).filter((p) => p.connected));
    } catch { /* noop */ }
  };

  const fetchAllData = async () => {
    try {
      const q = selectedSources.length ? `?sources=${encodeURIComponent(selectedSources.join(','))}` : '';
      const [analyticsRes, churnRes, croRes, dealsRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/revenue${q}`, { credentials: 'include' }),
        fetch(`${API_URL}/api/analytics/churn${q}`, { credentials: 'include' }),
        fetch(`${API_URL}/api/analytics/cro${q}`, { credentials: 'include' }),
        fetch(`${API_URL}/api/deals`, { credentials: 'include' }),
      ]);
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (churnRes.ok) setChurnData(await churnRes.json());
      if (croRes.ok) setCroData(await croRes.json());
      if (dealsRes.ok) setDeals(await dealsRes.json());
    } catch (error) { console.error('Failed to fetch data:', error); }
    finally { setLoading(false); }
  };

  const getAIInsight = async () => {
    if (!hasAccess('ai_insights')) return;
    setLoadingInsight(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/insights`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          context: `Analyze this business data and provide strategic insights: Total Pipeline: $${analytics?.total_pipeline || 0}, Win Rate: ${analytics?.win_rate || 0}%, Churn Rate: ${churnData?.churn_rate || 0}%, Conversion Rate: ${croData?.overall_conversion || 0}%`,
          data: { analytics, churnData, croData },
        }),
      });
      if (response.ok) setAiInsight(await response.json());
    } catch (error) { console.error('Failed to get AI insight:', error); }
    finally { setLoadingInsight(false); }
  };

  const getHealthColor = (score) => (score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400');

  const recentDeals = deals.slice(0, 5);
  const stageColors = STAGE_COLORS;
  const monthly = analytics?.monthly_data || [];
  const pieData = (analytics?.stage_breakdown || []).filter((s) => !['closed_won', 'closed_lost'].includes(s.stage) && s.count > 0);
  const donutData = pieData.map((s, i) => ({ label: cap(s.stage.replace('_', ' ')), value: s.count, slot: (i % 5) + 1 }));
  const revTrend = monthly.map((m) => m.revenue || 0);

  const revDelta = (() => {
    if (monthly.length < 2) return null;
    const last = monthly[monthly.length - 1]?.revenue || 0;
    const prev = monthly[monthly.length - 2]?.revenue || 0;
    if (!prev) return null;
    return ((last - prev) / prev) * 100;
  })();

  const LockedOverlay = ({ requiredTier }) => (
    <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm rounded-[18px] flex flex-col items-center justify-center z-10">
      <Lock className="w-6 h-6 text-zinc-500 mb-2" />
      <p className="text-zinc-400 text-xs mb-2">Available on {requiredTier}+</p>
      <Link to="/settings"><Button size="sm" className="bg-white/10 hover:bg-white/20 h-7 text-xs px-3">Upgrade</Button></Link>
    </div>
  );

  const stageBadge = (stage) => {
    const cls = stage === 'closed_won' ? 'bg-emerald-500/15 text-emerald-400'
      : stage === 'closed_lost' ? 'bg-red-500/15 text-red-400'
      : 'bg-white/[0.06] text-zinc-300';
    return <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${cls}`}>{(stage || '').replace('_', ' ')}</span>;
  };

  const viewAll = (to) => (
    <Link to={to}><Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-[#4d8bff] hover:bg-[#0052ff]/10 text-xs">View all <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button></Link>
  );

  return (
    <DashboardLayout>
      <div className="space-y-5" data-testid="dashboard-main">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Welcome back, {user?.name?.split(' ')[0] || 'there'}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {userGoals.length > 0 ? `Focused on ${userGoals.map((g) => cap(g)).join(', ')}` : "Here's your complete business overview"}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
            isEnterprise ? 'bg-[#0052ff]/15 text-[#4d8bff]' : isPro ? 'bg-slate-500/20 text-slate-300' :
            isEssential ? 'bg-cyan-500/20 text-cyan-400' : isTrial ? 'bg-amber-500/20 text-amber-400' :
            isExpired || isCancelled ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700 text-zinc-300'}`} data-testid="tier-badge">
            {isTrial ? `Trial · ${trialDaysLeft}d left` : isExpired ? 'Trial Expired' : isCancelled ? 'Cancelled' : `${cap(tierLabel)} Plan`}
          </span>
        </div>

        {!loading && deals.length === 0 && (
          <ConnectDataCTA title="No revenue data yet" message="Your dashboard is empty because no data source is linked. Connect your CRM or billing tool to see real revenue, pipeline and health metrics." testid="dashboard-empty-cta" />
        )}

        {/* Source filter */}
        {connectedSources.length > 0 && (() => {
          const manualOnly = selectedSources.length === 1 && selectedSources[0] === 'manual';
          const allActive = selectedSources.length === 0;
          const triggerLabel = allActive ? 'All sources' : manualOnly ? 'Manual only'
            : selectedSources.length === 1 ? (connectedSources.find((c) => c.platform_id === selectedSources[0])?.name || selectedSources[0]) : `${selectedSources.length} sources`;
          const togglePlatform = (pid) => setSelectedSources((prev) => {
            const withoutManual = prev.filter((p) => p !== 'manual');
            return withoutManual.includes(pid) ? withoutManual.filter((p) => p !== pid) : [...withoutManual, pid];
          });
          return (
            <div className="flex items-center gap-2" data-testid="source-filter">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Filter</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-card text-zinc-200 ring-1 ring-border hover:ring-slate-500/50 transition-colors" data-testid="source-filter-trigger">
                    <Filter className="w-3.5 h-3.5 text-slate-400" /><span>{triggerLabel}</span><ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60 bg-zinc-950 border-zinc-800 text-zinc-200" data-testid="source-filter-menu">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Data sources</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <button type="button" onClick={() => setSelectedSources([])} className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-zinc-900 ${allActive ? 'text-slate-400' : 'text-zinc-200'}`} data-testid="source-filter-all">
                    <Check className={`w-3.5 h-3.5 ${allActive ? 'opacity-100' : 'opacity-0'}`} /> All sources
                  </button>
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  {connectedSources.map((s) => {
                    const active = selectedSources.includes(s.platform_id);
                    const role = s.revenue_role || s.default_revenue_role || 'revenue';
                    const dotClass = role === 'revenue' ? 'bg-emerald-400' : role === 'pipeline' ? 'bg-slate-400' : 'bg-amber-400';
                    return (
                      <DropdownMenuCheckboxItem key={s.platform_id} checked={active} onCheckedChange={() => togglePlatform(s.platform_id)} className="text-sm focus:bg-zinc-900 focus:text-white data-[state=checked]:text-slate-400" data-testid={`source-filter-${s.platform_id}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-2 ${dotClass}`} /><span className="flex-1">{s.name}</span><span className="text-[10px] uppercase text-zinc-500 ml-2">{role}</span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <button type="button" onClick={() => setSelectedSources(manualOnly ? [] : ['manual'])} className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-zinc-900 ${manualOnly ? 'text-slate-400' : 'text-zinc-200'}`} data-testid="source-filter-manual">
                    <Check className={`w-3.5 h-3.5 ${manualOnly ? 'opacity-100' : 'opacity-0'}`} /> Manual deals only
                  </button>
                </DropdownMenuContent>
              </DropdownMenu>
              {!allActive && <button type="button" onClick={() => setSelectedSources([])} className="text-[11px] text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline" data-testid="source-filter-clear">Clear</button>}
            </div>
          );
        })()}

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard data-testid="metric-pipeline" label="Total Pipeline" value={fmtFull(analytics?.total_pipeline)} icon={DollarSign} accent="bg-[#0052ff]/12 text-[#4d8bff]" period="across all stages" />
          <KpiCard data-testid="metric-revenue" label="Closed Revenue" value={fmtFull(analytics?.closed_revenue)} icon={TrendingUp} accent="bg-emerald-500/12 text-emerald-400" delta={revDelta != null ? revDelta / 100 : undefined} good="up" period="vs last month" trend={revTrend} />
          <KpiCard data-testid="metric-winrate" label="Win Rate" value={`${analytics?.win_rate || 0}%`} icon={Target} accent="bg-cyan-500/12 text-cyan-400" period={`${croData?.won_deals || 0} won`} />
          <KpiCard data-testid="metric-total-revenue" label="Total Revenue" value={fmtFull(analytics?.projected_revenue)} icon={Wallet} accent="bg-amber-500/12 text-amber-400" period="closed + weighted pipeline" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard data-testid="revenue-chart" title={<span className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-[#4d8bff]" /> Revenue trend</span>} subtitle="Monthly closed revenue vs forecast" actions={viewAll('/revenue')}>
            {monthly.length > 0 ? (
              <AreaTrend data={monthly} xKey="month" height={240} description="Monthly revenue and forecast"
                format={moneyShort}
                series={[{ key: 'revenue', label: 'Revenue', slot: 1 }, { key: 'forecast', label: 'Forecast', slot: 3 }]} />
            ) : <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No revenue history yet</div>}
          </ChartCard>

          <ChartCard data-testid="pipeline-distribution" title={<span className="flex items-center gap-2"><PieChart className="w-4 h-4 text-violet-400" /> Pipeline by stage</span>} subtitle="Open deals across your funnel" actions={viewAll('/pipeline')}>
            {donutData.length > 0 ? (
              <DonutBreakdown data={donutData} centerLabel="Open deals" description="Open deals by funnel stage" format={(v) => `${v}`} size={168} className="py-2" />
            ) : <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No open pipeline yet</div>}
          </ChartCard>
        </div>

        {/* Recent deals + Health + Conversion */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <ChartCard data-testid="recent-deals" className="lg:col-span-2" title={<span className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /> Recent deals</span>} subtitle="Latest activity across your pipeline" actions={viewAll('/pipeline')}>
            {recentDeals.length > 0 ? (
              <div>
                <div className="grid grid-cols-[1.2fr_1.4fr_0.9fr_0.9fr] text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                  <span>Company</span><span>Deal</span><span className="text-right">Value</span><span className="text-right">Stage</span>
                </div>
                {recentDeals.map((deal, i) => (
                  <div key={i} className="grid grid-cols-[1.2fr_1.4fr_0.9fr_0.9fr] items-center py-2.5 border-b border-border/60 last:border-0 text-sm" data-testid={`deal-row-${i}`}>
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: stageColors[deal.stage] || '#0052FF' }} />
                      <span className="text-zinc-300 truncate">{deal.company || '—'}</span>
                    </span>
                    <span className="text-white truncate pr-2">{deal.name}</span>
                    <span className="text-right text-white font-medium whitespace-nowrap tabular-nums">{fmtFull(deal.value)}</span>
                    <span className="text-right">{stageBadge(deal.stage)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <Target className="w-9 h-9 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No deals yet</p>
                <Link to="/pipeline"><Button size="sm" className="mt-3 bg-white/10 hover:bg-white/20">Create your first deal</Button></Link>
              </div>
            )}
          </ChartCard>

          {/* Customer health */}
          {(() => {
            const locked = !hasAccess('churn_widget');
            return (
              <div className="relative" data-testid="churn-widget">
                {locked && <LockedOverlay requiredTier="Essential" />}
                <ChartCard title={<span className="flex items-center gap-2"><Heart className="w-4 h-4 text-emerald-400" /> Customer health</span>} actions={<Link to="/churn"><Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-white"><ArrowRight className="w-4 h-4" /></Button></Link>}>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className={`text-3xl font-bold ${getHealthColor(churnData?.health_score || 0)}`} style={{ fontFamily: 'Outfit' }}>{churnData?.health_score || 0}</div>
                      <p className="text-xs text-muted-foreground mt-0.5">Health score</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-emerald-400">{churnData?.retention_rate || 0}%</div>
                      <p className="text-xs text-muted-foreground">Retention</p>
                    </div>
                  </div>
                  <Progress value={churnData?.health_score || 0} className="h-1.5" />
                  {churnData?.at_risk_count > 0 ? (
                    <div className="flex items-center gap-2 text-amber-400 text-xs"><AlertTriangle className="w-3 h-3" />{churnData.at_risk_count} at-risk customers</div>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-400/80 text-xs"><CheckCircle2 className="w-3 h-3" /> Nothing at risk right now</div>
                  )}
                </ChartCard>
              </div>
            );
          })()}

          {/* Conversion */}
          {(() => {
            const locked = !hasAccess('cro_widget');
            return (
              <div className="relative" data-testid="cro-widget">
                {locked && <LockedOverlay requiredTier="Pro" />}
                <ChartCard title={<span className="flex items-center gap-2"><Zap className="w-4 h-4 text-cyan-400" /> Conversion</span>} actions={<Link to="/cro"><Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-white"><ArrowRight className="w-4 h-4" /></Button></Link>}>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-3xl font-bold text-cyan-400" style={{ fontFamily: 'Outfit' }}>{croData?.overall_conversion || 0}%</div>
                      <p className="text-xs text-muted-foreground mt-0.5">Overall conversion</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-white">{croData?.won_deals || 0}</div>
                      <p className="text-xs text-muted-foreground">Won deals</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {(croData?.funnel_data?.slice(0, 5) || []).map((stage, i) => (
                      <div key={i} className="flex-1 h-8 rounded bg-cyan-500/15 relative overflow-hidden" title={`${stage.stage}: ${stage.conversion}%`}>
                        <div className="absolute bottom-0 left-0 right-0 bg-cyan-500 transition-all" style={{ height: `${stage.conversion}%` }} />
                      </div>
                    ))}
                  </div>
                  {croData?.bottlenecks?.length > 0 && <div className="flex items-center gap-2 text-amber-400 text-xs"><AlertTriangle className="w-3 h-3" />{croData.bottlenecks.length} bottleneck(s)</div>}
                </ChartCard>
              </div>
            );
          })()}
        </div>

        {/* AI insights + Quick actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(() => {
            const locked = !hasAccess('ai_insights');
            return (
              <div className="relative lg:col-span-2" data-testid="ai-insights-card">
                {locked && <LockedOverlay requiredTier="Pro" />}
                <ChartCard title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-400" /> AI insights</span>}
                  actions={aiInsight ? <Button onClick={getAIInsight} disabled={loadingInsight} variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-white text-xs">{loadingInsight ? 'Analyzing…' : 'Regenerate'}</Button> : null}>
                  {aiInsight ? (
                    <div className="max-h-[260px] overflow-y-auto pr-1"><InsightCards data={aiInsight} /></div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-xs text-muted-foreground mb-3">Get an on-demand read on your pipeline, revenue and churn.</p>
                      <Button onClick={getAIInsight} disabled={loadingInsight} size="sm" className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-8 text-xs">{loadingInsight ? 'Analyzing…' : 'Generate insights'}</Button>
                    </div>
                  )}
                </ChartCard>
              </div>
            );
          })()}

          <ChartCard data-testid="quick-actions" title="Quick actions">
            <div className="space-y-2">
              <Link to="/pipeline" className="block"><Button variant="outline" className="w-full justify-start border-border hover:bg-zinc-900 hover:border-[#0052ff]/40 h-9 text-sm"><Target className="w-4 h-4 mr-2 text-[#4d8bff]" /> Add new deal</Button></Link>
              {(isPro || isEnterprise) && <Link to="/pricing" className="block"><Button variant="outline" className="w-full justify-start border-border hover:bg-zinc-900 hover:border-emerald-500/30 h-9 text-sm"><DollarSign className="w-4 h-4 mr-2 text-emerald-400" /> Analyze pricing</Button></Link>}
              <Link to="/churn" className="block"><Button variant="outline" className="w-full justify-start border-border hover:bg-zinc-900 hover:border-amber-500/30 h-9 text-sm"><Heart className="w-4 h-4 mr-2 text-amber-400" /> Check customer health</Button></Link>
              <Link to="/revenue" className="block"><Button variant="outline" className="w-full justify-start border-border hover:bg-zinc-900 hover:border-violet-500/30 h-9 text-sm"><BarChart3 className="w-4 h-4 mr-2 text-violet-400" /> View full analytics</Button></Link>
            </div>
          </ChartCard>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
