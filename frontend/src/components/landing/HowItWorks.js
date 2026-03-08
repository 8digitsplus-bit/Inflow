import { CreditCard, ShoppingBag, Users, Cloud, Calculator, ArrowRight, Zap, Database, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { useNavigate } from 'react-router-dom';

const platforms = [
  { name: 'Stripe', desc: 'Payments & subscriptions', icon: CreditCard, color: '#635BFF' },
  { name: 'Shopify', desc: 'E-commerce & orders', icon: ShoppingBag, color: '#96BF48' },
  { name: 'HubSpot', desc: 'CRM & contacts', icon: Users, color: '#FF7A59' },
  { name: 'Salesforce', desc: 'Pipeline & deals', icon: Cloud, color: '#00A1E0' },
  { name: 'QuickBooks', desc: 'Financial data', icon: Calculator, color: '#2CA01C' },
];

const benefits = [
  { icon: Database, title: 'Auto-Sync Data', desc: 'Connect once and your business data flows into every dashboard automatically.' },
  { icon: RefreshCw, title: 'Always Up To Date', desc: 'Real-time syncing keeps your analytics fresh — no manual imports needed.' },
  { icon: Zap, title: 'Instant Insights', desc: 'AI-powered analysis turns your live business data into actionable recommendations.' },
];

export const ConnectBusinessSection = () => {
  const navigate = useNavigate();

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8 bg-zinc-950/50">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="reveal-left">
              <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">Connect Your Business</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                Plug in your tools. Get real insights.
              </h2>
              <p className="mt-4 text-zinc-400 max-w-md">
                Link your existing business platforms and InFlow automatically syncs your data — powering every dashboard, metric, and AI recommendation with your real numbers. No spreadsheets, no manual entry.
              </p>
            </div>

            <div className="mt-10 space-y-6">
              {benefits.map((b, i) => (
                <div key={i} className={`flex gap-4 group cursor-default reveal reveal-delay-${i + 1}`}>
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/20 transition-colors">
                    <b.icon className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors" style={{ fontFamily: 'Outfit' }}>{b.title}</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 reveal reveal-delay-4">
              <Button
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 group"
                onClick={() => navigate('/auth')}
                data-testid="connect-business-cta"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>

          <div className="relative reveal-right">
            <div className="absolute -inset-4 bg-indigo-500/10 blur-3xl rounded-3xl" />
            <div className="relative bg-zinc-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur">
              <div className="flex items-center gap-2 mb-5">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-white" style={{ fontFamily: 'Outfit' }}>Your Integrations</span>
              </div>
              <div className="space-y-3">
                {platforms.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 border border-white/5 hover:border-indigo-500/20 transition-all group">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${p.color}18` }}>
                      <p.icon className="w-4 h-4" style={{ color: p.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white block">{p.name}</span>
                      <span className="text-[11px] text-zinc-500">{p.desc}</span>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 shrink-0">
                      Connected
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-zinc-500">
                <span>5 platforms synced</span>
                <span className="text-emerald-400">All data up to date</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
