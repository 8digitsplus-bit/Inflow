import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  TrendingUp, 
  Zap, 
  BarChart3, 
  Target, 
  ArrowRight, 
  Check, 
  Sparkles,
  PieChart,
  DollarSign,
  Users,
  ChevronRight,
  Menu,
  X,
  LogIn
} from 'lucide-react';
import { Button } from '../components/ui/button';

const Landing = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      login();
    }
  };

  const handleMenuClick = (action) => {
    setMenuOpen(false);
    if (action === 'signin') {
      handleGetStarted();
    } else {
      document.querySelector(action)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const features = [
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: 'Revenue Intelligence',
      description: 'AI-powered insights that analyze your sales data and predict revenue trends with precision.'
    },
    {
      icon: <Target className="w-6 h-6" />,
      title: 'Pricing Optimization',
      description: 'Maximize margins with Claude AI recommendations based on market dynamics and competition.'
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Sales Pipeline',
      description: 'Visual pipeline management with drag-and-drop deal tracking and probability scoring.'
    },
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: 'AI Insights',
      description: 'Get actionable recommendations powered by Claude Sonnet 4.5 to close deals faster.'
    }
  ];

  const stats = [
    { value: '47%', label: 'Revenue Increase' },
    { value: '3.2x', label: 'Deal Velocity' },
    { value: '89%', label: 'Win Rate Improvement' },
    { value: '$2.1M', label: 'Avg. Pipeline Value' }
  ];

  const [billingPeriod, setBillingPeriod] = useState('monthly');

  const plans = {
    monthly: [
      {
        name: 'Basic',
        price: '49',
        period: '/month',
        deals: '1,000 deals',
        features: ['1,000 deals/month', 'Basic analytics', 'Email support', 'Pipeline view', 'Churn alerts'],
        cta: 'Get Started',
        featured: false,
        planId: 'basic_monthly'
      },
      {
        name: 'Pro',
        price: '99',
        period: '/month',
        deals: '5,000 deals',
        features: ['5,000 deals/month', 'AI pricing insights', 'Priority support', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools'],
        cta: 'Start Free Trial',
        featured: true,
        planId: 'pro_monthly'
      },
      {
        name: 'Enterprise',
        price: '179',
        period: '/month',
        deals: '12,000 deals',
        features: ['12,000 deals/month', 'Everything in Pro', 'Custom integrations', 'API access', 'Advanced churn analytics', 'Request for Quote'],
        cta: 'Contact Sales',
        featured: false,
        planId: 'enterprise_monthly'
      }
    ],
    yearly: [
      {
        name: 'Basic',
        price: '490',
        period: '/year',
        deals: '2,500 deals',
        features: ['2,500 deals/year', 'Basic analytics', 'Email support', 'Pipeline view', 'Churn alerts'],
        cta: 'Get Started',
        featured: false,
        planId: 'basic_yearly',
        savings: 'Save $98 first year'
      },
      {
        name: 'Pro',
        price: '990',
        period: '/year',
        deals: '12,000 deals',
        features: ['12,000 deals/year', 'AI pricing insights', 'Priority support', 'Advanced analytics', 'Revenue forecasting', 'Churn prediction', 'CRO tools'],
        cta: 'Start Free Trial',
        featured: true,
        planId: 'pro_yearly',
        savings: 'Save $198 first year'
      },
      {
        name: 'Enterprise',
        price: '1,799',
        period: '/year',
        deals: '30,000 deals',
        features: ['30,000 deals/year', 'Everything in Pro', 'Custom integrations', 'API access', 'Advanced churn analytics', 'Request for Quote'],
        cta: 'Contact Sales',
        featured: false,
        planId: 'enterprise_yearly',
        savings: 'Save $349 first year'
      }
    ]
  };

  return (
    <div className="min-h-screen bg-[#09090B]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg text-white" style={{ fontFamily: 'Outfit' }}>Vector</span>
            </div>

            {/* Hamburger Menu */}
            <div className="relative" ref={menuRef}>
              <button 
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
                onClick={() => setMenuOpen(!menuOpen)}
                data-testid="hamburger-menu-btn"
              >
                {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                <span className="text-sm font-medium hidden sm:inline">Menu</span>
              </button>

              {/* Glassmorphism Dropdown */}
              <div 
                className={`absolute right-0 top-full mt-2 w-56 transition-all duration-300 ease-out transform origin-top-right ${
                  menuOpen 
                    ? 'opacity-100 scale-100 translate-y-0' 
                    : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
                }`}
              >
                <div className="rounded-xl border border-white/10 overflow-hidden shadow-2xl"
                  style={{
                    background: 'rgba(15, 15, 18, 0.85)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)'
                  }}
                >
                  <div className="p-2">
                    <button
                      onClick={() => handleMenuClick('#features')}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-all group"
                      data-testid="menu-features"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300" />
                      <span className="text-sm font-medium">Features</span>
                    </button>
                    
                    <button
                      onClick={() => handleMenuClick('#pricing')}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-all group"
                      data-testid="menu-pricing"
                    >
                      <DollarSign className="w-4 h-4 text-emerald-400 group-hover:text-emerald-300" />
                      <span className="text-sm font-medium">Pricing</span>
                    </button>

                    <div className="my-2 border-t border-white/10" />
                    
                    <button
                      onClick={() => handleMenuClick('signin')}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-zinc-300 hover:text-white hover:bg-indigo-500/20 transition-all group"
                      data-testid="menu-signin"
                    >
                      <LogIn className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300" />
                      <span className="text-sm font-medium">{isAuthenticated ? 'Dashboard' : 'Sign In'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Get Started Button (always visible) */}
            <Button 
              className="bg-indigo-600 hover:bg-indigo-500 text-white btn-glow hidden sm:flex"
              onClick={handleGetStarted}
              data-testid="header-cta-btn"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 hero-glow" />
        <div className="absolute inset-0 noise-overlay" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-8 animate-fade-in">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-indigo-300">Powered by Claude AI</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight" style={{ fontFamily: 'Outfit' }}>
                Optimize Pricing.<br />
                <span className="gradient-text">Accelerate Revenue.</span>
              </h1>
              
              <p className="text-lg text-zinc-400 max-w-xl leading-relaxed">
                AI-powered pricing optimization and revenue intelligence for B2B SaaS teams. 
                Close deals faster with data-driven insights.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white btn-glow px-8 py-6 text-base"
                  onClick={handleGetStarted}
                  data-testid="hero-cta-btn"
                >
                  Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button 
                  size="lg"
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-8 py-6 text-base"
                  data-testid="hero-demo-btn"
                >
                  Watch Demo
                </Button>
              </div>

              <div className="flex items-center gap-6 pt-4">
                <div className="flex -space-x-2">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-zinc-700 border-2 border-[#09090B]" />
                  ))}
                </div>
                <p className="text-sm text-zinc-400">
                  <span className="text-white font-medium">500+</span> companies trust Vector
                </p>
              </div>
            </div>

            <div className="lg:col-span-5 animate-slide-up stagger-2">
              <div className="relative">
                <div className="absolute -inset-4 bg-indigo-500/20 blur-3xl rounded-3xl" />
                <div className="relative bg-zinc-900/80 border border-white/10 rounded-2xl p-6 backdrop-blur">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-400">Revenue This Quarter</span>
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> +24%
                      </span>
                    </div>
                    <div className="text-3xl font-bold font-mono text-white">$847,290</div>
                    <div className="h-32 bg-gradient-to-t from-indigo-500/20 to-transparent rounded-lg flex items-end px-2">
                      {[40, 65, 45, 80, 60, 90, 75, 95].map((h, i) => (
                        <div 
                          key={i} 
                          className="flex-1 mx-0.5 bg-indigo-500 rounded-t"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="text-3xl sm:text-4xl font-bold font-mono text-white mb-2">{stat.value}</div>
                <div className="text-sm text-zinc-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">Features</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Everything you need to optimize revenue
            </h2>
            <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
              Powerful tools designed for modern revenue teams to maximize deal value and accelerate growth.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <div 
                key={i}
                className="group p-8 bg-zinc-950/50 border border-white/10 rounded-xl card-hover animate-fade-in"
                style={{ animationDelay: `${i * 0.1}s` }}
                data-testid={`feature-card-${i}`}
              >
                <div className="w-12 h-12 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-6 group-hover:bg-indigo-500/20 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3" style={{ fontFamily: 'Outfit' }}>
                  {feature.title}
                </h3>
                <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-zinc-950/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">How It Works</span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                AI-powered pricing in three steps
              </h2>
              
              <div className="mt-12 space-y-8">
                {[
                  { num: '01', title: 'Connect Your Data', desc: 'Import deals and pricing data from your CRM or enter manually.' },
                  { num: '02', title: 'Get AI Analysis', desc: 'Claude AI analyzes market trends, competition, and your data.' },
                  { num: '03', title: 'Optimize & Win', desc: 'Implement recommended pricing and watch revenue grow.' }
                ].map((step, i) => (
                  <div key={i} className="flex gap-6 group">
                    <div className="text-4xl font-bold text-zinc-800 group-hover:text-indigo-600 transition-colors font-mono">
                      {step.num}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                      <p className="text-zinc-400">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 bg-cyan-500/10 blur-3xl rounded-3xl" />
              <img 
                src="https://images.unsplash.com/photo-1772050138768-2107c6e62a03?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxNzV8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRpZ2l0YWwlMjBkYXRhJTIwZmxvdyUyMGRhcmslMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc3MjExODk1N3ww&ixlib=rb-4.1.0&q=85"
                alt="Data visualization"
                className="relative rounded-2xl border border-white/10"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-indigo-400 text-sm font-medium uppercase tracking-widest">Pricing</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Unlock full access
            </h2>
            <p className="mt-4 text-zinc-400">Start growing. Scale as you need.</p>
            
            {/* Billing Toggle */}
            <div className="mt-8 inline-flex items-center p-1 bg-zinc-900 rounded-lg border border-zinc-800">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  billingPeriod === 'monthly' 
                    ? 'bg-indigo-600 text-white' 
                    : 'text-zinc-400 hover:text-white'
                }`}
                data-testid="billing-monthly-btn"
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  billingPeriod === 'yearly' 
                    ? 'bg-indigo-600 text-white' 
                    : 'text-zinc-400 hover:text-white'
                }`}
                data-testid="billing-yearly-btn"
              >
                Yearly <span className="text-emerald-400 ml-1">17% off*</span>
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">*First year only, then regular price</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {plans[billingPeriod].map((plan, i) => (
              <div 
                key={i}
                className={`pricing-card ${plan.featured ? 'featured' : ''} animate-fade-in`}
                style={{ animationDelay: `${i * 0.1}s` }}
                data-testid={`pricing-card-${plan.name.toLowerCase()}`}
              >
                {plan.featured && (
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-medium mb-4">
                    <Sparkles className="w-3 h-3" /> Most Popular
                  </div>
                )}
                {plan.savings && (
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium mb-4 ml-2">
                    {plan.savings}
                  </div>
                )}
                <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>${plan.price}</span>
                  <span className="text-zinc-400">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-indigo-400">{plan.deals}</p>
                
                <ul className="mt-8 space-y-4">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-3 text-zinc-300">
                      <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button 
                  className={`w-full mt-8 ${plan.featured ? 'bg-indigo-600 hover:bg-indigo-500 btn-glow' : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}`}
                  onClick={handleGetStarted}
                  data-testid={`pricing-cta-${plan.name.toLowerCase()}`}
                >
                  {plan.cta} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 hero-glow" />
            <div className="relative bg-zinc-900/50 border border-white/10 rounded-3xl p-12 backdrop-blur">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
                Ready to optimize your pricing?
              </h2>
              <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
                Join 500+ revenue teams using Vector to close more deals and grow faster.
              </p>
              <Button 
                size="lg"
                className="bg-indigo-600 hover:bg-indigo-500 btn-glow px-8"
                onClick={handleGetStarted}
                data-testid="cta-final-btn"
              >
                Start Your Free Trial <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Vector</span>
            </div>
            
            <div className="flex items-center gap-8 text-sm text-zinc-400">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>

            <p className="text-sm text-zinc-500">
              © 2026 Vector. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
