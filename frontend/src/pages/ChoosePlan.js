import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Check, ArrowLeft, Zap, Shield, Clock, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { Toaster } from '../components/ui/sonner';
import { VolumeSlider } from '../components/VolumeSlider';
import {
  MAX_TIER, ALL_FEATURES, computePrice, planKeyFor,
} from '../lib/pricing';

const PricingSwitch = ({ options, value, onChange, layoutId, testidPrefix }) => (
  <div
    className="relative z-10 mx-auto w-full max-w-md rounded-full bg-white/[0.04] border border-white/10 p-1 backdrop-blur-md grid"
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
  >
    {options.map((opt) => {
      const active = value === opt.key;
      return (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          data-testid={`${testidPrefix}-${opt.key}`}
          className={cn(
            'relative z-10 h-12 rounded-full font-semibold transition-colors',
            active ? 'text-white' : 'text-zinc-400 hover:text-white',
          )}
        >
          {active && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-full border border-white/25 bg-gradient-to-b from-white/[0.16] to-white/[0.05] backdrop-blur-xl shadow-lg shadow-black/30 ring-1 ring-inset ring-white/10"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative flex items-center justify-center gap-1.5 text-sm sm:text-base">
            {opt.label}
            {opt.badge && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold', active ? 'bg-white/25 text-white' : 'bg-emerald-500/15 text-emerald-400')}>{opt.badge}</span>
            )}
          </span>
        </button>
      );
    })}
  </div>
);

const ChoosePlan = () => {
  const navigate = useNavigate();
  useAuth();
  const [tier, setTier] = useState(2);
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  const price = computePrice(tier, billingPeriod);
  const monthlyEquivalent = computePrice(tier, 'monthly') * 12;
  const atMax = tier >= MAX_TIER;

  const handlePurchase = () => {
    const params = new URLSearchParams({ plan: planKeyFor(billingPeriod), units: String(tier) });
    navigate(`/checkout?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#050507] relative overflow-hidden">
      <Toaster position="top-center" richColors />
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(125% 125% at 50% 8%, #050507 42%, #0052ff 130%)' }}
      />

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Hero */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Zap className="h-5 w-5 text-[#0052ff] fill-[#0052ff] mr-2" />
            <span className="text-[#4d8bff] font-semibold uppercase tracking-widest text-sm">Pricing</span>
          </div>
          <h1 className="md:text-6xl sm:text-5xl text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            Scale with flexible pricing
          </h1>
          <p className="text-lg text-zinc-400">
            One plan, every feature. You only pay for the deals &amp; revenue you track.
          </p>
        </div>

        {/* Slider */}
        <div className="relative" data-testid="pricing-card-usage">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-3xl opacity-50 blur-xl"
            style={{ background: 'linear-gradient(135deg, rgba(0,82,255,0.25), rgba(255,255,255,0.05) 45%, rgba(0,82,255,0.2))' }}
          />
          <div className="relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-6 sm:p-8 shadow-[0_8px_50px_-12px_rgba(0,0,0,0.6)]">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            <div className="flex items-center justify-center gap-1.5 mb-4">
              <p className="text-zinc-300 text-sm font-medium">Number of deals &amp; revenue tracked</p>
              <Info className="w-3.5 h-3.5 text-zinc-500" />
            </div>

            <VolumeSlider tier={tier} onChange={setTier} testidPrefix="volume" />

            {/* Billing period */}
            <div className="mt-10">
              <PricingSwitch
                layoutId="billing-pill"
                testidPrefix="toggle"
                value={billingPeriod}
                onChange={setBillingPeriod}
                options={[
                  { key: 'monthly', label: 'Monthly' },
                  { key: 'yearly', label: 'Yearly', badge: '2 mo free' },
                ]}
              />
            </div>

            {/* Price + CTA */}
            <div className="mt-8 flex flex-col items-center">
              <div className="flex items-baseline">
                <span className="text-5xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="plan-price">
                  $<NumberFlow value={price} />
                </span>
                <span className="text-zinc-400 text-lg ml-1">/{billingPeriod === 'yearly' ? 'yr' : 'mo'}</span>
              </div>
              <p className="mt-1 text-xs text-[#4d8bff]">
                {billingPeriod === 'monthly'
                  ? 'Billed monthly · cancel anytime'
                  : `Billed yearly · save $${(monthlyEquivalent - price).toLocaleString()} vs monthly`}
              </p>
              <button
                onClick={handlePurchase}
                data-testid="purchase-btn"
                className="mt-6 h-14 w-full max-w-md rounded-full text-lg font-semibold transition-all text-white border-2 border-[#0052ff] bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] shadow-lg shadow-[#0052ff]/30 hover:brightness-110"
              >
                Get started
              </button>
            </div>

            {/* Features */}
            <div className="mt-8 pt-6 border-t border-white/[0.08]">
              <p className="text-center text-sm text-zinc-400 mb-4">
                <span className="text-white font-semibold">Everything included</span> — no feature tiers, ever.
              </p>
              <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 max-w-lg mx-auto" data-testid="feature-list">
                {ALL_FEATURES.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </span>
                    <span className="text-zinc-200 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {atMax && (
              <p className="mt-6 text-center text-sm text-zinc-400" data-testid="enterprise-contact">
                Tracking more than 15M deals?{' '}
                <a href="mailto:sales@inflowft.com" className="text-[#4d8bff] hover:text-white transition-colors font-semibold">Contact sales</a> for custom volume &amp; white-glove onboarding.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-zinc-600 text-xs">
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Secured by Stripe</span>
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Cancel anytime</span>
          <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Instant activation</span>
        </div>
      </div>
    </div>
  );
};

export default ChoosePlan;
