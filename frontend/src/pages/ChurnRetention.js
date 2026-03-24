import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import {
  Users,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Heart,
  Sparkles,
  Loader2,
  RefreshCw,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Activity,
  Clock
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
  Cell,
  PieChart,
  Pie,
  Legend,
  ComposedChart,
  Line
} from 'recharts';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEALTH_COLORS = { Healthy: '#10B981', Moderate: '#F59E0B', 'At Risk': '#EF4444', Critical: '#DC2626' };

const ChurnRetention = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiPrediction, setAiPrediction] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => { fetchChurnData(); }, []);

  const fetchChurnData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/analytics/churn`, { credentials: 'include' });
      if (response.ok) setData(await response.json());
    } catch (error) { console.error('Failed to fetch churn data:', error); }
    finally { setLoading(false); }
  };

  const getAIPrediction = async (deal) => {
    if (!['pro_monthly', 'pro_yearly', 'enterprise_monthly', 'enterprise_yearly'].includes(user?.subscription_tier)) {
      toast.error('Upgrade to Pro for AI churn predictions'); return;
    }
    setLoadingAI(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/churn-prediction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ deal_data: deal })
      });
      if (response.ok) { setAiPrediction(await response.json().then(r => r.prediction)); toast.success('Churn prediction generated'); }
      else { toast.error((await response.json()).detail || 'Failed to get prediction'); }
    } catch { toast.error('Failed to get AI prediction'); }
    finally { setLoadingAI(false); }
  };

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem', padding: '0.75rem' }}>
        <p className="text-zinc-400 text-sm mb-1">{label}</p>
        {payload.map((e, i) => (
          <p key={i} className="text-sm font-medium" style={{ color: e.color || e.stroke }}>
            {e.name}: {e.name.includes('revenue') || e.name.includes('Revenue') ? fmt(e.value) : e.name.includes('rate') || e.name.includes('NRR') ? `${e.value}%` : e.value}
          </p>
        ))}
      </div>
    );
  };

  const getHealthColor = (s) => s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-amber-400' : 'text-red-400';
  const getRiskColor = (r) => r === 'critical' ? 'text-red-500 bg-red-500/10 border-red-500/20' : r === 'high' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  const getCohortColor = (v) => v >= 90 ? 'bg-emerald-500/30 text-emerald-300' : v >= 75 ? 'bg-emerald-500/20 text-emerald-400' : v >= 60 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400';

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="churn-retention-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Churn & Retention</h1>
            <p className="text-zinc-400 mt-1 text-sm">Monitor customer health, predict churn, and protect revenue</p>
          </div>
          <Button variant="outline" className="border-zinc-700" onClick={fetchChurnData} data-testid="refresh-churn-btn">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="health-score-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-xs">Health Score</span>
                <Heart className={`w-4 h-4 ${getHealthColor(data?.health_score || 0)}`} />
              </div>
              <div className={`text-lg sm:text-2xl font-bold font-mono truncate ${getHealthColor(data?.health_score || 0)}`}>{data?.health_score || 0}</div>
              <Progress value={data?.health_score || 0} className="mt-2 h-1.5" />
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="retention-rate-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-xs">Retention Rate</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono truncate text-emerald-400">{data?.retention_rate || 0}%</div>
              <div className="flex items-center gap-1 mt-1 text-emerald-400 text-[10px]"><ArrowUpRight className="w-3 h-3" />+2.3%</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="churn-rate-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-xs">Churn Rate</span>
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono truncate text-red-400">{data?.churn_rate || 0}%</div>
              <div className="flex items-center gap-1 mt-1 text-emerald-400 text-[10px]"><ArrowDownRight className="w-3 h-3" />-1.2%</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="nrr-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-xs">Net Revenue Retention</span>
                <DollarSign className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono truncate text-indigo-400">{data?.nrr || 100}%</div>
              <div className="text-[10px] text-zinc-500 mt-1">Target: {'>'}100%</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="revenue-at-risk-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-xs">Revenue at Risk</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono truncate text-amber-400">{fmt(data?.revenue_at_risk || 0)}</div>
              <div className="text-[10px] text-zinc-500 mt-1">{data?.at_risk_count || 0} deals</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="clv-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-xs">Avg CLV</span>
                <Shield className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono truncate text-purple-400">{fmt(data?.clv || 0)}</div>
              <div className="text-[10px] text-zinc-500 mt-1">ARPA: {fmt(data?.arpa || 0)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1: Retention/Churn Trend + Health Distribution */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="bg-zinc-950/50 border-white/10 lg:col-span-2" data-testid="retention-churn-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Activity className="w-5 h-5 text-emerald-400" /> Retention & Churn Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data?.monthly_data || []}>
                    <defs>
                      <linearGradient id="retGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#27272A' }} />
                    <Legend />
                    <Area type="monotone" dataKey="retention_rate" stroke="#10B981" fill="url(#retGrad)" strokeWidth={2} name="Retention" />
                    <Line type="monotone" dataKey="churn_rate" stroke="#EF4444" strokeWidth={2} dot={{ fill: '#EF4444', r: 3 }} name="Churn" />
                    <Line type="monotone" dataKey="nrr" stroke="#6366F1" strokeWidth={2} strokeDasharray="5 5" dot={false} name="NRR" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="health-distribution-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Heart className="w-5 h-5 text-pink-400" /> Customer Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={(data?.health_distribution || []).filter(h => h.count > 0)}
                      cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                      paddingAngle={4} dataKey="count" nameKey="status"
                      label={({ status, percent }) => {
                        const short = status.length > 8 ? status.slice(0, 7) + '..' : status;
                        return `${short} ${(percent * 100).toFixed(0)}%`;
                      }}
                      labelLine={{ stroke: '#52525B', strokeWidth: 1 }}
                      style={{ fontSize: '11px' }}
                    >
                      {(data?.health_distribution || []).filter(h => h.count > 0).map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        const total = (data?.health_distribution || []).reduce((s, h) => s + h.count, 0);
                        const pct = total > 0 ? ((d.count / total) * 100).toFixed(0) : 0;
                        return (
                          <div style={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '0.5rem', padding: '0.75rem' }}>
                            <p className="text-sm font-medium text-white">{d.status}</p>
                            <p className="text-indigo-400 text-sm font-mono">{d.count} customers ({pct}%)</p>
                          </div>
                        );
                      }} 
                    />
                    <Legend formatter={(value) => <span style={{ color: '#A1A1AA', fontSize: '11px' }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 -mt-2">
                {(data?.health_distribution || []).map((h, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color }} />
                    <span className="text-[10px] text-zinc-400">{h.status}: {h.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2: Revenue Lost + Churn Reasons */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="revenue-lost-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <DollarSign className="w-5 h-5 text-red-400" /> Revenue Lost to Churn
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.monthly_data || []}>
                    <defs>
                      <linearGradient id="lostGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#27272A' }} />
                    <Area type="monotone" dataKey="revenue_lost" stroke="#EF4444" fill="url(#lostGrad)" strokeWidth={2} name="Revenue Lost" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="churn-reasons-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <AlertTriangle className="w-5 h-5 text-amber-400" /> Churn Reasons
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(data?.churn_reasons || []).map((r, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-zinc-300">{r.reason}</span>
                      <span className="text-xs text-zinc-400 font-mono">{r.pct}%</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${r.pct}%`,
                          backgroundColor: ['#EF4444', '#F59E0B', '#6366F1', '#06B6D4', '#8B5CF6'][i]
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Risk by Segment */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="risk-by-segment">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Shield className="w-5 h-5 text-indigo-400" /> Risk by Deal Value Segment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(data?.risk_by_segment || []).map((seg, i) => {
                const riskPct = seg.total > 0 ? Math.round((seg.at_risk / seg.total) * 100) : 0;
                return (
                  <div key={i} className="p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
                    <h4 className="text-white font-medium text-sm mb-3">{seg.segment}</h4>
                    <div className="flex items-end justify-between mb-2">
                      <span className="text-lg sm:text-2xl font-bold font-mono truncate text-white">{seg.total}</span>
                      <span className={`text-xs font-mono ${riskPct > 30 ? 'text-red-400' : riskPct > 15 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {seg.at_risk} at risk ({riskPct}%)
                      </span>
                    </div>
                    <Progress value={100 - riskPct} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* At-Risk Deals & AI Prediction */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="at-risk-deals-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <AlertTriangle className="w-5 h-5 text-amber-400" /> At-Risk Deals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.at_risk_deals?.length > 0 ? (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {data.at_risk_deals.map((deal, i) => (
                    <div key={i} className={`p-3 rounded-lg border ${getRiskColor(deal.risk_level)} flex items-center justify-between`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-white font-medium text-sm truncate">{deal.name}</h4>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-medium ${
                            deal.risk_level === 'critical' ? 'bg-red-500/20 text-red-400' : deal.risk_level === 'high' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>{deal.risk_level}</span>
                        </div>
                        <p className="text-zinc-400 text-xs">{deal.company} &middot; {fmt(deal.value)}</p>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5">
                          <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Activity className="w-3 h-3" /> {deal.engagement_score}%</span>
                          <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {deal.days_inactive}d idle</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-white/5 ml-2 flex-shrink-0"
                        onClick={() => getAIPrediction(deal)} disabled={loadingAI}>
                        {loadingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No at-risk deals detected</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border-purple-500/20" data-testid="ai-prediction-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Sparkles className="w-5 h-5 text-purple-400" /> AI Churn Prediction
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!['pro_monthly', 'pro_yearly', 'enterprise_monthly', 'enterprise_yearly'].includes(user?.subscription_tier) ? (
                <div className="text-center py-8">
                  <Sparkles className="w-10 h-10 text-purple-400/50 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm mb-4">Upgrade to Pro for AI-powered churn predictions</p>
                  <Button className="bg-purple-600 hover:bg-purple-500" onClick={() => window.location.href = '/settings'}>Upgrade Now</Button>
                </div>
              ) : aiPrediction ? (
                <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap max-h-[360px] overflow-y-auto">{aiPrediction}</div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select an at-risk deal to analyze</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cohort Analysis */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="cohort-analysis-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Users className="w-5 h-5 text-indigo-400" /> Cohort Retention Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 px-4 text-zinc-400 font-medium">Cohort</th>
                    <th className="text-center py-3 px-2 text-zinc-400 font-medium">Size</th>
                    {['Month 0', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5'].map(m => (
                      <th key={m} className="text-center py-3 px-2 text-zinc-400 font-medium">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.cohorts || []).map((cohort, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 text-white font-medium">{cohort.cohort}</td>
                      <td className="py-3 px-2 text-center text-zinc-400">{cohort.size}</td>
                      {[cohort.month_0, cohort.month_1, cohort.month_2, cohort.month_3, cohort.month_4, cohort.month_5].map((v, j) => (
                        <td key={j} className="py-3 px-2 text-center">
                          {v != null ? (
                            <span className={`px-2 py-1 rounded text-xs font-mono ${getCohortColor(v)}`}>{v}%</span>
                          ) : (
                            <span className="text-zinc-700 text-xs">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ChurnRetention;
