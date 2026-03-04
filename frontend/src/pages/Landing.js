import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FullScreenMenu, Header } from '../components/landing/HeaderMenu';
import { HeroSection } from '../components/landing/HeroSection';
import { FeaturesSection } from '../components/landing/FeaturesSection';
import { HowItWorks } from '../components/landing/HowItWorks';
import { PricingSection } from '../components/landing/PricingSection';
import { CTASection, Footer } from '../components/landing/CTAFooter';

const Landing = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [menuOpen]);

  const handleGetStarted = () => {
    navigate(isAuthenticated ? '/dashboard' : '/auth');
  };

  const handleMenuClick = (action) => {
    setMenuOpen(false);
    if (action === 'signin') {
      handleGetStarted();
    } else {
      setTimeout(() => {
        document.querySelector(action)?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B]">
      <FullScreenMenu menuOpen={menuOpen} setMenuOpen={setMenuOpen} handleMenuClick={handleMenuClick} handleGetStarted={handleGetStarted} isAuthenticated={isAuthenticated} />
      <Header setMenuOpen={setMenuOpen} menuOpen={menuOpen} handleGetStarted={handleGetStarted} />
      <HeroSection handleGetStarted={handleGetStarted} />
      <FeaturesSection />
      <HowItWorks />
      <PricingSection handleGetStarted={handleGetStarted} />
      <CTASection handleGetStarted={handleGetStarted} />
      <Footer />
    </div>
  );
};

export default Landing;
