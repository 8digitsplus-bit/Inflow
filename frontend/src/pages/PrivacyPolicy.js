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

        <div className="termly-wrapper text-sm leading-relaxed">
          <div
            name="termly-embed"
            data-id={TERMLY_PRIVACY_POLICY_ID}
            data-type="iframe"
          />
        </div>
      </div>

      {/* Tone down Termly's default white-background iframe to fit our dark theme */}
      <style>{`
        .termly-wrapper iframe {
          background: #050507 !important;
          color-scheme: dark;
          min-height: 80vh;
          width: 100%;
          border: 0;
        }
      `}</style>
    </div>
  );
};

export default PrivacyPolicy;
