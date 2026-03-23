import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BarChart3, Shield, Zap, Users, TrendingUp, Brain, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';

const About = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#09090B] text-white">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50" style={{ background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors" data-testid="about-back-btn">
            <ArrowLeft className="w-4 h-4" />
            <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-5 w-auto" />
          </button>
          <Button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 h-8" onClick={() => navigate('/auth?trial=true')} data-testid="about-cta-btn">
            Start Free Trial <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-28 sm:pt-36 pb-16 sm:pb-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-6">
            <span className="text-xs font-medium text-indigo-400">About InFlow</span>
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6" style={{ fontFamily: 'Outfit' }}>
            Turn Revenue Data Into<br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Actionable Growth</span>
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            InFlow is a revenue intelligence platform that helps businesses optimize pricing, accelerate their sales pipeline, and predict churn before it happens.
          </p>
        </div>
      </section>

      {/* What We Do */}
      <section className="py-16 sm:py-20 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-base sm:text-lg font-semibold text-indigo-400 mb-3" style={{ fontFamily: 'Outfit' }}>What We Do</h2>
          <p className="text-xl sm:text-2xl font-bold text-white mb-10 max-w-3xl" style={{ fontFamily: 'Outfit' }}>
            One platform to manage your entire revenue lifecycle, from lead to renewal.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[
              { icon: BarChart3, title: 'Pipeline Analytics', desc: 'Visualize your sales funnel with real-time velocity metrics, bottleneck detection, and stage-by-stage conversion tracking.', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
              { icon: TrendingUp, title: 'Revenue Forecasting', desc: 'Model optimistic, realistic, and conservative scenarios with AI-weighted pipeline projections updated in real time.', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { icon: Shield, title: 'Churn Prevention', desc: 'Identify at-risk accounts with health scores, engagement tracking, and AI-powered predictions before revenue walks out the door.', color: 'text-red-400', bg: 'bg-red-500/10' },
              { icon: Zap, title: 'Conversion Optimization', desc: 'Analyze funnel drop-offs, run A/B tests on your sales process, and get AI-powered recommendations to close more deals.', color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { icon: Brain, title: 'Agentic AI Assistant', desc: 'Ask complex questions about your pipeline in natural language. Our AI agent autonomously investigates your data and delivers insights.', color: 'text-purple-400', bg: 'bg-purple-500/10' },
              { icon: Users, title: 'Platform Integrations', desc: 'Connect Stripe, Shopify, HubSpot, Salesforce, and QuickBooks for automatic data sync. Import via CSV or custom API.', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            ].map((item) => (
              <div key={item.title} className="group p-5 sm:p-6 rounded-2xl border border-white/5 bg-zinc-950/50 hover:border-white/10 transition-all duration-300">
                <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <h3 className="text-base font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>{item.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Helps */}
      <section className="py-16 sm:py-20 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-base sm:text-lg font-semibold text-indigo-400 mb-3" style={{ fontFamily: 'Outfit' }}>How InFlow Helps</h2>
          <p className="text-xl sm:text-2xl font-bold text-white mb-10 max-w-3xl" style={{ fontFamily: 'Outfit' }}>
            Built for revenue teams who are tired of spreadsheets and guesswork.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
            {[
              { num: '01', title: 'Connect Your Data', desc: 'Link your existing tools in minutes. InFlow pulls in deals, payments, and customer data automatically from Stripe, HubSpot, Salesforce, and more.' },
              { num: '02', title: 'Get Instant Clarity', desc: 'See your pipeline health, revenue trends, churn risk, and conversion rates across a single dashboard with metrics tailored to your role.' },
              { num: '03', title: 'Act on AI Insights', desc: 'Our agentic AI surfaces the actions that matter most: which deals to prioritize, which accounts are at risk, and where your funnel is leaking.' },
            ].map((step) => (
              <div key={step.num} className="relative">
                <span className="text-5xl sm:text-6xl font-bold text-white/[0.03] absolute -top-2 -left-1" style={{ fontFamily: 'Outfit' }}>{step.num}</span>
                <div className="pt-8">
                  <h3 className="text-base font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>{step.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-16 sm:py-20 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-base sm:text-lg font-semibold text-indigo-400 mb-3" style={{ fontFamily: 'Outfit' }}>Who It's For</h2>
          <p className="text-xl sm:text-2xl font-bold text-white mb-10 max-w-3xl" style={{ fontFamily: 'Outfit' }}>
            Whether you're a founder or a VP of Sales, InFlow gives you the clarity to grow faster.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { role: 'Founders & CEOs', desc: 'Get a single view of your revenue engine. Understand burn rate, forecast cash flow, and make confident decisions backed by real-time data.' },
              { role: 'Sales Leaders', desc: 'Track team performance, identify pipeline bottlenecks, and coach reps with data-driven insights on deal velocity and close rates.' },
              { role: 'Revenue Operations', desc: 'Unify data from every tool in your stack. Build clean analytics without engineering tickets or manual exports.' },
              { role: 'Customer Success', desc: 'Spot churn signals early with health scores, engagement tracking, and AI-powered risk predictions.' },
            ].map((item) => (
              <div key={item.role} className="p-5 rounded-xl border border-white/5 bg-zinc-950/30 hover:border-white/10 transition-all">
                <h3 className="text-sm font-semibold text-white mb-1.5" style={{ fontFamily: 'Outfit' }}>{item.role}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 px-4 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            Ready to take control of your revenue?
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 mb-8">
            Start your 14-day free trial. No credit card required. Cancel anytime.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 h-11 w-full sm:w-auto" onClick={() => navigate('/auth?trial=true')} data-testid="about-start-trial-btn">
              Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-white/5 px-6 h-11 w-full sm:w-auto" onClick={() => navigate('/')} data-testid="about-back-home-btn">
              Back to Home
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-600">
          <span>2026 InFlow. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <a href="/" className="hover:text-zinc-400 transition-colors">Home</a>
            <a href="/auth" className="hover:text-zinc-400 transition-colors">Sign In</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default About;
