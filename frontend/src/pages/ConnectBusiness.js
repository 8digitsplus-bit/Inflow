import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import CsvImportModal from '../components/CsvImportModal';
import CustomApiModal from '../components/CustomApiModal';
import { useAuth } from '../contexts/AuthContext';
import {
  CreditCard, ShoppingBag, Users, Cloud, Calculator, Check, Loader2, RefreshCw, Unplug,
  ArrowRight, Zap, Database, TrendingUp, Clock, Key, ExternalLink, Shield, X,
  FileSpreadsheet, Globe, Sparkles, Upload, AlertTriangle, Lock, DollarSign, BarChart3,
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ICON_MAP = { CreditCard, ShoppingBag, Users, Cloud, Calculator, DollarSign, BarChart3 };

const ConnectBusiness = () => {
  const { user } = useAuth();
  const [platforms, setPlatforms] = useState([]);
  const [summary, setSummary] = useState(null);
  const [customSources, setCustomSources] = useState([]);
  const [detectedPlatforms, setDetectedPlatforms] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [connectModal, setConnectModal] = useState(null); // platform object or null
  const [connectFields, setConnectFields] = useState({});
  const [csvModal, setCsvModal] = useState(false);
  const [apiModal, setApiModal] = useState(false);

  const TIER_LEVEL = { trial: 0, expired: -1, cancelled: -1, free: 0, essential_monthly: 1, essential_yearly: 1, pro_monthly: 2, pro_yearly: 2, enterprise_monthly: 3, enterprise_yearly: 3 };
  const userTier = user?.subscription_tier || 'trial';
  const userLevel = TIER_LEVEL[userTier] ?? 0;
  const isProPlus = userLevel >= 2;
  const isEnterprise = userLevel >= 3;

  const fetchData = useCallback(async () => {
    try {
      const [platRes, sumRes, customRes, detectRes, usageRes] = await Promise.all([
        fetch(`${API_URL}/api/business/platforms`, { credentials: 'include' }),
        fetch(`${API_URL}/api/business/summary`, { credentials: 'include' }),
        fetch(`${API_URL}/api/business/custom-sources`, { credentials: 'include' }),
        fetch(`${API_URL}/api/business/detect-platforms`, { credentials: 'include' }),
        fetch(`${API_URL}/api/business/integration-usage`, { credentials: 'include' }),
      ]);
      if (platRes.ok) setPlatforms(await platRes.json());
      if (sumRes.ok) setSummary(await sumRes.json());
      if (customRes.ok) setCustomSources(await customRes.json());
      if (detectRes.ok) {
        const d = await detectRes.json();
        setDetectedPlatforms(d.detected_platforms || []);
      }
      if (usageRes.ok) setUsage(await usageRes.json());
    } catch (err) {
      console.error('Failed to fetch business data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openConnectModal = (platform) => {
    setConnectModal(platform);
    const initial = {};
    (platform.key_fields || []).forEach(f => { initial[f.name] = ''; });
    setConnectFields(initial);
  };

  const handleConnect = async () => {
    if (!connectModal) return;
    const platform = connectModal;

    // Validate required fields (skip checkboxes — they're optional booleans)
    for (const field of (platform.key_fields || [])) {
      if (field.type === 'checkbox') continue;
      const val = connectFields[field.name];
      if (typeof val !== 'string' || !val.trim()) {
        toast.error(`${field.label} is required`);
        return;
      }
    }

    setActionLoading(platform.platform_id);
    try {
      const res = await fetch(`${API_URL}/api/business/connect/${platform.platform_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(connectFields),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setConnectModal(null);
        setConnectFields({});
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

  const handleDisconnect = async (platformId) => {
    setActionLoading(`disconnect-${platformId}`);
    try {
      const res = await fetch(`${API_URL}/api/business/disconnect/${platformId}`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) { toast.success('Platform disconnected'); await fetchData(); }
      else { const data = await res.json(); toast.error(data.detail || 'Failed to disconnect'); }
    } catch { toast.error('Disconnect failed'); }
    finally { setActionLoading(null); }
  };

  const handleSync = async (platformId) => {
    setActionLoading(`sync-${platformId}`);
    try {
      const res = await fetch(`${API_URL}/api/business/sync/${platformId}`, {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) { toast.success(data.message); await fetchData(); }
      else toast.error(data.detail || 'Sync failed');
    } catch { toast.error('Sync failed'); }
    finally { setActionLoading(null); }
  };

  const handleCustomSync = async (connectionId) => {
    setActionLoading(`sync-custom-${connectionId}`);
    try {
      const res = await fetch(`${API_URL}/api/business/custom-sources/${connectionId}/sync`, {
        method: 'POST', credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) { toast.success(data.message); await fetchData(); }
      else toast.error(data.detail || 'Sync failed');
    } catch { toast.error('Sync failed'); }
    finally { setActionLoading(null); }
  };

  const handleCustomDisconnect = async (connectionId) => {
    setActionLoading(`disconnect-custom-${connectionId}`);
    try {
      const res = await fetch(`${API_URL}/api/business/custom-sources/${connectionId}/disconnect`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) { toast.success('Source disconnected'); await fetchData(); }
      else { const data = await res.json(); toast.error(data.detail || 'Disconnect failed'); }
    } catch { toast.error('Disconnect failed'); }
    finally { setActionLoading(null); }
  };

  const handleCsvSuccess = (result) => {
    setCsvModal(false);
    toast.success(result.message);
    if (result.detected_platforms?.length > 0) {
      const p = result.detected_platforms[0];
      toast.info(`We detected ${p.platform_id.charAt(0).toUpperCase() + p.platform_id.slice(1)} patterns in your data. Connect it directly for real-time sync!`, { duration: 8000 });
    }
    fetchData();
  };

  const handleApiSuccess = (result) => {
    setApiModal(false);
    toast.success(result.message);
    if (result.detected_platforms?.length > 0) {
      const p = result.detected_platforms[0];
      toast.info(`Detected ${p.platform_id.charAt(0).toUpperCase() + p.platform_id.slice(1)} patterns. Connect directly for real-time sync!`, { duration: 8000 });
    }
    fetchData();
  };

  const connectedCount = platforms.filter(p => p.connected).length + customSources.length;

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
              Connect platforms, import data, or plug in your own API to power all analytics with real business insights.
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
            <SummaryCard icon={Database} label="Sources Connected" value={connectedCount} color="text-indigo-400" />
            <SummaryCard icon={TrendingUp} label="Records Synced" value={summary.total_records.toLocaleString()} color="text-emerald-400" />
            <SummaryCard icon={CreditCard} label="Total Pipeline Value" value={`$${(summary.total_synced_value || 0).toLocaleString()}`} color="text-amber-400" />
            <SummaryCard icon={Zap} label="Data Sources Active" value={connectedCount} color="text-indigo-400" />
          </div>
        )}

        {/* Platform Detection Banner */}
        {detectedPlatforms.length > 0 && (
          <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-500/20 rounded-xl p-4" data-testid="detection-banner">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-white mb-1" style={{ fontFamily: 'Outfit' }}>Platform Detected in Your Data</h4>
                <p className="text-xs text-zinc-400 mb-3">We analyzed your imported data and found patterns from known platforms. Connect them directly for real-time sync!</p>
                <div className="flex flex-wrap gap-2">
                  {detectedPlatforms.map(d => {
                    const plat = platforms.find(p => p.platform_id === d.platform_id);
                    return (
                      <button key={d.platform_id}
                        onClick={() => plat && openConnectModal(plat)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs hover:bg-indigo-500/20 transition-colors"
                        data-testid={`detect-connect-${d.platform_id}`}>
                        <Zap className="w-3 h-3" />
                        Connect {d.platform_id.charAt(0).toUpperCase() + d.platform_id.slice(1)}
                        <span className="text-indigo-500">({Math.round(d.confidence * 100)}% match)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && connectedCount === 0 && (
          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-8 text-center" data-testid="empty-state">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>No data sources connected yet</h3>
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Connect a platform, upload a CSV, or plug in your own API to unlock powerful insights across all dashboards.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        ) : (
          <>
            {/* Import Your Data */}
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Import Your Data</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <Card className={`bg-zinc-950/50 border transition-all duration-300 ${isProPlus ? 'border-white/10 hover:border-emerald-500/30 cursor-pointer group' : 'border-white/5 opacity-80'}`}
                  onClick={() => isProPlus ? setCsvModal(true) : toast.error('CSV import is available on the Pro and Enterprise plans. Upgrade to unlock.')} data-testid="csv-import-card">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>Import CSV</h3>
                          {!isProPlus && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/15 text-indigo-300 flex items-center gap-1" data-testid="csv-import-pro-badge">
                              <Lock className="w-2.5 h-2.5" /> Pro
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500 font-medium">Spreadsheet Upload</span>
                      </div>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed mb-3">Upload a CSV file with your business data. Map columns to InFlow fields and import up to 5,000 records at once.</p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {['deals', 'customers', 'revenue', 'pipeline'].map(dt => (
                        <span key={dt} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 capitalize">{dt}</span>
                      ))}
                    </div>
                    {isProPlus ? (
                      <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-xs h-9 group-hover:bg-emerald-500 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setCsvModal(true); }} data-testid="csv-import-btn">
                        <Upload className="w-3.5 h-3.5 mr-2" /> Upload CSV File
                      </Button>
                    ) : (
                      <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs h-9"
                        onClick={(e) => { e.stopPropagation(); toast.error('CSV import is available on the Pro and Enterprise plans. Upgrade to unlock.'); }} data-testid="csv-import-locked-btn">
                        <Lock className="w-3.5 h-3.5 mr-2" /> Pro &amp; Enterprise Only
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card className={`bg-zinc-950/50 border transition-all duration-300 ${isEnterprise ? 'border-white/10 hover:border-blue-500/30 cursor-pointer group' : 'border-white/5 opacity-80'}`}
                  onClick={() => isEnterprise ? setApiModal(true) : toast.error('Custom API is available on the Enterprise plan. Upgrade to unlock.')} data-testid="custom-api-card">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <Globe className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>Custom API</h3>
                          {!isEnterprise && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-400 flex items-center gap-1" data-testid="custom-api-enterprise-badge">
                              <Lock className="w-2.5 h-2.5" /> Enterprise
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-500 font-medium">Connect Any API</span>
                      </div>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed mb-3">Connect any REST API endpoint. Test the connection, map response fields, and sync data automatically.</p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {['REST API', 'JSON', 'real-time', 'auto-sync'].map(dt => (
                        <span key={dt} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400">{dt}</span>
                      ))}
                    </div>
                    {isEnterprise ? (
                      <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-xs h-9 group-hover:bg-indigo-500 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setApiModal(true); }} data-testid="custom-api-btn">
                        <Globe className="w-3.5 h-3.5 mr-2" /> Connect API
                      </Button>
                    ) : (
                      <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs h-9"
                        onClick={(e) => { e.stopPropagation(); toast.error('Custom API is available on the Enterprise plan. Upgrade to unlock.'); }} data-testid="custom-api-locked-btn">
                        <Lock className="w-3.5 h-3.5 mr-2" /> Enterprise Only
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Custom Sources */}
            {customSources.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Your Data Sources</h2>
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {customSources.map(source => {
                    const isCsv = source.platform === 'csv_import';
                    const isSyncing = actionLoading === `sync-custom-${source.connection_id}`;
                    const isDisconnecting = actionLoading === `disconnect-custom-${source.connection_id}`;
                    return (
                      <Card key={source.connection_id}
                        className="bg-zinc-950/50 border border-emerald-500/30 transition-all duration-300 hover:border-zinc-600"
                        data-testid={`custom-source-${source.connection_id}`}>
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isCsv ? 'bg-emerald-500/10' : 'bg-indigo-500/10'}`}>
                                {isCsv ? <FileSpreadsheet className="w-5 h-5 text-emerald-400" /> : <Globe className="w-5 h-5 text-indigo-400" />}
                              </div>
                              <div>
                                <h3 className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>{source.source_name}</h3>
                                <span className="text-[11px] text-zinc-500 font-medium">{isCsv ? 'CSV Import' : 'Custom API'}</span>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1 ${source.is_live ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                              {source.is_live ? <><Zap className="w-3 h-3" /> Live</> : <><Check className="w-3 h-3" /> Imported</>}
                            </span>
                          </div>
                          <p className="text-zinc-400 text-xs mb-3">{source.records_synced} records synced</p>
                          <div className="space-y-3">
                            <div className="flex items-center gap-4 text-[11px] text-zinc-500">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(source.last_synced)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {source.can_sync && (
                                <Button size="sm" variant="outline"
                                  className="flex-1 border-zinc-700 text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 text-xs h-8"
                                  onClick={() => handleCustomSync(source.connection_id)} disabled={isSyncing}
                                  data-testid={`sync-custom-${source.connection_id}`}>
                                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />} Re-sync
                                </Button>
                              )}
                              <Button size="sm" variant="ghost"
                                className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 text-xs h-8 px-3"
                                onClick={() => handleCustomDisconnect(source.connection_id)} disabled={isDisconnecting}
                                data-testid={`disconnect-custom-${source.connection_id}`}>
                                {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Platform Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Available Platforms</h2>
                {usage && (
                  <div className="flex items-center gap-2 text-xs" data-testid="integration-usage">
                    {usage.limit === null ? (
                      <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                        {usage.used} connected · Unlimited
                      </span>
                    ) : (
                      <>
                        <div className="w-28 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${usage.at_limit ? 'bg-amber-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
                            style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                          />
                        </div>
                        <span className={`font-medium ${usage.at_limit ? 'text-amber-400' : 'text-zinc-400'}`}>
                          {usage.used} / {usage.limit} integrations
                        </span>
                        {usage.at_limit && (
                          <button
                            onClick={() => window.location.assign('/settings')}
                            className="px-2.5 py-1 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors"
                            data-testid="upgrade-for-integrations-btn"
                          >
                            Upgrade for more
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {platforms.map((platform) => {
                  const Icon = ICON_MAP[platform.icon] || Database;
                  const isConnecting = actionLoading === platform.platform_id;
                  const isDisconnecting = actionLoading === `disconnect-${platform.platform_id}`;
                  const isSyncing = actionLoading === `sync-${platform.platform_id}`;
                  return (
                    <Card key={platform.platform_id}
                      className={`bg-zinc-950/50 border transition-all duration-300 hover:border-zinc-600 ${platform.connected ? 'border-emerald-500/30' : 'border-white/10'}`}
                      data-testid={`platform-card-${platform.platform_id}`}>
                      <CardContent className="p-5">
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
                            <span className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1 shrink-0"
                              data-testid={`connected-badge-${platform.platform_id}`}>
                              <Zap className="w-3 h-3" /> Live
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-xs leading-relaxed mb-3">{platform.description}</p>
                        {platform.connected && platform.account_name && (
                          <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                            <Shield className="w-3 h-3 text-indigo-400" />
                            <span className="text-[11px] text-indigo-300">{platform.account_name}</span>
                          </div>
                        )}
                        {platform.connected && platform.stats && (
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {Object.entries(platform.stats).slice(0, 4).map(([key, val]) => (
                              <div key={key} className="bg-zinc-900/60 rounded-lg px-2.5 py-1.5">
                                <span className="text-[10px] text-zinc-500 block capitalize">{key.replace(/_/g, ' ')}</span>
                                <span className="text-sm font-semibold text-white">
                                  {key === 'revenue' ? `$${(val || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : val}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {platform.data_types?.map(dt => (
                            <span key={dt} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 capitalize">{dt}</span>
                          ))}
                        </div>
                        {platform.connected ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(platform.last_synced)}</span>
                                <span>{platform.records_synced} records</span>
                              </div>
                              <select
                                value={platform.revenue_role || platform.default_revenue_role || 'revenue'}
                                onChange={async (e) => {
                                  const role = e.target.value;
                                  const r = await fetch(`${API_URL}/api/business/connection/${platform.platform_id}/role`, {
                                    method: 'PUT',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ role }),
                                  });
                                  if (r.ok) { toast.success(`Role updated to ${role}`); fetchData(); }
                                  else { const d = await r.json(); toast.error(d.detail || 'Failed to update role'); }
                                }}
                                className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-300 focus:outline-none focus:border-indigo-500"
                                data-testid={`role-select-${platform.platform_id}`}
                                title="Defines whether this source counts toward Revenue, Pipeline, or is treated as Signal-only"
                              >
                                <option value="revenue">Revenue</option>
                                <option value="pipeline">Pipeline</option>
                                <option value="signal">Signal only</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline"
                                className="flex-1 border-zinc-700 text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 text-xs h-8"
                                onClick={() => handleSync(platform.platform_id)} disabled={isSyncing}
                                data-testid={`sync-${platform.platform_id}`}>
                                {isSyncing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <RefreshCw className="w-3 h-3 mr-1.5" />} Re-sync
                              </Button>
                              <Button size="sm" variant="ghost"
                                className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 text-xs h-8 px-3"
                                onClick={() => handleDisconnect(platform.platform_id)} disabled={isDisconnecting}
                                data-testid={`disconnect-${platform.platform_id}`}>
                                {isDisconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-xs h-9 disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => openConnectModal(platform)} disabled={isConnecting || (usage?.at_limit)}
                            data-testid={`connect-${platform.platform_id}`}>
                            {isConnecting ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />Connecting...</>
                            ) : usage?.at_limit ? (
                              <><Lock className="w-3 h-3 mr-1.5" />Limit reached</>
                            ) : (
                              <><Key className="w-3.5 h-3.5 mr-2" />Connect with API Key</>
                            )}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </>
        )}

      </div>

      {/* Generic Platform Connect Modal */}
      {connectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setConnectModal(null); setConnectFields({}); }} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" data-testid="platform-connect-modal">
            <button onClick={() => { setConnectModal(null); setConnectFields({}); }} className="absolute top-4 right-4 text-zinc-500 hover:text-white" data-testid="platform-modal-close">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${connectModal.color}20` }}>
                {(() => { const Icon = ICON_MAP[connectModal.icon] || Database; return <Icon className="w-5 h-5" style={{ color: connectModal.color }} />; })()}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Connect {connectModal.name}</h3>
                <p className="text-xs text-zinc-500">Enter your credentials to sync live data</p>
              </div>
            </div>
            <div className="space-y-4">
              {(connectModal.key_fields || []).map(field => (
                <div key={field.name}>
                  {field.type === 'checkbox' ? (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!connectFields[field.name]}
                        onChange={(e) => setConnectFields(f => ({ ...f, [field.name]: e.target.checked }))}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500/30"
                        data-testid={`connect-field-${field.name}`}
                      />
                      <span className="text-xs text-zinc-400">{field.label}</span>
                    </label>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-zinc-400 block mb-1.5">{field.label}</label>
                      <input
                        type={field.type || 'text'}
                        value={connectFields[field.name] || ''}
                        onChange={(e) => setConnectFields(f => ({ ...f, [field.name]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                        data-testid={`connect-field-${field.name}`}
                      />
                    </>
                  )}
                </div>
              ))}

              {connectModal.token_expires && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/5 rounded-lg border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-[11px] text-amber-300/80 leading-relaxed">
                    This platform's access tokens are temporary. You may need to reconnect periodically when the token expires.
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <Shield className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="text-[11px] text-zinc-400 leading-relaxed">
                  Your credentials are stored securely and only used to read your {connectModal.name} data. We never modify your account.
                </div>
              </div>

              {connectModal.key_help_url && (
                <a href={connectModal.key_help_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                  <ExternalLink className="w-3 h-3" /> {connectModal.key_help_text || `Get your ${connectModal.name} credentials`}
                </a>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 border-zinc-700 text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30"
                  onClick={() => { setConnectModal(null); setConnectFields({}); }}>Cancel</Button>
                <Button className="flex-1 text-white"
                  style={{ backgroundColor: connectModal.color }}
                  onClick={handleConnect}
                  disabled={actionLoading === connectModal.platform_id}
                  data-testid="platform-connect-submit">
                  {actionLoading === connectModal.platform_id ? (
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

      {/* CSV Import Modal */}
      {csvModal && <CsvImportModal onClose={() => setCsvModal(false)} onSuccess={handleCsvSuccess} />}

      {/* Custom API Modal */}
      {apiModal && <CustomApiModal onClose={() => setApiModal(false)} onSuccess={handleApiSuccess} />}
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
