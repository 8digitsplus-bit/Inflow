import { LegalShell, LegalLink, SectionTitle } from '../components/legal/LegalShell';
import { DpaKeyTerms } from '../components/legal/DpaKeyTerms';
import { DpaClauses1to4 } from '../components/legal/DpaClauses1to4';
import { DpaClauses5to8 } from '../components/legal/DpaClauses5to8';
import { DpaSecurityMeasures } from '../components/legal/DpaSecurityMeasures';

const SECTIONS = [
  { id: 'key-terms', title: 'Section A – Key terms', desc: 'The key variables that apply to this DPA.' },
  { id: 'general-terms', title: 'Section B – General terms', desc: 'The general legal terms that apply to the processing.' },
  { id: 'security-measures', title: 'Section C – Security measures', desc: 'The technical and organisational measures in place.' },
];

export default function Dpa() {
  return (
    <LegalShell testPrefix="dpa" title="Data Processing Agreement" lastUpdated="October 21, 2026">
      <div className="space-y-4 text-[0.9rem] leading-relaxed">
        <div className="rounded-2xl border border-[#0052ff]/30 bg-[#0052ff]/[0.06] p-5 space-y-2" data-testid="dpa-acceptance-note">
          <p className="text-white font-medium">How this DPA applies</p>
          <p>
            This Data Processing Agreement forms part of the InFlow <LegalLink href="/terms" testId="dpa-terms-link">Terms of Service</LegalLink>.
            When a customer accepts the Terms of Service, they also accept this DPA, so no signature is needed. If you need a countersigned
            copy for your records, email <LegalLink href="mailto:support@inflowft.com" testId="dpa-signed-copy-link">support@inflowft.com</LegalLink>.
          </p>
        </div>

        <nav className="pt-4" aria-label="DPA sections" data-testid="dpa-structure">
          <p className="mb-3 text-white font-medium">This DPA is structured as follows:</p>
          <ul className="space-y-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-[#80ACFF] hover:text-white transition-colors" data-testid={`dpa-nav-${s.id}`}>{s.title}</a>
                <span className="text-zinc-500">: {s.desc}</span>
              </li>
            ))}
          </ul>
        </nav>

        <SectionTitle id="key-terms">{SECTIONS[0].title}</SectionTitle>
        <DpaKeyTerms />
        <p className="text-zinc-500">The variables defined in Section A serve as definitions in Sections B and C.</p>

        <SectionTitle id="general-terms">{SECTIONS[1].title}</SectionTitle>
        <DpaClauses1to4 />
        <DpaClauses5to8 />

        <SectionTitle id="security-measures">{SECTIONS[2].title}</SectionTitle>
        <DpaSecurityMeasures />
      </div>
    </LegalShell>
  );
}
