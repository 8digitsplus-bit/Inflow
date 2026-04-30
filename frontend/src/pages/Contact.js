import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Loader2, Sparkles, Check, X, Pencil, MailCheck,
  AlertTriangle, Bot, User as UserIcon, Plus, Lightbulb, Zap, HelpCircle, MessageSquare
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const SUGGESTED_PROMPTS = [
  { icon: Lightbulb, label: "What's the difference between Pro and Enterprise?", category: 'Plans' },
  { icon: Zap, label: 'Which integrations do you support?', category: 'Integrations' },
  { icon: HelpCircle, label: 'How does the 14-day free trial work?', category: 'Trial' },
  { icon: MessageSquare, label: 'I want to talk to your team about a custom request.', category: 'Custom' },
];

const TypingDots = () => (
  <div className="flex items-center gap-1.5 py-2">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce"
        style={{ animationDelay: `${i * 0.14}s` }}
      />
    ))}
  </div>
);

const FlowAIMark = ({ size = 'md' }) => {
  const dim = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const iconDim = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className={`${dim} rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20`}>
      <Sparkles className={`${iconDim} text-white`} strokeWidth={2.2} />
    </div>
  );
};

const ActionCard = ({ action, category, onApprove, onCancel, busy }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ to: action.to, subject: action.subject, body: action.body });
  const isEscalation = action.type === 'escalate';

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl overflow-hidden shadow-xl" data-testid="agent-action-card">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isEscalation ? 'bg-amber-500/15 text-amber-400' : 'bg-indigo-500/15 text-indigo-400'}`}>
            <MailCheck className="w-3.5 h-3.5" />
          </div>
          <span className="text-zinc-200">{isEscalation ? 'Forward to the InFlow team' : 'Send this email'}</span>
          {category && (
            <span className="ml-1 text-[10px] text-zinc-500 uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800/80">
              {category}
            </span>
          )}
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-zinc-500 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
          data-testid="agent-action-edit-toggle"
          disabled={busy}
        >
          <Pencil className="w-3 h-3" />
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="flex items-baseline gap-3 text-sm">
          <span className="text-zinc-500 text-xs w-16 shrink-0">To</span>
          {editing ? (
            <Input
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              className="bg-zinc-900/80 border-zinc-800 text-white h-9 text-sm"
              data-testid="agent-action-to-input"
            />
          ) : (
            <span className="text-zinc-200 text-sm">{draft.to}</span>
          )}
        </div>

        {!isEscalation && (
          <div className="flex items-baseline gap-3 text-sm">
            <span className="text-zinc-500 text-xs w-16 shrink-0">Subject</span>
            {editing ? (
              <Input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="bg-zinc-900/80 border-zinc-800 text-white h-9 text-sm"
                data-testid="agent-action-subject-input"
              />
            ) : (
              <span className="text-zinc-200 text-sm truncate">{draft.subject}</span>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-zinc-500 text-xs">Message</span>
          {editing ? (
            <Textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="bg-zinc-900/80 border-zinc-800 text-white text-sm min-h-[160px] resize-none leading-relaxed"
              data-testid="agent-action-body-input"
            />
          ) : (
            <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto pr-1">
              {draft.body}
            </div>
          )}
        </div>

        {action.reason && (
          <p className="text-xs text-zinc-500 italic flex items-start gap-1.5 pt-2 border-t border-white/[0.04]">
            <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0 text-indigo-400/70" />
            {action.reason}
          </p>
        )}
      </div>

      <div className="px-5 py-3 bg-black/30 border-t border-white/[0.06] flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="text-zinc-400 hover:text-zinc-200 h-8"
          data-testid="agent-action-cancel-btn"
        >
          <X className="w-3.5 h-3.5 mr-1" /> Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onApprove(editing ? draft : null)}
          disabled={busy || !draft.to || !draft.body}
          className="bg-indigo-600 hover:bg-indigo-500 h-8 px-4"
          data-testid="agent-action-approve-btn"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
          {isEscalation ? 'Forward' : 'Send'}
        </Button>
      </div>
    </div>
  );
};

const Contact = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [bootError, setBootError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const isWelcome = userMessageCount === 0 && !thinking;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking, pendingAction]);

  // Boot
  useEffect(() => {
    document.title = 'Flow AI · InFlow';
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/contact/agent/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!r.ok) throw new Error('Failed to start chat');
        const data = await r.json();
        if (cancelled) return;
        setSessionId(data.session_id);
        setMessages([{ role: 'assistant', content: data.greeting }]);
        setTimeout(() => inputRef.current?.focus(), 100);
      } catch (e) {
        if (!cancelled) setBootError(e.message || 'Could not connect to the assistant.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startNewChat = async () => {
    setMessages([]);
    setPendingAction(null);
    setInput('');
    setThinking(false);
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
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) {
      toast.error(e.message);
    }
  };

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
        { role: 'assistant', content: data.message, action: data.proposed_action || null, category: data.category },
      ]);
      if (data.proposed_action) setPendingAction(data.proposed_action);
      else setPendingAction(null);
    } catch (e) {
      toast.error(e.message);
      setMessages(m => [...m, { role: 'assistant', content: "Sorry, I had trouble with that. Try again?" }]);
    } finally {
      setThinking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
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

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white relative flex flex-col">
      <Toaster position="top-right" richColors />

      {/* Subtle ambient gradient */}
      <div className="absolute inset-x-0 top-0 h-[700px] pointer-events-none opacity-60" aria-hidden="true"
        style={{ background: 'radial-gradient(50% 40% at 50% 0%, rgba(99,102,241,0.10) 0%, transparent 70%)' }} />

      {/* Top bar */}
      <header className="relative z-10 border-b border-white/[0.06] bg-[#0a0a0c]/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm"
            data-testid="contact-back-home-btn"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </button>

          <div className="flex items-center gap-2.5">
            <FlowAIMark size="sm" />
            <span className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'Outfit' }} data-testid="contact-brand-name">
              Flow AI
            </span>
          </div>

          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
            data-testid="contact-new-chat-btn"
            title="Start a new chat"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col w-full">
        {isWelcome ? (
          /* Welcome / empty state — Claude/ChatGPT style */
          <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10" data-testid="contact-welcome-state">
            <div className="w-full max-w-2xl text-center animate-in fade-in slide-in-from-bottom-3 duration-500">
              <div className="flex justify-center mb-6">
                <FlowAIMark size="lg" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3" style={{ fontFamily: 'Outfit' }}>
                Hi, I'm <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">Flow AI</span>
              </h1>
              <p className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-10 max-w-md mx-auto">
                Plans, integrations, or anything else — I'll confirm before acting.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto text-left">
                {SUGGESTED_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => sendMessage(p.label)}
                      disabled={!sessionId}
                      className="group flex items-start gap-3 p-4 rounded-xl bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.10] transition-all text-left disabled:opacity-40 disabled:pointer-events-none"
                      data-testid={`contact-prompt-${i}`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-zinc-800/80 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/15 group-hover:text-indigo-300 transition-colors text-zinc-400">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">{p.category}</p>
                        <p className="text-sm text-zinc-200 leading-snug">{p.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Active chat */
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto"
            data-testid="contact-chat-scroll"
          >
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-7">
              {messages.map((m, i) => (
                <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {m.role === 'user' ? (
                    /* User message — small bubble, right-aligned */
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-indigo-600/90 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm" data-testid={`chat-msg-user-${i}`}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  ) : (
                    /* Assistant message — no bubble, ChatGPT/Claude style */
                    <div className="flex gap-4" data-testid={`chat-msg-assistant-${i}`}>
                      <FlowAIMark size="sm" />
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-zinc-100 text-[15px] leading-[1.7] whitespace-pre-wrap">
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
                          <p className="text-[11px] text-emerald-400/80 mt-2 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Action sent
                          </p>
                        )}
                        {m.cancelled && (
                          <p className="text-[11px] text-zinc-500 mt-2 flex items-center gap-1">
                            <X className="w-3 h-3" /> Cancelled
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {thinking && (
                <div className="flex gap-4 animate-in fade-in duration-200">
                  <FlowAIMark size="sm" />
                  <TypingDots />
                </div>
              )}

              {bootError && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-sm" data-testid="contact-boot-error">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-amber-300 font-medium">Couldn't reach Flow AI</p>
                    <p className="text-amber-200/70 text-xs mt-1">{bootError}. Email <a href="mailto:hello@inflow.io" className="underline">hello@inflow.io</a> directly.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Composer — fixed at bottom, ChatGPT-style rounded pill */}
        <div className="relative z-10 border-t border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
            <div className={`relative flex items-end gap-2 rounded-3xl border transition-all ${
              pendingAction
                ? 'border-amber-500/20 bg-amber-500/[0.03]'
                : 'border-white/[0.08] bg-white/[0.03] focus-within:border-indigo-500/40 focus-within:bg-white/[0.05]'
            }`}>
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  pendingAction
                    ? 'Approve or edit the proposed action above…'
                    : 'Message Flow AI'
                }
                disabled={!sessionId || !!bootError || !!pendingAction}
                className="bg-transparent border-0 text-white text-[15px] resize-none min-h-[52px] max-h-48 focus-visible:ring-0 focus-visible:ring-offset-0 px-5 py-4 placeholder:text-zinc-500"
                data-testid="contact-composer-input"
                rows={1}
              />
              <Button
                size="icon"
                onClick={() => sendMessage()}
                disabled={!input.trim() || thinking || !sessionId || !!pendingAction}
                className="bg-white text-zinc-900 hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 h-9 w-9 rounded-full flex-shrink-0 mb-2 mr-2"
                data-testid="contact-composer-send-btn"
              >
                {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={2.4} />}
              </Button>
            </div>
            <p className="text-[11px] text-zinc-600 text-center mt-2.5">
              Flow AI confirms with you before sending an email or escalating.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Contact;
