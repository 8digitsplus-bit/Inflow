import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

const CHECK_EVERY_MS = 5 * 60 * 1000;
const mainScript = (doc) => doc.querySelector('script[src*="/static/js/main."]')?.getAttribute('src');

// Production builds load a hashed main bundle; a different hash in the live index.html means a new deploy.
async function newVersionLive() {
  const current = mainScript(document);
  if (!current) return false;
  const res = await fetch(`/?_v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return false;
  const latest = mainScript(new DOMParser().parseFromString(await res.text(), 'text/html'));
  return !!latest && latest !== current;
}

export const UpdatePrompt = () => {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return undefined;
    const check = () => newVersionLive().then((v) => v && setShow(true)).catch(() => {});
    const onVisible = () => document.visibilityState === 'visible' && check();
    const id = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [dismissed]);

  if (!show || dismissed) return null;
  return (
    // Top-center (below the landing nav) so it never sits under the bottom cookie banner.
    <div className="fixed inset-x-0 top-20 z-[2147483647] flex justify-center px-4 pointer-events-none" data-testid="update-prompt">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-zinc-950/80 py-2 pl-5 pr-2 text-sm text-zinc-200 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300">
        <span>InFlow has been updated</span>
        <button type="button" onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 rounded-full bg-[#0052ff] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#1a63ff]"
          data-testid="update-prompt-refresh-btn">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss"
          className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
          data-testid="update-prompt-dismiss-btn">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
