import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import {
  TrendingUp,
  DollarSign,
  Target,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Lightbulb,
  Activity,
  Sparkles,
  Shield,
  Zap
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
  ComposedChart,
  Bar,
  Legend,
  Line
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const RevenueIntelligence = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/revenue-intelligence`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch (err) { console.error('Failed to fetch:', err); }
    finally { setLoading(false); }
  };

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem', padding: '0.75rem' }}>
        <p className="text-zinc-400 text-sm mb-1">{label}</p>
        {payload.map((e, i) => (
          <p key={i} className="text-sm font-medium" style={{ color: e.color }}>
            {e.name}: {e.name.includes('rate') || e.name.includes('Rate') ? `${e.value}%` : fmt(e.value)}
          </p>
        ))}
      </div>
    );
  };

  const healthColor = {
    strong: 'text-emerald-400',
    moderate: 'text-amber-400',
    weak: 'text-red-400'
  };

  const healthBg = {
    strong: 'bg-emerald-500/10 border-emerald-500/20',
    moderate: 'bg-amber-500/10 border-amber-500/20',
    weak: 'bg-red-500/10 border-red-500/20'
  };

  const trendColor = {
    improving: 'text-emerald-400',
    stable: 'text-amber-400',
    declining: 'text-red-400'
  };

  const priorityColor = {
    high: 'border-red-500/30 bg-red-500/5',
    medium: 'border-amber-500/30 bg-amber-500/5',
    low: 'border-zinc-700 bg-zinc-900/50'
  };

  const priorityIcon = {
    high: <AlertTriangle className="w-4 h-4 text-red-400" />,
    medium: <Lightbulb className="w-4 h-4 text-amber-400" />,
    low: <CheckCircle className="w-4 h-4 text-zinc-400" />
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="revenue-intelligence-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Revenue Intelligence</h1>
            <p className="text-zinc-400 mt-1">Unified overview across pipeline, performance, and revenue</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${healthBg[data?.pipeline_health || 'weak']}`}>
              <span className={healthColor[data?.pipeline_health || 'weak']}>Pipeline: {data?.pipeline_health || 'N/A'}</span>
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${healthBg[data?.performance_trend === 'improving' ? 'strong' : data?.performance_trend === 'stable' ? 'moderate' : 'weak']}`}>
              <span className={trendColor[data?.performance_trend || 'stable']}>Trend: {data?.performance_trend || 'N/A'}</span>
            </span>
          </div>
        </div>

        {/* Top-Level KPIs from all 3 features */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-revenue">
            <CardContent className="p-4">
              <span className="text-zinc-400 text-xs">Total Revenue</span>
              <div className="text-base sm:text-xl font-bold font-mono truncate text-white mt-1">{fmt(data?.total_revenue || 0)}</div>
              <Link to="/sales-revenue" className="text-xs text-slate-400 hover:text-slate-300 mt-1 flex items-center gap-1">Details <ArrowRight className="w-3 h-3" /></Link>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-pipeline">
            <CardContent className="p-4">
              <span className="text-zinc-400 text-xs">Pipeline Value</span>
              <div className="text-base sm:text-xl font-bold font-mono truncate text-white mt-1">{fmt(data?.pipeline_value || 0)}</div>
              <Link to="/pipeline" className="text-xs text-slate-400 hover:text-slate-300 mt-1 flex items-center gap-1">Details <ArrowRight className="w-3 h-3" /></Link>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-weighted">
            <CardContent className="p-4">
              <span className="text-zinc-400 text-xs">Weighted Pipeline</span>
              <div className="text-base sm:text-xl font-bold font-mono truncate text-white mt-1">{fmt(data?.weighted_pipeline || 0)}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-winrate">
            <CardContent className="p-4">
              <span className="text-zinc-400 text-xs">Win Rate</span>
              <div className="text-base sm:text-xl font-bold font-mono truncate text-white mt-1">{data?.win_rate || 0}%</div>
              <Link to="/sales-performance" className="text-xs text-slate-400 hover:text-slate-300 mt-1 flex items-center gap-1">Details <ArrowRight className="w-3 h-3" /></Link>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-avg-deal">
            <CardContent className="p-4">
              <span className="text-zinc-400 text-xs">Avg Deal Size</span>
              <div className="text-base sm:text-xl font-bold font-mono truncate text-white mt-1">{fmt(data?.avg_deal_value || 0)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Deal Snapshot */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-zinc-950/50 border-white/10">
            <CardContent className="p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>{data?.total_deals || 0}</div>
              <p className="text-xs text-zinc-400 mt-1">Total Deals</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10">
            <CardContent className="p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold text-slate-400" style={{ fontFamily: 'Outfit' }}>{data?.active_deals || 0}</div>
              <p className="text-xs text-zinc-400 mt-1">Active</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10">
            <CardContent className="p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold text-emerald-400" style={{ fontFamily: 'Outfit' }}>{data?.deals_won || 0}</div>
              <p className="text-xs text-zinc-400 mt-1">Won</p>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10">
            <CardContent className="p-3 sm:p-4 text-center">
              <div className="text-lg sm:text-2xl font-bold text-red-400" style={{ fontFamily: 'Outfit' }}>{data?.deals_lost || 0}</div>
              <p className="text-xs text-zinc-400 mt-1">Lost</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts: Revenue + Pipeline + Win Rate over time */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-revenue-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingUp className="w-5 h-5 text-emerald-400" /> Revenue & Pipeline Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.monthly_overview || []}>
                    <defs>
                      <linearGradient id="riRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="riPipe" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#64748B" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#64748B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#27272A' }} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke="#10B981" fill="url(#riRev)" strokeWidth={2} name="Revenue" />
                    <Area type="monotone" dataKey="pipeline_added" stroke="#64748B" fill="url(#riPipe)" strokeWidth={2} name="Pipeline Added" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-performance-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <BarChart3 className="w-5 h-5 text-slate-400" /> Win/Loss & Win Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data?.monthly_overview || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis yAxisId="left" stroke="#71717A" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" stroke="#71717A" fontSize={12} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(39, 39, 42, 0.3)' }} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="deals_won" name="Won" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="deals_lost" name="Lost" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="win_rate" stroke="#F59E0B" strokeWidth={2} name="Win Rate" dot={{ fill: '#F59E0B', r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stage Health */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-stage-health">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Activity className="w-5 h-5 text-cyan-400" /> Pipeline Stage Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
              {(data?.stage_health || []).map((stage, i) => (
                <div key={i} className="p-2.5 sm:p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs sm:text-sm font-medium text-white truncate">{stage.stage}</span>
                    <span className="text-[10px] sm:text-xs font-mono text-zinc-400 flex-shrink-0 ml-1">{stage.count} deals</span>
                  </div>
                  <div className="text-sm sm:text-lg font-bold text-emerald-400 font-mono truncate">{fmt(stage.value)}</div>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">Avg Probability</span>
                      <span className="text-white">{stage.avg_probability}%</span>
                    </div>
                    <Progress value={stage.avg_probability} className="h-1.5" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recommendations & Actions */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="ri-recommendations">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Sparkles className="w-5 h-5 text-purple-400" /> Recommendations & Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(data?.recommendations || []).map((rec, i) => (
                <div key={i} className={`p-4 rounded-lg border ${priorityColor[rec.priority]}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{priorityIcon[rec.priority]}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-medium text-sm">{rec.title}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-medium ${
                          rec.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                          rec.priority === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-zinc-700 text-zinc-400'
                        }`}>{rec.priority}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 uppercase">{rec.type}</span>
                      </div>
                      <p className="text-zinc-400 text-sm">{rec.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Shield className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-400 text-xs font-medium">{rec.action}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Navigation */}
        <div className="grid md:grid-cols-3 gap-4">
          <Link to="/pipeline">
            <Card className="bg-gradient-to-br from-slate-500/10 to-slate-500/5 border-slate-500/20 hover:border-slate-500/40 transition-colors cursor-pointer">
              <CardContent className="p-5 flex items-center gap-3">
                <Target className="w-8 h-8 text-slate-400" />
                <div>
                  <h4 className="text-white font-medium">Sales Pipeline</h4>
                  <p className="text-zinc-400 text-xs">Manage deals & stages</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-400 ml-auto" />
              </CardContent>
            </Card>
          </Link>
          <Link to="/sales-performance">
            <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40 transition-colors cursor-pointer">
              <CardContent className="p-5 flex items-center gap-3">
                <Zap className="w-8 h-8 text-emerald-400" />
                <div>
                  <h4 className="text-white font-medium">Sales Performance</h4>
                  <p className="text-zinc-400 text-xs">Win rates & velocity</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-400 ml-auto" />
              </CardContent>
            </Card>
          </Link>
          <Link to="/sales-revenue">
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20 hover:border-purple-500/40 transition-colors cursor-pointer">
              <CardContent className="p-5 flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-purple-400" />
                <div>
                  <h4 className="text-white font-medium">Sales Revenue</h4>
                  <p className="text-zinc-400 text-xs">MRR, ARR & growth</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-400 ml-auto" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default RevenueIntelligence;
