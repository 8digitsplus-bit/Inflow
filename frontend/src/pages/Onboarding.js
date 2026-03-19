import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ArrowRight, Check, Loader2 } from 'lucide-react';
import { CreditCard, ShoppingBag, Users, Cloud, Calculator } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PLATFORMS = [
  { id: 'stripe', name: 'Stripe', desc: 'Payments & subscriptions', icon: CreditCard, color: '#635BFF' },
  { id: 'shopify', name: 'Shopify', desc: 'E-commerce data', icon: ShoppingBag, color: '#96BF48' },
  { id: 'hubspot', name: 'HubSpot', desc: 'CRM & contacts', icon: Users, color: '#FF7A59' },
  { id: 'salesforce', name: 'Salesforce', desc: 'Pipeline & deals', icon: Cloud, color: '#00A1E0' },
  { id: 'quickbooks', name: 'QuickBooks', desc: 'Financial data', icon: Calculator, color: '#2CA01C' },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [connectingPlatform, setConnectingPlatform] = useState(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);

  const connectPlatform = async (platformId) => {
    setConnectingPlatform(platformId);
    try {
      const res = await fetch(`${API_URL}/api/business/connect/${platformId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setConnectedPlatforms((prev) => [...prev, platformId]);
        toast.success(`Connected ${platformId}`);
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Failed to connect');
      }
    } catch {
      toast.error('Connection failed');
    } finally {
      setConnectingPlatform(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <Toaster position="top-center" />

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center mb-6">
          <div className="h-8 overflow-hidden">
            <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-full w-auto object-contain" />
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <Zap className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
              Live Integration
            </h2>
            <p className="text-zinc-400 text-sm mt-2">
              Sync your tools for real-time insights — or skip and do it later
            </p>
          </div>

          <div className="space-y-2">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              const isConnected = connectedPlatforms.includes(platform.id);
              const isLoading = connectingPlatform === platform.id;
              return (
                <button
                  key={platform.id}
                  onClick={() => !isConnected && !isLoading && connectPlatform(platform.id)}
                  disabled={isConnected || isLoading}
                  className={`w-full flex items-center gap-4 p-3.5 rounded-xl transition-all ${
                    isConnected
                      ? 'bg-emerald-600/10 border border-emerald-500/30 text-white'
                      : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 hover:border-zinc-600'
                  }`}
                  data-testid={`onboarding-connect-${platform.id}`}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${platform.color}18` }}
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: platform.color }} />
                    ) : (
                      <Icon className="w-5 h-5" style={{ color: platform.color }} />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-sm font-medium block">{platform.name}</span>
                    <span className="text-xs text-zinc-500">{platform.desc}</span>
                  </div>
                  {isConnected && (
                    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-6">
            <Button
              variant="ghost"
              className="text-zinc-500 hover:text-zinc-300"
              onClick={() => navigate('/dashboard')}
              data-testid="onboarding-skip-btn"
            >
              Skip for now
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-500 btn-glow px-6"
              onClick={() => navigate('/dashboard')}
              data-testid="onboarding-next-btn"
            >
              {connectedPlatforms.length > 0 ? 'Go to Dashboard' : 'Continue'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-4">
          You can always connect more platforms from your dashboard
        </p>
      </div>
    </div>
  );
};

export default Onboarding;
