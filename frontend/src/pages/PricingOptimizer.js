import React, { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { STAGE_COLOR_ARRAY } from '../constants/colors';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  ComposedChart
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  DollarSign, TrendingUp, Percent, Target, BarChart3, Loader2,
  ArrowUpRight, ArrowDownRight, Zap, Link2, Sparkles, RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { AIResponseRenderer } from '../components/AIResponseRenderer';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PricingOptimizer = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dashData, setDashData] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/analytics/pricing`, { credentials: 'include' });
      if (res.ok) setDashData(await res.json());
    } catch (err) { console.error('Failed to fetch pricing analytics:', err); }
    finally { setLoading(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/api/analytics/pricing/sync`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        fetchDashboard();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Sync failed');
      }
    } catch { toast.error('Failed to sync pricing data'); }
    finally { setSyncing(false); }
  };

  const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  const fetchAIAnalysis = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ai/pricing-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          product_data: {
            total_products: dashData?.total_analyses || 0,
            avg_price: dashData?.avg_current_price || 0,
            price_gap: dashData?.price_gap || 0,
            revenue_uplift: dashData?.potential_revenue_uplift || 0,
            products: (dashData?.recent_analyses || []).slice(0, 5).map(p => ({
              name: p.product_name,
              current: p.current_price,
              optimal: p.optimal_price,
              segment: p.market_segment
            }))
          }
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiAnalysis(data.analysis || data.recommendations);
      } else {
        toast.error('AI analysis failed. Try again.');
      }
    } catch { toast.error('AI analysis request failed.'); }
    finally { setAiLoading(false); }
  };

  if (loading && !dashData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Pricing Optimizer</h1>
            <p className="text-zinc-400 mt-1">AI-powered pricing intelligence from your integrations</p>
          </div>
          <div className="flex items-center gap-3">
            {dashData?.connected_platforms?.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <Link2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 text-xs">{dashData.connected_platforms.length} connected</span>
              </div>
            )}
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="bg-slate-600 hover:bg-slate-700 text-white gap-2"
              data-testid="sync-pricing-btn"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Integrations'}
            </Button>
          </div>
        </div>

        {/* No data state */}
        {(!dashData || dashData.total_analyses === 0) ? (
          <Card className="bg-zinc-950/50 border-white/10">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BarChart3 className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">No pricing data yet</h3>
              <p className="text-zinc-400 text-sm text-center max-w-md mb-6">
                Connect your business platforms (Stripe, Shopify, HubSpot, etc.) on the Integrations page, then click "Sync from Integrations" to pull your product and pricing data.
              </p>
              <Button onClick={handleSync} disabled={syncing} className="bg-slate-600 hover:bg-slate-700 text-white gap-2" data-testid="sync-empty-btn">
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-products">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-sm">Products Tracked</span>
                    <div className="p-1.5 rounded bg-slate-500/10"><BarChart3 className="w-4 h-4 text-slate-400" /></div>
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">{dashData?.total_analyses || 0}</div>
                  <div className="text-xs text-zinc-500 mt-1">From integrations</div>
                </CardContent>
              </Card>
              <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-avg-price">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-sm">Avg Current Price</span>
                    <div className="p-1.5 rounded bg-cyan-500/10"><DollarSign className="w-4 h-4 text-cyan-400" /></div>
                  </div>
                  <div className="text-2xl font-bold font-mono text-white">{fmt(dashData?.avg_current_price || 0)}</div>
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
              {/* Margin Analysis - Line Chart */}
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
                        <LineChart data={dashData.margin_data} margin={{ top: 10, right: 20, left: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                          <XAxis dataKey="product" stroke="#71717A" fontSize={9} interval={0} angle={-25} textAnchor="end" height={60} />
                          <YAxis stroke="#71717A" fontSize={11} tickFormatter={(v) => `${v}%`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 10px', fontSize: '11px' }}
                            formatter={(value, name) => [`${value}%`, name]}
                            itemStyle={{ color: '#e4e4e7', fontSize: '11px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="current_margin" name="Current Margin" stroke="#64748B" strokeWidth={2.5} dot={{ r: 5, fill: '#64748B', stroke: '#0c0c10', strokeWidth: 2 }} activeDot={{ r: 7 }} />
                          <Line type="monotone" dataKey="optimal_margin" name="Optimal Margin" stroke="#10B981" strokeWidth={2.5} dot={{ r: 5, fill: '#10B981', stroke: '#0c0c10', strokeWidth: 2 }} activeDot={{ r: 7 }} />
                          <Line type="monotone" dataKey="target_margin" name="Target Margin" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 5, fill: '#F59E0B', stroke: '#0c0c10', strokeWidth: 2 }} activeDot={{ r: 7 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500"><Percent className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">Sync integrations to see margin data</p></div>
                  )}
                </CardContent>
              </Card>

              {/* Price vs Optimal Comparison */}
              <Card className="bg-zinc-950/50 border-white/10" data-testid="price-comparison-chart">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Target className="w-5 h-5 text-slate-400" /> Price vs Optimal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashData?.price_comparison_data?.length > 0 ? (
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={dashData.price_comparison_data} margin={{ top: 10, right: 20, left: 5, bottom: 5 }} barGap={2} barCategoryGap="20%">
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                          <XAxis dataKey="product" stroke="#71717A" fontSize={9} interval={0} angle={-25} textAnchor="end" height={60} />
                          <YAxis stroke="#71717A" fontSize={11} tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 10px', fontSize: '11px' }}
                            formatter={(value, name) => [fmt(value), name]}
                            itemStyle={{ color: '#e4e4e7', fontSize: '11px' }}
                            cursor={{ fill: 'rgba(39, 39, 42, 0.15)' }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="current_price" name="Current Price" fill="#64748B" radius={[4, 4, 0, 0]} maxBarSize={32} />
                          <Bar dataKey="optimal_price" name="Optimal Price" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-zinc-500"><Target className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">Sync integrations to see price comparison</p></div>
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
                      <BarChart data={dashData.elasticity_data} barCategoryGap="20%" barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                        <XAxis dataKey="price_change" stroke="#71717A" fontSize={12} />
                        <YAxis stroke="#71717A" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 10px', fontSize: '11px' }}
                          formatter={(value) => [fmt(value), 'Est. Revenue']}
                          itemStyle={{ color: '#e4e4e7', fontSize: '11px' }}
                          cursor={{ fill: 'rgba(39, 39, 42, 0.15)' }}
                        />
                        <Bar dataKey="estimated_revenue" name="Estimated Revenue" radius={[3, 3, 0, 0]} maxBarSize={60}>
                          {dashData.elasticity_data.map((_, i) => (
                            <Cell key={i} fill={STAGE_COLOR_ARRAY[i % STAGE_COLOR_ARRAY.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-12 text-zinc-500"><TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-50" /><p className="text-sm">Sync integrations to see elasticity data</p></div>
                )}
              </CardContent>
            </Card>

            {/* AI Pricing Analysis */}
            <Card className="bg-zinc-950/50 border-white/10" data-testid="ai-pricing-analysis-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Sparkles className="w-5 h-5 text-slate-400" /> AI Pricing Analysis
                  </CardTitle>
                  <Button
                    onClick={fetchAIAnalysis}
                    disabled={aiLoading || !dashData?.total_analyses}
                    className="bg-slate-600 hover:bg-slate-700 text-white text-xs gap-2"
                    data-testid="get-ai-pricing-btn"
                  >
                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {aiLoading ? 'Analyzing...' : 'Get Analysis'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {aiAnalysis ? (
                  <div className="max-h-[300px] overflow-y-auto">
                    <AIResponseRenderer text={aiAnalysis} />
                  </div>
                ) : (
                  <p className="text-zinc-500 text-sm text-center py-6">
                    {dashData?.total_analyses ? 'Click "Get Analysis" for AI-powered pricing recommendations' : 'Sync your integrations first to enable AI analysis'}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Bottom Row */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Segment Breakdown */}
              <Card className="bg-zinc-950/50 border-white/10" data-testid="segment-breakdown">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <Zap className="w-5 h-5 text-amber-400" /> Segment Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashData?.segment_breakdown?.length > 0 ? (
                    <div className="space-y-3">
                      {dashData.segment_breakdown.map((seg, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                          <div className="flex items-center gap-3">
                            <div className="w-2.5 h-8 rounded-full" style={{ backgroundColor: STAGE_COLOR_ARRAY[i % STAGE_COLOR_ARRAY.length] }} />
                            <div>
                              <p className="text-white text-sm font-medium">{seg.segment}</p>
                              <p className="text-zinc-500 text-xs">{seg.count} product{seg.count !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <span className="font-mono text-white text-sm">{fmt(seg.avg_price)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-zinc-500 py-8 text-sm">No segments yet</p>
                  )}
                </CardContent>
              </Card>

              {/* Recent Products */}
              <Card className="bg-zinc-950/50 border-white/10" data-testid="recent-products">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                    <DollarSign className="w-5 h-5 text-cyan-400" /> Synced Products
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashData?.recent_analyses?.length > 0 ? (
                    <div className="space-y-2.5">
                      {dashData.recent_analyses.map((a, i) => {
                        const diff = a.optimal_price - a.current_price;
                        return (
                          <div key={i} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                            <div>
                              <h4 className="text-white font-medium text-sm">{a.product_name}</h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-zinc-500 text-xs capitalize">{a.market_segment?.replace(/_/g, ' ')}</span>
                                {a.source && <span className="text-zinc-600 text-xs">via {a.source}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-400 text-sm font-mono">{fmt(a.current_price)}</span>
                              {diff > 0 ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : <ArrowDownRight className="w-4 h-4 text-red-400" />}
                              <span className={`text-sm font-mono font-semibold ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(a.optimal_price)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-zinc-500 py-8 text-sm">No products synced yet</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PricingOptimizer;
