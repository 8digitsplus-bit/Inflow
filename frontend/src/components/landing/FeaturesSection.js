import { TrendingUp, Zap, BarChart3, Target, Sparkles } from 'lucide-react';

const features = [
  { icon: <TrendingUp className="w-6 h-6" />, title: 'Revenue Intelligence', description: 'AI-powered insights that analyze your sales data and predict revenue trends with precision.' },
  { icon: <Target className="w-6 h-6" />, title: 'Pricing Optimization', description: 'Maximize margins with Claude AI recommendations based on market dynamics and competition.' },
  { icon: <BarChart3 className="w-6 h-6" />, title: 'Sales Pipeline', description: 'Visual pipeline management with drag-and-drop deal tracking and probability scoring.' },
  { icon: <Sparkles className="w-6 h-6" />, title: 'AI Insights', description: 'Get actionable recommendations powered by Claude Sonnet 4.5 to close deals faster.' }
];

export const FeaturesSection = () => (
  <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">Features</span>
        <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
          Everything you need to scale
        </h2>
        <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
          Powerful tools designed to maximise deal value & accelerate growth.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {features.map((feature, i) => (
          <div key={i} className="group p-8 bg-zinc-950/50 border border-white/10 rounded-xl card-hover animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }} data-testid={`feature-card-${i}`}>
            <div className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-6 group-hover:bg-indigo-500/20 group-hover:scale-110 transition-all duration-300">
              {feature.icon}
            </div>
            <h3 className="text-xl font-semibold text-white mb-3" style={{ fontFamily: 'Outfit' }}>{feature.title}</h3>
            <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
