import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { AnimatedGroup } from '../ui/animated-group';

const transitionVariants = {
  item: {
    hidden: { opacity: 0, filter: 'blur(12px)', y: 12 },
    visible: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: { type: 'spring', bounce: 0.3, duration: 1.5 },
    },
  },
};

export const HeroSection = ({ handleGetStarted }) => {
  const navigate = useNavigate();
  const scrollTo = (id) => document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <section className="landing-hero relative overflow-hidden pt-32 pb-20 px-4 sm:px-6 lg:px-8">
      {/* Ambient glass glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[40rem] w-[40rem] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute left-0 top-24 h-[28rem] w-[18rem] -rotate-45 rounded-full bg-cyan-500/[0.06] blur-[100px]" />
        <div className="absolute right-0 top-40 h-[28rem] w-[18rem] rotate-45 rounded-full bg-indigo-600/[0.06] blur-[100px]" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10 text-center">
        <AnimatedGroup variants={transitionVariants}>
          {/* Announcement pill */}
          <button
            onClick={() => navigate('/contact')}
            className="group mx-auto flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/5 p-1 pl-4 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08]"
            data-testid="hero-announcement-pill"
          >
            <span className="text-sm text-zinc-300">AI Smart Assist</span>
            <span className="block h-4 w-px bg-white/20" />
            <div className="size-6 overflow-hidden rounded-full bg-indigo-600">
              <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                <span className="flex size-6"><ArrowRight className="m-auto size-3 text-white" /></span>
                <span className="flex size-6"><ArrowRight className="m-auto size-3 text-white" /></span>
              </div>
            </div>
          </button>

          <h1
            className="mt-8 mx-auto max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight"
            style={{ fontFamily: 'Outfit' }}
          >
            Optimize Pricing.<br />
            <span className="gradient-text">Accelerate Revenue.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 leading-relaxed">
            Streamline workflows with AI-powered pricing optimization & revenue intelligence.
            Predict growth with data-driven insights.
          </p>
        </AnimatedGroup>

        <AnimatedGroup
          variants={{
            container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.5 } } },
            ...transitionVariants,
          }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button
            className="bg-indigo-600 hover:bg-indigo-500 text-white btn-glow px-5 py-2.5 text-sm group"
            onClick={handleGetStarted}
            data-testid="hero-cta-btn"
          >
            Start 14-Day Free Trial
            <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
          </Button>
          <Button
            variant="ghost"
            className="text-zinc-300 hover:text-white hover:bg-white/10 px-5 py-2.5 text-sm"
            onClick={() => scrollTo('#pricing')}
            data-testid="hero-pricing-btn"
          >
            View Pricing
          </Button>
        </AnimatedGroup>
      </div>

      {/* Framed dashboard preview with glow + fade-to-background */}
      <AnimatedGroup
        variants={{
          container: { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.6 } } },
          ...transitionVariants,
        }}
        className="relative z-10"
      >
        <div className="relative mx-auto mt-16 max-w-5xl px-2">
          <div className="absolute -inset-4 bg-indigo-500/20 blur-3xl rounded-3xl animate-pulse-glow" />
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl shadow-indigo-500/10 backdrop-blur-sm">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-b from-transparent to-[#050507]"
            />
            <img
              src="/dashboard-preview.png?v=5"
              alt="InFlow Analytics Dashboard"
              className="relative w-full rounded-xl border border-white/5"
            />
          </div>
        </div>
      </AnimatedGroup>

      {/* Integrates-with strip (real integrations — honest social proof) */}
      <div className="relative z-10 mx-auto mt-16 max-w-4xl px-6 text-center">
        <p className="text-xs uppercase tracking-widest text-zinc-600">
          Integrates with the tools you already use
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
          {['Stripe', 'HubSpot', 'Salesforce', 'QuickBooks', 'Shopify', 'PayPal'].map((name) => (
            <span
              key={name}
              className="text-sm font-semibold text-zinc-400"
              style={{ fontFamily: 'Outfit' }}
              data-testid={`hero-integration-${name.toLowerCase()}`}
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
