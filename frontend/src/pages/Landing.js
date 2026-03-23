import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Header, FullScreenMenu } from '../components/landing/HeaderMenu';
import { HeroSection } from '../components/landing/HeroSection';
import { FeaturesSection } from '../components/landing/FeaturesSection';
import { ConnectBusinessSection } from '../components/landing/HowItWorks';
import { PricingSection } from '../components/landing/PricingSection';
import { FAQSection } from '../components/landing/FAQSection';
import { AboutSection } from '../components/landing/AboutSection';
import { CTASection, Footer } from '../components/landing/CTAFooter';
import { Toaster } from '../components/ui/sonner';

const Landing = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef(null);

  // Scroll-reveal observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          } else {
            entry.target.classList.remove('visible');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    const el = mainRef.current;
    if (el) {
      el.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach((node) => {
        observer.observe(node);
      });
    }

    return () => observer.disconnect();
  }, []);

  const handleGetStarted = () => navigate(isAuthenticated ? '/dashboard' : '/auth');
  const handleStartTrial = () => navigate(isAuthenticated ? '/dashboard' : '/auth?trial=true');
  const handleScrollToPricing = () => document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' });
  const handleMenuClick = (target) => {
    setMenuOpen(false);
    if (target === 'signin') { navigate(isAuthenticated ? '/dashboard' : '/auth'); return; }
    setTimeout(() => document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' }), 200);
  };

  return (
    <div ref={mainRef} className="min-h-screen bg-[#09090B] text-white overflow-x-hidden">
      <Toaster position="top-center" />
      <Header setMenuOpen={setMenuOpen} menuOpen={menuOpen} handleGetStarted={handleStartTrial} />
      <FullScreenMenu menuOpen={menuOpen} setMenuOpen={setMenuOpen} handleMenuClick={handleMenuClick} handleGetStarted={handleStartTrial} isAuthenticated={isAuthenticated} />
      <HeroSection handleGetStarted={handleStartTrial} />
      <FeaturesSection />
      <ConnectBusinessSection />
      <PricingSection handleGetStarted={handleGetStarted} isAuthenticated={isAuthenticated} />
      <FAQSection />
      <AboutSection />
      <CTASection handleGetStarted={handleGetStarted} />
      <Footer />
    </div>
  );
};

export default Landing;
