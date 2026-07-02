import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send, Loader2, Check, X, Pencil,
  AlertTriangle, Plus, Lock, ArrowRight
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const FONT_BODY = "'IBM Plex Sans', system-ui, sans-serif";
const FONT_HEAD = "'Cabinet Grotesk', 'Outfit', sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

const STARTER_PROMPTS = [
  { category: 'Plans',         label: "What's the difference between Pro and Enterprise?" },
  { category: 'Integrations',  label: 'Which integrations do you support?' },
  { category: 'Trial',         label: 'How does the 14-day free trial work?' },
  { category: 'Get started',   label: "I'm new here — how do I get started with InFlow?" },
];

// Sentiment dot mapping — green by default (online indicator), shifts only when non-neutral
const SENTIMENT_COLOR = {
  positive:   '#34C759',
  neutral:    '#34C759',
  frustrated: '#FF3B30',
  anxious:    '#FFCC00',
  confused:   '#0057FF',
};

const FlowMark = ({ size = 'md' }) => {
  const text = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-base';
  return (
    <div
      className={`${text} flex-shrink-0 flex items-center leading-none tracking-tight`}
      style={{ fontFamily: FONT_HEAD, fontWeight: 800, color: '#64748B' }}
      aria-label="Flow AI"
    >
      flow
    </div>
  );
};

const TypingCursor = () => (
  <span
    className="inline-block w-2.5 h-4 bg-zinc-400 align-middle"
    style={{ animation: 'flowblink 1s steps(2, start) infinite' }}
    aria-label="thinking"
  />
);

const ActionCard = ({ action, category, onApprove, onCancel, busy }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ to: action.to, subject: action.subject, body: action.body });
  const isEscalation = action.type === 'escalate';
  const headerLabel = isEscalation ? 'FORWARD · HUMAN REVIEW' : 'OUTBOUND EMAIL · DRAFT';

  return (
    <div
      className="mt-5 border border-white/20 bg-[#0C0C0F] rounded-sm overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300"
      data-testid="agent-action-card"
    >
      <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
        <div className="flex items-center gap-2.5 text-[11px] tracking-widest text-zinc-300" style={{ fontFamily: FONT_MONO }}>
          <span className={`w-1.5 h-1.5 ${isEscalation ? 'bg-[#FFCC00]' : 'bg-[#0057FF]'} rounded-full`} />
          {headerLabel}
          {category && <span className="text-zinc-600">· {category.toUpperCase()}</span>}
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-[11px] text-zinc-500 hover:text-white flex items-center gap-1.5 transition-colors uppercase tracking-wider"
          style={{ fontFamily: FONT_MONO }}
          data-testid="agent-action-edit-toggle"
          disabled={busy}
        >
          <Pencil className="w-3 h-3" />
          {editing ? 'DONE' : 'EDIT'}
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 border-b border-white/5 pb-3">
          <span className="text-[10px] font-medium text-zinc-500 w-16 shrink-0 uppercase tracking-widest" style={{ fontFamily: FONT_MONO }}>To</span>
          {editing ? (
            <Input
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              className="bg-[#050507] border-white/15 text-white h-9 text-sm rounded-sm focus-visible:ring-1 focus-visible:ring-[#0057FF]"
              data-testid="agent-action-to-input"
            />
          ) : (
            <span className="text-sm text-zinc-200" style={{ fontFamily: FONT_BODY }}>{draft.to}</span>
          )}
        </div>

        {!isEscalation && (
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 border-b border-white/5 pb-3">
            <span className="text-[10px] font-medium text-zinc-500 w-16 shrink-0 uppercase tracking-widest" style={{ fontFamily: FONT_MONO }}>Subject</span>
            {editing ? (
              <Input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="bg-[#050507] border-white/15 text-white h-9 text-sm rounded-sm focus-visible:ring-1 focus-visible:ring-[#0057FF]"
                data-testid="agent-action-subject-input"
              />
            ) : (
              <span className="text-sm text-zinc-200 truncate" style={{ fontFamily: FONT_BODY }}>{draft.subject}</span>
            )}
          </div>
        )}

        <div className="space-y-2">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block" style={{ fontFamily: FONT_MONO }}>Message</span>
          {editing ? (
            <Textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="bg-[#050507] border-white/15 text-white text-sm min-h-[160px] resize-none leading-relaxed rounded-sm focus-visible:ring-1 focus-visible:ring-[#0057FF]"
              data-testid="agent-action-body-input"
              style={{ fontFamily: FONT_BODY }}
            />
          ) : (
            <div
              className="text-sm text-zinc-300 leading-[1.7] whitespace-pre-wrap max-h-72 overflow-y-auto pr-1"
              style={{ fontFamily: FONT_BODY }}
            >
              {draft.body}
            </div>
          )}
        </div>

        {action.reason && (
          <p
            className="text-[11px] text-zinc-600 pt-2 border-t border-white/5"
            style={{ fontFamily: FONT_MONO }}
          >
            <span className="text-zinc-500">// </span>{action.reason}
          </p>
        )}
      </div>

      <div className="px-4 py-3 bg-[#050507] border-t border-white/10 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="text-zinc-400 hover:text-white px-4 py-2 text-sm transition-colors font-medium rounded-sm hover:bg-white/5 disabled:opacity-40"
          style={{ fontFamily: FONT_BODY }}
          data-testid="agent-action-cancel-btn"
        >
          Cancel
        </button>
        <button
          onClick={() => onApprove(editing ? draft : null)}
          disabled={busy || !draft.to || !draft.body}
          className="bg-[#0057FF] text-white hover:bg-[#004CE6] disabled:opacity-40 px-5 py-2 text-sm font-medium rounded-sm transition-colors flex items-center gap-2"
          style={{ fontFamily: FONT_BODY }}
          data-testid="agent-action-approve-btn"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
          {isEscalation ? 'Forward' : 'Send email'}
        </button>
      </div>
    </div>
  );
};

