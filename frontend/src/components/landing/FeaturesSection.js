import { BarChart3, DollarSign, Shield, TrendingUp, Users, Zap } from 'lucide-react';
import { GradientCard } from '../ui/gradient-card';

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
        <span className="text-zinc-400 text-sm font-medium uppercase tracking-widest">Features</span>
        <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
          Everything you need to scale
        </h2>
        <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
          Powerful tools designed to maximise value & accelerate growth.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
        {features.map((feature, i) => (
          <div
            key={i}
            className={`reveal reveal-delay-${Math.min(i + 1, 4)} h-full`}
            data-testid={`feature-card-${i}`}
          >
            <GradientCard icon={feature.icon} title={feature.name} description={feature.desc} className="min-h-[200px]" />
          </div>
        ))}
      </div>
    </div>
  </section>
);
