import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';

// Termly Terms of Service UUID — Termly Dashboard → Documents → Terms → Embed
const TERMLY_TERMS_ID = 'd418110f-9ff8-4583-9d40-2cde4be2cfe0';
const API = process.env.REACT_APP_BACKEND_URL;

const Terms = () => {
  const navigate = useNavigate();
  const [html, setHtml] = useState('');
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API}/api/legal/policy/${TERMLY_TERMS_ID}`);
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (active) {
          setHtml(data.html || '');
          setStatus('ready');
        }
      } catch (e) {
        if (active) setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-300" data-testid="terms-page">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-12"
          data-testid="terms-back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <h1
          className="text-3xl sm:text-4xl font-bold text-white mb-12"
          style={{ fontFamily: 'Outfit' }}
          data-testid="terms-heading"
        >
          Terms of Service
        </h1>

        {status === 'loading' && (
          <div className="flex items-center gap-3 text-zinc-500" data-testid="terms-loading">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading the latest terms…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="text-zinc-400" data-testid="terms-error">
            We couldn't load the terms right now. Please refresh, or contact{' '}
            <a className="text-slate-400 underline" href="mailto:support@inflowft.com">
              support@inflowft.com
            </a>
            .
          </div>
        )}

        {status === 'ready' && (
          <div
            className="legal-content"
            data-testid="terms-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      {/* Termly's hardcoded colours are stripped server-side, so we theme the
          terms here to match the app's dark surface (light text on dark bg). */}
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
        .legal-content a { color: #CBD5E1; text-decoration: underline; text-underline-offset: 2px; }
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

export default Terms;
