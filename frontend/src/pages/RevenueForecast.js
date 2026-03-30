import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  TrendingUp, DollarSign, Target, BarChart3, Loader2, ArrowUpRight, ArrowDownRight,
  Layers, Clock, CalendarDays, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { STAGE_COLOR_ARRAY } from '../constants/colors';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, PieChart, Pie, Cell,
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const RevenueForecast = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState('expected');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/forecasting`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch (err) { console.error('Failed to fetch forecasting:', err); }
    finally { setLoading(false); }
  };

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v || 0);
  const fmtK = (v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
        <p style={{ color: '#a1a1aa', fontSize: '0.875rem', marginBottom: '0.25rem' }}>{label}</p>
        {payload.map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', fontSize: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '9999px', backgroundColor: entry.color, display: 'inline-block' }} />
              <span style={{ color: '#a1a1aa' }}>{entry.name}</span>
            </span>
            <span style={{ fontWeight: 600, color: '#ffffff' }}>{fmt(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return (
    <DashboardLayout>
      <div className="text-center py-20 text-zinc-500">No forecasting data available. Add some deals first.</div>
    </DashboardLayout>
  );

  const scenarioData = data.scenarios?.[scenario] || {};
  const scenarioColors = { best: '#10B981', expected: '#6366F1', worst: '#F59E0B' };
  const scenarioLabels = { best: 'Best Case', expected: 'Expected', worst: 'Conservative' };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="revenue-forecast-page">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="forecast-title">
            Revenue Forecast
          </h1>
          <p className="text-zinc-400 mt-1 text-sm">Weighted pipeline projections and scenario modeling based on your live data.</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="forecast-metrics">
          <MetricCard icon={DollarSign} label="Weighted Pipeline" value={fmt(data.weighted_pipeline)} change={data.pipeline_trend} color="text-indigo-400" />
          <MetricCard icon={Target} label="Expected Revenue" value={fmt(data.scenarios?.expected?.total)} color="text-emerald-400" />
          <MetricCard icon={Zap} label="Revenue Velocity" value={fmt(data.velocity?.value_per_day)} sub="/day" color="text-amber-400" />
          <MetricCard icon={Clock} label="Avg. Days to Close" value={`${data.velocity?.avg_cycle_days || 0}d`} color="text-cyan-400" />
        </div>

        {/* Scenario Toggle + Chart */}
        <Card className="bg-zinc-950/50 border border-white/10">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <BarChart3 className="w-5 h-5 text-indigo-400" /> Monthly Forecast
              </CardTitle>
              <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 border border-zinc-800" data-testid="scenario-toggle">
                {['best', 'expected', 'worst'].map(s => (
                  <button key={s} onClick={() => setScenario(s)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${scenario === s ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                    data-testid={`scenario-${s}`}>
                    {scenarioLabels[s]}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4">
              <div className="bg-zinc-900/60 rounded-lg p-2 sm:p-3">
                <span className="text-[10px] text-zinc-500 block">6-Month Total</span>
                <span className="text-sm sm:text-lg font-bold text-white" style={{ fontFamily: 'Outfit' }}>{fmt(scenarioData.total)}</span>
              </div>
              <div className="bg-zinc-900/60 rounded-lg p-2 sm:p-3">
                <span className="text-[10px] text-zinc-500 block">Monthly Avg</span>
                <span className="text-sm sm:text-lg font-bold text-white" style={{ fontFamily: 'Outfit' }}>{fmt(scenarioData.monthly_avg)}</span>
              </div>
              <div className="bg-zinc-900/60 rounded-lg p-2 sm:p-3">
                <span className="text-[10px] text-zinc-500 block">Confidence</span>
                <span className="text-sm sm:text-lg font-bold" style={{ fontFamily: 'Outfit', color: scenarioColors[scenario] }}>{scenarioData.confidence}%</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data.monthly_forecast}>
                <defs>
                  <linearGradient id="gradBest" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExpected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradWorst" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                <Tooltip
                  content={({ active, payload, label }) => <CustomTooltip active={active} payload={payload} label={label} />}
                  cursor={{ stroke: '#27272A', fill: 'none' }}
                />
                <Area type="monotone" dataKey="best" name="Best Case" stroke="#10B981" fill="url(#gradBest)" strokeWidth={scenario === 'best' ? 2.5 : 1} strokeOpacity={scenario === 'best' ? 1 : 0.3} fillOpacity={scenario === 'best' ? 1 : 0.1} />
                <Area type="monotone" dataKey="expected" name="Expected" stroke="#6366F1" fill="url(#gradExpected)" strokeWidth={scenario === 'expected' ? 2.5 : 1} strokeOpacity={scenario === 'expected' ? 1 : 0.3} fillOpacity={scenario === 'expected' ? 1 : 0.1} />
                <Area type="monotone" dataKey="worst" name="Conservative" stroke="#F59E0B" fill="url(#gradWorst)" strokeWidth={scenario === 'worst' ? 2.5 : 1} strokeOpacity={scenario === 'worst' ? 1 : 0.3} fillOpacity={scenario === 'worst' ? 1 : 0.1} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Weighted Pipeline by Stage - Pie Chart */}
          <Card className="bg-zinc-950/50 border border-white/10">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Layers className="w-5 h-5 text-purple-400" /> Pipeline Weighted by Stage
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const stages = data.stage_forecast || [];
                const colors = STAGE_COLOR_ARRAY;
                const total = stages.reduce((s, d) => s + d.weighted, 0);

                const pieData = stages.map((s, i) => ({
                  name: s.stage?.replace(/_/g, ' '),
                  value: s.weighted,
                  count: s.count,
                  fill: colors[i % colors.length],
                }));

                return (
                  <>
                    <div className="relative">
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            outerRadius={95}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                          >
                            {pieData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem', color: '#fff' }}
                            formatter={(value, name) => [fmt(value), name]}
                            itemStyle={{ color: '#e4e4e7' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {stages.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} />
                            <span className="text-zinc-400 capitalize">{s.stage?.replace(/_/g, ' ')}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-zinc-500">{s.count} deals</span>
                            <span className="font-medium text-white">{fmt(s.weighted)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Revenue Velocity & Cycle */}
          <Card className="bg-zinc-950/50 border border-white/10">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingUp className="w-5 h-5 text-cyan-400" /> Revenue Velocity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
                <div className="bg-zinc-900/60 rounded-xl p-2 sm:p-4">
                  <span className="text-[10px] text-zinc-500 block mb-1">Pipeline Value/Day</span>
                  <span className="text-sm sm:text-xl font-bold text-white truncate block" style={{ fontFamily: 'Outfit' }}>{fmt(data.velocity?.value_per_day)}</span>
                </div>
                <div className="bg-zinc-900/60 rounded-xl p-2 sm:p-4">
                  <span className="text-[10px] text-zinc-500 block mb-1">Avg Deal Size</span>
                  <span className="text-sm sm:text-xl font-bold text-white truncate block" style={{ fontFamily: 'Outfit' }}>{fmt(data.velocity?.avg_deal_size)}</span>
                </div>
                <div className="bg-zinc-900/60 rounded-xl p-2 sm:p-4">
                  <span className="text-[10px] text-zinc-500 block mb-1">Win Rate</span>
                  <span className="text-sm sm:text-xl font-bold text-emerald-400" style={{ fontFamily: 'Outfit' }}>{data.velocity?.win_rate || 0}%</span>
                </div>
                <div className="bg-zinc-900/60 rounded-xl p-2 sm:p-4">
                  <span className="text-[10px] text-zinc-500 block mb-1">Open Deals</span>
                  <span className="text-sm sm:text-xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>{data.velocity?.open_deals || 0}</span>
                </div>
              </div>
              <div className="bg-zinc-900/40 rounded-xl p-4 border border-white/5">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">Velocity Formula</h4>
                <div className="flex items-center gap-2 text-sm text-zinc-300 flex-wrap">
                  <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{data.velocity?.open_deals} deals</span>
                  <span className="text-zinc-600">x</span>
                  <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{fmt(data.velocity?.avg_deal_size)}</span>
                  <span className="text-zinc-600">x</span>
                  <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{data.velocity?.win_rate}%</span>
                  <span className="text-zinc-600">/</span>
                  <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{data.velocity?.avg_cycle_days}d</span>
                  <span className="text-zinc-600">=</span>
                  <span className="bg-indigo-500/15 text-indigo-400 px-2 py-1 rounded text-xs font-semibold">{fmt(data.velocity?.value_per_day)}/day</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Upcoming Deals */}
        {data.top_deals?.length > 0 && (
          <Card className="bg-zinc-950/50 border border-white/10">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <CalendarDays className="w-5 h-5 text-amber-400" /> Top Upcoming Deals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="top-deals-table">
                  <thead>
                    <tr className="text-zinc-500 text-xs border-b border-zinc-800">
                      <th className="text-left py-2.5 px-3 font-medium">Deal</th>
                      <th className="text-left py-2.5 px-3 font-medium">Company</th>
                      <th className="text-right py-2.5 px-3 font-medium">Value</th>
                      <th className="text-right py-2.5 px-3 font-medium">Weighted</th>
                      <th className="text-center py-2.5 px-3 font-medium">Probability</th>
                      <th className="text-left py-2.5 px-3 font-medium">Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_deals.map((deal, i) => (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/30 transition-colors">
                        <td className="py-2.5 px-3 text-white font-medium truncate max-w-[180px]">{deal.name}</td>
                        <td className="py-2.5 px-3 text-zinc-400 truncate max-w-[140px]">{deal.company}</td>
                        <td className="py-2.5 px-3 text-right text-white">{fmt(deal.value)}</td>
                        <td className="py-2.5 px-3 text-right text-indigo-400 font-medium">{fmt(deal.weighted)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${deal.probability >= 70 ? 'bg-emerald-500/15 text-emerald-400' : deal.probability >= 40 ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-700 text-zinc-400'}`}>
                            {deal.probability}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/10 text-indigo-400 capitalize">
                            {deal.stage?.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

const MetricCard = ({ icon: Icon, label, value, change, sub, color }) => (
  <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 sm:p-4" data-testid={`metric-${label.toLowerCase().replace(/\s/g, '-')}`}>
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
        <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium truncate">{label}</span>
      </div>
      {typeof change === 'number' && (
        <span className={`flex items-center gap-0.5 text-[10px] sm:text-[11px] font-medium flex-shrink-0 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(change)}%
        </span>
      )}
    </div>
    <p className="text-base sm:text-xl font-bold text-white truncate" style={{ fontFamily: 'Outfit' }}>
      {value}{sub && <span className="text-xs sm:text-sm text-zinc-500 font-normal">{sub}</span>}
    </p>
  </div>
);

export default RevenueForecast;
