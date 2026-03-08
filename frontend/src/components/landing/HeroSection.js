import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';

export const HeroSection = ({ handleScrollToPricing }) => (
  <section className="landing-hero relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
    <div className="absolute inset-0 hero-glow" />
    <div className="absolute inset-0 noise-overlay" />
    <div className="max-w-7xl mx-auto relative z-10">
      <div className="grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-8 reveal-left">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-indigo-300">Powered by Claude AI</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight" style={{ fontFamily: 'Outfit' }}>
            Optimize Pricing.<br />
            <span className="gradient-text">Accelerate Revenue.</span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-xl leading-relaxed">
            Streamline workflows with AI-powered pricing optimization & revenue intelligence.
            Predict growth with data-driven insights.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 text-white btn-glow px-8 py-6 text-base group" onClick={handleScrollToPricing} data-testid="hero-cta-btn">
              Start 14-Day Free Trial <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
            </Button>
          </div>
        </div>

        <div className="lg:col-span-5 reveal-right reveal-delay-2">
          <div className="relative">
            <div className="absolute -inset-4 bg-indigo-500/20 blur-3xl rounded-3xl animate-pulse-glow" />
            <img
              src="/dashboard-preview.png?v=3"
              alt="InFlow Analytics Dashboard"
              className="relative rounded-2xl border border-white/10 shadow-2xl shadow-indigo-500/10 hover:scale-[1.02] transition-transform duration-500"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
);
