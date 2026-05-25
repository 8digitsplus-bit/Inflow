import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Replace the value below with the policy UUID Termly assigns when you generate
// the Cookie Policy. Find it in Termly Dashboard → Documents → Cookie Policy →
// "Embed" → look for `data-id="..."` in the snippet they give you.
const TERMLY_COOKIE_POLICY_ID = 'REPLACE_WITH_TERMLY_COOKIE_POLICY_UUID';

const CookiePolicy = () => {
  const navigate = useNavigate();
  const embedContainer = useRef(null);

  // Inject Termly's embed script once when the page mounts. The script reads
  // the <div name="termly-embed" data-id="..."> placed below and renders the
  // policy inline (no iframe redirect, no white background — matches site).
  useEffect(() => {
    if (document.getElementById('termly-jssdk')) return;
    const script = document.createElement('script');
    script.id = 'termly-jssdk';
    script.src = 'https://app.termly.io/embed-policy.min.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const isConfigured = TERMLY_COOKIE_POLICY_ID && TERMLY_COOKIE_POLICY_ID !== 'REPLACE_WITH_TERMLY_COOKIE_POLICY_UUID';

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-300">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-12"
          data-testid="cookies-back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <h1
          className="text-3xl sm:text-4xl font-bold text-white mb-2"
          style={{ fontFamily: 'Outfit' }}
          data-testid="cookies-heading"
        >
          Cookie Policy
        </h1>
        <p className="text-sm text-zinc-500 mb-12">Last updated: 24 March 2026</p>

        {isConfigured ? (
          <div ref={embedContainer} className="termly-wrapper text-sm leading-relaxed text-zinc-300">
            <div
              name="termly-embed"
              data-id={TERMLY_COOKIE_POLICY_ID}
            />
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-sm leading-relaxed">
            <p className="text-amber-300 font-medium mb-2">Cookie policy coming soon</p>
            <p className="text-zinc-400">
              We're finalizing our cookie policy. In the meantime, please see our{' '}
              <button
                onClick={() => navigate('/privacy')}
                className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                data-testid="cookies-fallback-privacy-link"
              >
                Privacy Policy
              </button>{' '}
              for details on how we handle data, or email{' '}
              <a
                href="mailto:privacy@inflowft.com"
                className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
              >
                privacy@inflowft.com
              </a>{' '}
              with any questions.
            </p>
          </div>
        )}
      </div>

      {/* Style the inline-rendered Termly content to match our dark theme */}
      <style>{`
        .termly-wrapper { color: rgb(212 212 216); }
        .termly-wrapper h1,
        .termly-wrapper h2,
        .termly-wrapper h3,
        .termly-wrapper h4,
        .termly-wrapper h5,
        .termly-wrapper h6,
        .termly-wrapper strong,
        .termly-wrapper b { color: #fff !important; font-family: 'Outfit', system-ui, sans-serif; }
        .termly-wrapper h1 { font-size: 1.75rem; margin: 2rem 0 1rem; }
        .termly-wrapper h2 { font-size: 1.4rem; margin: 2rem 0 0.75rem; }
        .termly-wrapper h3 { font-size: 1.15rem; margin: 1.5rem 0 0.5rem; }
        .termly-wrapper p,
        .termly-wrapper li { color: rgb(212 212 216); line-height: 1.7; margin-bottom: 0.75rem; }
        .termly-wrapper a { color: #818cf8; text-decoration: underline; text-underline-offset: 2px; }
        .termly-wrapper a:hover { color: #a5b4fc; }
        .termly-wrapper ul,
        .termly-wrapper ol { padding-left: 1.5rem; margin: 0.5rem 0 1rem; }
        .termly-wrapper table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
          font-size: 0.85rem;
        }
        .termly-wrapper th,
        .termly-wrapper td {
          border: 1px solid rgb(63 63 70);
          padding: 0.5rem 0.75rem;
          text-align: left;
        }
        .termly-wrapper th { background: rgb(24 24 27); color: #fff; }
        .termly-wrapper hr { border-color: rgb(39 39 42); margin: 2rem 0; }
        .termly-wrapper blockquote {
          border-left: 3px solid #6366f1;
          padding-left: 1rem;
          margin: 1rem 0;
          color: rgb(161 161 170);
        }
      `}</style>
    </div>
  );
};

export default CookiePolicy;
