import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Target,
  Award,
  Clock,
  ArrowDownRight,
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
  LineChart,
  Line,
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
                    <Tooltip contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem' }} itemStyle={{ color: '#e4e4e7' }} formatter={(v) => [`${v} deals`, 'Count']} cursor={{ fill: 'rgba(39, 39, 42, 0.3)' }} />
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {(data?.close_rate_by_size || []).map((d, i) => {
                  const radius = 36;
                  const stroke = 6;
                  const size = 96;
                  const center = size / 2;
                  const circumference = 2 * Math.PI * radius;
                  const offset = circumference - (d.rate / 100) * circumference;
                  return (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div className="relative" style={{ width: size, height: size }}>
                        <svg width={size} height={size} className="transform -rotate-90">
                          <circle cx={center} cy={center} r={radius} stroke="#27272a" strokeWidth={stroke} fill="none" />
                          <circle cx={center} cy={center} r={radius} stroke={SIZE_COLORS[i]} strokeWidth={stroke} fill="none" strokeLinecap="round"
                            strokeDasharray={circumference} strokeDashoffset={offset}
                            style={{ transition: 'stroke-dashoffset 1s ease' }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-base font-bold font-mono text-white">{d.rate}%</span>
                        </div>
                      </div>
                      <span className="text-xs text-zinc-400">{d.size}</span>
                      <span className="text-[10px] font-mono" style={{ color: SIZE_COLORS[i] }}>{d.won}W / {d.lost}L</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity-to-Close Ratio */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="activity-close-chart">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Layers className="w-4 h-4 text-cyan-400" /> Activity-to-Close Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.activity_to_close || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                  <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                  <YAxis stroke="#71717A" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#27272A' }} />
                  <Line type="monotone" dataKey="opened" name="Opened" stroke="#6366F1" strokeWidth={2} dot={{ r: 4, fill: '#6366F1', stroke: '#0c0c10', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="closed" name="Closed" stroke="#10B981" strokeWidth={2} dot={{ r: 4, fill: '#10B981', stroke: '#0c0c10', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-3">
              <div className="flex items-center gap-2 text-xs"><div className="w-3 h-0.5 bg-indigo-500 rounded" /><span className="text-zinc-400">Opened</span></div>
              <div className="flex items-center gap-2 text-xs"><div className="w-3 h-0.5 bg-emerald-500 rounded" /><span className="text-zinc-400">Closed</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SalesPerformance;
