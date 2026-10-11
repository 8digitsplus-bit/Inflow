import { useState } from 'react';
import { Send, Loader2, Check } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { toast } from 'sonner';
import { api, DEST_LABEL } from './shared';

const DESTS = ['hubspot', 'salesforce', 'pipedrive', 'zoho', 'slack'];

export const PushMenu = ({ leadId, kind, destinations = {}, disabled, label = 'Push to…', onDone, testid }) => {
  const [busy, setBusy] = useState('');

  const push = async (dest) => {
    setBusy(dest);
    try {
      await api(`/intent/profiles/${leadId}/push`, { method: 'POST', body: JSON.stringify({ destination: dest, kind }) });
      toast.success(`Pushed to ${DEST_LABEL[dest]}`);
      onDone && onDone(dest);
    } catch (e) { toast.error(e.message); }
    setBusy('');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || !!busy}>
        <button className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-[#0052ff]/40 text-[#7aa7ff] hover:bg-[#0052ff]/10 transition-colors disabled:opacity-40" data-testid={testid || `push-${kind}-btn`}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-zinc-950 border-zinc-800 text-zinc-200 w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-zinc-500">Send {kind} to</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-zinc-800" />
        {DESTS.map((d) => (
          <DropdownMenuItem key={d} disabled={!destinations[d]} onSelect={() => push(d)} className="text-sm cursor-pointer focus:bg-white/5" data-testid={`push-${kind}-${d}`}>
            <span className="flex-1">{DEST_LABEL[d]}</span>
            {destinations[d] ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <span className="text-[10px] text-zinc-500">not connected</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
