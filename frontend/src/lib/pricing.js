// Usage-based (value-metric) pricing — mirrors backend USAGE_TIERS in payments.py.
// The self-serve plan is billed by the volume of deals & revenue tracked per month,
// chosen via a ruler slider that snaps to discrete tiers. Yearly = 10x monthly
// (2 months free). Above the top tier => "Contact sales". Internally the plan uses
// the top tier ("enterprise_*") so a paying customer unlocks all features.
export const USAGE_TIERS = [
  { contracts: 1000, monthly: 50, yearly: 500 },
  { contracts: 10000, monthly: 259, yearly: 2590 },
  { contracts: 25000, monthly: 500, yearly: 5000 },
  { contracts: 100000, monthly: 1345, yearly: 13450 },
  { contracts: 250000, monthly: 2590, yearly: 25900 },
  { contracts: 500000, monthly: 4250, yearly: 42500 },
  { contracts: 1000000, monthly: 7000, yearly: 70000 },
  { contracts: 5000000, monthly: 22100, yearly: 221000 },
  { contracts: 10000000, monthly: 35400, yearly: 354000 },
  { contracts: 15000000, monthly: 46800, yearly: 468000 },
];

export const MIN_TIER = 0;
export const MAX_TIER = USAGE_TIERS.length - 1;

export const ALL_FEATURES = [
  'All features included',
  'Unlimited integrations',
  'AI insights & revenue forecasting',
  'CRO & churn analysis',
  'Competitor Intelligence',
  'Smart Assist AI',
  'Priority support',
];

export const clampTier = (i) => {
  const n = parseInt(i, 10);
  if (Number.isNaN(n)) return MIN_TIER;
  return Math.max(MIN_TIER, Math.min(MAX_TIER, n));
};

export const planKeyFor = (period) => (period === 'yearly' ? 'enterprise_yearly' : 'enterprise_monthly');

export const computePrice = (tierIdx, period) => {
  const t = USAGE_TIERS[clampTier(tierIdx)];
  return period === 'yearly' ? t.yearly : t.monthly;
};

export const contractsForTier = (tierIdx) => USAGE_TIERS[clampTier(tierIdx)].contracts;

export const formatDeals = (n) => {
  if (n >= 1000000) return `${n / 1000000}M`;
  if (n >= 1000) return `${n / 1000}K`;
  return `${n}`;
};
