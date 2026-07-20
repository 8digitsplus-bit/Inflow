// Usage-based (value-metric) pricing — mirrors backend USAGE_PRICING in payments.py.
// The self-serve plan is billed by the number of deals tracked, chosen via a slider:
// $50 base (first 1,000) + $21 per additional 1,000. Yearly = 10x monthly (2 months free).
// Above the max => "Contact us". Internally the plan uses the top tier so all features unlock.
export const USAGE_PRICING = {
  unitSize: 1000,
  minUnits: 1,
  maxUnits: 20,
  monthly: { base: 50, perUnit: 21 },
  yearly: { base: 500, perUnit: 210 },
};

export const ALL_FEATURES = [
  'All features included',
  'Unlimited integrations',
  'AI insights & revenue forecasting',
  'CRO & churn analysis',
  'Competitor Intelligence',
  'Smart Assist AI',
  'Priority support',
];

export const clampUnits = (units) =>
  Math.max(USAGE_PRICING.minUnits, Math.min(USAGE_PRICING.maxUnits, parseInt(units, 10) || USAGE_PRICING.minUnits));

export const planKeyFor = (period) => (period === 'yearly' ? 'enterprise_yearly' : 'enterprise_monthly');

export const computePrice = (units, period) => {
  const cfg = period === 'yearly' ? USAGE_PRICING.yearly : USAGE_PRICING.monthly;
  const u = clampUnits(units);
  return cfg.base + cfg.perUnit * (u - 1);
};

export const dealsForUnits = (units) => clampUnits(units) * USAGE_PRICING.unitSize;

export const formatDeals = (n) => (n >= 1000 ? `${n / 1000}k` : `${n}`);
