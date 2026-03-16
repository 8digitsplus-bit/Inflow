import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  TrendingUp, 
  Target, 
  Zap,
  AlertCircle,
  Sparkles,
  Loader2,
  RefreshCw,
  FlaskConical,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Cell
} from 'recharts';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const FUNNEL_COLORS = ['#6366F1', '#8B5CF6', '#06B6D4', '#F59E0B', '#10B981'];

const ConversionOptimization = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiRecommendations, setAiRecommendations] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    fetchCROData();
  }, []);

  const fetchCROData = async () => {
    try {
      const response = await fetch(`${API_URL}/api/analytics/cro`, {
        credentials: 'include'
      });
      if (response.ok) {
        setData(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch CRO data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAIRecommendations = async () => {
    if (!['pro_monthly', 'pro_yearly', 'enterprise_monthly', 'enterprise_yearly'].includes(user?.subscription_tier)) {
      toast.error('Upgrade to Pro for AI CRO recommendations');
      return;
    }

    setLoadingAI(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/cro-recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ funnel_data: data })
      });

      if (response.ok) {
        const result = await response.json();
        setAiRecommendations(result.recommendations);
        toast.success('Recommendations generated');
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to get recommendations');
      }
    } catch (error) {
      toast.error('Failed to get AI recommendations');
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
            <p key={index} className="text-sm font-medium" style={{ color: entry.color || '#fff' }}>
              {entry.name}: {entry.value}{typeof entry.value === 'number' && entry.name.includes('rate') ? '%' : ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'completed': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
      case 'planned': return 'bg-zinc-700/50 text-zinc-400 border-zinc-600';
      default: return 'bg-zinc-700/50 text-zinc-400 border-zinc-600';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="cro-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Conversion Rate Optimization
            </h1>
            <p className="text-zinc-400 mt-1 text-sm">Optimize your sales funnel and increase conversions</p>
          </div>
          <Button 
            variant="outline" 
            className="border-zinc-700"
            onClick={fetchCROData}
            data-testid="refresh-cro-btn"
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="overall-conversion-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400 text-sm">Overall Conversion</span>
                <Target className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold font-mono text-emerald-400">
                {data?.overall_conversion || 0}%
              </div>
              <p className="text-xs text-emerald-400/70 mt-2">+4.2% vs last month</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="total-opportunities-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400 text-sm">Total Opportunities</span>
                <TrendingUp className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="text-3xl font-bold font-mono text-white">
                {data?.total_opportunities || 0}
              </div>
              <p className="text-xs text-zinc-500 mt-2">In pipeline</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="won-deals-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400 text-sm">Win Deals</span>
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div className="text-3xl font-bold font-mono text-amber-400">
                {data?.won_deals || 0}
              </div>
              <p className="text-xs text-zinc-500 mt-2">This period</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="avg-cycle-card">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-zinc-400 text-sm">Avg. Sales Cycle</span>
                <Target className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="text-3xl font-bold font-mono text-cyan-400">
                {data?.avg_cycle_days || 0}
              </div>
              <p className="text-xs text-zinc-500 mt-2">Days to close</p>
            </CardContent>
          </Card>
        </div>

        {/* Funnel & Conversion Chart */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Conversion Funnel */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="funnel-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Target className="w-5 h-5 text-indigo-400" />
                Conversion Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.funnel_data || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272A" horizontal={false} />
                    <XAxis type="number" stroke="#71717A" fontSize={12} />
                    <YAxis type="category" dataKey="stage" stroke="#71717A" fontSize={11} width={80} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="conversion" name="Conversion Rate" radius={[0, 4, 4, 0]}>
                      {data?.funnel_data?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Stage Conversions */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="stage-conversions-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <ArrowRight className="w-5 h-5 text-cyan-400" />
                Stage-to-Stage Conversion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data?.stage_conversions?.map((conv, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">
                        {conv.from_stage} → {conv.to_stage}
                      </span>
                      <span className={`font-mono font-medium ${
                        conv.rate >= 70 ? 'text-emerald-400' :
                        conv.rate >= 50 ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {conv.rate}%
                      </span>
                    </div>
                    <Progress 
                      value={conv.rate} 
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* A/B Tests & Bottlenecks */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* A/B Tests */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="ab-tests-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <FlaskConical className="w-5 h-5 text-purple-400" />
                A/B Tests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data?.ab_tests?.map((test, i) => (
                  <div 
                    key={i}
                    className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-white font-medium">{test.name}</h4>
                      <Badge className={getStatusColor(test.status)}>
                        {test.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-400">Improvement</span>
                      <span className={`font-mono ${
                        test.improvement.startsWith('+') ? 'text-emerald-400' : 'text-zinc-400'
                      }`}>
                        {test.improvement}
                      </span>
                    </div>
                    {test.confidence > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-zinc-500">Confidence</span>
                          <span className="text-zinc-400">{test.confidence}%</span>
                        </div>
                        <Progress value={test.confidence} className="h-1" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bottlenecks */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="bottlenecks-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <AlertCircle className="w-5 h-5 text-amber-400" />
                Bottlenecks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.bottlenecks?.length > 0 ? (
                <div className="space-y-3">
                  {data.bottlenecks.map((bottleneck, i) => (
                    <div 
                      key={i}
                      className={`p-4 rounded-lg border ${
                        bottleneck.severity === 'high' 
                          ? 'bg-red-500/10 border-red-500/30' 
                          : 'bg-amber-500/10 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-white font-medium">{bottleneck.stage} Stage</h4>
                          <p className={`text-sm ${
                            bottleneck.severity === 'high' ? 'text-red-400' : 'text-amber-400'
                          }`}>
                            {bottleneck.drop_rate}% drop-off rate
                          </p>
                        </div>
                        <Badge className={
                          bottleneck.severity === 'high' 
                            ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }>
                          {bottleneck.severity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>No significant bottlenecks detected</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Recommendations */}
        <Card className="bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border-purple-500/20" data-testid="ai-recommendations-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI Optimization Recommendations
            </CardTitle>
            {['pro_monthly', 'pro_yearly', 'enterprise_monthly', 'enterprise_yearly'].includes(user?.subscription_tier) && (
              <Button
                onClick={getAIRecommendations}
                disabled={loadingAI}
                className="bg-purple-600 hover:bg-purple-500"
                data-testid="get-ai-recs-btn"
              >
                {loadingAI ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Get Recommendations</>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!['pro_monthly', 'pro_yearly', 'enterprise_monthly', 'enterprise_yearly'].includes(user?.subscription_tier) ? (
              <div className="text-center py-8">
                <Sparkles className="w-10 h-10 text-purple-400/50 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm mb-4">
                  Upgrade to Pro for AI-powered CRO recommendations
                </p>
                <Button 
                  className="bg-purple-600 hover:bg-purple-500"
                  onClick={() => window.location.href = '/settings'}
                >
                  Upgrade Now
                </Button>
              </div>
            ) : aiRecommendations ? (
              <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                {aiRecommendations}
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-500">
                <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Click "Get Recommendations" to analyze your funnel</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ConversionOptimization;
