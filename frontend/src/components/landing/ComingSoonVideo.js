import { useRef, useEffect, useState } from 'react';

export const ComingSoonVideo = () => {
  const videoRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting && videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      },
      { threshold: 0.3 }
    );
    const el = document.getElementById('coming-soon-video');
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="coming-soon-video" className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden" data-testid="coming-soon-section">
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          className="w-full h-full object-cover opacity-40"
          src="/inflow-teaser.mp4"
          muted
          loop
          playsInline
          preload="metadata"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-[#050507]/70 to-[#050507]" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <div className={`transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="inline-block px-4 py-1.5 rounded-full bg-slate-500/15 border border-slate-500/25 text-slate-400 text-xs font-semibold uppercase tracking-widest mb-6" data-testid="coming-soon-badge">
            Coming Soon
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-5" style={{ fontFamily: 'Outfit' }} data-testid="coming-soon-heading">
            The future of revenue intelligence
          </h2>
          <p className="text-zinc-400 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed" data-testid="coming-soon-description">
            AI-powered pricing optimization, sales pipeline management, and predictive forecasting — all in one platform. Built for teams that want to grow smarter.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors btn-glow"
              data-testid="coming-soon-cta"
            >
              Join the waitlist
            </a>
            <span className="text-zinc-600 text-sm">Be the first to know when we launch</span>
          </div>
        </div>
      </div>
    </section>
  );
};
