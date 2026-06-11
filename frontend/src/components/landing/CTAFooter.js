import { ArrowRight, Mail, MapPin } from 'lucide-react';
import { Button } from '../ui/button';

export const CTASection = ({ handleGetStarted }) => (
  <section className="py-24 px-4 sm:px-6 lg:px-8">
    <div className="max-w-4xl mx-auto text-center reveal-scale">
      <div className="relative">
        <div className="absolute inset-0 hero-glow" />
        <div className="cta-card relative bg-white/[0.04] border border-white/[0.1] rounded-3xl p-12 backdrop-blur-xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            Ready to optimize your pricing?
          </h2>
          <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
            Start optimizing your pricing and accelerate revenue growth today.
          </p>
          <Button className="bg-indigo-600 hover:bg-indigo-500 btn-glow px-3 group" onClick={handleGetStarted} data-testid="cta-final-btn">
            Access Now <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
    </div>
  </section>
);

export const Footer = () => (
  <footer className="relative overflow-hidden border-t border-white/[0.06]" data-testid="main-footer">
    {/* Background ambient glow */}
    <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-indigo-500/[0.04] blur-[120px] pointer-events-none" />
    <div className="absolute -bottom-20 right-0 w-[400px] h-[200px] rounded-full bg-cyan-500/[0.03] blur-[100px] pointer-events-none" />

    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Main footer grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 lg:gap-16 py-16 lg:py-20">
        {/* Brand column */}
        <div className="col-span-2 md:col-span-4 lg:col-span-2">
          <a href="/" className="inline-flex items-center group mb-5">
            <div className="h-7 overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform">
              <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-full w-auto object-contain" />
            </div>
          </a>
          <p className="text-zinc-500 text-sm leading-relaxed max-w-xs mb-6">
            AI-powered revenue intelligence platform for modern B2B teams. Maximise deal value and accelerate growth.
          </p>
          <div className="flex items-center gap-3">
            {[
              { label: 'Twitter', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
              { label: 'LinkedIn', path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
              { label: 'GitHub', path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' }
            ].map((s) => (
              <a key={s.label} href="#" className="social-icon w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12]" aria-label={s.label} data-testid={`footer-social-${s.label.toLowerCase()}`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d={s.path} /></svg>
              </a>
            ))}
          </div>
        </div>

        {/* Product */}
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-5" style={{ fontFamily: 'Outfit' }}>Product</h4>
          <ul className="space-y-3">
            {['Sales Pipeline', 'Sales Performance', 'Revenue Intelligence', 'Pricing Optimizer', 'CRO Tools'].map((item) => (
              <li key={item}>
                <a href="#features" className="text-sm text-zinc-500 hover:text-white transition-colors duration-200">{item}</a>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div className="hidden lg:block" id="contact">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-5" style={{ fontFamily: 'Outfit' }}>Contact</h4>
          <ul className="space-y-4">
            <li>
              <a href="mailto:support@inflowft.com" className="flex items-center gap-2.5 text-sm text-zinc-500 hover:text-white transition-colors" data-testid="footer-email-link">
                <Mail className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                support@inflowft.com
              </a>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-zinc-500">
              <MapPin className="w-4 h-4 text-zinc-600 flex-shrink-0 mt-0.5" />
              Greater London, UK
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06] py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-zinc-600">&copy; 2026 InFlow. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <a href="/privacy" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors duration-200">Privacy Policy</a>
          <a href="/terms" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors duration-200">Terms of Service</a>
          <a href="/cookies" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors duration-200">Cookies</a>
          <a
            href="#"
            className="termly-display-preferences text-xs text-zinc-600 hover:text-zinc-400 transition-colors duration-200"
            onClick={(e) => {
              e.preventDefault();
              if (typeof window.displayPreferenceModal === 'function') {
                window.displayPreferenceModal();
              } else if (window.Termly && typeof window.Termly.displayPreferenceModal === 'function') {
                window.Termly.displayPreferenceModal();
              }
            }}
            data-testid="footer-consent-preferences"
          >
            Consent Preferences
          </a>
        </div>
      </div>
    </div>
  </footer>
);
