import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';

// Termly Privacy Policy UUID — find under Termly Dashboard → Documents → Privacy Policy → Embed
const TERMLY_PRIVACY_POLICY_ID = 'b2bacd1c-c041-49b6-ae03-a0e8c57fea3e';
const API = process.env.REACT_APP_BACKEND_URL;

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const [html, setHtml] = useState('');
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API}/api/legal/policy/${TERMLY_PRIVACY_POLICY_ID}`);
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
    <div className="min-h-screen bg-white text-zinc-800" data-testid="privacy-policy-page">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors mb-12"
          data-testid="privacy-back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <h1
          className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-12"
          style={{ fontFamily: 'Outfit' }}
          data-testid="privacy-heading"
        >
          Privacy Policy
        </h1>

        {status === 'loading' && (
          <div className="flex items-center gap-3 text-zinc-500" data-testid="privacy-loading">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading the latest policy…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="text-zinc-600" data-testid="privacy-error">
            We couldn't load the policy right now. Please refresh, or contact{' '}
            <a className="text-indigo-600 underline" href="mailto:privacy@inflowft.com">
              privacy@inflowft.com
            </a>
            .
          </div>
        )}

        {status === 'ready' && (
          <div
            className="legal-content"
            data-testid="privacy-content"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      {/* Render Termly's content as a normal light document — dark text on a
          white surface — independent of the app's global dark theme. */}
      <style>{`
        .legal-content { color: #3f3f46; font-size: 0.9rem; line-height: 1.7; }
        .legal-content h1,
        .legal-content h2,
        .legal-content h3,
        .legal-content h4,
        .legal-content strong,
        .legal-content b { color: #18181b; }
        .legal-content h1 { font-size: 1.6rem; margin: 2rem 0 1rem; line-height: 1.25; }
        .legal-content h2 { font-size: 1.3rem; margin: 2rem 0 0.75rem; line-height: 1.3; }
        .legal-content h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
        .legal-content p,
        .legal-content li { margin-bottom: 0.75rem; }
        .legal-content a { color: #4f46e5; text-decoration: underline; text-underline-offset: 2px; }
        .legal-content a:hover { color: #4338ca; }
        .legal-content ul,
        .legal-content ol { padding-left: 1.5rem; margin: 0.5rem 0 1rem; list-style: revert; }
        .legal-content ul { list-style: disc; }
        .legal-content table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.82rem; }
        .legal-content th,
        .legal-content td { border: 1px solid #e4e4e7; padding: 0.5rem 0.75rem; text-align: left; }
        .legal-content th { background: #f4f4f5; color: #18181b; }
        .legal-content hr { border: 0; border-top: 1px solid #e4e4e7; margin: 2rem 0; }
      `}</style>
    </div>
  );
};

export default PrivacyPolicy;
