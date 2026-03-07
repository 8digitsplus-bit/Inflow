import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ArrowRight, ArrowLeft, Building2, Users, Target, Check, CreditCard, ShoppingBag, Cloud, Calculator, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const INDUSTRIES = [
  'SaaS / Software',
  'E-Commerce',
  'FinTech',
  'Healthcare',
  'Marketing / Agency',
  'Manufacturing',
  'Consulting',
  'Other',
];

const TEAM_SIZES = ['1-5', '6-20', '21-50', '51-200', '200+'];

const GOALS = [
  { id: 'pipeline', label: 'Sales Pipeline Management', icon: Target },
  { id: 'pricing', label: 'Pricing Optimization', icon: Zap },
  { id: 'churn', label: 'Churn & Retention Analysis', icon: Users },
  { id: 'cro', label: 'Conversion Rate Optimization', icon: ArrowRight },
  { id: 'revenue', label: 'Revenue Intelligence', icon: Building2 },
];

const PLATFORMS = [
  { id: 'stripe', name: 'Stripe', desc: 'Payments & subscriptions', icon: CreditCard, color: '#635BFF' },
  { id: 'shopify', name: 'Shopify', desc: 'E-commerce data', icon: ShoppingBag, color: '#96BF48' },
  { id: 'hubspot', name: 'HubSpot', desc: 'CRM & contacts', icon: Users, color: '#FF7A59' },
  { id: 'salesforce', name: 'Salesforce', desc: 'Pipeline & deals', icon: Cloud, color: '#00A1E0' },
  { id: 'quickbooks', name: 'QuickBooks', desc: 'Financial data', icon: Calculator, color: '#2CA01C' },
];

