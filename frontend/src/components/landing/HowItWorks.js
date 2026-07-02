import { CreditCard, ShoppingBag, Users, Cloud, Calculator, Zap, Database, RefreshCw, Code2, FileSpreadsheet, Shield, Gauge } from 'lucide-react';
import { GradientCard } from '../ui/gradient-card';

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

  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="reveal-left">
              <span className="text-slate-400 text-sm font-medium uppercase tracking-widest">Live Integration</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                Plug in your tools. Get real insights.
              </h2>
              <p className="mt-4 text-zinc-400 max-w-md">
                Integrate your business tools. Sync real-time data. Access in-depth analytics & AI insights.
              </p>
            </div>

            <div className="mt-10 space-y-6">
              {benefits.map((b, i) => (
                <div key={i} className={`flex gap-4 group cursor-default reveal reveal-delay-${i + 1}`}>
                  <div className="w-10 h-10 rounded-lg bg-slate-500/10 flex items-center justify-center shrink-0 group-hover:bg-slate-500/20 transition-colors">
                    <b.icon className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-slate-300 transition-colors" style={{ fontFamily: 'Outfit' }}>{b.title}</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed">{b.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative reveal-right">
            <div className="absolute -inset-4 bg-white/[0.04] blur-3xl rounded-3xl" />
            <div className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-xl">
              <div className="flex items-center gap-2 mb-5">
                <Zap className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-white" style={{ fontFamily: 'Outfit' }}>Your Integrations</span>
              </div>
              <div className="space-y-3">
                {platforms.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-lg hover:border-slate-500/20 hover:bg-white/[0.04] transition-all group">
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

const customBenefits = [
  { icon: Code2, title: 'Connect Any REST API', desc: 'Point InFlow at any internal or third-party API endpoint. Your data, your schema, your rules.', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { icon: FileSpreadsheet, title: 'CSV Import for Pro', desc: 'Pro and Enterprise plans can upload CSV files to bring in historical data, forecasts, or custom datasets — up to 5,000 rows per import.', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  { icon: Shield, title: 'Secure by Default', desc: 'All credentials are encrypted at rest. OAuth tokens auto-refresh. Your integration keys never leave our servers.', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { icon: Gauge, title: 'Unified Analytics', desc: 'No matter the source — platform, API, or CSV — your data feeds into every dashboard, forecast, and AI insight.', color: 'text-amber-400', bg: 'bg-amber-500/10' },
];

export const CustomIntegrationSection = () => (
  <section className="pb-24 px-4 sm:px-6 lg:px-8" data-testid="custom-integration-section">
    <div className="max-w-7xl mx-auto">
      <div className="reveal">
        <div className="text-center mb-14">
          <span className="text-zinc-400 text-sm font-medium uppercase tracking-widest">Custom Integration</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
            Your business. Your data sources.
          </h2>
          <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
            Not limited to pre-built connectors. Enterprise users can plug in any REST API endpoint to bring proprietary data directly into InFlow.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12 items-stretch">
        {customBenefits.map((b, i) => (
          <div
            key={i}
            className={`reveal reveal-delay-${Math.min(i + 1, 4)} h-full`}
            data-testid={`custom-benefit-${i}`}
          >
            <GradientCard icon={b.icon} title={b.title} description={b.desc} />
          </div>
        ))}
      </div>

      <div className="reveal">
        <GradientCard
          icon={Code2}
          title="Custom API"
          badge="Enterprise"
          className="min-h-[150px]"
          description="Define your endpoint URL, authentication headers, and data mapping. InFlow handles the sync schedule, error retries, and data flows automatically."
        />
      </div>
    </div>
  </section>
);
