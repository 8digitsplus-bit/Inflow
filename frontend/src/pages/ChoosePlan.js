import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Check, ArrowLeft, Zap, Shield, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { Toaster } from '../components/ui/sonner';
import {
  USAGE_PRICING, ALL_FEATURES, computePrice, dealsForUnits, formatDeals, planKeyFor,
} from '../lib/pricing';

const Tick = () => (
  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
    <Check className="w-3 h-3 text-white" strokeWidth={3} />
  </span>
);

const PricingSwitch = ({ options, value, onChange, layoutId, testidPrefix }) => (
  <div
    className="relative z-10 w-full rounded-full bg-white/[0.04] border border-white/10 p-1 backdrop-blur-md grid"
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
            'relative z-10 h-12 sm:h-14 rounded-full font-semibold transition-colors',
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
  const [units, setUnits] = useState(3);
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  const price = computePrice(units, billingPeriod);
  const deals = dealsForUnits(units);
  const monthlyEquivalent = computePrice(units, 'monthly') * 12;
  const atMax = units >= USAGE_PRICING.maxUnits;

  const handlePurchase = () => {
    const params = new URLSearchParams({ plan: planKeyFor(billingPeriod), units: String(units) });
    navigate(`/checkout?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#050507] relative overflow-hidden">
      <Toaster position="top-center" richColors />
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(125% 125% at 50% 8%, #050507 42%, #0052ff 130%)' }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-10">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors"
          data-testid="back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Hero */}
        <div className="max-w-3xl mx-auto text-center mb-14">
          <div className="flex items-center justify-center mb-4">
            <Zap className="h-5 w-5 text-[#0052ff] fill-[#0052ff] mr-2" />
            <span className="text-[#4d8bff] font-medium uppercase tracking-widest text-sm">Pay for what you track</span>
          </div>
          <h1 className="md:text-6xl sm:text-5xl text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            One plan. Every feature.
          </h1>
          <p className="text-lg text-zinc-400">
            Slide to your volume — you only pay for the deals &amp; revenue you track.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 md:gap-14 gap-8 items-start">
          {/* Left: all features included */}
          <div>
            <div className="mb-5">
              <h3 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: 'Outfit' }}>What's inside</h3>
              <p className="text-zinc-400 text-sm">
                <span className="text-white font-semibold">Everything included</span> — no feature tiers, ever.
              </p>
            </div>
            <div className="space-y-3.5" data-testid="feature-list">
              {ALL_FEATURES.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Tick />
                  <span className="text-zinc-200">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: slider + price + purchase */}
          <div className="space-y-7">
            <div>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-white mb-0.5">Deals &amp; revenue tracked</h4>
                  <p className="text-sm text-zinc-400">Drag to set your monthly volume</p>
                </div>
                <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="volume-value">
                  {formatDeals(deals)}
                </span>
              </div>
              <input
                type="range"
                min={USAGE_PRICING.minUnits}
                max={USAGE_PRICING.maxUnits}
                step={1}
                value={units}
                onChange={(e) => setUnits(parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/10 accent-[#0052ff]"
                data-testid="volume-slider"
              />
              <div className="flex justify-between text-[11px] text-zinc-500 mt-2">
                <span>1k</span>
                <span>20k{atMax ? '+' : ''}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-1">Billing period</h4>
              <p className="text-sm text-zinc-400 mb-2">Get 2 months free when you pay yearly</p>
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

            <div className="grid grid-cols-2 items-center gap-3 pt-2">
              <div className="flex items-baseline">
                <span className="text-5xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="plan-price">
                  $<NumberFlow value={price} />
                </span>
                <span className="text-zinc-400 text-lg ml-1">/{billingPeriod === 'yearly' ? 'yr' : 'mo'}</span>
              </div>
              <button
                onClick={handlePurchase}
                data-testid="purchase-btn"
                className="h-14 w-full rounded-full text-lg font-semibold transition-all text-white border-2 border-[#0052ff] bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] shadow-lg shadow-[#0052ff]/30 hover:brightness-110"
              >
                Get started
              </button>
              <p className="col-span-2 text-xs text-[#4d8bff]">
                {billingPeriod === 'monthly'
                  ? `$50 base + $21 / additional 1k deals · cancel anytime`
                  : `Billed yearly · save $${(monthlyEquivalent - price).toLocaleString()} vs monthly`}
              </p>
            </div>

            {atMax && (
              <p className="text-sm text-zinc-400" data-testid="enterprise-contact">
                Tracking more than 20k deals?{' '}
                <a href="mailto:sales@inflowft.com" className="text-[#4d8bff] hover:text-white transition-colors font-semibold">Contact sales</a> for custom volume &amp; white-glove onboarding.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 mt-16 text-zinc-600 text-xs">
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Secured by Stripe</span>
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Cancel anytime</span>
          <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Instant activation</span>
        </div>
      </div>
    </div>
  );
};

export default ChoosePlan;