const Contact = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingCategory, setPendingCategory] = useState(null);
  const [latestSentiment, setLatestSentiment] = useState('neutral');
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const isWelcome = userMessageCount === 0 && !thinking;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking, pendingAction]);

  const startSession = useCallback(async () => {
    setMessages([]);
    setPendingAction(null);
    setPendingCategory(null);
    setLatestSentiment('neutral');
    setInput('');
    setThinking(false);
    setScrolled(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    try {
      const r = await fetch(`${API_URL}/api/contact/agent/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) throw new Error('Failed to start chat');
      const data = await r.json();
      setSessionId(data.session_id);
      setMessages([{ role: 'assistant', content: data.greeting }]);
      // Focus without auto-scrolling the page to the input (bottom of page)
      setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 100);
    } catch (e) {
      setBootError(e.message || 'Could not connect to Flow AI.');
    }
  }, []);

  useEffect(() => {
    document.title = 'Flow AI · InFlow';
    window.scrollTo(0, 0);
    startSession();
  }, [startSession]);

  // Track scroll on the inner chat container to drive the dynamic header / composer
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 24);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isWelcome]);

  const sendMessage = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || !sessionId || thinking) return;
    if (!overrideText) setInput('');
    setMessages(m => [...m, { role: 'user', content: text }]);
    setThinking(true);
    try {
      const r = await fetch(`${API_URL}/api/contact/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || 'Message failed');
      }
      const data = await r.json();
      setMessages(m => [
        ...m,
        { role: 'assistant', content: data.message, action: data.proposed_action || null, category: data.category, sentiment: data.sentiment },
      ]);
      if (data.sentiment) setLatestSentiment(data.sentiment);
      if (data.proposed_action) {
        setPendingAction(data.proposed_action);
        setPendingCategory(data.category);
      } else {
        setPendingAction(null);
      }
    } catch (e) {
      toast.error(e.message);
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, I had trouble with that. Try again?' }]);
    } finally {
      setThinking(false);
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    }
  }, [input, sessionId, thinking]);

  const approveAction = async (edits) => {
    if (!pendingAction || !sessionId) return;
    setActionBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/contact/agent/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, action_id: pendingAction.id, edits }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || 'Action failed');
      }
      const data = await r.json();
      setMessages(m => {
        const next = m.map(msg => msg.action?.id === pendingAction.id ? { ...msg, action: null, executed: true } : msg);
        return [...next, { role: 'assistant', content: data.message, system: true }];
      });
      setPendingAction(null);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setActionBusy(false);
    }
  };

  const cancelAction = async () => {
    if (!pendingAction || !sessionId) return;
    setActionBusy(true);
    try {
      await fetch(`${API_URL}/api/contact/agent/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, action_id: pendingAction.id }),
      });
      setMessages(m => {
        const next = m.map(msg => msg.action?.id === pendingAction.id ? { ...msg, action: null, cancelled: true } : msg);
        return [...next, { role: 'assistant', content: 'No problem — what would you like to do instead?' }];
      });
      setPendingAction(null);
    } catch {
      // silent
    } finally {
      setActionBusy(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const dotColor = SENTIMENT_COLOR[latestSentiment] || SENTIMENT_COLOR.neutral;
  const showPulse = latestSentiment !== 'neutral';

  return (
    <div className="min-h-screen bg-[#050507] text-white relative flex flex-col" style={{ fontFamily: FONT_BODY }}>
      <Toaster position="top-right" richColors />

      {/* Local CSS for blinking cursor + grain */}
      <style>{`
        @keyframes flowblink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes flowpulse {
          0%, 100% { box-shadow: 0 0 0 0 currentColor; }
          50% { box-shadow: 0 0 0 4px transparent; }
        }
        .flow-grain::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
          opacity: .35; mix-blend-mode: overlay;
        }
      `}</style>

      {/* Sticky top bar — Swiss minimal, dynamic shrink on scroll */}
      <header className={`sticky top-0 z-50 border-b border-white/10 bg-[#050507]/80 backdrop-blur-xl transition-all duration-300 ${scrolled ? 'py-1.5' : 'py-3'}`}>
        <div className="w-full px-4 sm:px-6 lg:px-8 grid grid-cols-3 items-center">
          {/* LEFT — logo (clickable, goes home) */}
          <a href="/" className="flex items-center group justify-self-start" data-testid="contact-logo" aria-label="InFlow home">
            <div className={`overflow-hidden flex items-center justify-center transition-all duration-500 group-hover:scale-105 ${scrolled ? 'h-5' : 'h-6'}`}>
              <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-full w-auto object-contain" />
            </div>
          </a>

          {/* CENTER — Flow AI brand + sentiment dot */}
          <div className="flex items-center justify-center gap-2">
            <span
              className={`font-medium tracking-tight text-white transition-all duration-300 ${scrolled ? 'text-[12px]' : 'text-[13px]'}`}
              style={{ fontFamily: FONT_BODY }}
              data-testid="contact-brand-name"
            >
              Flow AI
            </span>
            <span
              className="w-1.5 h-1.5 rounded-full transition-colors duration-500"
              style={{
                backgroundColor: dotColor,
                animation: showPulse ? 'flowblink 2s ease-in-out infinite' : undefined,
              }}
              aria-label={`Sentiment: ${latestSentiment}`}
              title={`Tone: ${latestSentiment}`}
              data-testid="contact-sentiment-dot"
            />
          </div>

          {/* RIGHT — New chat */}
          <button
            onClick={startSession}
            className="justify-self-end flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm px-3 py-1.5 rounded-sm hover:bg-white/5"
            data-testid="contact-new-chat-btn"
            style={{ fontFamily: FONT_BODY }}
          >
            <Plus className="w-4 h-4" />
            <span className={`hidden sm:inline transition-opacity duration-300 ${scrolled ? 'opacity-0 sm:opacity-100' : 'opacity-100'}`}>New chat</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col w-full">
        {isWelcome ? (
          <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-20 md:py-32 flow-grain relative" data-testid="contact-welcome-state">
            <div className="w-full max-w-2xl text-center animate-in fade-in slide-in-from-bottom-3 duration-500 relative z-10">
              <h1
                className="text-4xl md:text-6xl text-white tracking-tighter leading-[0.95] mb-12"
                style={{ fontFamily: FONT_HEAD, fontWeight: 800 }}
              >
                Hi, I'm <span style={{ color: '#64748B' }}>flow</span> AI.<br />
                <span className="text-zinc-600">How can I help?</span>
              </h1>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto text-left">
                {STARTER_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(p.label)}
                    disabled={!sessionId}
                    className="group p-5 border border-white/10 bg-transparent hover:border-white/40 hover:bg-white/[0.02] transition-all duration-200 text-left flex flex-col gap-2 rounded-sm cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                    data-testid={`contact-prompt-${i}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] group-hover:text-zinc-300 transition-colors"
                        style={{ fontFamily: FONT_MONO }}
                      >
                        {p.category}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-sm text-zinc-200 font-medium leading-snug" style={{ fontFamily: FONT_BODY }}>
                      {p.label}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto" data-testid="contact-chat-scroll">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-7">
              {messages.map((m, i) => (
                <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {m.role === 'user' ? (
                    <div className="flex justify-end">
                      <div
                        className="max-w-[85%] sm:max-w-[75%] bg-white text-black px-5 py-3 rounded-2xl rounded-br-sm text-[15px] font-medium shadow-sm"
                        style={{ fontFamily: FONT_BODY }}
                        data-testid={`chat-msg-user-${i}`}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-4" data-testid={`chat-msg-assistant-${i}`}>
                      <FlowMark size="sm" />
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p
                          className="text-[15px] text-zinc-100 leading-[1.7] whitespace-pre-wrap"
                          style={{ fontFamily: FONT_BODY }}
                        >
                          {m.content}
                        </p>
                        {m.action && (
                          <ActionCard
                            action={m.action}
                            category={m.category}
                            onApprove={approveAction}
                            onCancel={cancelAction}
                            busy={actionBusy}
                          />
                        )}
                        {m.executed && (
                          <p className="text-[10px] text-[#34C759] mt-2 flex items-center gap-1.5 uppercase tracking-widest" style={{ fontFamily: FONT_MONO }}>
                            <Check className="w-3 h-3" /> SENT · CONFIRMED
                          </p>
                        )}
                        {m.cancelled && (
                          <p className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1.5 uppercase tracking-widest" style={{ fontFamily: FONT_MONO }}>
                            <X className="w-3 h-3" /> CANCELLED
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {thinking && (
                <div className="flex gap-4 animate-in fade-in duration-200">
                  <FlowMark size="sm" />
                  <div className="pt-1.5 flex items-center gap-2">
                    <span className="text-[11px] tracking-widest text-zinc-500 uppercase" style={{ fontFamily: FONT_MONO }}>
                      thinking
                    </span>
                    <TypingCursor />
                  </div>
                </div>
              )}

              {bootError && (
                <div className="border border-[#FFCC00]/40 bg-[#FFCC00]/[0.05] p-4 flex items-start gap-3 text-sm rounded-sm" data-testid="contact-boot-error">
                  <AlertTriangle className="w-4 h-4 text-[#FFCC00] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[#FFCC00] font-medium uppercase tracking-widest text-[11px]" style={{ fontFamily: FONT_MONO }}>
                      Connection lost
                    </p>
                    <p className="text-zinc-400 text-xs mt-1" style={{ fontFamily: FONT_BODY }}>
                      {bootError}. Email <a href="mailto:hello@inflow.io" className="underline decoration-zinc-600 hover:decoration-white">hello@inflow.io</a> directly.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Composer — dynamic, shrinks helper text once scrolled */}
        <div className={`relative z-20 border-t border-white/10 bg-[#050507]/90 backdrop-blur-2xl px-4 sm:px-6 transition-all duration-300 ${scrolled ? 'pt-3 pb-3' : 'pt-4 pb-6'}`}>
          <div
            className={`relative flex items-end gap-2 rounded-full border bg-[#0C0C0F] transition-all max-w-3xl mx-auto pl-5 pr-2 shadow-lg ${
              pendingAction ? 'border-[#FFCC00]/40' : 'border-white/20 focus-within:border-white/50 focus-within:bg-[#0F0F12]'
            } ${scrolled ? 'py-1.5' : 'py-2'}`}
          >
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingAction ? 'Approve or edit the proposed action above…' : 'Message Flow AI'}
              disabled={!sessionId || !!bootError || !!pendingAction}
              className="bg-transparent border-0 text-white text-[15px] min-h-[40px] max-h-32 py-2.5 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none w-full placeholder:text-zinc-600"
              style={{ fontFamily: FONT_BODY }}
              data-testid="contact-composer-input"
              rows={1}
            />
            <Button
              size="icon"
              onClick={() => sendMessage()}
              disabled={!input.trim() || thinking || !sessionId || !!pendingAction}
              className="bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 h-10 w-10 rounded-full flex-shrink-0 transition-colors"
              data-testid="contact-composer-send-btn"
              aria-label="Send message"
            >
              {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={2.4} />}
            </Button>
          </div>
          <p
            className={`text-[10px] text-zinc-500 text-center tracking-[0.2em] uppercase flex items-center justify-center gap-1.5 transition-all duration-300 overflow-hidden ${
              scrolled ? 'h-0 opacity-0 mt-0' : 'h-4 opacity-100 mt-3'
            }`}
            style={{ fontFamily: FONT_MONO }}
          >
            <Lock className="w-3 h-3" /> Encrypted · Flow AI confirms before acting
          </p>
        </div>
      </main>
    </div>
  );
};

export default Contact;