const TOTAL_STEPS = 4;

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [form, setForm] = useState({
    company_name: '',
    team_size: '',
    industry: '',
    goals: [],
  });

  const toggleGoal = (goalId) => {
    setForm((prev) => ({
      ...prev,
      goals: prev.goals.includes(goalId)
        ? prev.goals.filter((g) => g !== goalId)
        : [...prev.goals, goalId],
    }));
  };

  const canProceed = () => {
    if (step === 1) return form.company_name.trim().length > 0;
    if (step === 2) return form.team_size && form.industry;
    if (step === 3) return form.goals.length > 0;
    if (step === 4) return true; // Always can proceed — step 4 is optional
    return false;
  };

  const connectPlatform = async (platformId) => {
    setConnectingPlatform(platformId);
    try {
      const res = await fetch(`${API_URL}/api/business/connect/${platformId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setConnectedPlatforms((prev) => [...prev, platformId]);
        toast.success(`Connected ${platformId}`);
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Failed to connect');
      }
    } catch {
      toast.error('Connection failed');
    } finally {
      setConnectingPlatform(null);
    }
  };

  const handleSubmit = async (goToDashboard = true) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      if (response.ok) {
        if (goToDashboard) {
          navigate('/dashboard');
        } else {
          setStep(4);
        }
      } else {
        toast.error('Something went wrong');
      }
    } catch {
      toast.error('Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else if (step === 3) {
      // Save onboarding first, then go to step 4
      handleSubmit(false);
    } else {
      // Step 4 — go to dashboard
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <div className="absolute inset-0 noise-overlay pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>InFlow</span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 px-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${s <= step ? 'bg-indigo-500' : 'bg-zinc-800'}`} />
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-8 backdrop-blur-xl animate-fade-in" key={step}>
          {/* Step 1: Company Name */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4">
                  <Building2 className="w-7 h-7 text-indigo-400" />
                </div>
                <h2 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
                  What's your company called?
                </h2>
                <p className="text-zinc-400 text-sm mt-2">We'll personalize your experience</p>
              </div>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="e.g. Acme Corp"
                className="bg-zinc-800 border-zinc-700 text-white h-12 text-center text-lg"
                autoFocus
                data-testid="onboarding-company-input"
              />
            </div>
          )}

          {/* Step 2: Team & Industry */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4">
                  <Users className="w-7 h-7 text-indigo-400" />
                </div>
                <h2 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
                  Tell us about your team
                </h2>
                <p className="text-zinc-400 text-sm mt-2">This helps us recommend the right features</p>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Team Size</label>
                <div className="grid grid-cols-5 gap-2">
                  {TEAM_SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={() => setForm({ ...form, team_size: size })}
                      className={`py-2.5 rounded-full text-sm font-medium transition-all ${
                        form.team_size === size
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700'
                      }`}
                      data-testid={`team-size-${size}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Industry</label>
                <div className="grid grid-cols-2 gap-2">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      onClick={() => setForm({ ...form, industry: ind })}
                      className={`py-2.5 px-4 rounded-full text-sm font-medium text-left transition-all ${
                        form.industry === ind
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-zinc-700'
                      }`}
                      data-testid={`industry-${ind.replace(/[^a-z]/gi, '-').toLowerCase()}`}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Goals */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4">
                  <Target className="w-7 h-7 text-indigo-400" />
                </div>
                <h2 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
                  What are your goals?
                </h2>
                <p className="text-zinc-400 text-sm mt-2">Select all that apply</p>
              </div>

              <div className="space-y-2">
                {GOALS.map((goal) => {
                  const Icon = goal.icon;
                  const selected = form.goals.includes(goal.id);
                  return (
                    <button
                      key={goal.id}
                      onClick={() => toggleGoal(goal.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${
                        selected
                          ? 'bg-indigo-600/15 border border-indigo-500/40 text-white'
                          : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 hover:border-zinc-600'
                      }`}
                      data-testid={`goal-${goal.id}`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selected ? 'bg-indigo-500/20' : 'bg-zinc-700/50'
                      }`}>
                        <Icon className={`w-5 h-5 ${selected ? 'text-indigo-400' : 'text-zinc-400'}`} />
                      </div>
                      <span className="flex-1 text-left text-sm font-medium">{goal.label}</span>
                      {selected && (
                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Connect Your Business (Optional) */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                  <Zap className="w-7 h-7 text-emerald-400" />
                </div>
                <h2 className="text-xl font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
                  Connect Your Business
                </h2>
                <p className="text-zinc-400 text-sm mt-2">
                  Sync your tools for real-time insights — or skip and do it later
                </p>
              </div>

              <div className="space-y-2">
                {PLATFORMS.map((platform) => {
                  const Icon = platform.icon;
                  const isConnected = connectedPlatforms.includes(platform.id);
                  const isLoading = connectingPlatform === platform.id;
                  return (
                    <button
                      key={platform.id}
                      onClick={() => !isConnected && !isLoading && connectPlatform(platform.id)}
                      disabled={isConnected || isLoading}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${
                        isConnected
                          ? 'bg-emerald-600/10 border border-emerald-500/30 text-white'
                          : 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 hover:border-zinc-600'
                      }`}
                      data-testid={`onboarding-connect-${platform.id}`}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${platform.color}18` }}
                      >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" style={{ color: platform.color }} />
                        ) : (
                          <Icon className="w-5 h-5" style={{ color: platform.color }} />
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium block">{platform.name}</span>
                        <span className="text-xs text-zinc-500">{platform.desc}</span>
                      </div>
                      {isConnected && (
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {step > 1 && step <= 3 ? (
              <Button
                variant="ghost"
                className="text-zinc-400 hover:text-white"
                onClick={() => setStep(step - 1)}
                data-testid="onboarding-back-btn"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
            ) : step === 4 ? (
              <Button
                variant="ghost"
                className="text-zinc-500 hover:text-zinc-300"
                onClick={() => navigate('/dashboard')}
                data-testid="onboarding-skip-connect-btn"
              >
                Skip for now
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="text-zinc-500 hover:text-zinc-300"
                onClick={() => navigate('/dashboard')}
                data-testid="onboarding-skip-btn"
              >
                Skip for now
              </Button>
            )}

            <Button
              className="bg-indigo-600 hover:bg-indigo-500 btn-glow px-6"
              onClick={handleNext}
              disabled={!canProceed() || loading}
              data-testid="onboarding-next-btn"
            >
              {step === 4 ? 'Go to Dashboard' : step === 3 ? 'Continue' : 'Continue'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Step indicator */}
        <p className="text-center text-xs text-zinc-600 mt-4">Step {step} of {TOTAL_STEPS}</p>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  );
};

export default Onboarding;
