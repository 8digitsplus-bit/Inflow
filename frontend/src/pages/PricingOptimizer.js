import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  AlertCircle,
  Loader2,
  Plus,
  X,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Percent,
  Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Slider } from '../components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const PricingOptimizer = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [dashData, setDashData] = useState(null);
  const [activeTab, setActiveTab] = useState('analyze');

  const [form, setForm] = useState({
    product_name: '',
    current_price: '',
    competitor_prices: [''],
    target_margin: 30,
    market_segment: 'mid-market',
    cost_of_goods: '',
    monthly_volume: '',
    discount_percentage: 0
  });

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/pricing`, { credentials: 'include' });
      if (res.ok) setDashData(await res.json());
    } catch (err) { console.error('Failed to fetch pricing analytics:', err); }
  };

  const addCompetitorPrice = () => setForm({ ...form, competitor_prices: [...form.competitor_prices, ''] });
  const removeCompetitorPrice = (i) => {
    const updated = form.competitor_prices.filter((_, idx) => idx !== i);
    setForm({ ...form, competitor_prices: updated.length ? updated : [''] });
  };
  const updateCompetitorPrice = (i, v) => {
    const updated = [...form.competitor_prices];
    updated[i] = v;
    setForm({ ...form, competitor_prices: updated });
  };

  const handleAnalyze = async () => {
    if (user?.subscription_tier === 'free') { toast.error('Upgrade to Pro for AI pricing analysis'); return; }
    if (!form.product_name || !form.current_price) { toast.error('Please fill in product name and current price'); return; }
    const validPrices = form.competitor_prices.map(p => parseFloat(p)).filter(p => !isNaN(p) && p > 0);
    if (validPrices.length === 0) { toast.error('Please add at least one competitor price'); return; }

    setLoading(true);
    try {
      const body = {
        product_name: form.product_name,
        current_price: parseFloat(form.current_price),
        competitor_prices: validPrices,
        target_margin: form.target_margin,
        market_segment: form.market_segment
      };
      if (form.cost_of_goods) body.cost_of_goods = parseFloat(form.cost_of_goods);
      if (form.monthly_volume) body.monthly_volume = parseInt(form.monthly_volume);
      if (form.discount_percentage > 0) body.discount_percentage = form.discount_percentage;

      const response = await fetch(`${API_URL}/api/ai/pricing-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
        fetchDashboard();
        toast.success('Analysis complete!');
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Analysis failed');
      }
    } catch { toast.error('Failed to analyze pricing'); }
    finally { setLoading(false); }
  };

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl">
        <p className="text-zinc-400 text-sm mb-1">{label}</p>
        {payload.map((e, i) => (
          <p key={i} className="text-sm font-medium" style={{ color: e.color || e.fill }}>
            {e.name}: {typeof e.value === 'number' && e.value > 100 ? fmt(e.value) : e.name.includes('argin') ? `${e.value}%` : e.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="pricing-optimizer-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Pricing Optimizer</h1>
            <p className="text-zinc-400 mt-1">AI-powered pricing intelligence & optimization</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center p-1 bg-zinc-900 rounded-full border border-zinc-800">
              <button onClick={() => setActiveTab('analyze')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === 'analyze' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                data-testid="tab-analyze">Analyze</button>
              <button onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                data-testid="tab-dashboard">Dashboard</button>
            </div>
            {user?.subscription_tier === 'free' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-amber-400 text-xs">Pro feature</span>
              </div>
            )}
          </div>
        </div>

        {activeTab === 'analyze' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Enhanced Input Form */}
            <Card className="bg-zinc-950/50 border-white/10" data-testid="pricing-input-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <Target className="w-5 h-5 text-indigo-400" /> Product Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Product Name</label>
                    <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                      placeholder="e.g., Enterprise Plan" className="bg-zinc-800 border-zinc-700 text-white" data-testid="product-name-input" />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Current Price ($)</label>
                    <Input type="number" value={form.current_price} onChange={(e) => setForm({ ...form, current_price: e.target.value })}
                      placeholder="99.00" className="bg-zinc-800 border-zinc-700 text-white" data-testid="current-price-input" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Cost of Goods ($)</label>
                    <Input type="number" value={form.cost_of_goods} onChange={(e) => setForm({ ...form, cost_of_goods: e.target.value })}
                      placeholder="Optional" className="bg-zinc-800 border-zinc-700 text-white" data-testid="cogs-input" />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Monthly Volume</label>
                    <Input type="number" value={form.monthly_volume} onChange={(e) => setForm({ ...form, monthly_volume: e.target.value })}
                      placeholder="Optional" className="bg-zinc-800 border-zinc-700 text-white" data-testid="volume-input" />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Competitor Prices ($)</label>
                  <div className="space-y-2">
                    {form.competitor_prices.map((price, index) => (
                      <div key={index} className="flex gap-2">
                        <Input type="number" value={price} onChange={(e) => updateCompetitorPrice(index, e.target.value)}
                          placeholder={`Competitor ${index + 1}`} className="bg-zinc-800 border-zinc-700 text-white" data-testid={`competitor-price-${index}`} />
                        {form.competitor_prices.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeCompetitorPrice(index)} className="text-zinc-400 hover:text-red-400">
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addCompetitorPrice} className="border-zinc-700 text-zinc-400 hover:text-white" data-testid="add-competitor-btn">
                      <Plus className="w-4 h-4 mr-1" /> Add Competitor
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Market Segment</label>
                    <Select value={form.market_segment} onValueChange={(val) => setForm({ ...form, market_segment: val })}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="market-segment-select"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="startup" className="text-zinc-300">Startup / SMB</SelectItem>
                        <SelectItem value="mid-market" className="text-zinc-300">Mid-Market</SelectItem>
                        <SelectItem value="enterprise" className="text-zinc-300">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm text-zinc-400">Discount %</label>
                      <span className="text-sm font-mono text-white">{form.discount_percentage}%</span>
                    </div>
                    <Slider value={[form.discount_percentage]} onValueChange={([val]) => setForm({ ...form, discount_percentage: val })}
                      min={0} max={50} step={1} className="py-2" data-testid="discount-slider" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-zinc-400">Target Margin</label>
                    <span className="text-sm font-mono text-white">{form.target_margin}%</span>
                  </div>
                  <Slider value={[form.target_margin]} onValueChange={([val]) => setForm({ ...form, target_margin: val })}
                    min={10} max={80} step={5} className="py-2" data-testid="target-margin-slider" />
                </div>

                <Button onClick={handleAnalyze} disabled={loading || user?.subscription_tier === 'free'}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 btn-glow" data-testid="analyze-btn">
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</> : <><Sparkles className="w-4 h-4 mr-2" />Analyze Pricing</>}
                </Button>
              </CardContent>
            </Card>

            {/* Results Panel */}
            <div className="space-y-6">
              {/* Optimal Price + Metrics */}
              <Card className={`border-white/10 ${analysis ? 'bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border-indigo-500/20' : 'bg-zinc-950/50'}`} data-testid="optimal-price-card">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <DollarSign className="w-5 h-5 text-emerald-400" /> Optimal Price
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analysis ? (
                    <div className="space-y-4">
                      <div className="flex items-end gap-3">
                        <span className="text-4xl font-bold font-mono text-white">{fmt(analysis.optimal_price)}</span>
                        <span className={`text-sm font-medium flex items-center gap-1 mb-1 ${analysis.price_change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {analysis.price_change_pct >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          {analysis.price_change_pct >= 0 ? '+' : ''}{analysis.price_change_pct}%
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
                        <div>
                          <span className="text-[10px] text-zinc-500 block mb-1 uppercase tracking-wider">Current</span>
                          <span className="font-mono text-zinc-300 text-sm">{fmt(parseFloat(form.current_price))}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block mb-1 uppercase tracking-wider">Comp. Avg</span>
                          <span className="font-mono text-zinc-300 text-sm">{fmt(analysis.competitor_average)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-500 block mb-1 uppercase tracking-wider">Range</span>
                          <span className="font-mono text-zinc-300 text-sm">{fmt(analysis.competitor_range?.min)} - {fmt(analysis.competitor_range?.max)}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
                        <div className="p-3 bg-zinc-900/50 rounded-lg text-center">
                          <span className="text-[10px] text-zinc-500 block mb-1 uppercase">Current Margin</span>
                          <span className="font-mono text-white font-medium">{analysis.current_margin}%</span>
                        </div>
                        <div className="p-3 bg-zinc-900/50 rounded-lg text-center">
                          <span className="text-[10px] text-zinc-500 block mb-1 uppercase">Optimal Margin</span>
                          <span className="font-mono text-emerald-400 font-medium">{analysis.optimal_margin}%</span>
                        </div>
                        <div className="p-3 bg-zinc-900/50 rounded-lg text-center">
                          <span className="text-[10px] text-zinc-500 block mb-1 uppercase">Revenue Impact</span>
                          <span className={`font-mono font-medium ${analysis.revenue_impact_monthly >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {analysis.revenue_impact_monthly >= 0 ? '+' : ''}{fmt(analysis.revenue_impact_monthly)}/mo
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/10">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          analysis.price_position === 'below' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {analysis.price_position === 'below' ? 'Below market average' : 'Above market average'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-zinc-500">
                      <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Run analysis to see optimal price</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* AI Recommendation */}
              <Card className="bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border-purple-500/20" data-testid="ai-recommendation-card">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Sparkles className="w-5 h-5 text-purple-400" /> AI Strategy & Recommendation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analysis?.recommendation ? (
                    <div className="prose prose-invert prose-sm max-w-none max-h-[400px] overflow-y-auto">
                      <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{analysis.recommendation}</div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-zinc-500">
                      <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">{user?.subscription_tier === 'free' ? 'Upgrade to Pro for AI recommendations' : 'Run analysis to get AI strategy'}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Dashboard KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-analyses">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-sm">Total Analyses</span>
                    <div className="p-1.5 rounded bg-indigo-500/10"><BarChart3 className="w-4 h-4 text-indigo-400" /></div>
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">{dashData?.total_analyses || 0}</div>
                </CardContent>
              </Card>
              <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-price-gap">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-sm">Avg Price Gap</span>
                    <div className="p-1.5 rounded bg-emerald-500/10"><TrendingUp className="w-4 h-4 text-emerald-400" /></div>
                  </div>
                  <div className={`text-2xl font-bold font-mono ${(dashData?.price_gap || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(dashData?.price_gap || 0) >= 0 ? '+' : ''}{fmt(dashData?.price_gap || 0)}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">Optimal vs current</div>
                </CardContent>
              </Card>
              <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-competitor">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-sm">Avg Competitor</span>
                    <div className="p-1.5 rounded bg-amber-500/10"><Target className="w-4 h-4 text-amber-400" /></div>
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">{fmt(dashData?.avg_competitor_price || 0)}</div>
                </CardContent>
              </Card>
              <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-revenue-uplift">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-sm">Revenue Uplift</span>
                    <div className="p-1.5 rounded bg-purple-500/10"><DollarSign className="w-4 h-4 text-purple-400" /></div>
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-400">{fmt(dashData?.potential_revenue_uplift || 0)}</div>
                  <div className="text-xs text-zinc-400 mt-1">Potential from optimization</div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Margin Analysis Chart */}
              <Card className="bg-zinc-950/50 border-white/10" data-testid="margin-chart">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Percent className="w-5 h-5 text-emerald-400" /> Margin Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashData?.margin_data?.length > 0 ? (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dashData.margin_data} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272A" horizontal={false} />
                          <XAxis type="number" stroke="#71717A" fontSize={12} tickFormatter={(v) => `${v}%`} />
                          <YAxis type="category" dataKey="product" stroke="#71717A" fontSize={11} width={90} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                          <Legend />
                          <Bar dataKey="current_margin" name="Current Margin" fill="#6366F1" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="optimal_margin" name="Optimal Margin" fill="#10B981" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="target_margin" name="Target Margin" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500"><Percent className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">Run analyses to see margin data</p></div>
                  )}
                </CardContent>
              </Card>

              {/* Competitor Positioning */}
              <Card className="bg-zinc-950/50 border-white/10" data-testid="positioning-chart">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Target className="w-5 h-5 text-indigo-400" /> Competitor Positioning
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashData?.price_position_data?.length > 0 ? (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dashData.price_position_data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                          <XAxis dataKey="product" stroke="#71717A" fontSize={11} />
                          <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${v}`} />
                          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                          <Legend />
                          <Bar dataKey="your_price" name="Your Price" fill="#6366F1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="competitor_avg" name="Competitor Avg" fill="#EF4444" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="optimal" name="Optimal" fill="#10B981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500"><Target className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">Run analyses to see competitor data</p></div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Price Elasticity */}
            <Card className="bg-zinc-950/50 border-white/10" data-testid="elasticity-chart">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <TrendingUp className="w-5 h-5 text-cyan-400" /> Price Elasticity Simulator
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dashData?.elasticity_data?.length > 0 ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dashData.elasticity_data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                        <XAxis dataKey="price_change" stroke="#71717A" fontSize={12} />
                        <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                        <Bar dataKey="estimated_revenue" name="Estimated Revenue" radius={[4, 4, 0, 0]}>
                          {dashData.elasticity_data.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-12 text-zinc-500"><TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">Run analyses to see elasticity data</p></div>
                )}
              </CardContent>
            </Card>

            {/* Segment Breakdown + Recent History */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="bg-zinc-950/50 border-white/10" data-testid="segment-breakdown">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Package className="w-5 h-5 text-amber-400" /> Segment Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashData?.segment_breakdown?.length > 0 ? (
                    <div className="space-y-3">
                      {dashData.segment_breakdown.map((seg, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-8 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <div>
                              <h4 className="text-white font-medium text-sm">{seg.segment}</h4>
                              <p className="text-zinc-400 text-xs">{seg.count} analys{seg.count === 1 ? 'is' : 'es'}</p>
                            </div>
                          </div>
                          <span className="text-white font-mono text-sm">{fmt(seg.avg_price)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500"><Package className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">No segment data yet</p></div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-zinc-950/50 border-white/10" data-testid="recent-analyses">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <History className="w-5 h-5 text-zinc-400" /> Recent Analyses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashData?.recent_analyses?.length > 0 ? (
                    <div className="space-y-3">
                      {dashData.recent_analyses.map((a, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                          <div>
                            <h4 className="text-white font-medium text-sm">{a.product_name}</h4>
                            <p className="text-zinc-400 text-xs capitalize">{a.market_segment?.replace('_', ' ')} &middot; {a.target_margin}% margin</p>
                          </div>
                          <div className="text-right">
                            <div className="text-white font-mono text-sm">{fmt(a.current_price)} <span className="text-zinc-500 mx-1">&rarr;</span> <span className="text-emerald-400">{fmt(a.optimal_price)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500"><History className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">No analyses yet</p></div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PricingOptimizer;
