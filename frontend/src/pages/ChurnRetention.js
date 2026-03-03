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
  RefreshCw
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
  LineChart,
  Line
} from 'recharts';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ChurnRetention = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiPrediction, setAiPrediction] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    fetchChurnData();
  }, []);

  const fetchChurnData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/analytics/churn`, {
        credentials: 'include'
      });
      if (response.ok) {
        setData(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch churn data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAIPrediction = async (deal) => {
    if (!['pro_monthly', 'pro_yearly', 'priority_monthly', 'priority_yearly'].includes(user?.subscription_tier)) {
      toast.error('Upgrade to Pro for AI churn predictions');
      return;
    }

    setLoadingAI(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/churn-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deal_data: deal })
      });

      if (response.ok) {
        const result = await response.json();
        setAiPrediction(result.prediction);
        toast.success('Churn prediction generated');
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to get prediction');
      }
    } catch (error) {
      toast.error('Failed to get AI prediction');
    } finally {
      setLoadingAI(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl">
          <p className="text-zinc-400 text-sm mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
              {entry.name}: {entry.value}%
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const getHealthColor = (score) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getHealthBg = (score) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="churn-retention-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Churn & Retention
            </h1>
            <p className="text-zinc-400 mt-1">Monitor customer health and prevent churn</p>
          </div>
          <Button 
            variant="outline" 
            className="border-zinc-700"
            onClick={fetchChurnData}
            data-testid="refresh-churn-btn"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="health-score-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400 text-sm">Health Score</span>
                <Heart className={`w-5 h-5 ${getHealthColor(data?.health_score || 0)}`} />
              </div>
              <div className={`text-3xl font-bold font-mono ${getHealthColor(data?.health_score || 0)}`}>
                {data?.health_score || 0}
              </div>
              <Progress 
                value={data?.health_score || 0} 
                className="mt-3 h-2"
              />
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="retention-rate-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400 text-sm">Retention Rate</span>
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold font-mono text-emerald-400">
                {data?.retention_rate || 0}%
              </div>
              <p className="text-xs text-zinc-500 mt-2">+2.3% vs last month</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="churn-rate-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400 text-sm">Churn Rate</span>
                <TrendingDown className="w-5 h-5 text-red-400" />
              </div>
              <div className="text-3xl font-bold font-mono text-red-400">
                {data?.churn_rate || 0}%
              </div>
              <p className="text-xs text-zinc-500 mt-2">-1.2% vs last month</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="at-risk-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400 text-sm">At Risk</span>
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="text-3xl font-bold font-mono text-amber-400">
                {data?.at_risk_count || 0}
              </div>
              <p className="text-xs text-zinc-500 mt-2">Needs attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Retention Trend */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="retention-trend-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Retention Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.monthly_data || []}>
                    <defs>
                      <linearGradient id="colorRetention" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="retention_rate" 
                      stroke="#10B981" 
                      fill="url(#colorRetention)"
                      strokeWidth={2}
                      name="Retention"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Churn Trend */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="churn-trend-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <TrendingDown className="w-5 h-5 text-red-400" />
                Churn Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.monthly_data || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={12} />
                    <YAxis stroke="#71717A" fontSize={12} domain={[0, 20]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line 
                      type="monotone" 
                      dataKey="churn_rate" 
                      stroke="#EF4444" 
                      strokeWidth={2}
                      dot={{ fill: '#EF4444' }}
                      name="Churn"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* At-Risk Customers & AI Prediction */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* At-Risk Deals */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="at-risk-deals-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                At-Risk Deals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.at_risk_deals?.length > 0 ? (
                <div className="space-y-3">
                  {data.at_risk_deals.map((deal, i) => (
                    <div 
                      key={i}
                      className="p-4 bg-zinc-900/50 border border-amber-500/20 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <h4 className="text-white font-medium">{deal.name}</h4>
                        <p className="text-zinc-400 text-sm">{deal.company}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-amber-400 text-xs">
                            {deal.probability}% probability
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        onClick={() => getAIPrediction(deal)}
                        disabled={loadingAI}
                      >
                        {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Analyze'}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No at-risk deals detected</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Prediction */}
          <Card className="bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border-purple-500/20" data-testid="ai-prediction-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Sparkles className="w-5 h-5 text-purple-400" />
                AI Churn Prediction
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!['pro_monthly', 'pro_yearly', 'priority_monthly', 'priority_yearly'].includes(user?.subscription_tier) ? (
                <div className="text-center py-8">
                  <Sparkles className="w-10 h-10 text-purple-400/50 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm mb-4">
                    Upgrade to Pro for AI-powered churn predictions
                  </p>
                  <Button 
                    className="bg-purple-600 hover:bg-purple-500"
                    onClick={() => window.location.href = '/settings'}
                  >
                    Upgrade Now
                  </Button>
                </div>
              ) : aiPrediction ? (
                <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {aiPrediction}
                </div>
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
              <Users className="w-5 h-5 text-indigo-400" />
              Cohort Retention Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-3 px-4 text-zinc-400 font-medium">Cohort</th>
                    <th className="text-center py-3 px-4 text-zinc-400 font-medium">Month 0</th>
                    <th className="text-center py-3 px-4 text-zinc-400 font-medium">Month 1</th>
                    <th className="text-center py-3 px-4 text-zinc-400 font-medium">Month 2</th>
                    <th className="text-center py-3 px-4 text-zinc-400 font-medium">Month 3</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.cohorts?.map((cohort, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="py-3 px-4 text-white font-medium">{cohort.cohort}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                          {cohort.month_0}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                          {cohort.month_1}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">
                          {cohort.month_2}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs">
                          {cohort.month_3}%
                        </span>
                      </td>
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
