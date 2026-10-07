import React from 'react';
import { TrendingUp, TrendingDown, Minus, FlaskConical, Tag } from 'lucide-react';

const money = (n) => `$${Math.round(Number(n || 0)).toLocaleString()}`;

const Headline = ({ text, testid }) => (
  <p data-testid={testid} className="text-sm text-zinc-200 leading-relaxed mb-4 border-l-2 border-cyan-400/60 pl-3">
    {text}
  </p>
);

// ---- Insights (executive revenue-health summary) ----
export const InsightCards = ({ data }) => {
  if (!data) return null;
  const trend = (t) =>
    t === 'up' ? <TrendingUp className="w-4 h-4 text-emerald-400" />
      : t === 'down' ? <TrendingDown className="w-4 h-4 text-rose-400" />
      : <Minus className="w-4 h-4 text-zinc-400" />;
  return (
    <div data-testid="ai-insight-cards">
      <Headline text={data.headline} testid="ai-insight-headline" />
      <div className="space-y-2">
        {(data.signals || []).map((s, i) => (
          <div key={i} data-testid={`ai-insight-signal-${i}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white flex items-center gap-2">{trend(s.trend)}{s.signal}</span>
              <span className="text-xs font-semibold text-cyan-300">{money(s.impact)}</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">{s.action}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- Churn / retention (risk score + save-plays) ----
export const ChurnCards = ({ data }) => {
  if (!data) return null;
  const score = Number(data.risk_score || 0);
  const scoreColor = score >= 66 ? 'text-rose-400' : score >= 33 ? 'text-amber-400' : 'text-emerald-400';
  return (
    <div data-testid="ai-churn-cards">
      <Headline text={data.headline} testid="ai-churn-headline" />
      <div className="flex items-center gap-6 mb-4">
        <div className="text-center">
          <div className={`text-3xl font-bold ${scoreColor}`} data-testid="ai-churn-risk-score">{score}</div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Risk score</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-cyan-300" data-testid="ai-churn-at-risk">{money(data.at_risk_revenue)}</div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">At risk</div>
        </div>
      </div>
      {(data.drivers || []).length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-zinc-300 mb-1.5">Why</div>
          <div className="flex flex-wrap gap-1.5">
            {(data.drivers || []).map((d, i) => (
              <span key={i} data-testid={`ai-churn-driver-${i}`} className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-300">
                {d.factor}: {d.detail}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="text-xs font-semibold text-zinc-300 mb-1.5">Save-plays</div>
      <div className="space-y-2">
        {(data.save_plays || []).map((p, i) => (
          <div key={i} data-testid={`ai-churn-play-${i}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white">{p.account}</span>
              {p.value ? <span className="text-xs font-semibold text-cyan-300">{money(p.value)}</span> : null}
            </div>
            <p className="text-xs text-zinc-400 mt-1">{p.play}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- Pricing (price moves + upside) ----
export const PricingCards = ({ data }) => {
  if (!data) return null;
  return (
    <div data-testid="ai-pricing-cards">
      <Headline text={data.headline} testid="ai-pricing-headline" />
      <div className="text-center mb-4">
        <div className="text-2xl font-bold text-cyan-300" data-testid="ai-pricing-upside">{money(data.upside)}</div>
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Projected upside</div>
      </div>
      <div className="space-y-2">
        {(data.moves || []).map((m, i) => (
          <div key={i} data-testid={`ai-pricing-move-${i}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white flex items-center gap-2"><Tag className="w-3.5 h-3.5 text-cyan-400 shrink-0" />{m.change}</span>
              <span className="text-xs font-semibold text-emerald-400 shrink-0">{money(m.projected_delta)}</span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">{m.rationale} · <span className="uppercase text-[10px] tracking-wide text-zinc-500">{m.confidence}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- CRO (testable experiments) ----
export const CroCards = ({ data }) => {
  if (!data) return null;
  return (
    <div data-testid="ai-cro-cards">
      <Headline text={data.headline} testid="ai-cro-headline" />
      <div className="space-y-2">
        {(data.hypotheses || []).map((h, i) => (
          <div key={i} data-testid={`ai-cro-hyp-${i}`} className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-sm font-medium text-white">{h.stage}</span>
              <span className="ml-auto text-xs font-semibold text-emerald-400">{h.expected_lift}</span>
            </div>
            <p className="text-xs text-zinc-300">{h.change}</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              Metric: {h.metric}{h.value_at_stake ? ` · ${money(h.value_at_stake)} at stake` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
