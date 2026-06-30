import { BarChart3, DollarSign, Shield, TrendingUp, Users, Zap, Code2 } from 'lucide-react';
import { GradientCard } from '../components/ui/gradient-card';

const items = [
  { icon: DollarSign, title: 'Pricing Optimizer', desc: 'AI-recommended optimal pricing strategies based on market and competitor data.' },
  { icon: TrendingUp, title: 'Sales Performance', desc: 'Track win rates, deal velocity, and team effectiveness in real time.' },
  { icon: BarChart3, title: 'Revenue Intelligence', desc: 'Unified overview combining pipeline, performance, and revenue insights.' },
  { icon: Zap, title: 'Conversion Optimization', desc: 'Identify funnel bottlenecks, run A/B tests, and boost conversions.' },
  { icon: Users, title: 'Churn Prevention', desc: 'AI-powered health scores and early warning for at-risk accounts.' },
  { icon: Shield, title: 'Sales Pipeline', desc: 'Visual kanban with drag-and-drop deal management and stage tracking.' },
];

export default function GlowPreview() {
  return (
    <div className="min-h-screen bg-[#050507] p-10">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch max-w-7xl mx-auto">
        {items.map((it, i) => (
          <div key={i} className="h-full">
            <GradientCard icon={it.icon} title={it.title} description={it.desc} className="min-h-[180px]" />
          </div>
        ))}
      </div>
      <div className="mt-8 max-w-7xl mx-auto">
        <GradientCard icon={Code2} title="Custom API" badge="Enterprise" className="min-h-[150px]"
          description="Define your endpoint URL, authentication headers, and data mapping. InFlow handles the sync schedule, error retries, and data flows automatically." />
      </div>
    </div>
  );
}
