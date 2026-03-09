import { useState, useEffect } from 'react';
import { ArrowRight, X, Menu, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

export const FullScreenMenu = ({ menuOpen, setMenuOpen, handleMenuClick, handleGetStarted, isAuthenticated }) => (
  <div
    className={`fixed inset-0 z-[60] transition-all duration-500 ease-out ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    style={{ background: 'rgba(9, 9, 11, 0.60)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
  >
    <button className="absolute top-5 right-6 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all" onClick={() => setMenuOpen(false)} data-testid="menu-close-btn">
      <X className="w-6 h-6" />
    </button>
    <div className="h-full flex flex-col items-center justify-center">
      <nav className="flex flex-col items-center gap-2">
        {[
          { label: 'Features', action: '#features', delay: '100ms' },
          { label: 'Pricing', action: '#pricing', delay: '150ms' },
          { label: 'Contact', action: '#contact', delay: '200ms' },
        ].map((item) => (
          <button key={item.label} onClick={() => handleMenuClick(item.action)}
            className={`group px-8 py-5 rounded-2xl transition-all duration-300 hover:bg-white/5 hover:shadow-[0_0_40px_rgba(255,255,255,0.25)] ${menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
            style={{ transitionDelay: item.delay }}
            data-testid={`menu-${item.label.toLowerCase()}`}
          >
            <span className="text-2xl font-semibold text-zinc-300 group-hover:text-white transition-colors" style={{ fontFamily: 'Outfit' }}>{item.label}</span>
          </button>
        ))}
        <div className={`w-24 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent my-4 transition-all duration-300 ${menuOpen ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`} style={{ transitionDelay: '250ms' }} />
        <button onClick={() => handleMenuClick('signin')}
          className={`group px-8 py-5 rounded-2xl transition-all duration-300 hover:bg-white/5 hover:shadow-[0_0_40px_rgba(255,255,255,0.25)] ${menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
          style={{ transitionDelay: '300ms' }}
          data-testid="menu-signin"
        >
          <span className="text-2xl font-semibold text-zinc-300 group-hover:text-white transition-colors" style={{ fontFamily: 'Outfit' }}>
            {isAuthenticated ? 'Dashboard' : 'Sign In'}
          </span>
        </button>
      </nav>
      <div className={`mt-10 transition-all duration-300 ${menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`} style={{ transitionDelay: '350ms' }}>
        <Button className="bg-indigo-600 hover:bg-indigo-500 text-white btn-glow px-3 py-2.5 text-sm" onClick={() => { setMenuOpen(false); handleGetStarted(); }}>
          Start Free Trial <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  </div>
);

export const Header = ({ setMenuOpen, menuOpen, handleGetStarted }) => {
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [lastScroll, setLastScroll] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 20);
      setVisible(y < lastScroll || y < 80);
      setLastScroll(y);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [lastScroll]);

  const scrollTo = (id) => {
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out ${
        visible ? 'translate-y-0' : '-translate-y-full'
      }`}
      style={{
        background: scrolled ? 'rgba(9, 9, 11, 0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
      }}
      data-testid="main-header"
    >
      {/* Animated bottom border */}
      <div className={`absolute bottom-0 left-0 right-0 h-px transition-opacity duration-500 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
        <div className="h-full bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-between transition-all duration-500 ${scrolled ? 'h-14' : 'h-20'}`}>
          {/* Logo */}
          <a href="/" className="flex items-center group" data-testid="header-logo">
            <div className={`overflow-hidden flex items-center justify-center transition-all duration-500 group-hover:scale-105 ${scrolled ? 'h-6' : 'h-7'}`}>
              <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-full w-auto object-contain" />
            </div>
          </a>

          {/* Center hamburger */}
          <button
            className={`absolute left-1/2 -translate-x-1/2 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all duration-300 ${scrolled ? 'w-8 h-8' : 'w-9 h-9'}`}
            onClick={() => setMenuOpen(!menuOpen)}
            data-testid="hamburger-menu-btn"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Right side CTA */}
          <div className="flex items-center">
            <Button
              className={`bg-indigo-600 hover:bg-indigo-500 text-white btn-glow hidden sm:flex items-center gap-1.5 transition-all duration-500 ${scrolled ? 'h-8 text-xs px-4' : 'h-9 text-sm px-5'}`}
              onClick={handleGetStarted}
              data-testid="header-cta-btn"
            >
              14-Day Free Trial <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
