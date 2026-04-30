import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Loader2, Sparkles, Check, X, Pencil, MailCheck,
  AlertTriangle, Bot, User as UserIcon
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Avatar = ({ role }) => (
  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
    role === 'assistant'
      ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300'
      : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
  }`}>
    {role === 'assistant' ? <Bot className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
  </div>
);

const TypingDots = () => (
  <div className="flex items-center gap-1 px-1 py-2">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-indigo-400/70 animate-bounce"
        style={{ animationDelay: `${i * 0.12}s` }}
      />
    ))}
  </div>
);

const ActionCard = ({ action, category, onApprove, onCancel, busy }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ to: action.to, subject: action.subject, body: action.body });
  const isEscalation = action.type === 'escalate';

  const headerLabel = isEscalation ? 'Forward to InFlow team' : 'Send this email';
  const headerColor = isEscalation ? 'text-amber-400' : 'text-indigo-400';
  const headerBg = isEscalation ? 'bg-amber-500/10 border-amber-500/30' : 'bg-indigo-500/10 border-indigo-500/30';

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden" data-testid="agent-action-card">
      <div className={`px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between ${headerBg}`}>
        <div className="flex items-center gap-2 text-xs font-medium">
          <MailCheck className={`w-3.5 h-3.5 ${headerColor}`} />
          <span className={headerColor}>{headerLabel}</span>
          {category && (
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800/60 border border-zinc-700/50">
              {category}
            </span>
          )}
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
          data-testid="agent-action-edit-toggle"
          disabled={busy}
        >
          <Pencil className="w-3 h-3" />
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* To */}
        <div className="flex items-baseline gap-3 text-sm">
          <span className="text-zinc-500 text-xs w-14 shrink-0">To</span>
          {editing ? (
            <Input
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              className="bg-zinc-900/60 border-zinc-800 text-white h-9 text-sm"
              data-testid="agent-action-to-input"
            />
          ) : (
            <span className="text-zinc-200 text-sm">{draft.to}</span>
          )}
        </div>

        {/* Subject */}
        {!isEscalation && (
          <div className="flex items-baseline gap-3 text-sm">
            <span className="text-zinc-500 text-xs w-14 shrink-0">Subject</span>
            {editing ? (
              <Input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="bg-zinc-900/60 border-zinc-800 text-white h-9 text-sm"
                data-testid="agent-action-subject-input"
              />
            ) : (
              <span className="text-zinc-200 text-sm truncate">{draft.subject}</span>
            )}
          </div>
        )}

        {/* Body */}
        <div className="space-y-1.5">
          <span className="text-zinc-500 text-xs">Message</span>
          {editing ? (
            <Textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="bg-zinc-900/60 border-zinc-800 text-white text-sm min-h-[140px] resize-none"
              data-testid="agent-action-body-input"
            />
          ) : (
            <div className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto pr-1">
              {draft.body}
            </div>
          )}
        </div>

        {action.reason && (
          <p className="text-xs text-zinc-500 italic flex items-start gap-1.5 pt-1 border-t border-white/[0.04]">
            <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0 text-indigo-400/70" />
            {action.reason}
          </p>
        )}
      </div>

      <div className="px-4 py-3 bg-zinc-900/40 border-t border-white/[0.06] flex items-center justify-end gap-2">
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
          className="bg-indigo-600 hover:bg-indigo-500 h-8"
          data-testid="agent-action-approve-btn"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
          {isEscalation ? 'Forward' : 'Send'}
        </Button>
      </div>
    </div>
  );
};

const Contact = () => {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]); // {role, content, action?, executed?}
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingCategory, setPendingCategory] = useState(null);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [bootError, setBootError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinking, pendingAction]);

  // Boot: start a session
  useEffect(() => {
    document.title = 'Contact · InFlow';
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

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !sessionId || thinking) return;
    setInput('');
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
      if (data.proposed_action) {
        setPendingAction(data.proposed_action);
        setPendingCategory(data.category);
      } else {
        setPendingAction(null);
      }
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
        // Mark the previous action as executed (so the card disappears) and append confirmation
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
    <div className="min-h-screen bg-[#050507] text-white relative overflow-x-hidden flex flex-col">
      <Toaster position="top-right" richColors />

      {/* Ambient glow */}
      <div className="absolute inset-x-0 top-0 h-[600px] pointer-events-none" aria-hidden="true"
        style={{ background: 'radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
      <div className="absolute inset-0 noise-overlay pointer-events-none" aria-hidden="true" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06] backdrop-blur-xl bg-[#050507]/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
            data-testid="contact-back-home-btn"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Home</span>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-indigo-300" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#050507]" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold" style={{ fontFamily: 'Outfit' }}>InFlow Assistant</p>
              <p className="text-[11px] text-zinc-500">AI · confirms before acting</p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <main className="relative z-10 flex-1 flex flex-col w-full max-w-4xl mx-auto px-4 sm:px-6 pb-4">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto py-8 space-y-5"
          data-testid="contact-chat-scroll"
          style={{ scrollBehavior: 'smooth' }}
        >
          {bootError && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-sm" data-testid="contact-boot-error">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-amber-300 font-medium">Couldn't reach the assistant</p>
                <p className="text-amber-200/70 text-xs mt-1">{bootError}. Email <a href="mailto:hello@inflow.io" className="underline">hello@inflow.io</a> directly.</p>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <Avatar role={m.role} />
              <div className={`max-w-[78%] ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-white/[0.04] border border-white/[0.06] text-zinc-100 rounded-bl-sm'
                  }`}
                  data-testid={`chat-msg-${m.role}-${i}`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
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
                  <p className="text-[11px] text-emerald-400/80 mt-1.5 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Action sent
                  </p>
                )}
                {m.cancelled && (
                  <p className="text-[11px] text-zinc-500 mt-1.5 flex items-center gap-1">
                    <X className="w-3 h-3" /> Cancelled
                  </p>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex gap-3">
              <Avatar role="assistant" />
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-bl-sm">
                <TypingDots />
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="relative z-10 border-t border-white/[0.06] pt-4">
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl backdrop-blur-xl flex items-end gap-2 p-2 focus-within:border-indigo-500/40 transition-colors">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingAction ? "Approve or edit the proposed action above…" : "Type your message — Shift+Enter for a new line"}
              disabled={!sessionId || !!bootError || !!pendingAction}
              className="bg-transparent border-0 text-white text-sm resize-none min-h-[44px] max-h-40 focus-visible:ring-0 focus-visible:ring-offset-0"
              data-testid="contact-composer-input"
              rows={1}
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || thinking || !sessionId || !!pendingAction}
              className="bg-indigo-600 hover:bg-indigo-500 h-9 w-9 flex-shrink-0"
              data-testid="contact-composer-send-btn"
            >
              {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-zinc-600 text-center mt-2">
            The assistant will always ask before sending an email or escalating.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Contact;
