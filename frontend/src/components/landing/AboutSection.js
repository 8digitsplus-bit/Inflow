import { BarChart3, Shield, Zap, TrendingUp, Brain, CheckCircle2, ArrowRight } from 'lucide-react';

export const AboutSection = () => (
  <section id="about" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8" data-testid="about-section">
    <div className="max-w-6xl mx-auto">

      {/* Header — empathy-driven */}
      <div className="text-center mb-16 sm:mb-20">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-5">
          <span className="text-xs font-medium text-indigo-400">Why InFlow</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-bold text-white mb-5" style={{ fontFamily: 'Outfit' }}>
          Your Revenue Deserves More Than <span className="text-indigo-400">Guesswork</span>
        </h2>
        <p className="text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Most teams lose deals because they can't see problems until it's too late. InFlow gives you the clarity to act before opportunities slip away — so you can grow with confidence, not gut feeling.
        </p>
      </div>

      {/* Outcomes — what clients actually get */}
      <div className="grid sm:grid-cols-3 gap-4 sm:gap-6 mb-20">
        {[
          { stat: '2.3x', label: 'faster deal cycles', desc: 'Teams identify bottlenecks early and move deals through the pipeline faster.' },
          { stat: '40%', label: 'less revenue churn', desc: 'AI-powered health scores catch at-risk accounts before they leave.' },
          { stat: '3hrs', label: 'saved per week', desc: 'No more spreadsheets. One dashboard replaces hours of manual reporting.' },
        ].map((item) => (
          <div key={item.stat} className="text-center p-6 sm:p-8 rounded-2xl border border-white/5 bg-zinc-950/50" data-testid={`about-stat-${item.stat}`}>
            <div className="text-3xl sm:text-4xl font-bold text-indigo-400 mb-1" style={{ fontFamily: 'Outfit' }}>{item.stat}</div>
            <div className="text-sm font-medium text-white mb-2">{item.label}</div>
            <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* The problem & solution — storytelling */}
      <div className="grid lg:grid-cols-2 gap-10 sm:gap-16 items-center mb-20">
        <div>
          <h3 className="text-lg sm:text-2xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            Built for teams who are tired of flying blind
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed mb-6">
            We built InFlow because we've been in your shoes — staring at disconnected spreadsheets, guessing which deals would close, and finding out about churn after it happened. There had to be a better way.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed mb-8">
            InFlow connects to the tools you already use, pulls your data together, and gives you a single source of truth for your entire revenue operation — powered by AI that actually understands your business.
          </p>
          <div className="space-y-3">
            {[
              'See your real pipeline health in under 60 seconds',
              'Get AI alerts before deals go cold or accounts churn',
              'Ask your data questions in plain English and get instant answers',
              'Connect Stripe, HubSpot, Salesforce, and more in minutes',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-zinc-300">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: BarChart3, title: 'Pipeline Analytics', desc: 'Velocity, bottlenecks, and stage-by-stage conversion.', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
            { icon: TrendingUp, title: 'Revenue Forecasting', desc: 'AI-weighted scenarios updated in real time.', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { icon: Shield, title: 'Churn Prevention', desc: 'Health scores and risk predictions.', color: 'text-red-400', bg: 'bg-red-500/10' },
            { icon: Brain, title: 'Agentic AI', desc: 'Autonomous data investigation, on demand.', color: 'text-purple-400', bg: 'bg-purple-500/10' },
          ].map((item) => (
            <div key={item.title} className="p-4 rounded-xl border border-white/5 bg-zinc-950/50 hover:border-white/10 transition-all" data-testid={`about-card-${item.title.toLowerCase().replace(/\s/g, '-')}`}>
              <div className={`w-9 h-9 rounded-lg ${item.bg} flex items-center justify-center mb-3`}>
                <item.icon className={`w-4 h-4 ${item.color}`} />
              </div>
              <h4 className="text-xs font-semibold text-white mb-1" style={{ fontFamily: 'Outfit' }}>{item.title}</h4>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonial / trust signal */}
      <div className="rounded-2xl border border-white/5 bg-zinc-950/30 p-6 sm:p-10 mb-20">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-base sm:text-lg text-zinc-300 leading-relaxed italic mb-6" style={{ fontFamily: 'Outfit' }}>
            "We went from spending half a day on pipeline reviews to having everything we need in one dashboard. The AI caught two at-risk accounts we'd completely missed — that alone saved us $180K in ARR."
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm" style={{ fontFamily: 'Outfit' }}>JM</div>
            <div className="text-left">
              <div className="text-sm font-medium text-white">Jamie Morrison</div>
              <div className="text-xs text-zinc-500">VP of Sales, Cloudline</div>
            </div>
          </div>
        </div>
      </div>

      {/* How it works — simple 3-step */}
      <div className="text-center mb-10">
        <h3 className="text-lg sm:text-2xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
          Up and running in minutes, not months
        </h3>
        <p className="text-sm text-zinc-500 max-w-lg mx-auto">No complex setup. No engineering tickets. Just connect, see, and act.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-6 sm:gap-10">
        {[
          { num: '01', title: 'Connect Your Tools', desc: 'Link Stripe, HubSpot, Salesforce, or import a CSV. Your data flows in automatically.' },
          { num: '02', title: 'See the Full Picture', desc: 'Pipeline health, revenue trends, churn risk, and conversion rates — all in one place.' },
          { num: '03', title: 'Let AI Guide You', desc: 'Our agentic AI tells you which deals to prioritize, which accounts need attention, and why.' },
        ].map((step) => (
          <div key={step.num} className="relative" data-testid={`about-step-${step.num}`}>
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
