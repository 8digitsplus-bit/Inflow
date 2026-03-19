import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  CreditCard,
  ShoppingBag,
  Users,
  Cloud,
  Calculator,
  Check,
  Loader2,
  RefreshCw,
  Unplug,
  ArrowRight,
  Zap,
  Database,
  TrendingUp,
  Clock,
  Key,
  ExternalLink,
  Shield,
  X,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ICON_MAP = { CreditCard, ShoppingBag, Users, Cloud, Calculator };

const ConnectBusiness = () => {
  const [platforms, setPlatforms] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [stripeKeyModal, setStripeKeyModal] = useState(false);
  const [stripeKey, setStripeKey] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [platRes, sumRes] = await Promise.all([
        fetch(`${API_URL}/api/business/platforms`, { credentials: 'include' }),
        fetch(`${API_URL}/api/business/summary`, { credentials: 'include' }),
      ]);
      if (platRes.ok) setPlatforms(await platRes.json());
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch (err) {
      console.error('Failed to fetch business data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleConnect = async (platformId) => {
    if (platformId === 'stripe') {
      setStripeKeyModal(true);
      return;
    }
    setActionLoading(platformId);
    try {
      const res = await fetch(`${API_URL}/api/business/connect/${platformId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        await fetchData();
      } else {
        toast.error(data.detail || 'Failed to connect');
      }
    } catch {
      toast.error('Connection failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStripeConnect = async () => {
    if (!stripeKey.trim()) {
      toast.error('Please enter your Stripe API key');
      return;
    }
    if (!stripeKey.startsWith('sk_')) {
      toast.error('API key must start with sk_test_ or sk_live_');
      return;
    }
    setActionLoading('stripe');
    try {
      const res = await fetch(`${API_URL}/api/business/connect/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ api_key: stripeKey }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setStripeKeyModal(false);
        setStripeKey('');
        await fetchData();
      } else {
        toast.error(data.detail || 'Failed to connect Stripe');
      }
    } catch {
      toast.error('Connection failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async (platformId) => {
    setActionLoading(`disconnect-${platformId}`);
    try {
      const res = await fetch(`${API_URL}/api/business/disconnect/${platformId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Platform disconnected');
        await fetchData();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Failed to disconnect');
      }
    } catch {
      toast.error('Disconnect failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSync = async (platformId) => {
    setActionLoading(`sync-${platformId}`);
    try {
      const res = await fetch(`${API_URL}/api/business/sync/${platformId}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        await fetchData();
      } else {
        toast.error(data.detail || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setActionLoading(null);
    }
  };

  const connectedCount = platforms.filter((p) => p.connected).length;

  const formatDate = (iso) => {
    if (!iso) return '--';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8" data-testid="connect-business-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="connect-business-title">
              Live Integration
            </h1>
            <p className="text-zinc-400 mt-1 text-sm max-w-xl">
              Integrate your existing tools to automatically sync data and power all your analytics with real business insights.
            </p>
          </div>
          {connectedCount > 0 && (
            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 shrink-0" data-testid="connected-platforms-count">
              {connectedCount} connected
            </span>
          )}
        </div>

        {/* Summary Cards */}
        {summary && summary.connected_count > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="business-summary-cards">
            <SummaryCard icon={Database} label="Platforms Connected" value={summary.connected_count} color="text-indigo-400" />
            <SummaryCard icon={TrendingUp} label="Records Synced" value={summary.total_records.toLocaleString()} color="text-emerald-400" />
            <SummaryCard icon={CreditCard} label="Total Pipeline Value" value={`$${(summary.total_synced_value || 0).toLocaleString()}`} color="text-amber-400" />
            <SummaryCard icon={Zap} label="Data Sources Active" value={summary.connected_count} color="text-indigo-400" />
          </div>
        )}

        {/* Empty state */}
        {!loading && connectedCount === 0 && (
          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-8 text-center" data-testid="empty-state">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>No platforms connected yet</h3>
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Connect your business tools below to automatically sync data and unlock powerful insights across all your dashboards.
            </p>
          </div>
        )}

        {/* Platform Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Available Platforms</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {platforms.map((platform) => {
                const Icon = ICON_MAP[platform.icon] || Database;
                const isConnecting = actionLoading === platform.platform_id;
                const isDisconnecting = actionLoading === `disconnect-${platform.platform_id}`;
                const isSyncing = actionLoading === `sync-${platform.platform_id}`;

                return (
                  <Card
                    key={platform.platform_id}
                    className={`bg-zinc-950/50 border transition-all duration-300 hover:border-zinc-600 ${
                      platform.connected ? 'border-emerald-500/30' : 'border-white/10'
                    }`}
                    data-testid={`platform-card-${platform.platform_id}`}
                  >
                    <CardContent className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${platform.color}18` }}>
                            <Icon className="w-5 h-5" style={{ color: platform.color }} />
                          </div>
                          <div>
                            <h3 className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>{platform.name}</h3>
                            <span className="text-[11px] text-zinc-500 font-medium">{platform.category}</span>
                          </div>
                        </div>
                        {platform.connected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0" data-testid={`connected-badge-${platform.platform_id}`}>
                            {platform.is_live ? (
                              <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Zap className="w-3 h-3" /> Live
                              </span>
                            ) : (
                              <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Check className="w-3 h-3" /> Demo
                              </span>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-zinc-400 text-xs leading-relaxed mb-3">{platform.description}</p>

                      {/* Account name for live connections */}
                      {platform.connected && platform.account_name && (
                        <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                          <Shield className="w-3 h-3 text-indigo-400" />
                          <span className="text-[11px] text-indigo-300">{platform.account_name}</span>
                        </div>
                      )}

                      {/* Stats for live Stripe */}
                      {platform.connected && platform.stats && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
                            <span className="text-[10px] text-zinc-500 block">Customers</span>
                            <span className="text-sm font-semibold text-white">{platform.stats.customers}</span>
                          </div>
                          <div className="bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
                            <span className="text-[10px] text-zinc-500 block">Revenue</span>
                            <span className="text-sm font-semibold text-emerald-400">${(platform.stats.revenue || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
                            <span className="text-[10px] text-zinc-500 block">Subscriptions</span>
                            <span className="text-sm font-semibold text-white">{platform.stats.subscriptions}</span>
                          </div>
                          <div className="bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
                            <span className="text-[10px] text-zinc-500 block">Charges</span>
                            <span className="text-sm font-semibold text-white">{platform.stats.charges}</span>
                          </div>
                        </div>
                      )}

                      {/* Data types */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {platform.data_types?.map((dt) => (
                          <span key={dt} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 capitalize">{dt}</span>
                        ))}
                      </div>

                      {/* Connected actions */}
                      {platform.connected ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-4 text-[11px] text-zinc-500">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(platform.last_synced)}</span>
                            <span>{platform.records_synced} records</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm" variant="outline"
                              className="flex-1 border-zinc-700 text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 text-xs h-8"
                              onClick={() => handleSync(platform.platform_id)}
                              disabled={isSyncing}
                              data-testid={`sync-${platform.platform_id}`}
                            >
                              {isSyncing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                              Re-sync
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 text-xs h-8 px-3"
                              onClick={() => handleDisconnect(platform.platform_id)}
                              disabled={isDisconnecting}
                              data-testid={`disconnect-${platform.platform_id}`}
                            >
                              {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-xs h-9"
                          onClick={() => handleConnect(platform.platform_id)}
                          disabled={isConnecting}
                          data-testid={`connect-${platform.platform_id}`}
                        >
                          {isConnecting ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Connecting...</>
                          ) : platform.requires_key ? (
                            <><Key className="w-3.5 h-3.5 mr-2" />Connect with API Key</>
                          ) : (
                            <><ArrowRight className="w-3.5 h-3.5 mr-2" />Connect</>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Info section */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-5" data-testid="info-section">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-white mb-1" style={{ fontFamily: 'Outfit' }}>How it works</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                When you connect a platform, InFlow syncs your business data and feeds it directly into your Sales Pipeline, Performance, Revenue, and all other analytics features.
                Stripe uses your real API key for live data. Other platforms use simulated data for demo purposes.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stripe API Key Modal */}
      {stripeKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setStripeKeyModal(false); setStripeKey(''); }} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" data-testid="stripe-key-modal">
            <button onClick={() => { setStripeKeyModal(false); setStripeKey(''); }} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#635BFF]/15 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-[#635BFF]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Connect Stripe</h3>
                <p className="text-xs text-zinc-500">Enter your API key to sync live data</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Secret API Key</label>
                <input
                  type="password"
                  value={stripeKey}
                  onChange={(e) => setStripeKey(e.target.value)}
                  placeholder="sk_test_... or sk_live_..."
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  data-testid="stripe-api-key-input"
                />
              </div>

              <div className="flex items-start gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <Shield className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="text-[11px] text-zinc-400 leading-relaxed">
                  Your key is stored securely and only used to read your Stripe data. We never modify your Stripe account.
                </div>
              </div>

              <a
                href="https://dashboard.stripe.com/apikeys"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Find your API key on Stripe Dashboard
              </a>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-zinc-700 text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30"
                  onClick={() => { setStripeKeyModal(false); setStripeKey(''); }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-[#635BFF] hover:bg-[#5851ea] text-white"
                  onClick={handleStripeConnect}
                  disabled={actionLoading === 'stripe' || !stripeKey.trim()}
                  data-testid="stripe-connect-submit"
                >
                  {actionLoading === 'stripe' ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Connecting...</>
                  ) : (
                    <><Zap className="w-3.5 h-3.5 mr-2" />Connect & Sync</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

const SummaryCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
    </div>
    <p className="text-xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>{value}</p>
  </div>
);

export default ConnectBusiness;
