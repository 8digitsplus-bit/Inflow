import { ChevronsLeftRight } from 'lucide-react';
import { USAGE_TIERS, MAX_TIER, contractsForTier, formatDeals } from '../lib/pricing';

// Ruler-style volume slider: dense tick marks fill up to the handle, a value pill
// floats above the handle, and tier labels sit below. Backed by a real (visually
// hidden) range input so drag + keyboard + a11y all work. Snaps to discrete tiers.
const TICKS = 61;

export const VolumeSlider = ({ tier, onChange, testidPrefix = 'volume', disabled = false }) => {
  const frac = MAX_TIER === 0 ? 0 : tier / MAX_TIER; // 0..1
  const pct = frac * 100;
  const pillLeft = Math.min(90, Math.max(10, pct)); // keep the pill on-canvas at the edges
  const tierFracs = USAGE_TIERS.map((_, i) => i / MAX_TIER);

  return (
    <div className="select-none w-full">
      {/* Value pill floating above the handle */}
      <div className="relative h-16">
        <div
          className="absolute -translate-x-1/2 flex flex-col items-center transition-[left] duration-150 ease-out"
          style={{ left: `${pillLeft}%` }}
        >
          <div className="flex items-baseline gap-1.5 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 py-2 backdrop-blur-md shadow-lg shadow-black/30">
            <span className="text-2xl sm:text-3xl font-bold text-white leading-none" style={{ fontFamily: 'Outfit' }} data-testid={`${testidPrefix}-value`}>
              {formatDeals(contractsForTier(tier))}
            </span>
            <span className="text-[11px] text-zinc-400">per month</span>
          </div>
          <span className="mt-1 h-2 w-px bg-white/20" aria-hidden />
        </div>
      </div>

      {/* Ruler */}
      <div className="relative h-12">
        {/* Ticks */}
        <div className="absolute inset-0 flex items-center justify-between px-0.5">
          {Array.from({ length: TICKS }).map((_, i) => {
            const tf = i / (TICKS - 1);
            const active = tf <= frac + 0.0001;
            const isMajor = tierFracs.some((tfr) => Math.abs(tfr - tf) < 0.008);
            return (
              <span
                key={i}
                aria-hidden
                className={`w-px rounded-full transition-colors duration-150 ${active ? 'bg-[#4d8bff]' : 'bg-white/15'}`}
                style={{ height: isMajor ? '100%' : '52%' }}
              />
            );
          })}
        </div>

        {/* Handle */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2 flex items-center transition-[left] duration-150 ease-out"
          style={{ left: `${pct}%` }}
        >
          <div className={`flex h-9 w-7 items-center justify-center rounded-lg bg-[#0052ff] shadow-lg shadow-[#0052ff]/40 ring-1 ring-white/20 ${disabled ? 'opacity-50' : ''}`}>
            <ChevronsLeftRight className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
        </div>

        {/* Real range input (invisible, drives everything) */}
        <input
          type="range"
          min={0}
          max={MAX_TIER}
          step={1}
          value={tier}
          disabled={disabled}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          aria-label="Deals and revenue tracked per month"
          data-testid={`${testidPrefix}-slider`}
        />
      </div>

      {/* Tier labels */}
      <div className="relative mt-3 h-4 hidden sm:block">
        {USAGE_TIERS.map((t, i) => {
          const active = i === tier;
          return (
            <span
              key={i}
              className={`absolute -translate-x-1/2 text-[10px] font-medium transition-colors ${active ? 'text-white' : 'text-zinc-500'}`}
              style={{ left: `${(i / MAX_TIER) * 100}%` }}
            >
              {formatDeals(t.contracts)}
            </span>
          );
        })}
      </div>
      {/* Mobile: just the endpoints */}
      <div className="flex justify-between text-[11px] text-zinc-500 mt-2 sm:hidden">
        <span>{formatDeals(USAGE_TIERS[0].contracts)}</span>
        <span>{formatDeals(USAGE_TIERS[MAX_TIER].contracts)}</span>
      </div>
    </div>
  );
};

export default VolumeSlider;
