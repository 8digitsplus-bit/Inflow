import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  TrendingUp, 
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
  Lock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
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

// Map onboarding goals to dashboard sections for ordering priority
const GOAL_TO_SECTION = {
  pipeline: ['pipeline_dist', 'recent_deals'],
  pricing: ['ai_insights'],
  churn: ['churn_widget'],
  cro: ['cro_widget'],
  revenue: ['revenue_chart'],
};

const Dashboard = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [churnData, setChurnData] = useState(null);
  const [croData, setCroData] = useState(null);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

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
  }, []);

  const fetchAllData = async () => {
    try {
      const [analyticsRes, churnRes, croRes, dealsRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/revenue`, { credentials: 'include' }),
        fetch(`${API_URL}/api/analytics/churn`, { credentials: 'include' }),
        fetch(`${API_URL}/api/analytics/cro`, { credentials: 'include' }),
        fetch(`${API_URL}/api/deals`, { credentials: 'include' })
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
          data: { analytics, churnData, croData }
        })
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

  const formatCurrency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem', padding: '0.75rem' }}>
        <p className="text-zinc-400 text-sm mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' && entry.name.toLowerCase().includes('revenue') ? formatCurrency(entry.value) : `${entry.value}${entry.name.toLowerCase().includes('rate') ? '%' : ''}`}
          </p>
        ))}
      </div>
    );
  };

  const getHealthColor = (score) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const recentDeals = deals.slice(0, 5);
  const stageColors = { lead: '#6366F1', qualified: '#8B5CF6', proposal: '#06B6D4', negotiation: '#F59E0B', closed_won: '#10B981', closed_lost: '#EF4444' };
  const pieData = analytics?.stage_breakdown?.filter(s => !['closed_won', 'closed_lost'].includes(s.stage) && s.count > 0) || [];

  // Locked section overlay
  const LockedOverlay = ({ requiredTier }) => (
    <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
      <Lock className="w-6 h-6 text-zinc-500 mb-2" />
      <p className="text-zinc-400 text-xs mb-2">Available on {requiredTier}+</p>
      <Link to="/settings">
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 h-7 text-xs px-3">
          Upgrade
        </Button>
      </Link>
    </div>
  );

  // Determine which health sections to prioritize based on goals
  const goalSections = userGoals.flatMap(g => GOAL_TO_SECTION[g] || []);
  const isGoalHighlighted = (section) => goalSections.includes(section);

  // Order health row: churn, cro, ai - but prioritize goal-matched ones
  const healthSections = ['churn_widget', 'cro_widget', 'ai_insights'];
  const sortedHealthSections = [...healthSections].sort((a, b) => {
    const aGoal = isGoalHighlighted(a) ? 0 : 1;
    const bGoal = isGoalHighlighted(b) ? 0 : 1;
    return aGoal - bGoal;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="dashboard-main">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Welcome back, {user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-zinc-400 mt-1">
              {userGoals.length > 0 
                ? `Focused on ${userGoals.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', ')}`
                : "Here's your complete business overview"
              }
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              isEnterprise ? 'bg-purple-500/20 text-purple-400' :
              isPro ? 'bg-indigo-500/20 text-indigo-400' :
              isEssential ? 'bg-cyan-500/20 text-cyan-400' :
              isTrial ? 'bg-amber-500/20 text-amber-400' :
              isExpired || isCancelled ? 'bg-red-500/20 text-red-400' :
              'bg-zinc-700 text-zinc-300'
            }`} data-testid="tier-badge">
              {isTrial ? `Trial · ${trialDaysLeft}d left` : isExpired ? 'Trial Expired' : isCancelled ? 'Cancelled' : `${tierLabel.charAt(0).toUpperCase() + tierLabel.slice(1)} Plan`}
            </span>
          </div>
        </div>

        {/* Key Metrics - Available to all */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-zinc-950/50 border-white/10 hover:border-indigo-500/30 transition-colors" data-testid="metric-pipeline">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400"><DollarSign className="w-5 h-5" /></div>
                <span className="text-xs font-medium flex items-center gap-1 text-emerald-400"><TrendingUp className="w-3 h-3" /> +12.5%</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold text-white truncate" style={{ fontFamily: 'Outfit' }}>{formatCurrency(analytics?.total_pipeline || 0)}</div>
              <div className="text-xs sm:text-sm text-zinc-400 mt-1">Total Pipeline</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10 hover:border-emerald-500/30 transition-colors" data-testid="metric-revenue">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><TrendingUp className="w-5 h-5" /></div>
                <span className="text-xs font-medium flex items-center gap-1 text-emerald-400"><TrendingUp className="w-3 h-3" /> +8.2%</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold text-white truncate" style={{ fontFamily: 'Outfit' }}>{formatCurrency(analytics?.closed_revenue || 0)}</div>
              <div className="text-xs sm:text-sm text-zinc-400 mt-1">Closed Revenue</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10 hover:border-cyan-500/30 transition-colors" data-testid="metric-winrate">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400"><Target className="w-5 h-5" /></div>
                <span className="text-xs font-medium flex items-center gap-1 text-emerald-400"><TrendingUp className="w-3 h-3" /> +3.1%</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>{analytics?.win_rate || 0}%</div>
              <div className="text-xs sm:text-sm text-zinc-400 mt-1">Win Rate</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10 hover:border-amber-500/30 transition-colors" data-testid="metric-deals">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400"><Users className="w-5 h-5" /></div>
                <span className="text-xs font-medium flex items-center gap-1 text-emerald-400"><TrendingUp className="w-3 h-3" /> +5</span>
              </div>
              <div className="text-lg sm:text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>{analytics?.total_deals || 0}</div>
              <div className="text-xs sm:text-sm text-zinc-400 mt-1">Active Deals</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Charts Row */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className={`lg:col-span-2 bg-zinc-950/50 border-white/10 ${isGoalHighlighted('revenue_chart') ? 'ring-1 ring-indigo-500/30' : ''}`} data-testid="revenue-chart">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <BarChart3 className="w-5 h-5 text-indigo-400" /> Revenue Trend
                  {isGoalHighlighted('revenue_chart') && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">Priority</span>}
                </CardTitle>
                <Link to="/revenue"><Button variant="ghost" size="sm" className="text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10">View All <ArrowRight className="w-4 h-4 ml-1" /></Button></Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] sm:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics?.monthly_data || []}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#27272A' }} />
                    <Area type="monotone" dataKey="revenue" stroke="#6366F1" fill="url(#colorRevenue)" strokeWidth={2} name="Revenue" />
                    <Area type="monotone" dataKey="forecast" stroke="#10B981" fill="url(#colorForecast)" strokeWidth={2} strokeDasharray="5 5" name="Forecast" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className={`bg-zinc-950/50 border-white/10 ${isGoalHighlighted('pipeline_dist') ? 'ring-1 ring-purple-500/30' : ''}`} data-testid="pipeline-distribution">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <PieChart className="w-5 h-5 text-purple-400" /> Pipeline
                  {isGoalHighlighted('pipeline_dist') && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Priority</span>}
                </CardTitle>
                <Link to="/pipeline"><Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white"><ArrowRight className="w-4 h-4" /></Button></Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pieData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="stage" tick={{ fill: '#a1a1aa', fontSize: 12, textTransform: 'capitalize' }} width={80} tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                    <Tooltip contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '8px', color: '#fff' }} itemStyle={{ color: '#A1A1AA' }} formatter={(v) => [`${v} deals`, 'Count']} cursor={{ fill: 'rgba(39, 39, 42, 0.3)' }} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                      {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={stageColors[entry.stage] || '#6366F1'} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Health Metrics Row - tier gated, goal ordered */}
        <div className="grid md:grid-cols-3 gap-6">
          {sortedHealthSections.map((section) => {
            if (section === 'churn_widget') {
              const locked = !hasAccess('churn_widget');
              return (
                <Card key={section} className={`relative bg-gradient-to-br from-emerald-500/5 to-zinc-950/50 ${locked ? 'border-zinc-800' : isGoalHighlighted('churn_widget') ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-emerald-500/20'}`} data-testid="churn-widget">
                  {locked && <LockedOverlay requiredTier="Essential" />}
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                        <Heart className="w-4 h-4 text-emerald-400" /> Customer Health
                        {isGoalHighlighted('churn_widget') && !locked && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Priority</span>}
                      </CardTitle>
                      <Link to="/churn"><Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white h-8 px-2"><ArrowRight className="w-4 h-4" /></Button></Link>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className={`text-xl sm:text-3xl font-bold ${getHealthColor(churnData?.health_score || 0)}`} style={{ fontFamily: 'Outfit' }}>{churnData?.health_score || 0}</div>
                        <p className="text-xs text-zinc-400">Health Score</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-emerald-400">{churnData?.retention_rate || 0}%</div>
                        <p className="text-xs text-zinc-400">Retention</p>
                      </div>
                    </div>
                    <Progress value={churnData?.health_score || 0} className="h-2" />
                    {churnData?.at_risk_count > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs"><AlertTriangle className="w-3 h-3" />{churnData.at_risk_count} at-risk customers</div>
                    )}
                  </CardContent>
                </Card>
              );
            }

            if (section === 'cro_widget') {
              const locked = !hasAccess('cro_widget');
              return (
                <Card key={section} className={`relative bg-gradient-to-br from-cyan-500/5 to-zinc-950/50 ${locked ? 'border-zinc-800' : isGoalHighlighted('cro_widget') ? 'border-cyan-500/40 ring-1 ring-cyan-500/20' : 'border-cyan-500/20'}`} data-testid="cro-widget">
                  {locked && <LockedOverlay requiredTier="Pro" />}
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                        <Zap className="w-4 h-4 text-cyan-400" /> Conversion Rate
                        {isGoalHighlighted('cro_widget') && !locked && <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">Priority</span>}
                      </CardTitle>
                      <Link to="/cro"><Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white h-8 px-2"><ArrowRight className="w-4 h-4" /></Button></Link>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-xl sm:text-3xl font-bold text-cyan-400" style={{ fontFamily: 'Outfit' }}>{croData?.overall_conversion || 0}%</div>
                        <p className="text-xs text-zinc-400">Overall Conversion</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-white">{croData?.won_deals || 0}</div>
                        <p className="text-xs text-zinc-400">Won Deals</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {croData?.funnel_data?.slice(0, 5).map((stage, i) => (
                        <div key={i} className="flex-1 h-8 rounded bg-cyan-500/20 relative overflow-hidden" title={`${stage.stage}: ${stage.conversion}%`}>
                          <div className="absolute bottom-0 left-0 right-0 bg-cyan-500 transition-all" style={{ height: `${stage.conversion}%` }} />
                        </div>
                      ))}
                    </div>
                    {croData?.bottlenecks?.length > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs"><AlertTriangle className="w-3 h-3" />{croData.bottlenecks.length} bottleneck(s) detected</div>
                    )}
                  </CardContent>
                </Card>
              );
            }

            if (section === 'ai_insights') {
              const locked = !hasAccess('ai_insights');
              return (
                <Card key={section} className={`relative bg-gradient-to-br from-purple-500/10 to-indigo-500/5 ${locked ? 'border-zinc-800' : isGoalHighlighted('ai_insights') ? 'border-purple-500/40 ring-1 ring-purple-500/20' : 'border-purple-500/20'}`} data-testid="ai-insights-card">
                  {locked && <LockedOverlay requiredTier="Pro" />}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                      <Sparkles className="w-4 h-4 text-purple-400" /> AI Insights
                      {isGoalHighlighted('ai_insights') && !locked && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Priority</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {aiInsight ? (
                      <div className="text-zinc-300 text-xs leading-relaxed max-h-[120px] overflow-y-auto">{aiInsight.substring(0, 300)}...</div>
                    ) : (
                      <div className="text-center py-4">
                        <Button onClick={getAIInsight} disabled={loadingInsight} size="sm" className="bg-purple-600 hover:bg-purple-500 h-8 text-xs">
                          {loadingInsight ? 'Analyzing...' : 'Generate Insights'}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            }

            return null;
          })}
        </div>

        {/* Recent Deals & Quick Actions */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className={`lg:col-span-2 bg-zinc-950/50 border-white/10 ${isGoalHighlighted('recent_deals') ? 'ring-1 ring-indigo-500/20' : ''}`} data-testid="recent-deals">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <Clock className="w-5 h-5 text-indigo-400" /> Recent Deals
                </CardTitle>
                <Link to="/pipeline"><Button variant="ghost" size="sm" className="text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10">View All <ArrowRight className="w-4 h-4 ml-1" /></Button></Link>
              </div>
            </CardHeader>
            <CardContent>
              {recentDeals.length > 0 ? (
                <div className="space-y-3">
                  {recentDeals.map((deal, i) => (
                    <div key={i} className="flex items-center justify-between p-2 sm:p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: stageColors[deal.stage] || '#6366F1' }} />
                        <div className="min-w-0">
                          <h4 className="text-white font-medium text-xs sm:text-sm truncate">{deal.name}</h4>
                          <p className="text-zinc-400 text-[10px] sm:text-xs truncate">{deal.company}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-emerald-400 font-medium text-xs sm:text-sm">{formatCurrency(deal.value)}</div>
                        <span className={`text-xs px-2 py-0.5 rounded capitalize ${deal.stage === 'closed_won' ? 'bg-emerald-500/20 text-emerald-400' : deal.stage === 'closed_lost' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-700 text-zinc-300'}`}>{deal.stage.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <Target className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No deals yet</p>
                  <Link to="/pipeline"><Button size="sm" className="mt-3 bg-indigo-600 hover:bg-indigo-500">Create Your First Deal</Button></Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="quick-actions">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/pipeline" className="block">
                <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-indigo-500/30">
                  <Target className="w-4 h-4 mr-2 text-indigo-400" /> Add New Deal
                </Button>
              </Link>
              {(isPro || isEnterprise) && (
                <Link to="/pricing" className="block">
                  <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-emerald-500/30">
                    <DollarSign className="w-4 h-4 mr-2 text-emerald-400" /> Analyze Pricing
                  </Button>
                </Link>
              )}
              <Link to="/churn" className="block">
                <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-amber-500/30">
                  <Heart className="w-4 h-4 mr-2 text-amber-400" /> Check Customer Health
                </Button>
              </Link>
              {(isPro || isEnterprise) && (
                <Link to="/cro" className="block">
                  <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-cyan-500/30">
                    <Zap className="w-4 h-4 mr-2 text-cyan-400" /> Optimize Conversions
                  </Button>
                </Link>
              )}
              <Link to="/revenue" className="block">
                <Button variant="outline" className="w-full justify-start border-zinc-800 hover:bg-zinc-900 hover:border-purple-500/30">
                  <BarChart3 className="w-4 h-4 mr-2 text-purple-400" /> View Full Analytics
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
