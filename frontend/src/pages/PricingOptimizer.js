import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  Sparkles, 
  TrendingUp, 
  DollarSign,
  Target,
  AlertCircle,
  Loader2,
  Plus,
  X
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

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PricingOptimizer = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  
  const [form, setForm] = useState({
    product_name: '',
    current_price: '',
    competitor_prices: [''],
    target_margin: 30,
    market_segment: 'mid-market'
  });

  const addCompetitorPrice = () => {
    setForm({
      ...form,
      competitor_prices: [...form.competitor_prices, '']
    });
  };

  const removeCompetitorPrice = (index) => {
    const updated = form.competitor_prices.filter((_, i) => i !== index);
    setForm({ ...form, competitor_prices: updated.length ? updated : [''] });
  };

  const updateCompetitorPrice = (index, value) => {
    const updated = [...form.competitor_prices];
    updated[index] = value;
    setForm({ ...form, competitor_prices: updated });
  };

  const handleAnalyze = async () => {
    if (user?.subscription_tier === 'free') {
      toast.error('Upgrade to Pro for AI pricing analysis');
      return;
    }

    if (!form.product_name || !form.current_price) {
      toast.error('Please fill in product name and current price');
      return;
    }

    const validPrices = form.competitor_prices
      .map(p => parseFloat(p))
      .filter(p => !isNaN(p) && p > 0);

    if (validPrices.length === 0) {
      toast.error('Please add at least one competitor price');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/ai/pricing-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          product_name: form.product_name,
          current_price: parseFloat(form.current_price),
          competitor_prices: validPrices,
          target_margin: form.target_margin,
          market_segment: form.market_segment
        })
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
        toast.success('Analysis complete!');
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Analysis failed');
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      toast.error('Failed to analyze pricing');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const priceChange = analysis ? 
    ((analysis.optimal_price - parseFloat(form.current_price)) / parseFloat(form.current_price) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="pricing-optimizer-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Pricing Optimizer
            </h1>
            <p className="text-zinc-400 mt-1">AI-powered pricing recommendations</p>
          </div>
          {user?.subscription_tier === 'free' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-sm">Pro feature</span>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <Card className="bg-zinc-950/50 border-white/10" data-testid="pricing-input-card">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Target className="w-5 h-5 text-indigo-400" />
                Product Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Product Name</label>
                <Input
                  value={form.product_name}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                  placeholder="e.g., Enterprise Plan"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  data-testid="product-name-input"
                />
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Current Price ($)</label>
                <Input
                  type="number"
                  value={form.current_price}
                  onChange={(e) => setForm({ ...form, current_price: e.target.value })}
                  placeholder="99.00"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  data-testid="current-price-input"
                />
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Competitor Prices ($)</label>
                <div className="space-y-2">
                  {form.competitor_prices.map((price, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        type="number"
                        value={price}
                        onChange={(e) => updateCompetitorPrice(index, e.target.value)}
                        placeholder={`Competitor ${index + 1}`}
                        className="bg-zinc-800 border-zinc-700 text-white"
                        data-testid={`competitor-price-${index}`}
                      />
                      {form.competitor_prices.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCompetitorPrice(index)}
                          className="text-zinc-400 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCompetitorPrice}
                    className="border-zinc-700 text-zinc-400 hover:text-white"
                    data-testid="add-competitor-btn"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Competitor
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Market Segment</label>
                <Select 
                  value={form.market_segment} 
                  onValueChange={(val) => setForm({ ...form, market_segment: val })}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="market-segment-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="startup" className="text-zinc-300">Startup / SMB</SelectItem>
                    <SelectItem value="mid-market" className="text-zinc-300">Mid-Market</SelectItem>
                    <SelectItem value="enterprise" className="text-zinc-300">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-zinc-400">Target Margin</label>
                  <span className="text-sm font-mono text-white">{form.target_margin}%</span>
                </div>
                <Slider
                  value={[form.target_margin]}
                  onValueChange={([val]) => setForm({ ...form, target_margin: val })}
                  min={10}
                  max={80}
                  step={5}
                  className="py-2"
                  data-testid="target-margin-slider"
                />
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={loading || user?.subscription_tier === 'free'}
                className="w-full bg-indigo-600 hover:bg-indigo-500 btn-glow"
                data-testid="analyze-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Analyze Pricing
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="space-y-6">
            {/* Optimal Price Card */}
            <Card className={`border-white/10 ${analysis ? 'bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border-indigo-500/20' : 'bg-zinc-950/50'}`} data-testid="optimal-price-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  Optimal Price
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis ? (
                  <div className="space-y-4">
                    <div className="flex items-end gap-3">
                      <span className="text-4xl font-bold font-mono text-white">
                        {formatCurrency(analysis.optimal_price)}
                      </span>
                      <span className={`text-sm font-medium flex items-center gap-1 mb-1 ${
                        priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        <TrendingUp className="w-4 h-4" />
                        {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                      <div>
                        <span className="text-xs text-zinc-400 block mb-1">Current Price</span>
                        <span className="font-mono text-zinc-300">{formatCurrency(parseFloat(form.current_price))}</span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-400 block mb-1">Competitor Avg</span>
                        <span className="font-mono text-zinc-300">{formatCurrency(analysis.competitor_average)}</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                      <span className="text-xs text-zinc-400 block mb-1">Market Position</span>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        analysis.price_position === 'below' 
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400'
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
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  AI Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis?.recommendation ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {analysis.recommendation}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-zinc-500">
                    <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">
                      {user?.subscription_tier === 'free' 
                        ? 'Upgrade to Pro for AI recommendations'
                        : 'Run analysis to get AI recommendations'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PricingOptimizer;
