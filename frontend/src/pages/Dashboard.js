import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { AIResponseRenderer } from '../components/AIResponseRenderer';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Users,
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
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Tier access map: which tier can access which sections
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

const CARD = 'rounded-xl border border-white/[0.07] bg-zinc-950/40 backdrop-blur-sm';

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
  const [selectedSources, setSelectedSources] = useState([]); // empty = all sources

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
      if (r.ok) {
        const platforms = await r.json();
        setConnectedSources(platforms.filter((p) => p.connected));
      }
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
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAIInsight = async () => {
    if (!hasAccess('ai_insights')) return;
    setLoadingInsight(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          context: `Analyze this business data and provide strategic insights: Total Pipeline: $${analytics?.total_pipeline || 0}, Win Rate: ${analytics?.win_rate || 0}%, Churn Rate: ${churnData?.churn_rate || 0}%, Conversion Rate: ${croData?.overall_conversion || 0}%`,
          data: { analytics, churnData, croData },
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setAiInsight(data.insight);
      }
    } catch (error) {
      console.error('Failed to get AI insight:', error);
    } finally {
      setLoadingInsight(false);
    }
  };

  const formatCurrency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', lineHeight: '1.4' }}>
        <p style={{ color: '#a1a1aa', marginBottom: '2px', fontWeight: 500 }}>{label}</p>
        {payload.map((entry, index) => {
          const name = (entry.name || '').toLowerCase();
          const isMoney = name.includes('revenue') || name.includes('forecast') || name.includes('pipeline');
          const isRate = name.includes('rate');
          return (
            <p key={index} style={{ color: entry.color, margin: 0 }}>
              {entry.name}: {isMoney ? formatCurrency(entry.value) : isRate ? `${entry.value}%` : entry.value}
            </p>
          );
        })}
      </div>
    );
  };

  const getHealthColor = (score) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const recentDeals = deals.slice(0, 5);
  const stageColors = STAGE_COLORS;
  const monthly = analytics?.monthly_data || [];
  const pieData = analytics?.stage_breakdown?.filter((s) => !['closed_won', 'closed_lost'].includes(s.stage) && s.count > 0) || [];

  // Real month-over-month revenue delta (no fabricated numbers)
  const revDelta = (() => {
    if (monthly.length < 2) return null;
    const last = monthly[monthly.length - 1]?.revenue || 0;
    const prev = monthly[monthly.length - 2]?.revenue || 0;
    if (!prev) return null;
    return ((last - prev) / prev) * 100;
  })();

  const LockedOverlay = ({ requiredTier }) => (
    <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
      <Lock className="w-6 h-6 text-zinc-500 mb-2" />
      <p className="text-zinc-400 text-xs mb-2">Available on {requiredTier}+</p>
      <Link to="/settings">
        <Button size="sm" className="bg-white/10 hover:bg-white/20 h-7 text-xs px-3">Upgrade</Button>
      </Link>
    </div>
  );

  // Efferd-style KPI stat card
  const Kpi = ({ label, value, icon: Icon, accent, delta, sub, testid }) => (
    <div className={`${CARD} p-4 transition-colors hover:border-white/[0.14]`} data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent}`}><Icon className="w-3.5 h-3.5" /></span>
      </div>
      <div className="text-2xl sm:text-[28px] leading-tight font-bold text-white mt-3 truncate" style={{ fontFamily: 'Outfit' }}>{value}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {delta != null && (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        <span className="text-zinc-500">{sub}</span>
      </div>
    </div>
  );

  const stageBadge = (stage) => {
    const cls = stage === 'closed_won'
      ? 'bg-emerald-500/15 text-emerald-400'
      : stage === 'closed_lost'
        ? 'bg-red-500/15 text-red-400'
        : 'bg-white/[0.06] text-zinc-300';
    return <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${cls}`}>{(stage || '').replace('_', ' ')}</span>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-5" data-testid="dashboard-main">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Welcome back, {user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              {userGoals.length > 0
                ? `Focused on ${userGoals.map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(', ')}`
                : "Here's your complete business overview"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              isEnterprise ? 'bg-[#0052ff]/15 text-[#4d8bff]' :
              isPro ? 'bg-slate-500/20 text-slate-300' :
              isEssential ? 'bg-cyan-500/20 text-cyan-400' :
              isTrial ? 'bg-amber-500/20 text-amber-400' :
              isExpired || isCancelled ? 'bg-red-500/20 text-red-400' :
              'bg-zinc-700 text-zinc-300'
            }`} data-testid="tier-badge">
              {isTrial ? `Trial · ${trialDaysLeft}d left` : isExpired ? 'Trial Expired' : isCancelled ? 'Cancelled' : `${tierLabel.charAt(0).toUpperCase() + tierLabel.slice(1)} Plan`}
            </span>
          </div>
        </div>

        {/* Source Filter Dropdown — visible only when integrations exist */}
        {connectedSources.length > 0 && (() => {
          const manualOnly = selectedSources.length === 1 && selectedSources[0] === 'manual';
          const allActive = selectedSources.length === 0;
          const triggerLabel = allActive
            ? 'All sources'
            : manualOnly
              ? 'Manual only'
              : selectedSources.length === 1
                ? (connectedSources.find((c) => c.platform_id === selectedSources[0])?.name || selectedSources[0])
                : `${selectedSources.length} sources`;
          const togglePlatform = (pid) => {
            setSelectedSources((prev) => {
              const withoutManual = prev.filter((p) => p !== 'manual');
              return withoutManual.includes(pid)
                ? withoutManual.filter((p) => p !== pid)
                : [...withoutManual, pid];
            });
          };
          return (
            <div className="flex items-center gap-2" data-testid="source-filter">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">Filter</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-zinc-200 border border-zinc-800 hover:border-slate-500/50 hover:bg-zinc-800 transition-colors"
                    data-testid="source-filter-trigger"
                  >
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span>{triggerLabel}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60 bg-zinc-950 border-zinc-800 text-zinc-200" data-testid="source-filter-menu">
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Data sources</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <button
                    type="button"
                    onClick={() => setSelectedSources([])}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-zinc-900 ${allActive ? 'text-slate-400' : 'text-zinc-200'}`}
                    data-testid="source-filter-all"
                  >
                    <Check className={`w-3.5 h-3.5 ${allActive ? 'opacity-100' : 'opacity-0'}`} />
                    All sources
                  </button>
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  {connectedSources.map((s) => {
                    const active = selectedSources.includes(s.platform_id);
                    const role = s.revenue_role || s.default_revenue_role || 'revenue';
                    const dotClass = role === 'revenue' ? 'bg-emerald-400' : role === 'pipeline' ? 'bg-slate-400' : 'bg-amber-400';
                    return (
                      <DropdownMenuCheckboxItem
                        key={s.platform_id}
                        checked={active}
                        onCheckedChange={() => togglePlatform(s.platform_id)}
                        className="text-sm focus:bg-zinc-900 focus:text-white data-[state=checked]:text-slate-400"
                        data-testid={`source-filter-${s.platform_id}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full mr-2 ${dotClass}`} />
                        <span className="flex-1">{s.name}</span>
                        <span className="text-[10px] uppercase text-zinc-500 ml-2">{role}</span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                  <DropdownMenuSeparator className="bg-zinc-800" />
                  <button
                    type="button"
                    onClick={() => setSelectedSources(manualOnly ? [] : ['manual'])}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-zinc-900 ${manualOnly ? 'text-slate-400' : 'text-zinc-200'}`}
                    data-testid="source-filter-manual"
                  >
                    <Check className={`w-3.5 h-3.5 ${manualOnly ? 'opacity-100' : 'opacity-0'}`} />
                    Manual deals only
                  </button>
                </DropdownMenuContent>
              </DropdownMenu>
              {!allActive && (
                <button type="button" onClick={() => setSelectedSources([])} className="text-[11px] text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline" data-testid="source-filter-clear">Clear</button>
              )}
            </div>
          );
        })()}

        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Total Pipeline" value={formatCurrency(analytics?.total_pipeline)} icon={DollarSign} accent="bg-[#0052ff]/12 text-[#4d8bff]" delta={null} sub="across all stages" testid="metric-pipeline" />
          <Kpi label="Closed Revenue" value={formatCurrency(analytics?.closed_revenue)} icon={TrendingUp} accent="bg-emerald-500/12 text-emerald-400" delta={revDelta} sub="vs last month" testid="metric-revenue" />
          <Kpi label="Win Rate" value={`${analytics?.win_rate || 0}%`} icon={Target} accent="bg-cyan-500/12 text-cyan-400" delta={null} sub={`${croData?.won_deals || 0} won`} testid="metric-winrate" />
          <Kpi label="Active Deals" value={analytics?.total_deals || 0} icon={Users} accent="bg-amber-500/12 text-amber-400" delta={null} sub="in pipeline" testid="metric-deals" />
        </div>

        {/* Charts row: Revenue bar + Pipeline distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${CARD} p-5`} data-testid="revenue-chart">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <BarChart3 className="w-4 h-4 text-[#4d8bff]" /> Revenue Trend
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Monthly closed revenue</p>
              </div>
              <div className="flex items-center gap-3">
                {revDelta != null && (
                  <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${revDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {revDelta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}{Math.abs(revDelta).toFixed(1)}%
                  </span>
                )}
                <Link to="/revenue"><Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-[#4d8bff] hover:bg-[#0052ff]/10 text-xs">View all <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button></Link>
              </div>
            </div>
            <div className="h-[240px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ left: -12, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c20" vertical={false} />
                  <XAxis dataKey="month" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`)} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="revenue" fill="#0052ff" radius={[4, 4, 0, 0]} maxBarSize={40} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${CARD} p-5`} data-testid="pipeline-distribution">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <PieChart className="w-4 h-4 text-purple-400" /> Pipeline by stage
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Open deals across your funnel</p>
              </div>
              <Link to="/pipeline"><Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-white text-xs">View all <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button></Link>
            </div>
            <div className="h-[240px] mt-4">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pieData} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="stage" tick={{ fill: '#a1a1aa', fontSize: 11 }} width={82} tickLine={false} axisLine={false} tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                    <Tooltip contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '8px', color: '#fff', fontSize: '11px' }} itemStyle={{ color: '#A1A1AA' }} formatter={(v) => [`${v} deals`, 'Count']} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="count" radius={[0, 5, 5, 0]} barSize={16}>
                      {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={stageColors[entry.stage] || '#0052FF'} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">No open pipeline yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Recent deals table + health + conversion */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className={`${CARD} p-5 lg:col-span-2`} data-testid="recent-deals">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <Clock className="w-4 h-4 text-slate-400" /> Recent deals
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Latest activity across your pipeline</p>
              </div>
              <Link to="/pipeline"><Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-white text-xs">View all <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button></Link>
            </div>
            {recentDeals.length > 0 ? (
              <div className="mt-3">
                <div className="grid grid-cols-[1.2fr_1.4fr_0.9fr_0.9fr] text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06] pb-2">
                  <span>Company</span>
                  <span>Deal</span>
                  <span className="text-right">Value</span>
                  <span className="text-right">Stage</span>
                </div>
                {recentDeals.map((deal, i) => (
                  <div key={i} className="grid grid-cols-[1.2fr_1.4fr_0.9fr_0.9fr] items-center py-2.5 border-b border-white/[0.04] last:border-0 text-sm" data-testid={`deal-row-${i}`}>
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: stageColors[deal.stage] || '#0052FF' }} />
                      <span className="text-zinc-300 truncate">{deal.company || '—'}</span>
                    </span>
                    <span className="text-white truncate pr-2">{deal.name}</span>
                    <span className="text-right text-white font-medium whitespace-nowrap">{formatCurrency(deal.value)}</span>
                    <span className="text-right">{stageBadge(deal.stage)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-zinc-500">
                <Target className="w-9 h-9 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No deals yet</p>
                <Link to="/pipeline"><Button size="sm" className="mt-3 bg-white/10 hover:bg-white/20">Create your first deal</Button></Link>
              </div>
            )}
          </div>

          {/* Customer Health (billing-health analog) */}
          {(() => {
            const locked = !hasAccess('churn_widget');
            return (
              <div className={`relative ${CARD} p-5`} data-testid="churn-widget">
                {locked && <LockedOverlay requiredTier="Essential" />}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Heart className="w-4 h-4 text-emerald-400" /> Customer health
                  </h3>
                  <Link to="/churn"><Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-white"><ArrowRight className="w-4 h-4" /></Button></Link>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className={`text-3xl font-bold ${getHealthColor(churnData?.health_score || 0)}`} style={{ fontFamily: 'Outfit' }}>{churnData?.health_score || 0}</div>
                    <p className="text-xs text-zinc-500 mt-0.5">Health score</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-emerald-400">{churnData?.retention_rate || 0}%</div>
                    <p className="text-xs text-zinc-500">Retention</p>
                  </div>
                </div>
                <Progress value={churnData?.health_score || 0} className="h-1.5 mt-4" />
                {churnData?.at_risk_count > 0 ? (
                  <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs"><AlertTriangle className="w-3 h-3" />{churnData.at_risk_count} at-risk customers</div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-emerald-400/80 text-xs"><CheckCircle2 className="w-3 h-3" /> Nothing at risk right now</div>
                )}
              </div>
            );
          })()}

          {/* Conversion (CRO) */}
          {(() => {
            const locked = !hasAccess('cro_widget');
            return (
              <div className={`relative ${CARD} p-5`} data-testid="cro-widget">
                {locked && <LockedOverlay requiredTier="Pro" />}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Zap className="w-4 h-4 text-cyan-400" /> Conversion
                  </h3>
                  <Link to="/cro"><Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-white"><ArrowRight className="w-4 h-4" /></Button></Link>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-bold text-cyan-400" style={{ fontFamily: 'Outfit' }}>{croData?.overall_conversion || 0}%</div>
                    <p className="text-xs text-zinc-500 mt-0.5">Overall conversion</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-white">{croData?.won_deals || 0}</div>
                    <p className="text-xs text-zinc-500">Won deals</p>
                  </div>
                </div>
                <div className="flex gap-1 mt-4">
                  {(croData?.funnel_data?.slice(0, 5) || []).map((stage, i) => (
                    <div key={i} className="flex-1 h-8 rounded bg-cyan-500/15 relative overflow-hidden" title={`${stage.stage}: ${stage.conversion}%`}>
                      <div className="absolute bottom-0 left-0 right-0 bg-cyan-500 transition-all" style={{ height: `${stage.conversion}%` }} />
                    </div>
                  ))}
                </div>
                {croData?.bottlenecks?.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs"><AlertTriangle className="w-3 h-3" />{croData.bottlenecks.length} bottleneck(s)</div>
                )}
              </div>
            );
          })()}
        </div>

        {/* AI Insights + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(() => {
            const locked = !hasAccess('ai_insights');
            return (
              <div className={`relative ${CARD} p-5 lg:col-span-2`} data-testid="ai-insights-card">
                {locked && <LockedOverlay requiredTier="Pro" />}
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Sparkles className="w-4 h-4 text-purple-400" /> AI insights
                  </h3>
                  {aiInsight && (
                    <Button onClick={getAIInsight} disabled={loadingInsight} variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-white text-xs">{loadingInsight ? 'Analyzing…' : 'Regenerate'}</Button>
                  )}
                </div>
                {aiInsight ? (
                  <div className="max-h-[160px] overflow-y-auto pr-1"><AIResponseRenderer text={aiInsight.substring(0, 400)} /></div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-xs text-zinc-500 mb-3">Get an on-demand read on your pipeline, revenue and churn.</p>
                    <Button onClick={getAIInsight} disabled={loadingInsight} size="sm" className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-8 text-xs">
                      {loadingInsight ? 'Analyzing…' : 'Generate insights'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}

          <div className={`${CARD} p-5`} data-testid="quick-actions">
            <h3 className="text-sm font-semibold text-white mb-3" style={{ fontFamily: 'Outfit' }}>Quick actions</h3>
            <div className="space-y-2">
              <Link to="/pipeline" className="block">
                <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-[#0052ff]/40 h-9 text-sm">
                  <Target className="w-4 h-4 mr-2 text-[#4d8bff]" /> Add new deal
                </Button>
              </Link>
              {(isPro || isEnterprise) && (
                <Link to="/pricing" className="block">
                  <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-emerald-500/30 h-9 text-sm">
                    <DollarSign className="w-4 h-4 mr-2 text-emerald-400" /> Analyze pricing
                  </Button>
                </Link>
              )}
              <Link to="/churn" className="block">
                <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-amber-500/30 h-9 text-sm">
                  <Heart className="w-4 h-4 mr-2 text-amber-400" /> Check customer health
                </Button>
              </Link>
              <Link to="/revenue" className="block">
                <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-purple-500/30 h-9 text-sm">
                  <BarChart3 className="w-4 h-4 mr-2 text-purple-400" /> View full analytics
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
