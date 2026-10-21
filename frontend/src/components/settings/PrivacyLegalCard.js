import { FileText, ExternalLink } from 'lucide-react';

const LINKS = [
  { title: 'Privacy Policy', href: '/privacy', id: 'privacy' },
  { title: 'Terms of Service', href: '/terms', id: 'terms' },
  { title: 'Cookie Policy', href: '/cookies', id: 'cookies' },
  { title: 'Sub-processors', href: '/subprocessors', id: 'subprocessors' },
  { title: 'Data Processing Agreement', href: '/dpa', id: 'dpa', wide: true },
];

export const PrivacyLegalCard = ({ className }) => (
  <div className={className} data-testid="privacy-legal-card">
    <h2 className="text-sm font-semibold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-[#7aa6ff]" /> Privacy &amp; legal</h2>
    <p className="mb-4 mt-0.5 text-xs text-zinc-500">How we handle your data and who helps us process it.</p>
    <ul className="grid grid-cols-2 gap-2">
      {LINKS.map((l) => (
        <li key={l.id} className={l.wide ? 'col-span-2' : undefined}>
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white transition-colors"
            data-testid={`settings-legal-link-${l.id}`}
          >
            {l.title}
            <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          </a>
        </li>
      ))}
    </ul>
  </div>
);
