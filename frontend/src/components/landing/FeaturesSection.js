import { BarChart3, DollarSign, Shield, TrendingUp, Users, Zap } from 'lucide-react';

const features = [
  { icon: DollarSign, name: 'Pricing Optimizer', desc: 'AI-recommended optimal pricing strategies based on market and competitor data.' },
  { icon: TrendingUp, name: 'Sales Performance', desc: 'Track win rates, deal velocity, and team effectiveness in real time.' },
  { icon: BarChart3, name: 'Revenue Intelligence', desc: 'Unified overview combining pipeline, performance, and revenue insights.' },
  { icon: Zap, name: 'Conversion Optimization', desc: 'Identify funnel bottlenecks, run A/B tests, and boost conversions.' },
  { icon: Users, name: 'Churn Prevention', desc: 'AI-powered health scores and early warning for at-risk accounts.' },
  { icon: Shield, name: 'Sales Pipeline', desc: 'Visual kanban with drag-and-drop deal management and stage tracking.' }
];

export const FeaturesSection = () => (
  <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-16 reveal">
        <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">Features</span>
        <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
          Everything you need to scale
        </h2>
        <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
          Powerful tools designed to maximise value & accelerate growth.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, i) => (
          <div key={i} className={`feature-card reveal reveal-delay-${Math.min(i + 1, 4)} group p-6 rounded-xl bg-zinc-900/30 border border-white/[0.06] cursor-default`}>
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-4 group-hover:bg-indigo-500/20 transition-colors duration-300">
              <feature.icon className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform duration-300" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2 group-hover:text-indigo-300 transition-colors duration-300" style={{ fontFamily: 'Outfit' }}>{feature.name}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
