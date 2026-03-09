import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import {
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  BarChart3,
  Target,
  Building2,
  PieChart as PieChartIcon
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
  PieChart,
  Pie,
  Legend
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const COLORS = ['#6366F1', '#8B5CF6', '#06B6D4', '#F59E0B', '#10B981'];

const SalesRevenue = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/sales-revenue`, { credentials: 'include' });
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
            {e.name}: {e.name.includes('rate') || e.name.includes('Growth') ? `${e.value}%` : fmt(e.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="sales-revenue-page">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Sales Revenue</h1>
          <p className="text-zinc-400 mt-1">Revenue tracking, MRR/ARR, and growth analytics</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-total-revenue">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Total Revenue</span>
                <div className="p-1.5 rounded bg-emerald-500/10"><DollarSign className="w-4 h-4 text-emerald-400" /></div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">{fmt(data?.total_revenue || 0)}</div>
              <div className="flex items-center gap-1 mt-2 text-emerald-400 text-xs"><ArrowUpRight className="w-3 h-3" /><span>+{data?.revenue_growth || 0}% growth</span></div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-mrr">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">MRR</span>
                <div className="p-1.5 rounded bg-indigo-500/10"><TrendingUp className="w-4 h-4 text-indigo-400" /></div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">{fmt(data?.mrr || 0)}</div>
              <div className="text-xs text-zinc-400 mt-2">ARR: {fmt(data?.arr || 0)}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-pipeline">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Pipeline Value</span>
                <div className="p-1.5 rounded bg-purple-500/10"><Target className="w-4 h-4 text-purple-400" /></div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">{fmt(data?.pipeline_value || 0)}</div>
              <div className="text-xs text-zinc-400 mt-2">Weighted: {fmt(data?.weighted_pipeline || 0)}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-avg-deal">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Avg Deal Size</span>
                <div className="p-1.5 rounded bg-amber-500/10"><BarChart3 className="w-4 h-4 text-amber-400" /></div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">{fmt(data?.avg_deal_size || 0)}</div>
              <div className="text-xs text-zinc-400 mt-2">Target: {data?.target_attainment || 0}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="revenue-trend-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingUp className="w-5 h-5 text-emerald-400" /> Revenue vs Target
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.monthly_revenue || []}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="tgtGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke="#10B981" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                    <Area type="monotone" dataKey="target" stroke="#6366F1" fill="url(#tgtGrad)" strokeWidth={2} strokeDasharray="5 5" name="Target" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="revenue-by-stage-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <PieChartIcon className="w-5 h-5 text-purple-400" /> Revenue by Stage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(data?.revenue_by_stage || []).filter(s => s.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="stage"
                      label={({ stage, percent }) => `${stage} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#52525B', strokeWidth: 1 }}
                    >
                      {(data?.revenue_by_stage || []).filter(s => s.value > 0).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmt(value)} contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '8px' }} />
                    <Legend formatter={(value) => <span style={{ color: '#A1A1AA', fontSize: '12px' }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Growth Rate Bar */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="growth-chart">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <BarChart3 className="w-5 h-5 text-indigo-400" /> Monthly Growth Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.monthly_revenue || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                  <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                  <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="growth_rate" name="Growth Rate" radius={[4, 4, 0, 0]}>
                    {(data?.monthly_revenue || []).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Accounts */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="top-accounts">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Building2 className="w-5 h-5 text-cyan-400" /> Top Accounts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.top_accounts?.length > 0 ? (
              <div className="space-y-3">
                {data.top_accounts.map((acct, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                      <div>
                        <h4 className="text-white font-medium text-sm">{acct.company}</h4>
                        <p className="text-zinc-400 text-xs">{acct.deals} deal{acct.deals > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-emerald-400 font-medium text-sm font-mono">{fmt(acct.value)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500 text-sm">No account data yet. Add deals to see top accounts.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SalesRevenue;
