import { useState, useEffect } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import {
  Plug,
  Check,
  Loader2,
  Search,
  MessageSquare,
  Users,
  Cloud,
  Table,
  Zap,
  CreditCard,
  Mail,
  Monitor,
  LayoutGrid,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ICON_MAP = {
  MessageSquare,
  Users,
  Cloud,
  Table,
  Zap,
  CreditCard,
  Mail,
  Monitor,
  LayoutGrid,
};

const CATEGORIES = ['All', 'CRM', 'Communication', 'Productivity', 'Automation', 'Payments'];

const Integrations = () => {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const response = await fetch(`${API_URL}/api/integrations`, {
        credentials: 'include',
      });
      if (response.ok) {
        setIntegrations(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleIntegration = async (integrationId, isConnected) => {
    setConnecting(integrationId);
    const action = isConnected ? 'disconnect' : 'connect';
    try {
      const response = await fetch(
        `${API_URL}/api/integrations/${integrationId}/${action}`,
        { method: 'POST', credentials: 'include' }
      );
      if (response.ok) {
        toast.success(
          isConnected ? 'Integration disconnected' : 'Integration connected'
        );
        fetchIntegrations();
      } else {
        const error = await response.json();
        toast.error(error.detail || `Failed to ${action}`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} integration`);
    } finally {
      setConnecting(null);
    }
  };

  const filtered = integrations.filter((i) => {
    const matchesSearch =
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === 'All' || i.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const connectedCount = integrations.filter((i) => i.connected).length;

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="integrations-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-bold text-white"
              style={{ fontFamily: 'Outfit' }}
            >
              Integrations
            </h1>
            <p className="text-zinc-400 mt-1">
              Connect your favorite tools to supercharge your workflow
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400" data-testid="connected-count">
              {connectedCount} connected
            </span>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Search integrations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-zinc-900 border-zinc-800 text-white"
              data-testid="integrations-search"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat
                    ? 'bg-slate-600 text-white'
                    : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
                data-testid={`filter-${cat.toLowerCase()}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Integrations Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <Plug className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No integrations found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((integration) => {
              const IconComponent = ICON_MAP[integration.icon] || Plug;
              const isLoading = connecting === integration.integration_id;

              return (
                <Card
                  key={integration.integration_id}
                  className={`bg-zinc-950/50 border transition-all hover:border-zinc-600 ${
                    integration.connected
                      ? 'border-emerald-500/30'
                      : 'border-white/10'
                  }`}
                  data-testid={`integration-card-${integration.integration_id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${integration.color}20` }}
                      >
                        <IconComponent
                          className="w-5 h-5"
                          style={{ color: integration.color }}
                        />
                      </div>
                      {integration.connected && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium" data-testid={`connected-badge-${integration.integration_id}`}>
                          <Check className="w-3 h-3" /> Connected
                        </span>
                      )}
                    </div>

                    <h3
                      className="text-white font-semibold mb-1"
                      style={{ fontFamily: 'Outfit' }}
                    >
                      {integration.name}
                    </h3>
                    <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                      {integration.description}
                    </p>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500 px-2 py-1 bg-zinc-900 rounded-full">
                        {integration.category}
                      </span>
                      <Button
                        size="sm"
                        className={
                          integration.connected
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
                            : 'bg-white/10 hover:bg-white/20'
                        }
                        onClick={() =>
                          toggleIntegration(
                            integration.integration_id,
                            integration.connected
                          )
                        }
                        disabled={isLoading}
                        data-testid={`toggle-${integration.integration_id}`}
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : integration.connected ? (
                          'Disconnect'
                        ) : (
                          'Connect'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Integrations;
