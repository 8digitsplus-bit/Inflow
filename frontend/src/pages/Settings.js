import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  User, 
  CreditCard, 
  Check, 
  Sparkles,
  Loader2,
  ChevronRight,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Settings = () => {
  const { user, logout, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState({});
  const [processingPayment, setProcessingPayment] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  useEffect(() => {
    fetchPlans();
    
    // Check for payment return
    const sessionId = searchParams.get('session_id');
    const success = searchParams.get('success');
    
    if (sessionId && success) {
      pollPaymentStatus(sessionId);
    }
  }, [searchParams]);

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${API_URL}/api/subscription/plans`);
      if (response.ok) {
        const data = await response.json();
        setPlans(data);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;
    const pollInterval = 2000;

    if (attempts >= maxAttempts) {
      toast.error('Payment status check timed out. Please refresh the page.');
      setCheckingStatus(false);
      return;
    }

    setCheckingStatus(true);

    try {
      const response = await fetch(`${API_URL}/api/payments/status/${sessionId}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.payment_status === 'paid') {
          toast.success('Payment successful! Your plan has been upgraded.');
          await refreshUser();
          setCheckingStatus(false);
          // Clear URL params
          window.history.replaceState({}, '', '/settings');
          return;
        } else if (data.status === 'expired') {
          toast.error('Payment session expired. Please try again.');
          setCheckingStatus(false);
          return;
        }
      }

      // Continue polling
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    } catch (error) {
      console.error('Error checking payment status:', error);
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), pollInterval);
    }
  };

  const handleUpgrade = async (planId) => {
    if (planId === user?.subscription_tier) return;
    
    setProcessingPayment(true);
    try {
      const response = await fetch(`${API_URL}/api/payments/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: planId,
          origin_url: window.location.origin
        })
      });

      if (response.ok) {
        const data = await response.json();
        window.location.href = data.url;
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Checkout failed:', error);
      toast.error('Failed to start checkout');
    } finally {
      setProcessingPayment(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getTierDisplayName = (tier) => {
    if (!tier) return 'Free';
    const parts = tier.split('_');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts[1] ? ` (${parts[1]})` : '');
  };

  const getTierColor = (tier) => {
    if (!tier) return 'bg-zinc-700 text-zinc-300';
    if (tier.includes('enterprise')) return 'bg-purple-500/20 text-purple-400';
    if (tier.includes('pro')) return 'bg-indigo-500/20 text-indigo-400';
    if (tier.includes('essential')) return 'bg-cyan-500/20 text-cyan-400';
    return 'bg-zinc-700 text-zinc-300';
  };

  const planConfig = {
    monthly: [
      { key: 'essential_monthly', name: 'Essential', price: 59, deals: '1,500' },
      { key: 'pro_monthly', name: 'Pro', price: 149, deals: '7,500', featured: true },
      { key: 'enterprise_monthly', name: 'Enterprise', price: 249, deals: '20,000' }
    ],
    yearly: [
      { key: 'essential_yearly', name: 'Essential', price: 496, originalPrice: 708, deals: '3,000', savings: 212 },
      { key: 'pro_yearly', name: 'Pro', price: 1252, originalPrice: 1788, deals: '15,000', featured: true, savings: 536 },
      { key: 'enterprise_yearly', name: 'Enterprise', price: 2092, originalPrice: 2988, deals: '40,000', savings: 896 }
    ]
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl" data-testid="settings-page">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
            Settings
          </h1>
          <p className="text-zinc-400 mt-1">Manage your account and subscription</p>
        </div>

        {/* Payment Status Banner */}
        {checkingStatus && (
          <div className="flex items-center gap-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
            <span className="text-indigo-300">Verifying payment...</span>
          </div>
        )}

        {/* Profile Section */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="profile-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <User className="w-5 h-5 text-indigo-400" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarImage src={user?.picture} alt={user?.name} />
                <AvatarFallback className="bg-indigo-600 text-white text-lg">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold text-white">{user?.name}</h3>
                <p className="text-zinc-400">{user?.email}</p>
                <div className="mt-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getTierColor(user?.subscription_tier)}`}>
                    <Sparkles className="w-3 h-3" />
                    {getTierDisplayName(user?.subscription_tier)} Plan
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-zinc-800">
              <Button 
                variant="outline" 
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={logout}
                data-testid="logout-btn"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Plans */}
        <Card className="bg-zinc-950/50 border-white/10" data-testid="subscription-card">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
              <CreditCard className="w-5 h-5 text-emerald-400" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Billing Toggle */}
            <div className="mb-6 flex justify-center">
              <div className="inline-flex items-center p-1 bg-zinc-900 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setBillingPeriod('monthly')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    billingPeriod === 'monthly' 
                      ? 'bg-indigo-600 text-white' 
                      : 'text-zinc-400 hover:text-white'
                  }`}
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
                >
                  Yearly <span className="text-emerald-400 ml-1">30% off</span>
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">*1st year only, renews at full price</p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {planConfig[billingPeriod].map((plan) => {
                const planData = plans[plan.key];
                const isCurrentPlan = user?.subscription_tier === plan.key;
                
                return (
                  <div 
                    key={plan.key}
                    className={`relative p-5 rounded-xl border transition-all ${
                      isCurrentPlan 
                        ? 'bg-indigo-500/10 border-indigo-500/30' 
                        : plan.featured
                          ? 'bg-zinc-900/50 border-indigo-500/20 hover:border-indigo-500/40'
                          : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                    }`}
                    data-testid={`plan-${plan.key}`}
                  >
                    {plan.featured && !isCurrentPlan && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-600 text-white text-xs rounded-full">
                          <Sparkles className="w-3 h-3" /> Recommended
                        </span>
                      </div>
                    )}
                    
                    {isCurrentPlan && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full">
                          <Check className="w-3 h-3" /> Current
                        </span>
                      </div>
                    )}
                    
                    <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
                      {plan.name}
                    </h3>
                    
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                        ${plan.price.toLocaleString()}
                      </span>
                      {plan.originalPrice && (
                        <span className="text-sm text-zinc-500 line-through">
                          ${plan.originalPrice.toLocaleString()}
                        </span>
                      )}
                      <span className="text-zinc-400 text-sm">
                        /{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                      </span>
                    </div>

                    {plan.savings && (
                      <p className="text-emerald-400 text-xs mt-1">30% off 1st year (save ${plan.savings})</p>
                    )}
                    
                    <p className="text-indigo-400 text-sm mt-2">{plan.deals} usages</p>
                    
                    <ul className="mt-4 space-y-2">
                      {planData?.features?.slice(0, 4).map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-zinc-300">
                          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    
                    <Button
                      className={`w-full mt-4 ${
                        isCurrentPlan
                          ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 btn-glow'
                      }`}
                      disabled={isCurrentPlan || processingPayment}
                      onClick={() => handleUpgrade(plan.key)}
                      data-testid={`upgrade-${plan.key}-btn`}
                    >
                      {processingPayment ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isCurrentPlan ? (
                        'Current Plan'
                      ) : (
                        <>
                          Upgrade <ChevronRight className="w-4 h-4 ml-1" />
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-zinc-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-zinc-400">
                  <p>Payments are processed securely through Stripe. You can cancel anytime.</p>
                  <p className="mt-1">Priority plans include dedicated support and custom features.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
