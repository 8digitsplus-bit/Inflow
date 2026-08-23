import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  TrendingUp, DollarSign, Target, Loader2, Layers, Clock, Zap, Sparkles,
  Database, HeartPulse, Megaphone, Wallet, CheckCircle2, PlusCircle, ShieldAlert, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../components/ui/tooltip';
import { STAGE_COLOR_ARRAY } from '../constants/colors';
import {
  Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, PieChart, Pie, Cell,
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const SOURCE_ICON = {
  'CRM (Deals)': Database,
  'Finance / Billing': Wallet,
  'Customer Success': HeartPulse,
  'Marketing': Megaphone,
};

const BANDS = {
  p10: { label: 'Conservative', color: '#5A7D66', desc: 'There is a 90% chance you will make at least this much revenue. Only a 10% chance your revenue will fall below this line.' },
  p50: { label: 'Realistic', color: '#B8B2AA', desc: 'The middle outcome — there is a 50% chance your final revenue will land higher or lower than this value.' },
  p90: { label: 'Potential', color: '#354278', desc: 'The upside case — there is only a 10% chance you will match or exceed this number, and a 90% chance your final revenue will be lower than this peak.' },
};

const RevenueForecast = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [narrative, setNarrative] = useState(null);
  const [narrativeLoading, setNarrativeLoading] = useState(true);
  const [targetInput, setTargetInput] = useState('');
  const [appliedTarget, setAppliedTarget] = useState(null);

  const fetchData = useCallback(async (target) => {
    setLoading(true);
    try {
      const q = target ? `?target=${target}` : '';
      const res = await fetch(`${API_URL}/api/analytics/forecasting${q}`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } catch (err) { console.error('Failed to fetch forecasting:', err); }
    finally { setLoading(false); }
  }, []);

  const fetchNarrative = useCallback(async (target) => {
    setNarrativeLoading(true);
    try {
      const q = target ? `?target=${target}` : '';
      const res = await fetch(`${API_URL}/api/analytics/forecast-narrative${q}`, { credentials: 'include' });
      if (res.ok) {
        const j = await res.json();
        setNarrative(j.narrative);
      }
    } catch (err) { console.error('Failed to fetch narrative:', err); }
    finally { setNarrativeLoading(false); }
  }, []);

  useEffect(() => { fetchData(); fetchNarrative(); }, [fetchData, fetchNarrative]);

  const applyTarget = () => {
    const t = parseFloat(targetInput.replace(/[^0-9.]/g, ''));
    const val = Number.isFinite(t) && t > 0 ? t : null;
    setAppliedTarget(val);
    fetchData(val);
    fetchNarrative(val);
  };

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v || 0);
  const fmtK = (v) => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${Math.round(v)}`;

  const BandTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload || {};
    return (
      <div style={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '8px', padding: '8px 12px', fontSize: '11px', lineHeight: '1.5' }}>
        <p style={{ color: '#a1a1aa', marginBottom: '4px', fontWeight: 600 }}>{p.month}</p>
        <Row color={BANDS.p90.color} label="Potential" value={fmt(p.p90)} />
        <Row color={BANDS.p50.color} label="Realistic" value={fmt(p.p50)} />
        <Row color={BANDS.p10.color} label="Conservative" value={fmt(p.p10)} />
      </div>
    );
  };

  if (loading && !data) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return (
    <DashboardLayout>
      <div className="text-center py-20 text-zinc-500">No forecasting data available. Add some deals first.</div>
    </DashboardLayout>
  );

  const range = data.range || {};
  const chartData = (data.monthly_forecast || []).map((m) => ({
    ...m,
    l_conservative: Math.max(0, m.p10),
    l_realistic: Math.max(0, m.p50 - m.p10),
    l_potential: Math.max(0, m.p90 - m.p50),
  }));

  const goalPct = data.goal ? data.goal.probability : null;
  const goalColor = goalPct == null ? '#71717a' : goalPct >= 70 ? '#10B981' : goalPct >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={100}>
      <div className="space-y-5" data-testid="revenue-forecast-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit' }} data-testid="forecast-title">
              Revenue Forecast
            </h1>
            <p className="text-zinc-400 text-sm">Probability forecasting that predicts revenue</p>
          </div>
        </div>

        {/* Hero: Expected + Range + Target probability */}
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="bg-zinc-950/50 border border-white/10 lg:col-span-2" data-testid="forecast-headline">
            <CardContent className="p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wide inline-flex items-center gap-1.5">
                    Realistic 6-month revenue
                    <InfoTip text={BANDS.p50.desc} />
                  </span>
                  <div className="text-4xl font-bold text-white mt-1" style={{ fontFamily: 'Outfit' }} data-testid="forecast-p50">
                    {fmt(range.p50)}
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-sm">
                    <span className="text-zinc-400">Likely range (Conservative → Potential):</span>
                    <span className="font-medium text-slate-300" data-testid="forecast-range">{fmt(range.p10)} – {fmt(range.p90)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="Win rate" value={`${data.win_rate || 0}%`} color="text-emerald-400" />
                  <MiniStat label="Cycle" value={`${data.sales_cycle_days || 0}d`} color="text-cyan-400" />
                  <MiniStat label="NRR" value={`${data.nrr || 0}%`} color="text-slate-300" />
                </div>
              </div>
              {/* P10 / P50 / P90 confidence bar */}
              <div className="mt-5">
                <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #5A7D66, #B8B2AA, #354278)' }}>
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/60" />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-zinc-500">
                  <BandLabel band={BANDS.p10} value={fmtK(range.p10)} />
                  <BandLabel band={BANDS.p50} value={fmtK(range.p50)} className="text-slate-300 font-medium" />
                  <BandLabel band={BANDS.p90} value={fmtK(range.p90)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Target probability */}
          <Card className="bg-zinc-950/50 border border-white/10" data-testid="forecast-target-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Target className="w-4 h-4 text-amber-400" /> Probability to hit target
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <Input
                  data-testid="forecast-target-input"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyTarget(); }}
                  placeholder="e.g. 500000"
                  className="bg-zinc-900 border-zinc-800 text-white h-9 text-sm"
                />
                <Button data-testid="forecast-target-apply" onClick={applyTarget} disabled={loading} className="h-9 shrink-0" size="sm">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check'}
                </Button>
              </div>
              {data.goal ? (
                <div className="flex items-center gap-4" data-testid="forecast-goal-result">
                  <RingGauge value={goalPct} color={goalColor} />
                  <div>
                    <div className="text-2xl font-bold" style={{ fontFamily: 'Outfit', color: goalColor }}>{goalPct}%</div>
                    <div className="text-xs text-zinc-400">chance of reaching</div>
                    <div className="text-sm font-medium text-white">{fmt(data.goal.target)}</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-500 py-3">
                  Enter a 6-month revenue target to see the simulated probability of hitting it.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monte Carlo stacked probability layers */}
        <Card className="bg-zinc-950/50 border border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <TrendingUp className="w-5 h-5 text-slate-400" /> Monthly forecast — stacked probability layers
            </CardTitle>
            <p className="text-xs text-zinc-500">Each layer stacks onto the one below · green = Conservative floor · platinum = Realistic · blue = Potential upside (stack top = Potential / P90)</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} data-testid="monte-carlo-chart">
                <defs>
                  <linearGradient id="gConservative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5A7D66" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#5A7D66" stopOpacity={0.45} />
                  </linearGradient>
                  <linearGradient id="gRealistic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B8B2AA" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#B8B2AA" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="gPotential" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#354278" stopOpacity={0.75} />
                    <stop offset="100%" stopColor="#354278" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                <Tooltip content={<BandTooltip />} cursor={{ stroke: '#3f3f46' }} />
                <Area type="monotone" dataKey="l_conservative" stackId="bands" stroke="#5A7D66" strokeWidth={1.5} fill="url(#gConservative)" name="Conservative" />
                <Area type="monotone" dataKey="l_realistic" stackId="bands" stroke="#B8B2AA" strokeWidth={1.5} fill="url(#gRealistic)" name="Realistic" />
                <Area type="monotone" dataKey="l_potential" stackId="bands" stroke="#354278" strokeWidth={1.5} fill="url(#gPotential)" name="Potential" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* AI narrative */}
        <Card className="bg-gradient-to-br from-slate-500/[0.07] to-transparent border border-slate-500/20" data-testid="forecast-narrative-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Sparkles className="w-5 h-5 text-slate-300" /> AI forecast analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {narrativeLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Generating analysis…
              </div>
            ) : (
              <p className="text-sm text-zinc-300 leading-relaxed" data-testid="forecast-narrative">{narrative}</p>
            )}
          </CardContent>
        </Card>

        {/* Data sources + Quarterly */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="bg-zinc-950/50 border border-white/10" data-testid="data-sources-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Layers className="w-5 h-5 text-purple-400" /> Data sources
              </CardTitle>
              <p className="text-xs text-zinc-500">The forecast blends every system you connect. Green = feeding the model.</p>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(data.data_sources || []).map((s, i) => {
                const Icon = SOURCE_ICON[s.system] || Database;
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${s.connected ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-zinc-900/40 border-white/5'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white">{s.system}</span>
                        {s.connected
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          : <PlusCircle className="w-3.5 h-3.5 text-zinc-500" />}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{s.detail}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Clock className="w-5 h-5 text-cyan-400" /> Quarterly outlook
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data.quarterly_forecast || []).map((q, i) => {
                const spread = q.p90 - q.p10;
                return (
                  <div key={i} className="bg-zinc-900/50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-white">{q.quarter}</span>
                      <span className="text-sm font-bold text-slate-300" style={{ fontFamily: 'Outfit' }}>{fmt(q.p50)}</span>
                    </div>
                    <div className="relative h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="absolute inset-y-0 rounded-full bg-slate-500/40" style={{ left: '5%', right: '5%' }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
                      <span>Conservative {fmtK(q.p10)}</span>
                      <span>Range {fmtK(spread)}</span>
                      <span>Potential {fmtK(q.p90)}</span>
                    </div>
                  </div>
                );
              })}
              {(!data.quarterly_forecast || data.quarterly_forecast.length === 0) && (
                <div className="text-xs text-zinc-500 py-4 text-center">No quarterly data yet.</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Risk metrics row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={DollarSign} label="Weighted Pipeline" value={fmt(data.weighted_pipeline)} color="text-slate-400" />
          <MetricCard icon={Wallet} label="Recurring / mo" value={fmt(data.recurring_base_monthly)} color="text-emerald-400" />
          <MetricCard icon={ShieldAlert} label="Revenue at Risk" value={fmt(data.revenue_at_risk)} color="text-red-400" sub="low-prob deals" />
          <MetricCard icon={Zap} label="Velocity / day" value={fmt(data.velocity?.value_per_day)} color="text-amber-400" />
        </div>

        {/* Stage pie + Velocity */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="bg-zinc-950/50 border border-white/10">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Layers className="w-5 h-5 text-purple-400" /> Pipeline weighted by stage
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const stages = data.stage_forecast || [];
                const colors = STAGE_COLOR_ARRAY;
                const pieData = stages.map((s, i) => ({
                  name: s.stage?.replace(/_/g, ' '),
                  value: s.weighted,
                  count: s.count,
                  fill: colors[i % colors.length],
                }));
                return (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                          {pieData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', color: '#fff' }}
                          formatter={(value, name) => [fmt(value), name]}
                          itemStyle={{ color: '#e4e4e7' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
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

          <Card className="bg-zinc-950/50 border border-white/10">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingUp className="w-5 h-5 text-cyan-400" /> Revenue velocity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
                <div className="bg-zinc-900/60 rounded-xl p-3">
                  <span className="text-[10px] text-zinc-500 block mb-1">Pipeline Value/Day</span>
                  <span className="text-sm sm:text-xl font-bold text-white truncate block" style={{ fontFamily: 'Outfit' }}>{fmt(data.velocity?.value_per_day)}</span>
                </div>
                <div className="bg-zinc-900/60 rounded-xl p-3">
                  <span className="text-[10px] text-zinc-500 block mb-1">Avg Deal Size</span>
                  <span className="text-sm sm:text-xl font-bold text-white truncate block" style={{ fontFamily: 'Outfit' }}>{fmt(data.velocity?.avg_deal_size)}</span>
                </div>
                <div className="bg-zinc-900/60 rounded-xl p-3">
                  <span className="text-[10px] text-zinc-500 block mb-1">Win Rate</span>
                  <span className="text-sm sm:text-xl font-bold text-emerald-400" style={{ fontFamily: 'Outfit' }}>{data.velocity?.win_rate || 0}%</span>
                </div>
                <div className="bg-zinc-900/60 rounded-xl p-3">
                  <span className="text-[10px] text-zinc-500 block mb-1">Open Deals</span>
                  <span className="text-sm sm:text-xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>{data.velocity?.open_deals || 0}</span>
                </div>
              </div>
              <div className="bg-zinc-900/40 rounded-xl p-4 border border-white/5">
                <h4 className="text-xs font-medium text-zinc-400 mb-2">Velocity formula</h4>
                <div className="flex items-center gap-2 text-sm text-zinc-300 flex-wrap">
                  <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{data.velocity?.open_deals} deals</span>
                  <span className="text-zinc-600">×</span>
                  <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{fmt(data.velocity?.avg_deal_size)}</span>
                  <span className="text-zinc-600">×</span>
                  <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{data.velocity?.win_rate}%</span>
                  <span className="text-zinc-600">/</span>
                  <span className="bg-zinc-800 px-2 py-1 rounded text-xs">{data.velocity?.avg_cycle_days}d</span>
                  <span className="text-zinc-600">=</span>
                  <span className="bg-slate-500/15 text-slate-400 px-2 py-1 rounded text-xs font-semibold">{fmt(data.velocity?.value_per_day)}/day</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top deals */}
        {data.top_deals?.length > 0 && (
          <Card className="bg-zinc-950/50 border border-white/10">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Target className="w-5 h-5 text-amber-400" /> Top deals driving the forecast
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
                        <td className="py-2.5 px-3 text-right text-slate-400 font-medium">{fmt(deal.weighted)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${deal.probability >= 70 ? 'bg-emerald-500/15 text-emerald-400' : deal.probability >= 40 ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-700 text-zinc-400'}`}>
                            {deal.probability}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-500/10 text-slate-400 capitalize">
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
      </TooltipProvider>
    </DashboardLayout>
  );
};

