import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const LAST_UPDATED = 'October 21, 2026';

const SUBPROCESSORS = [
  { name: 'MongoDB, Inc. (MongoDB Atlas)', purpose: 'Database hosting', location: 'Ireland' },
  { name: 'Railway Corporation', purpose: 'Backend application hosting', location: 'Netherlands' },
  { name: 'Vercel Inc.', purpose: 'Website hosting and request routing', location: 'United States' },
  { name: 'Anthropic, PBC', purpose: 'AI-generated insights and drafts', location: 'United States' },
  { name: 'Emergent', purpose: 'AI request routing and Google sign-in', location: 'United States' },
  { name: 'Resend, Inc.', purpose: 'Transactional emails and notifications', location: 'United States' },
  { name: 'Cordnet OÜ (Featurebase)', purpose: 'Customer support and feedback', location: 'European Union' },
  { name: 'ProdFix', purpose: 'Error and performance monitoring', location: 'United States' },
  { name: 'Scalekit', purpose: 'Secure connections to certain third-party integrations', location: 'United States' },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default function Subprocessors() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#050507] text-zinc-300" data-testid="subprocessors-page">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-12" data-testid="subprocessors-back-btn">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3" style={{ fontFamily: 'Outfit' }} data-testid="subprocessors-heading">Sub-processors</h1>
        <p className="text-sm text-zinc-500 mb-10" data-testid="subprocessors-last-updated">Last updated {LAST_UPDATED}</p>

        <div className="space-y-4 text-[0.9rem] leading-relaxed">
          <p>
            InFlow is a trading name of Amaan Bashar, a sole trader based in the United Kingdom. To provide the InFlow service, we use the
            third-party sub-processors below. Each one may process personal data that our customers store in InFlow, only for the purpose listed,
            and under written terms that protect that data at least as well as our{' '}
            <a href="/terms" className="text-[#80ACFF] underline underline-offset-2">Terms of Service</a> and{' '}
            <a href="/privacy" className="text-[#80ACFF] underline underline-offset-2">Privacy Policy</a>.
          </p>
          <p>Transfers of personal data outside the UK and EEA are protected by appropriate safeguards, such as standard contractual clauses.</p>
        </div>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur" data-testid="subprocessors-table">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-white">
              <tr>
                <th className="px-4 py-3 font-medium">Sub-processor</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s) => (
                <tr key={s.name} className="border-t border-white/[0.06]" data-testid={`subprocessor-row-${slug(s.name)}`}>
                  <td className="px-4 py-3 text-white">{s.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{s.purpose}</td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{s.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 space-y-4 text-[0.9rem] leading-relaxed">
          <h2 className="text-lg font-semibold text-white">Changes to this list</h2>
          <p>
            We will notify customers at least 30 days before adding or replacing a sub-processor. Customers may object on reasonable data
            protection grounds during that period.
          </p>
          <p>
            Questions? Contact{' '}
            <a href="mailto:support@inflowft.com" className="text-[#80ACFF] underline underline-offset-2" data-testid="subprocessors-contact-link">support@inflowft.com</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
