import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const LegalShell = ({ testPrefix, title, lastUpdated, children }) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#050507] text-zinc-300" data-testid={`${testPrefix}-page`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-12" data-testid={`${testPrefix}-back-btn`}>
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }} data-testid={`${testPrefix}-heading`}>{title}</h1>
        <p className="text-sm text-zinc-500 mb-10" data-testid={`${testPrefix}-last-updated`}>Last updated {lastUpdated}</p>
        {children}
      </div>
    </div>
  );
};

export const LegalLink = ({ href, children, testId }) => (
  <a href={href} className="text-[#80ACFF] underline underline-offset-2 hover:text-white transition-colors" data-testid={testId}>{children}</a>
);

export const SectionTitle = ({ id, children }) => (
  <h2 id={id} className="mt-16 mb-6 text-xl sm:text-2xl font-semibold text-white scroll-mt-24" style={{ fontFamily: 'Outfit' }}>{children}</h2>
);

export const Clause = ({ n, title, children }) => (
  <section className="mt-8 space-y-3" data-testid={`dpa-clause-${String(n).replace('.', '-')}`}>
    <h3 className="text-base font-semibold text-white">{n}. {title}</h3>
    {children}
  </section>
);

export const SubClause = ({ n, title, children }) => (
  <div className="mt-5 space-y-3">
    <h4 className="text-sm font-semibold text-zinc-100">{n} {title}</h4>
    {children}
  </div>
);

export const Para = ({ n, children }) => (
  <div className="flex gap-3">
    <span className="shrink-0 w-8 text-zinc-500 tabular-nums">{n}</span>
    <div className="min-w-0 space-y-2">{children}</div>
  </div>
);

export const Bullets = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1.5 marker:text-zinc-600">
    {items.map((i) => <li key={i}>{i}</li>)}
  </ul>
);

export const Lettered = ({ items }) => (
  <ol className="list-[lower-alpha] pl-6 space-y-1.5 marker:text-zinc-500">
    {items.map((i) => <li key={i}>{i}</li>)}
  </ol>
);
