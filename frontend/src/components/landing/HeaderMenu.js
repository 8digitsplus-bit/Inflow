import { ArrowRight, X, Zap, Menu } from 'lucide-react';
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
        <Button className="bg-indigo-600 hover:bg-indigo-500 text-white btn-glow px-8 py-6 text-lg" onClick={() => { setMenuOpen(false); handleGetStarted(); }}>
          Get Started <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  </div>
);

export const Header = ({ setMenuOpen, menuOpen, handleGetStarted }) => (
  <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-lg text-white" style={{ fontFamily: 'Outfit' }}>Vector</span>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all" onClick={() => setMenuOpen(!menuOpen)} data-testid="hamburger-menu-btn">
          <Menu className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:inline">Menu</span>
        </button>
        <Button className="bg-indigo-600 hover:bg-indigo-500 text-white btn-glow hidden sm:flex" onClick={handleGetStarted} data-testid="header-cta-btn">
          Get Started
        </Button>
      </div>
    </div>
  </header>
);
