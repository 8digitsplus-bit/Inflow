import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  ArrowUpRight,
  Shield,
  Repeat,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

const SalesRevenue = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/analytics/sales-revenue`, { credentials: 'include' });
        if (res.ok) setData(await res.json());
      } catch (err) { console.error('Failed to fetch:', err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem', padding: '0.75rem' }}>
        <p className="text-zinc-400 text-sm mb-1">{label}</p>
        {payload.map((e, i) => (
          <p key={i} className="text-sm font-medium" style={{ color: e.color || e.stroke }}>
            {e.name}: {fmt(e.value)}
          </p>
        ))}
      </div>
    );
  };

  const riskLevel = (data?.concentration_risk || 0) > 60 ? 'High' : (data?.concentration_risk || 0) > 40 ? 'Medium' : 'Low';
  const riskColor = riskLevel === 'High' ? 'text-red-400' : riskLevel === 'Medium' ? 'text-amber-400' : 'text-emerald-400';

  const expPieData = [
    { name: 'Expansion', value: data?.expansion_revenue || 0, color: '#8B5CF6' },
    { name: 'New', value: data?.new_revenue || 0, color: '#06B6D4' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="sales-revenue-page">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Revenue Analytics</h1>
          <p className="text-zinc-400 mt-1 text-sm">Where is your money coming from? ARPU, concentration risk, and retention</p>
        </div>

        {/* KPIs — Revenue Specific */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-mrr">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">MRR</span>
                <div className="p-1.5 rounded bg-indigo-500/10"><DollarSign className="w-4 h-4 text-indigo-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">{fmt(data?.mrr || 0)}</div>
              <div className="text-zinc-500 text-xs mt-1">ARR: {fmt(data?.arr || 0)}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-arpu">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">ARPU</span>
                <div className="p-1.5 rounded bg-emerald-500/10"><Users className="w-4 h-4 text-emerald-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">{fmt(data?.arpu || 0)}</div>
              <div className="text-zinc-500 text-xs mt-1">{data?.unique_customers || 0} customers</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-nrr">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Net Revenue Retention</span>
                <div className="p-1.5 rounded bg-violet-500/10"><Repeat className="w-4 h-4 text-violet-400" /></div>
              </div>
              <div className={`text-lg sm:text-2xl font-bold font-mono ${(data?.nrr || 100) >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>{data?.nrr || 100}%</div>
              <div className="flex items-center gap-1 mt-1 text-emerald-400 text-xs">{(data?.nrr || 100) >= 100 && <><ArrowUpRight className="w-3 h-3" /><span>Net positive</span></>}</div>
            </CardContent>
          </Card>
          <Card className={`bg-zinc-950/50 border-white/10 ${riskLevel === 'High' ? 'border-red-500/20' : ''}`} data-testid="kpi-concentration">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Concentration Risk</span>
                <div className={`p-1.5 rounded ${riskLevel === 'High' ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                  <AlertTriangle className={`w-4 h-4 ${riskColor}`} />
                </div>
              </div>
              <div className={`text-lg sm:text-2xl font-bold font-mono ${riskColor}`}>{data?.concentration_risk || 0}%</div>
              <div className="text-zinc-500 text-xs mt-1">{riskLevel} — top 3 accounts</div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Trend + Expansion vs New */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="bg-zinc-950/50 border-white/10 lg:col-span-2" data-testid="revenue-trend-chart">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Revenue vs Target
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.monthly_revenue || []}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#27272A' }} />
                    <Area type="monotone" dataKey="target" stroke="#3f3f46" fill="none" strokeDasharray="5 5" strokeWidth={1.5} name="Target" />
                    <Area type="monotone" dataKey="revenue" stroke="#6366F1" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="expansion-new-chart">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Shield className="w-4 h-4 text-violet-400" /> Revenue Mix
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expPieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3}>
                      {expPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem' }} itemStyle={{ color: '#e4e4e7' }} formatter={(v) => fmt(v)} cursor={{ fill: 'rgba(39, 39, 42, 0.3)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" /> Expansion</span>
                  <span className="text-white font-mono">{fmt(data?.expansion_revenue || 0)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-500" /> New Revenue</span>
                  <span className="text-white font-mono">{fmt(data?.new_revenue || 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Accounts by Revenue */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="top-accounts">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Users className="w-4 h-4 text-cyan-400" /> Top Accounts by Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data?.top_accounts || []).map((a, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                    <span className="text-zinc-300 text-sm truncate">{a.company}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-white font-mono text-sm">{fmt(a.value)}</span>
                    <div className="w-16">
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${a.pct}%` }} />
                      </div>
                    </div>
                    <span className="text-zinc-500 text-xs w-10 text-right">{a.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SalesRevenue;
