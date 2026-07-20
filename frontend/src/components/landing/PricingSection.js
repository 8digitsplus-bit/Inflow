import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import {
  USAGE_PRICING, ALL_FEATURES, computePrice, dealsForUnits, formatDeals, planKeyFor,
} from '../../lib/pricing';

export const PricingSection = ({ handleGetStarted, isAuthenticated }) => {
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [units, setUnits] = useState(3);

  const price = computePrice(units, billingPeriod);
  const deals = dealsForUnits(units);
  const monthlyEquivalent = computePrice(units, 'monthly') * 12;
  const atMax = units >= USAGE_PRICING.maxUnits;

  const handleStart = () => {
    navigate(`/checkout?plan=${planKeyFor(billingPeriod)}&units=${units}`);
  };

  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12 reveal">
          <span className="text-zinc-400 text-sm font-medium uppercase tracking-widest">Pricing</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>One plan. Every feature.</h2>
          <p className="mt-4 text-zinc-400">Pay only for the deals &amp; revenue you track. Slide to your volume.</p>

          <div className="mt-8 inline-flex items-center p-1 bg-white/[0.04] rounded-full border border-white/10 backdrop-blur-md relative" data-testid="billing-toggle">
            <div
              className="absolute top-1 bottom-1 rounded-full bg-white/15 border border-white/20 backdrop-blur-sm transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: 'calc(50% - 4px)',
                left: billingPeriod === 'monthly' ? '4px' : 'calc(50%)',
              }}
            />
            <button onClick={() => setBillingPeriod('monthly')}
              className={`relative z-10 w-32 py-2 rounded-full text-sm font-medium text-center transition-colors duration-300 ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="billing-monthly-btn">Monthly</button>
            <button onClick={() => setBillingPeriod('yearly')}
              className={`relative z-10 w-32 py-2 rounded-full text-sm font-medium text-center transition-colors duration-300 ${billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="billing-yearly-btn">Yearly · 2 mo free</button>
          </div>
        </div>

        <div className="reveal relative" data-testid="pricing-card-usage">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-3xl opacity-60 blur-xl"
            style={{ background: 'linear-gradient(135deg, rgba(0,82,255,0.25), rgba(255,255,255,0.05) 45%, rgba(0,82,255,0.2))' }}
          />
          <div className="relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.1] rounded-3xl p-8 shadow-[0_8px_50px_-12px_rgba(0,0,0,0.6)]">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {/* Slider */}
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-white font-semibold" style={{ fontFamily: 'Outfit' }}>Deals &amp; revenue tracked</p>
                <p className="text-zinc-400 text-sm">Drag to set your volume</p>
              </div>
              <span className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="landing-volume-value">
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
              data-testid="landing-volume-slider"
            />
            <div className="flex justify-between text-[11px] text-zinc-500 mt-2">
              <span>1k</span>
              <span>20k{atMax ? '+' : ''}</span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-2 mt-6 mb-1">
              <span className="text-5xl font-bold text-white" style={{ fontFamily: 'Outfit' }} data-testid="landing-price">${price.toLocaleString()}</span>
              <span className="text-zinc-400 text-lg">/{billingPeriod === 'yearly' ? 'yr' : 'mo'}</span>
              {billingPeriod === 'yearly' && (
                <span className="text-zinc-500 text-sm line-through">${monthlyEquivalent.toLocaleString()}</span>
              )}
            </div>
            <p className="text-[#4d8bff] text-xs mb-6">
              {billingPeriod === 'monthly'
                ? '$50 base + $21 / additional 1k deals'
                : `Save $${(monthlyEquivalent - price).toLocaleString()} vs monthly`}
            </p>

            {/* Features */}
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-8">
              {ALL_FEATURES.map((f, j) => (
                <li key={j} className="flex items-center gap-2 text-zinc-300 text-sm">
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
                    <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            <Button
              className="w-full h-12 text-base bg-gradient-to-t from-[#0038b3] via-[#0052ff] to-[#0038b3] text-white border-2 border-[#0052ff] shadow-lg shadow-[#0052ff]/30 hover:brightness-110"
              onClick={handleStart}
              data-testid="pricing-cta-usage"
            >
              Get started <ChevronRight className="w-4 h-4 ml-1" />
            </Button>

            <p className="text-center text-zinc-500 text-xs mt-4">
              Tracking more than 20k deals?{' '}
              <a href="mailto:sales@inflowft.com" className="text-[#4d8bff] hover:text-white transition-colors font-semibold" data-testid="pricing-contact-sales">Contact sales</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
