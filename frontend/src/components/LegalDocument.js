import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RotateCw } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Shared renderer for our Termly-backed legal pages (Privacy, Terms, Cookies).
// The fetch is hardened against a few real-world failure modes we hit before:
//  - StrictMode double-invoke dropping the resolved response (page stuck loading)
//  - a stalled/never-resolving request (hard client-side timeout → error state)
//  - transient backend/Termly hiccups (explicit "Try again" retry)
export const LegalDocument = ({ slug, title, docLabel, contactEmail, testId }) => {
  const navigate = useNavigate();
  const [html, setHtml] = useState('');
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let settled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setStatus('error');
        ctrl.abort();
      }
    }, 12000);

    (async () => {
      try {
        const res = await fetch(`${API}/api/legal/content/${slug}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          setHtml(data.html || '');
          setStatus(data.html ? 'ready' : 'error');
        }
      } catch (e) {
        if (e.name === 'AbortError') return; // cleanup or timeout already handled it
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          setStatus('error');
        }
      }
    })();

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [slug, reloadKey]);

  const retry = () => {
    setStatus('loading');
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-300" data-testid={`${testId}-page`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-12"
          data-testid={`${testId}-back-btn`}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <h1
          className="text-3xl sm:text-4xl font-bold text-white mb-12"
          style={{ fontFamily: 'Outfit' }}
          data-testid={`${testId}-heading`}
        >
          {title}
        </h1>

        {status === 'loading' && (
          <div className="flex items-center gap-3 text-zinc-500" data-testid={`${testId}-loading`}>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading the latest {docLabel}…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="text-zinc-400" data-testid={`${testId}-error`}>
            <p className="mb-5">
              We couldn't load the {docLabel} right now. Please try again, or contact{' '}
              <a className="text-[#80ACFF] underline" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
              .
            </p>
            <button
              onClick={retry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white text-sm transition-colors"
              data-testid={`${testId}-retry-btn`}
            >
              <RotateCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div
            className="legal-content"
            data-testid={`${testId}-content`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      {/* Termly's hardcoded colours are stripped server-side, so we theme the
          document here to match the app's dark surface (light text on dark bg). */}
      <style>{`
        .legal-content { color: #d4d4d8; font-size: 0.9rem; line-height: 1.7; }
        .legal-content h1,
        .legal-content h2,
        .legal-content h3,
        .legal-content h4,
        .legal-content strong,
        .legal-content b { color: #ffffff; }
        .legal-content h1 { font-size: 1.6rem; margin: 2rem 0 1rem; line-height: 1.25; }
        .legal-content h2 { font-size: 1.3rem; margin: 2rem 0 0.75rem; line-height: 1.3; }
        .legal-content h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
        .legal-content p,
        .legal-content li { margin-bottom: 0.75rem; }
        .legal-content a { color: #80ACFF; text-decoration: underline; text-underline-offset: 2px; }
        .legal-content a:hover { color: #c7d2fe; }
        .legal-content ul,
        .legal-content ol { padding-left: 1.5rem; margin: 0.5rem 0 1rem; list-style: revert; }
        .legal-content ul { list-style: disc; }
        .legal-content table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.82rem; }
        .legal-content th,
        .legal-content td { border: 1px solid #27272a; padding: 0.5rem 0.75rem; text-align: left; }
        .legal-content th { background: #18181b; color: #ffffff; }
        .legal-content hr { border: 0; border-top: 1px solid #27272a; margin: 2rem 0; }
      `}</style>
    </div>
  );
};

export default LegalDocument;