const Row = ({ color, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#a1a1aa' }}>
      <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '9999px', backgroundColor: color, display: 'inline-block' }} />
      {label}
    </span>
    <span style={{ fontWeight: 600, color: '#ffffff' }}>{value}</span>
  </div>
);

const InfoTip = ({ text }) => (
  <UITooltip>
    <TooltipTrigger asChild>
      <span className="cursor-help text-zinc-500 hover:text-zinc-300 transition-colors" data-testid="forecast-info-tip">
        <Info className="w-3 h-3" />
      </span>
    </TooltipTrigger>
    <TooltipContent className="max-w-[240px] bg-zinc-900 text-zinc-200 border border-white/10 text-[11px] leading-relaxed normal-case tracking-normal font-normal">
      {text}
    </TooltipContent>
  </UITooltip>
);

const BandLabel = ({ band, value, className }) => (
  <UITooltip>
    <TooltipTrigger asChild>
      <span className={`inline-flex items-center gap-1 cursor-help ${className || ''}`} data-testid={`band-label-${band.label.toLowerCase()}`}>
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: band.color }} />
        {band.label} {value}
        <Info className="w-2.5 h-2.5 opacity-50" />
      </span>
    </TooltipTrigger>
    <TooltipContent className="max-w-[240px] bg-zinc-900 text-zinc-200 border border-white/10 text-[11px] leading-relaxed">
      <span className="font-semibold" style={{ color: band.color }}>{band.label}: </span>{band.desc}
    </TooltipContent>
  </UITooltip>
);

const MiniStat = ({ label, value, color }) => (
  <div className="bg-zinc-900/60 rounded-lg px-3 py-2 text-center">
    <span className="text-[10px] text-zinc-500 block">{label}</span>
    <span className={`text-sm font-bold ${color}`} style={{ fontFamily: 'Outfit' }}>{value}</span>
  </div>
);

const RingGauge = ({ value, color }) => {
  const pct = Math.max(0, Math.min(100, value || 0));
  const r = 30;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76">
      <circle cx="38" cy="38" r={r} fill="none" stroke="#27272a" strokeWidth="7" />
      <circle
        cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`} transform="rotate(-90 38 38)"
      />
    </svg>
  );
};

const MetricCard = ({ icon: Icon, label, value, sub, color }) => (
  <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-3 sm:p-4" data-testid={`metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 mb-2">
      <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
      <span className="text-[10px] sm:text-[11px] text-zinc-500 font-medium truncate">{label}</span>
    </div>
    <p className="text-base sm:text-xl font-bold text-white truncate" style={{ fontFamily: 'Outfit' }}>{value}</p>
    {sub && <span className="text-[10px] text-zinc-600">{sub}</span>}
  </div>
);

export default RevenueForecast;
