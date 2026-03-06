import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
  Cell,
  Legend
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const COLORS = ['#6366F1', '#8B5CF6', '#06B6D4', '#F59E0B'];

const SalesPerformance = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/sales-performance`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch (err) { console.error('Failed to fetch:', err); }
    finally { setLoading(false); }
  };

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl">
        <p className="text-zinc-400 text-sm mb-1">{label}</p>
        {payload.map((e, i) => (
          <p key={i} className="text-sm font-medium" style={{ color: e.color }}>
            {e.name}: {e.name.includes('rate') ? `${e.value}%` : e.name.includes('revenue') || e.name.includes('Revenue') ? fmt(e.value) : e.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="sales-performance-page">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Sales Performance</h1>
          <p className="text-zinc-400 mt-1">Track win rates, deal velocity, and team effectiveness</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-win-rate">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Win Rate</span>
                <div className="p-1.5 rounded bg-emerald-500/10"><Target className="w-4 h-4 text-emerald-400" /></div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">{data?.win_rate || 0}%</div>
              <div className="flex items-center gap-1 mt-2 text-emerald-400 text-xs"><ArrowUpRight className="w-3 h-3" /><span>+3.2% vs last month</span></div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-avg-deal">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Avg Deal Value</span>
                <div className="p-1.5 rounded bg-indigo-500/10"><Award className="w-4 h-4 text-indigo-400" /></div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">{fmt(data?.avg_deal_value || 0)}</div>
              <div className="flex items-center gap-1 mt-2 text-emerald-400 text-xs"><ArrowUpRight className="w-3 h-3" /><span>+5% improvement</span></div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-cycle">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Avg Cycle Days</span>
                <div className="p-1.5 rounded bg-amber-500/10"><Clock className="w-4 h-4 text-amber-400" /></div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">{data?.avg_cycle_days || 0}d</div>
              <div className="flex items-center gap-1 mt-2 text-emerald-400 text-xs"><ArrowDownRight className="w-3 h-3" /><span>-2 days faster</span></div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-velocity">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Deal Velocity</span>
                <div className="p-1.5 rounded bg-cyan-500/10"><Zap className="w-4 h-4 text-cyan-400" /></div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">{data?.deal_velocity || 0}/mo</div>
              <div className="flex items-center gap-1 mt-2 text-zinc-400 text-xs"><span>{data?.total_active || 0} active deals</span></div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="performance-trend-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingUp className="w-5 h-5 text-emerald-400" /> Performance Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.monthly_performance || []}>
                    <defs>
                      <linearGradient id="perfRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" stroke="#6366F1" fill="url(#perfRev)" strokeWidth={2} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="win-loss-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <BarChart3 className="w-5 h-5 text-indigo-400" /> Win/Loss Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.monthly_performance || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="deals_won" name="Won" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="deals_lost" name="Lost" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stage Velocity */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="stage-velocity">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Clock className="w-5 h-5 text-amber-400" /> Stage Velocity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(data?.stage_velocity || []).map((stage, i) => (
                <div key={i} className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="text-sm font-medium text-white">{stage.stage}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-zinc-400">Deals</span><span className="text-white font-mono">{stage.count}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-zinc-400">Avg Value</span><span className="text-emerald-400 font-mono">{fmt(stage.avg_value)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-zinc-400">Avg Days</span><span className="text-amber-400 font-mono">{stage.avg_days}d</span></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Deals */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="top-deals">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Award className="w-5 h-5 text-purple-400" /> Top Active Deals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.top_deals?.length > 0 ? (
              <div className="space-y-3">
                {data.top_deals.map((deal, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                      <div>
                        <h4 className="text-white font-medium text-sm">{deal.name}</h4>
                        <p className="text-zinc-400 text-xs">{deal.company}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-400 font-medium text-sm">{fmt(deal.value)}</div>
                      <span className="text-xs text-zinc-400 capitalize">{deal.stage?.replace('_', ' ')} &middot; {deal.probability}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500 text-sm">No active deals yet. Add deals in Sales Pipeline to see performance data.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SalesPerformance;
