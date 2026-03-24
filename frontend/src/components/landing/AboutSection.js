import { BarChart3, Shield, Zap, Users, TrendingUp, Brain } from 'lucide-react';

export const AboutSection = () => (
  <section id="about" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8" data-testid="about-section">
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-5">
          <span className="text-xs font-medium text-indigo-400">About InFlow</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
          Your Revenue Deserves More Than <span className="text-indigo-400">Guesswork</span>
        </h2>
        <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          InFlow is a revenue intelligence platform that helps businesses optimize pricing, accelerate their sales pipeline, and predict churn before it happens.
        </p>
      </div>

      {/* What We Do */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-20">
        {[
          { icon: BarChart3, title: 'Pipeline Analytics', desc: 'Real-time velocity metrics, bottleneck detection, and stage-by-stage conversion tracking.', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { icon: TrendingUp, title: 'Revenue Forecasting', desc: 'Model optimistic, realistic, and conservative scenarios with AI-weighted pipeline projections.', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { icon: Shield, title: 'Churn Prevention', desc: 'Health scores, engagement tracking, and AI-powered predictions to protect your revenue.', color: 'text-red-400', bg: 'bg-red-500/10' },
          { icon: Zap, title: 'Conversion Optimization', desc: 'Funnel drop-off analysis, A/B testing, and AI recommendations to close more deals.', color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { icon: Brain, title: 'Agentic AI Assistant', desc: 'Ask complex questions in natural language. Our AI autonomously investigates your data and delivers insights.', color: 'text-purple-400', bg: 'bg-purple-500/10' },
          { icon: Users, title: 'Platform Integrations', desc: 'Connect Stripe, Shopify, HubSpot, Salesforce, and QuickBooks. Import via CSV or custom API.', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
        ].map((item) => (
          <div key={item.title} className="group p-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl hover:border-white/[0.15] hover:bg-white/[0.05] transition-all duration-300" data-testid={`about-card-${item.title.toLowerCase().replace(/\s/g, '-')}`}>
            <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1.5" style={{ fontFamily: 'Outfit' }}>{item.title}</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* How It Helps */}
      <div className="text-center mb-10">
        <h3 className="text-lg sm:text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
          Up and running in minutes, not months
        </h3>
        <p className="text-sm text-zinc-500 max-w-lg mx-auto">No complex setup. No engineering tickets. Just connect, see, and act.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-6 sm:gap-10">
        {[
          { num: '01', title: 'Connect Your Data', desc: 'Link your tools in minutes. InFlow pulls deals, payments, and customer data from Stripe, HubSpot, Salesforce, and more.' },
          { num: '02', title: 'Get Instant Clarity', desc: 'See pipeline health, revenue trends, churn risk, and conversion rates across a single dashboard.' },
          { num: '03', title: 'Act on AI Insights', desc: 'Our agentic AI surfaces the actions that matter: which deals to prioritize, which accounts are at risk, and where your funnel leaks.' },
        ].map((step) => (
          <div key={step.num} className="relative p-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl" data-testid={`about-step-${step.num}`}>
            <span className="text-5xl sm:text-6xl font-bold text-white/[0.03] absolute -top-2 -left-1" style={{ fontFamily: 'Outfit' }}>{step.num}</span>
            <div className="pt-8">
              <h4 className="text-sm font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>{step.title}</h4>
              <p className="text-sm text-zinc-500 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);
