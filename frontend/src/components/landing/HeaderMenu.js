import { useState, useEffect, useRef } from 'react';
import { X, Menu } from 'lucide-react';
import { Button } from '../ui/button';

const navLinks = [
  { label: 'Features', target: '#features' },
  { label: 'Pricing', target: '#pricing' },
  { label: 'FAQs', target: '#faq' },
  { label: 'Contact', target: '/contact' },
];

// Nav link with a slide-up reveal on hover (gray -> white).
const AnimatedNavLink = ({ onClick, children, testid }) => (
  <button
    onClick={onClick}
    data-testid={testid}
    className="group relative inline-block h-5 overflow-hidden align-middle text-sm font-medium leading-5"
  >
    <span className="block transition-transform duration-300 ease-out group-hover:-translate-y-5">
      <span className="block h-5 text-zinc-400">{children}</span>
      <span className="block h-5 text-white">{children}</span>
    </span>
  </button>
);

export const Header = ({ handleGetStarted, handleMenuClick, isAuthenticated }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shapeClass, setShapeClass] = useState('rounded-full');
  const shapeTimeout = useRef(null);

  // Morph the pill to a rounded panel while the mobile menu is open.
  useEffect(() => {
    if (shapeTimeout.current) clearTimeout(shapeTimeout.current);
    if (isOpen) {
      setShapeClass('rounded-3xl');
    } else {
      shapeTimeout.current = setTimeout(() => setShapeClass('rounded-full'), 300);
    }
    return () => shapeTimeout.current && clearTimeout(shapeTimeout.current);
  }, [isOpen]);

  const onNav = (target) => { setIsOpen(false); handleMenuClick(target); };
  const onLogin = () => { setIsOpen(false); window.location.href = '/auth?mode=login'; };
  const onCta = () => { setIsOpen(false); handleGetStarted(); };

  return (
    <header
      className={`fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center px-4 sm:px-6 py-3 border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.7)] w-[calc(100%-1.5rem)] lg:w-auto max-w-[calc(100vw-1.5rem)] transition-[border-radius] duration-300 ease-in-out ${shapeClass}`}
      data-testid="main-header"
    >
      {/* top sheen */}
      <div aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      <div className="flex items-center justify-between w-full gap-x-4 lg:gap-x-8">
        {/* Logo */}
        <a href="/" className="group flex shrink-0 items-center" data-testid="header-logo">
          <img
            src="/inflow-logo.png?v=3"
            alt="InFlow"
            className="h-6 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
          />
        </a>

        {/* Center nav (desktop) */}
        <nav className="hidden items-center gap-6 lg:flex xl:gap-8">
          {navLinks.map((l) => (
            <AnimatedNavLink key={l.label} onClick={() => onNav(l.target)} testid={`nav-${l.label.toLowerCase()}`}>
              {l.label}
            </AnimatedNavLink>
          ))}
        </nav>

        {/* CTAs (desktop) */}
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <Button
            variant="ghost"
            className="h-8 px-4 text-xs text-zinc-300 hover:text-white"
            onClick={onLogin}
            data-testid="header-login-btn"
          >
            Log In
          </Button>
          <Button
            className="btn-glow h-8 bg-white/10 px-4 text-xs text-white hover:bg-white/20"
            onClick={onCta}
            data-testid="header-cta-btn"
          >
            {isAuthenticated ? 'Dashboard' : 'Get Started'}
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          className="flex h-8 w-8 items-center justify-center text-zinc-300 hover:text-white focus:outline-none lg:hidden"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'Close Menu' : 'Open Menu'}
          data-testid="hamburger-menu-btn"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      <div
        className={`flex w-full flex-col items-center overflow-hidden transition-all duration-300 ease-in-out lg:hidden ${
          isOpen ? 'max-h-[420px] pt-4 opacity-100' : 'pointer-events-none max-h-0 pt-0 opacity-0'
        }`}
      >
        <nav className="flex w-full flex-col items-center gap-4">
          {navLinks.map((l) => (
            <button
              key={l.label}
              onClick={() => onNav(l.target)}
              className="w-full text-center text-sm text-zinc-300 transition-colors hover:text-white"
              data-testid={`nav-mobile-${l.label.toLowerCase()}`}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <div className="mt-4 flex w-full flex-col items-center gap-3 px-1">
          <Button
            variant="ghost"
            className="h-9 w-full text-sm text-zinc-300 hover:text-white"
            onClick={onLogin}
            data-testid="header-login-btn-mobile"
          >
            Log In
          </Button>
          <Button
            className="btn-glow h-9 w-full bg-white/10 text-sm text-white hover:bg-white/20"
            onClick={onCta}
            data-testid="header-cta-btn-mobile"
          >
            {isAuthenticated ? 'Dashboard' : 'Get Started'}
          </Button>
        </div>
      </div>
    </header>
  );
};
