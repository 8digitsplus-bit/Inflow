import { TrendingUp } from 'lucide-react';

export const HowItWorks = () => (
  <section className="py-24 px-4 sm:px-6 lg:px-8 bg-zinc-950/50">
    <div className="max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">How It Works</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
            AI-powered pricing in three steps
          </h2>
          <div className="mt-12 space-y-8">
            {[
              { num: '01', title: 'Connect Your Data', desc: 'Import deals and pricing data from your CRM or enter manually.' },
              { num: '02', title: 'Get AI Analysis', desc: 'Claude AI analyzes market trends, competition, and your data.' },
              { num: '03', title: 'Optimize & Win', desc: 'Implement recommended pricing and watch revenue grow.' }
            ].map((step, i) => (
              <div key={i} className="flex gap-6 group cursor-default">
                <div className="text-4xl font-bold text-zinc-800 group-hover:text-indigo-600 transition-colors duration-300 font-mono">{step.num}</div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-indigo-300 transition-colors duration-300">{step.title}</h3>
                  <p className="text-zinc-400">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 bg-cyan-500/10 blur-3xl rounded-3xl" />
          <div className="relative bg-zinc-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Pipeline Health</span>
                <span className="text-xs text-emerald-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Healthy</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Active', value: '24', color: 'text-indigo-400' },
                  { label: 'Won', value: '18', color: 'text-emerald-400' },
                  { label: 'At Risk', value: '3', color: 'text-amber-400' },
                ].map((m, i) => (
                  <div key={i} className="bg-zinc-800/50 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold font-mono ${m.color}`}>{m.value}</div>
                    <div className="text-xs text-zinc-500 mt-1">{m.label}</div>
                  </div>
                ))}
              </div>
              <div className="h-24 bg-gradient-to-t from-indigo-500/20 to-transparent rounded-lg flex items-end px-2 pt-2">
                {[35, 55, 40, 70, 55, 85, 65, 90, 75, 95].map((h, i) => (
                  <div key={i} className="flex-1 mx-0.5 bg-indigo-500 rounded-t transition-all duration-500 hover:bg-indigo-400" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);
