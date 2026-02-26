import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Target,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight
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
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const RevenueIntelligence = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [analyticsRes, pipelineRes] = await Promise.all([
        fetch(`${API_URL}/api/analytics/revenue`, { credentials: 'include' }),
        fetch(`${API_URL}/api/analytics/pipeline`, { credentials: 'include' })
      ]);

      if (analyticsRes.ok) {
        setAnalytics(await analyticsRes.json());
      }
      if (pipelineRes.ok) {
        setPipelineData(await pipelineRes.json());
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const COLORS = ['#6366F1', '#8B5CF6', '#06B6D4', '#F59E0B', '#10B981', '#EF4444'];

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl">
          <p className="text-zinc-400 text-sm mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const stageData = analytics?.stage_breakdown?.filter(s => 
    !['closed_won', 'closed_lost'].includes(s.stage)
  ) || [];

  const winLossData = [
    { name: 'Won', value: analytics?.stage_breakdown?.find(s => s.stage === 'closed_won')?.value || 0 },
    { name: 'Lost', value: analytics?.stage_breakdown?.find(s => s.stage === 'closed_lost')?.value || 0 }
  ];

  const forecastData = analytics?.monthly_data?.map((m, i) => ({
    ...m,
    conservative: m.forecast * 0.85,
    optimistic: m.forecast * 1.15
  })) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="revenue-intelligence-page">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
            Revenue Intelligence
          </h1>
          <p className="text-zinc-400 mt-1">Deep insights into your revenue performance</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="metric-pipeline">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Active Pipeline</span>
                <div className="p-1.5 rounded bg-indigo-500/10">
                  <DollarSign className="w-4 h-4 text-indigo-400" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {formatCurrency(analytics?.total_pipeline || 0)}
              </div>
              <div className="flex items-center gap-1 mt-2 text-emerald-400 text-xs">
                <ArrowUpRight className="w-3 h-3" />
                <span>+15% from last quarter</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="metric-weighted">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Weighted Pipeline</span>
                <div className="p-1.5 rounded bg-purple-500/10">
                  <Target className="w-4 h-4 text-purple-400" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {formatCurrency(pipelineData?.weighted_pipeline || 0)}
              </div>
              <div className="flex items-center gap-1 mt-2 text-emerald-400 text-xs">
                <ArrowUpRight className="w-3 h-3" />
                <span>+8% from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="metric-winrate">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Win Rate</span>
                <div className="p-1.5 rounded bg-emerald-500/10">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {analytics?.win_rate || 0}%
              </div>
              <div className="flex items-center gap-1 mt-2 text-emerald-400 text-xs">
                <ArrowUpRight className="w-3 h-3" />
                <span>+3.2% improvement</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="metric-avg-deal">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Avg Deal Size</span>
                <div className="p-1.5 rounded bg-cyan-500/10">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                </div>
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {formatCurrency(analytics?.avg_deal_size || 0)}
              </div>
              <div className="flex items-center gap-1 mt-2 text-amber-400 text-xs">
                <ArrowDownRight className="w-3 h-3" />
                <span>-2% from target</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Revenue Forecast */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="forecast-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Revenue Forecast
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastData}>
                    <defs>
                      <linearGradient id="colorConservative" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOptimistic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="conservative" 
                      stroke="#F59E0B" 
                      fill="url(#colorConservative)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      name="Conservative"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="forecast" 
                      stroke="#10B981" 
                      fill="url(#colorForecast)"
                      strokeWidth={2}
                      name="Forecast"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="optimistic" 
                      stroke="#6366F1" 
                      fill="url(#colorOptimistic)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      name="Optimistic"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Win/Loss Analysis */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="winloss-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <PieChartIcon className="w-5 h-5 text-purple-400" />
                Win/Loss Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={winLossData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      <Cell fill="#10B981" />
                      <Cell fill="#EF4444" />
                    </Pie>
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: '#18181B', border: '1px solid #27272A', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm text-zinc-400">Won: {formatCurrency(winLossData[0].value)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm text-zinc-400">Lost: {formatCurrency(winLossData[1].value)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline by Stage */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="stage-breakdown-chart">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              Pipeline by Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                  <XAxis dataKey="stage" stroke="#71717A" fontSize={12} />
                  <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="value" 
                    radius={[4, 4, 0, 0]}
                    name="Value"
                  >
                    {stageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Insights Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Strength</span>
              </div>
              <p className="text-zinc-300 text-sm">
                Your proposal-to-close conversion is 23% above industry average.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-amber-400" />
                <span className="text-amber-400 font-medium">Opportunity</span>
              </div>
              <p className="text-zinc-300 text-sm">
                Lead qualification stage has the longest average time. Consider automation.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                <span className="text-purple-400 font-medium">Forecast</span>
              </div>
              <p className="text-zinc-300 text-sm">
                Based on current velocity, Q1 target is 87% likely to be achieved.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default RevenueIntelligence;
