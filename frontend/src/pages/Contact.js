import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, Send, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Contact = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const mainRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'Contact · InFlow';
  }, []);

  const validate = () => {
    if (!form.name.trim()) return 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Please enter a valid email.';
    if (form.message.trim().length < 10) return 'Please share a bit more (min. 10 characters).';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          company: form.company.trim() || null,
          message: form.message.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to send. Please try again.');
      }
      setSubmitted(true);
    } catch (e2) {
      toast.error(e2.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={mainRef} className="min-h-screen bg-[#050507] text-white relative overflow-x-hidden">
      <Toaster position="top-right" richColors />

      {/* Ambient glow */}
      <div className="absolute inset-x-0 top-0 h-[600px] pointer-events-none" aria-hidden="true"
        style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
      <div className="absolute inset-0 noise-overlay pointer-events-none" aria-hidden="true" />

      {/* Back nav */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors z-10"
        data-testid="contact-back-home-btn"
      >
        <ArrowLeft className="w-4 h-4" /><span className="text-sm">Home</span>
      </button>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            AI-assisted replies · usually under 2 minutes
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>
            Let's talk.
          </h1>
          <p className="mt-5 text-zinc-400 text-base sm:text-lg leading-relaxed">
            Questions about pricing, integrations, or a custom use-case? Drop a note — most replies land in your inbox within minutes.
          </p>
        </div>

        {/* Layout: form + side info */}
        <div className="grid lg:grid-cols-5 gap-10 items-start">
          {/* Form */}
          <div className="lg:col-span-3 order-2 lg:order-1">
            {submitted ? (
              <div
                className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-10 text-center animate-in fade-in zoom-in duration-500"
                data-testid="contact-success-card"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-semibold mb-2" style={{ fontFamily: 'Outfit' }}>Message received</h2>
                <p className="text-zinc-400 text-sm leading-relaxed max-w-md mx-auto">
                  Our AI is reading your note right now and will reply to <span className="text-white">{form.email}</span> shortly. If it's a complex ask, a human will pick it up next.
                </p>
                <div className="mt-8 flex items-center justify-center gap-3">
                  <Button
                    variant="ghost"
                    className="text-zinc-400 hover:text-white"
                    onClick={() => { setSubmitted(false); setForm({ name: '', email: '', company: '', message: '' }); }}
                    data-testid="contact-send-another-btn"
                  >
                    Send another message
                  </Button>
                  <Button
                    className="bg-indigo-600 hover:bg-indigo-500"
                    onClick={() => navigate('/')}
                    data-testid="contact-back-to-home-btn"
                  >
                    Back to home
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 sm:p-10"
                data-testid="contact-form"
              >
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Name</label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Jane Doe"
                      className="bg-zinc-900/60 border-zinc-800 text-white h-11"
                      data-testid="contact-name-input"
                      disabled={submitting}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Email</label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="jane@company.com"
                      className="bg-zinc-900/60 border-zinc-800 text-white h-11"
                      data-testid="contact-email-input"
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <label className="text-sm text-zinc-400 mb-1.5 block">
                    Company <span className="text-zinc-600">(optional)</span>
                  </label>
                  <Input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Acme Inc."
                    className="bg-zinc-900/60 border-zinc-800 text-white h-11"
                    data-testid="contact-company-input"
                    disabled={submitting}
                  />
                </div>

                <div className="mt-5">
                  <label className="text-sm text-zinc-400 mb-1.5 block">Message</label>
                  <Textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="How can we help? Share as much context as you can — our AI uses it to craft an accurate reply."
                    className="bg-zinc-900/60 border-zinc-800 text-white min-h-[160px] resize-none"
                    data-testid="contact-message-input"
                    disabled={submitting}
                    maxLength={4000}
                  />
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-zinc-600">We'll never share your email.</p>
                    <p className="text-xs text-zinc-600">{form.message.length}/4000</p>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 btn-glow h-11 font-medium"
                  disabled={submitting}
                  data-testid="contact-submit-btn"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending…</>
                  ) : (
                    <>Send message <Send className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* Side info */}
          <aside className="lg:col-span-2 order-1 lg:order-2 space-y-5">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
              <div className="flex items-start gap-3 mb-1">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white" style={{ fontFamily: 'Outfit' }}>How this works</h3>
                  <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
                    Claude reads every message, classifies the intent, and drafts a reply for routine questions. Refunds, billing, and custom requests go straight to our team.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <a href="mailto:hello@inflow.io" className="text-sm text-zinc-300 hover:text-white transition-colors" data-testid="contact-email-link">
                  hello@inflow.io
                </a>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                <span className="text-sm text-zinc-300">San Francisco, CA</span>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-white mb-2" style={{ fontFamily: 'Outfit' }}>Already a customer?</h3>
              <p className="text-sm text-zinc-400 leading-relaxed mb-3">
                Log in and use <span className="text-white">Smart Assist AI</span> inside the app for instant answers about your data.
              </p>
              <Button
                variant="ghost"
                className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 p-0 h-auto text-sm"
                onClick={() => navigate('/auth?mode=login')}
                data-testid="contact-login-cta"
              >
                Sign in →
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Contact;
