import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target, 
  Users, 
  Sparkles,
  ArrowUpRight,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Dashboard = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`${API_URL}/api/analytics/revenue`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAIInsight = async () => {
    if (user?.subscription_tier === 'free') {
      return;
    }
    
    setLoadingInsight(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          context: `Analyze this revenue data and provide insights: Total Pipeline: $${analytics?.total_pipeline || 0}, Win Rate: ${analytics?.win_rate || 0}%, Average Deal Size: $${analytics?.avg_deal_size || 0}`,
          data: analytics
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiInsight(data.insight);
      }
    } catch (error) {
      console.error('Failed to get AI insight:', error);
    } finally {
      setLoadingInsight(false);
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

  const metrics = [
    {
      title: 'Total Pipeline',
      value: formatCurrency(analytics?.total_pipeline || 0),
      change: '+12.5%',
      positive: true,
      icon: <DollarSign className="w-5 h-5" />
    },
    {
      title: 'Closed Revenue',
      value: formatCurrency(analytics?.closed_revenue || 0),
      change: '+8.2%',
      positive: true,
      icon: <TrendingUp className="w-5 h-5" />
    },
    {
      title: 'Win Rate',
      value: `${analytics?.win_rate || 0}%`,
      change: '+3.1%',
      positive: true,
      icon: <Target className="w-5 h-5" />
    },
    {
      title: 'Active Deals',
      value: analytics?.total_deals || 0,
      change: '+5',
      positive: true,
      icon: <Users className="w-5 h-5" />
    }
  ];

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

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="dashboard-main">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Welcome back, {user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-zinc-400 mt-1">Here's your revenue performance overview</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              user?.subscription_tier === 'enterprise' ? 'bg-purple-500/20 text-purple-400' :
              user?.subscription_tier === 'pro' ? 'bg-indigo-500/20 text-indigo-400' :
              'bg-zinc-700 text-zinc-300'
            }`}>
              {user?.subscription_tier?.charAt(0).toUpperCase() + user?.subscription_tier?.slice(1) || 'Free'} Plan
            </span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric, i) => (
            <Card 
              key={i} 
              className="bg-zinc-950/50 border-white/10 hover:border-indigo-500/30 transition-colors"
              data-testid={`metric-card-${i}`}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                    {metric.icon}
                  </div>
                  <span className={`text-xs font-medium flex items-center gap-1 ${
                    metric.positive ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {metric.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {metric.change}
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono text-white">{metric.value}</div>
                <div className="text-sm text-zinc-400 mt-1">{metric.title}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <Card className="lg:col-span-2 bg-zinc-950/50 border-white/10" data-testid="revenue-chart">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Revenue Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics?.monthly_data || []}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#6366F1" 
                      fill="url(#colorRevenue)"
                      strokeWidth={2}
                      name="Revenue"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="forecast" 
                      stroke="#10B981" 
                      fill="url(#colorForecast)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Forecast"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* AI Insights */}
          <Card className="bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border-purple-500/20" data-testid="ai-insights-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Sparkles className="w-5 h-5 text-purple-400" />
                AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              {user?.subscription_tier === 'free' ? (
                <div className="text-center py-8">
                  <Sparkles className="w-10 h-10 text-purple-400/50 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm mb-4">
                    Upgrade to Pro to unlock AI-powered insights
                  </p>
                  <Button 
                    className="bg-purple-600 hover:bg-purple-500"
                    onClick={() => window.location.href = '/settings'}
                    data-testid="upgrade-ai-btn"
                  >
                    Upgrade Now
                  </Button>
                </div>
              ) : (
                <div>
                  {aiInsight ? (
                    <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {aiInsight}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-zinc-400 text-sm mb-4">
                        Get AI-powered analysis of your pipeline
                      </p>
                      <Button 
                        onClick={getAIInsight}
                        disabled={loadingInsight}
                        className="bg-purple-600 hover:bg-purple-500"
                        data-testid="get-insights-btn"
                      >
                        {loadingInsight ? 'Analyzing...' : 'Generate Insights'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Breakdown */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="pipeline-breakdown">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
              Pipeline by Stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.stage_breakdown || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" horizontal={false} />
                  <XAxis type="number" stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
                  <YAxis type="category" dataKey="stage" stroke="#71717A" fontSize={12} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="value" 
                    fill="#6366F1" 
                    radius={[0, 4, 4, 0]}
                    name="Value"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
