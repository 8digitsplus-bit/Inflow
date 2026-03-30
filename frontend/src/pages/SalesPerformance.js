import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Target,
  Award,
  Clock,
  ArrowDownRight,
  BarChart3,
  XCircle,
  Timer,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);
const AGING_COLORS = ['#10B981', '#6366F1', '#F59E0B', '#EF4444'];
const AGING_LABELS = { '7d': '0-7 days', '14d': '8-14 days', '30d': '15-30 days', '60d+': '31+ days' };
const SIZE_COLORS = ['#06B6D4', '#8B5CF6', '#6366F1', '#F59E0B'];

const SalesPerformance = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/analytics/sales-performance`, { credentials: 'include' });
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
          <p key={i} className="text-sm font-medium" style={{ color: e.color || e.fill }}>
            {e.name}: {typeof e.value === 'number' && e.value > 100 ? fmt(e.value) : e.value}
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
          <p className="text-zinc-400 mt-1 text-sm">How well are you closing? Cycle time, aging, and close rates by deal size</p>
        </div>

        {/* KPIs — Performance Specific */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-win-rate">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Win Rate</span>
                <div className="p-1.5 rounded bg-emerald-500/10"><Target className="w-4 h-4 text-emerald-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">{data?.win_rate || 0}%</div>
              <div className="text-zinc-500 text-xs mt-1">{data?.total_won || 0} won of {(data?.total_won || 0) + (data?.total_lost || 0)} closed</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-loss-rate">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Loss Rate</span>
                <div className="p-1.5 rounded bg-red-500/10"><XCircle className="w-4 h-4 text-red-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">{data?.loss_rate || 0}%</div>
              <div className="text-zinc-500 text-xs mt-1">{data?.total_lost || 0} lost deals</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-cycle-days">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Avg Sales Cycle</span>
                <div className="p-1.5 rounded bg-amber-500/10"><Clock className="w-4 h-4 text-amber-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">{data?.avg_cycle_days || 0}d</div>
              <div className="flex items-center gap-1 mt-1 text-emerald-400 text-xs"><ArrowDownRight className="w-3 h-3" /><span>Lead to close</span></div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-active">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Active Deals</span>
                <div className="p-1.5 rounded bg-indigo-500/10"><Layers className="w-4 h-4 text-indigo-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">{data?.total_active || 0}</div>
              <div className="text-zinc-500 text-xs mt-1">In pipeline now</div>
            </CardContent>
          </Card>
        </div>

        {/* Deal Aging + Close Rate by Size */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="deal-aging-chart">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Timer className="w-4 h-4 text-amber-400" /> Deal Age Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(data?.deal_aging || []).map(d => ({ ...d, label: AGING_LABELS[d.bucket] || d.bucket }))} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem' }} itemStyle={{ color: '#e4e4e7' }} formatter={(v) => [`${v} deals`, 'Count']} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={32}>
                      {(data?.deal_aging || []).map((_, i) => (
                        <Cell key={i} fill={AGING_COLORS[i % AGING_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-zinc-500 mt-2 text-center">How long open deals have been in the pipeline</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="close-rate-size-chart">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Award className="w-4 h-4 text-indigo-400" /> Close Rate by Deal Size
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.close_rate_by_size || []} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                    <XAxis dataKey="size" stroke="#71717A" fontSize={11} />
                    <YAxis stroke="#71717A" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(39, 39, 42, 0.3)' }} />
                    <Bar dataKey="rate" name="Close Rate %" radius={[6, 6, 0, 0]} barSize={36}>
                      {(data?.close_rate_by_size || []).map((_, i) => (
                        <Cell key={i} fill={SIZE_COLORS[i % SIZE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-3">
                {(data?.close_rate_by_size || []).map((d, i) => (
                  <div key={i} className="text-center">
                    <div className="text-[10px] text-zinc-500">{d.size}</div>
                    <div className="text-xs font-mono" style={{ color: SIZE_COLORS[i] }}>{d.won}W / {d.lost}L</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity-to-Close Ratio */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="activity-close-chart">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <BarChart3 className="w-4 h-4 text-cyan-400" /> Activity-to-Close Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.activity_to_close || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                  <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                  <YAxis stroke="#71717A" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(39, 39, 42, 0.3)' }} />
                  <Bar dataKey="opened" name="Opened" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="closed" name="Closed" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SalesPerformance;
