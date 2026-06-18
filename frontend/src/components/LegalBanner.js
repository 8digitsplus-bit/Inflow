import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ScrollText, X, ArrowUpRight } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Top-of-page banner that notifies logged-in users when one of our legal
 * documents (Terms, Privacy Policy, Cookie Policy) has been updated since they
 * last acknowledged it. Versions are tracked server-side (content-hash based)
 * via GET /api/legal/updates; clicking "Got it" records acknowledgement via
 * POST /api/legal/ack so the banner won't reappear for that version.
 *
 * "Dismiss" (X) hides it for the current session only (no ack) so it reappears
 * on next load until the user explicitly acknowledges.
 *
 * Renders nothing when signed-out or when there are no pending updates.
 */
const LegalBanner = () => {
  const { user } = useAuth();
  const [updates, setUpdates] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [acking, setAcking] = useState(false);

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/legal/updates`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setUpdates(Array.isArray(data.updates) ? data.updates : []);
    } catch {
      // Non-critical surface; stay silent on failure.
    }
  }, []);

  useEffect(() => {
    if (user) fetchUpdates();
  }, [user, fetchUpdates]);

  if (!user || dismissed || updates.length === 0) return null;

  const handleAck = async () => {
    setAcking(true);
    try {
      await fetch(`${API_URL}/api/legal/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ doc_types: updates.map((u) => u.doc_type) }),
      });
      setUpdates([]);
    } catch {
      // If ack fails, leave the banner so the user can retry.
    } finally {
      setAcking(false);
    }
  };

  // Build a readable sentence: "Terms of Service", "X and Y", "X, Y, and Z".
  const names = updates.map((u) => u.name);
  let phrase;
  if (names.length === 1) phrase = names[0];
  else if (names.length === 2) phrase = `${names[0]} and ${names[1]}`;
  else phrase = `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;

  return (
    <div
      className="relative w-full bg-indigo-500/10 border-b border-indigo-500/20"
      data-testid="legal-update-banner"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
        <div className="shrink-0 w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <ScrollText className="w-3.5 h-3.5 text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] sm:text-sm font-medium text-indigo-100">
            We've updated our {phrase}.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            {updates.map((u) => (
              <a
                key={u.doc_type}
                href={u.path}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[11px] text-indigo-300/90 hover:text-indigo-200 underline underline-offset-2 transition-colors"
                data-testid={`legal-review-${u.doc_type}`}
              >
                Review {u.name}
                <ArrowUpRight className="w-2.5 h-2.5" />
              </a>
            ))}
          </div>
        </div>
        <button
          onClick={handleAck}
          disabled={acking}
          className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-md text-[12px] font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition-colors disabled:opacity-60"
          data-testid="legal-banner-ack-btn"
        >
          {acking ? 'Saving…' : 'Got it'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-indigo-300/60 hover:text-indigo-200 transition-colors p-1"
          aria-label="Dismiss"
          data-testid="legal-banner-dismiss-btn"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default LegalBanner;
