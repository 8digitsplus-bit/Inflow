import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Termly Privacy Policy UUID — find under Termly Dashboard → Documents → Privacy Policy → Embed
const TERMLY_PRIVACY_POLICY_ID = 'b2bacd1c-c041-49b6-ae03-a0e8c57fea3e';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  // Inject Termly's embed script once when the page mounts.
  useEffect(() => {
    if (document.getElementById('termly-jssdk')) return;
    const script = document.createElement('script');
    script.id = 'termly-jssdk';
    script.src = 'https://app.termly.io/embed-policy.min.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-300">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors mb-12"
          data-testid="privacy-back-btn"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        <h1
          className="text-3xl sm:text-4xl font-bold text-white mb-12"
          style={{ fontFamily: 'Outfit' }}
          data-testid="privacy-heading"
        >
          Privacy Policy
        </h1>

        <div className="bg-zinc-800/40 border border-zinc-700/60 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
          <div className="termly-wrapper text-sm leading-relaxed">
            <div
              name="termly-embed"
              data-id={TERMLY_PRIVACY_POLICY_ID}
            />
          </div>
        </div>
      </div>

      {/* Style the inline-rendered Termly content to match our dark theme */}
      <style>{`
        .termly-wrapper,
        .termly-wrapper * { color: #ffffff !important; }
        .termly-wrapper h1,
        .termly-wrapper h1 *,
        .termly-wrapper h2,
        .termly-wrapper h2 *,
        .termly-wrapper h3,
        .termly-wrapper h3 *,
        .termly-wrapper h4,
        .termly-wrapper h4 *,
        .termly-wrapper h5,
        .termly-wrapper h5 *,
        .termly-wrapper h6,
        .termly-wrapper h6 *,
        .termly-wrapper strong,
        .termly-wrapper strong *,
        .termly-wrapper b,
        .termly-wrapper b * { color: #ffffff !important; font-family: 'Outfit', system-ui, sans-serif !important; }
        .termly-wrapper a,
        .termly-wrapper a * { color: #818cf8 !important; text-decoration: underline; text-underline-offset: 2px; }
        .termly-wrapper a:hover,
        .termly-wrapper a:hover * { color: #a5b4fc !important; }
        .termly-wrapper h1 { font-size: 1.75rem; margin: 2rem 0 1rem; }
        .termly-wrapper h2 { font-size: 1.4rem; margin: 2rem 0 0.75rem; }
        .termly-wrapper h3 { font-size: 1.15rem; margin: 1.5rem 0 0.5rem; }
        .termly-wrapper p,
        .termly-wrapper li { line-height: 1.7; margin-bottom: 0.75rem; }
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

export default PrivacyPolicy;
