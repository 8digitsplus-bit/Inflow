import { Link } from 'react-router-dom';
import { PlugZap, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';

// Shown when a section has no data because no integration/source is linked yet.
// Makes an empty (new-account) state clearly distinct from a broken data sync.
export const ConnectDataCTA = ({
  title = 'No data yet — connect a source',
  message = 'This view is empty because no data source is linked. Connect your CRM or billing tool to see real, attributable revenue numbers here.',
  cta = 'Connect a data source',
  to = '/connect-business',
  testid = 'connect-data-cta',
}) => (
  <div
    className="rounded-2xl border border-[#0052ff]/25 bg-[#0052ff]/[0.06] backdrop-blur-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
    data-testid={testid}
  >
    <div className="w-11 h-11 rounded-xl bg-[#0052ff]/15 flex items-center justify-center flex-shrink-0">
      <PlugZap className="w-5 h-5 text-[#4d8bff]" />
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="text-white font-semibold text-sm" style={{ fontFamily: 'Outfit' }}>{title}</h3>
      <p className="text-zinc-400 text-xs mt-0.5 max-w-2xl">{message}</p>
    </div>
    <Link to={to} className="flex-shrink-0">
      <Button size="sm" className="bg-[#0052ff] hover:bg-[#0047d6] text-white h-9 text-sm" data-testid={`${testid}-btn`}>
        {cta} <ArrowRight className="w-4 h-4 ml-1.5" />
      </Button>
    </Link>
  </div>
);

export default ConnectDataCTA;
