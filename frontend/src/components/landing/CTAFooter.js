import { ArrowRight, Twitter, Linkedin, Github } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '../ui/button';

export const CTASection = ({ handleGetStarted }) => (
  <section className="py-24 px-4 sm:px-6 lg:px-8">
    <div className="max-w-4xl mx-auto text-center reveal-scale">
      <div className="relative">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
        <div className="cta-card relative bg-white/[0.04] border border-white/[0.1] rounded-3xl p-12 backdrop-blur-xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            Ready to optimize your pricing?
          </h2>
          <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
            Start optimizing your pricing and accelerate revenue growth today.
          </p>
          <Button className="bg-white/10 hover:bg-white/20 btn-glow px-3 group" onClick={handleGetStarted} data-testid="cta-final-btn">
            Access Now <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
    </div>
  </section>
);

const openConsentPreferences = (e) => {
  e.preventDefault();
  if (typeof window.displayPreferenceModal === 'function') {
    window.displayPreferenceModal();
  } else if (window.Termly && typeof window.Termly.displayPreferenceModal === 'function') {
    window.Termly.displayPreferenceModal();
  }
};

const footerLinks = [
  {
    label: 'Product',
    links: [
      { title: 'Features', href: '#features' },
      { title: 'Pricing', href: '#pricing' },
      { title: 'Integrations', href: '#integrations' },
      { title: 'FAQ', href: '#faq' },
    ],
  },
  {
    label: 'Company',
    links: [
      { title: 'Contact', href: '/contact' },
      { title: 'Support', href: '/support' },
      { title: 'Sign In', href: '/auth' },
    ],
  },
  {
    label: 'Legal',
    links: [
      { title: 'Privacy Policy', href: '/privacy' },
      { title: 'Terms of Service', href: '/terms' },
      { title: 'Cookies', href: '/cookies' },
      { title: 'Consent Preferences', href: '#', onClick: openConsentPreferences },
    ],
  },
  {
    label: 'Social',
    links: [
      { title: 'Twitter', href: '#', icon: Twitter },
      { title: 'LinkedIn', href: '#', icon: Linkedin },
      { title: 'GitHub', href: '#', icon: Github },
    ],
  },
];

const AnimatedContainer = ({ className, delay = 0.1, children }) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ filter: 'blur(4px)', translateY: -8, opacity: 0 }}
      whileInView={{ filter: 'blur(0px)', translateY: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.8 }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export const Footer = () => (
  <footer
    className="relative w-full max-w-6xl mx-auto flex flex-col items-center justify-center rounded-t-3xl md:rounded-t-[2.5rem] border-t border-white/[0.08] bg-[radial-gradient(35%_128px_at_50%_0%,rgba(255,255,255,0.06),transparent)] px-6 py-14 lg:py-20"
    data-testid="main-footer"
  >
    <div className="absolute top-0 right-1/2 left-1/2 h-px w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 blur" />

    <div className="grid w-full gap-10 xl:grid-cols-3 xl:gap-8">
      <AnimatedContainer className="space-y-4">
        <a href="/" className="inline-flex items-center group">
          <div className="h-7 overflow-hidden flex items-center group-hover:scale-105 transition-transform">
            <img src="/inflow-logo.png?v=6" alt="InFlow" className="h-full w-auto object-contain" />
          </div>
        </a>
        <p className="text-zinc-500 text-sm leading-relaxed max-w-xs">
          AI-powered revenue intelligence platform for modern B2B teams. Maximise deal value and accelerate growth.
        </p>
        <p className="text-zinc-600 text-sm">
          &copy; {new Date().getFullYear()} InFlow. All rights reserved.
        </p>
      </AnimatedContainer>

      <div className="mt-2 grid grid-cols-2 gap-8 md:grid-cols-4 xl:col-span-2 xl:mt-0">
        {footerLinks.map((section, index) => (
          <AnimatedContainer key={section.label} delay={0.1 + index * 0.1}>
            <div className="mb-6 md:mb-0">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest" style={{ fontFamily: 'Outfit' }}>
                {section.label}
              </h4>
              <ul className="mt-4 space-y-2.5 text-sm">
                {section.links.map((link) => (
                  <li key={link.title}>
                    <a
                      href={link.href}
                      onClick={link.onClick}
                      className="inline-flex items-center text-zinc-500 hover:text-white transition-colors duration-300"
                      data-testid={`footer-link-${link.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {link.icon && <link.icon className="me-2 size-4" />}
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </AnimatedContainer>
        ))}
      </div>
    </div>
  </footer>
);
