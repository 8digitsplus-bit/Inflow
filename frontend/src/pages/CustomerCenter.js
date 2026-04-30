import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Send, Loader2, Sparkles, Check, X, AlertTriangle, Plus,
  CreditCard, Users, LogOut, Mail, ArrowUpRight, Settings as SettingsIcon,
  ShieldAlert
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import DashboardLayout from '../components/DashboardLayout';
import { toast } from 'sonner';
import { Toaster } from '../components/ui/sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STARTER_PROMPTS = [
  { icon: CreditCard, label: 'What plan am I on and how much will I be charged next?', category: 'Billing' },
  { icon: Users, label: 'I want to invite a teammate to my workspace.', category: 'Team' },
  { icon: LogOut, label: 'I want to cancel my subscription.', category: 'Cancel' },
  { icon: Mail, label: 'I have a custom request — please pass this to your team.', category: 'Talk to a human' },
];

const ACTION_META = {
  cancel_subscription: { icon: LogOut, color: 'text-red-400', bg: 'bg-red-500/15', label: 'Cancel subscription', danger: true },
  open_billing_portal: { icon: CreditCard, color: 'text-indigo-400', bg: 'bg-indigo-500/15', label: 'Open billing portal' },
  invite_member:       { icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Send invite' },
  escalate:            { icon: Mail, color: 'text-amber-400', bg: 'bg-amber-500/15', label: 'Escalate to team' },
  navigate:            { icon: ArrowUpRight, color: 'text-zinc-300', bg: 'bg-zinc-700/40', label: 'Open page' },
};

const FlowAIMark = ({ size = 'md' }) => {
  const dim = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const iconDim = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className={`${dim} rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20`}>
      <Sparkles className={`${iconDim} text-white`} strokeWidth={2.2} />
    </div>
  );
};

const TypingDots = () => (
  <div className="flex items-center gap-1.5 py-2">
    {[0, 1, 2].map(i => (
      <span key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: `${i * 0.14}s` }} />
    ))}
  </div>
);

const ActionCard = ({ action, onApprove, onCancel, busy }) => {
  const meta = ACTION_META[action.type] || ACTION_META.navigate;
  const Icon = meta.icon;
  const [params, setParams] = useState(action.params || {});

  const renderEditableParams = () => {
    if (action.type === 'invite_member') {
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Teammate's email</label>
            <Input
              value={params.email || ''}
              onChange={(e) => setParams({ ...params, email: e.target.value, role: 'member' })}
              placeholder="alex@yourcompany.com"
              className="bg-zinc-900/80 border-zinc-800 text-white h-10 text-sm"
              data-testid="action-invite-email"
            />
          </div>
        </div>
      );
    }
    if (action.type === 'escalate') {
      return (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Subject</label>
            <Input
              value={params.subject || ''}
              onChange={(e) => setParams({ ...params, subject: e.target.value })}
              className="bg-zinc-900/80 border-zinc-800 text-white h-9 text-sm"
              data-testid="action-escalate-subject"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Message</label>
            <Textarea
              value={params.body || ''}
              onChange={(e) => setParams({ ...params, body: e.target.value })}
              className="bg-zinc-900/80 border-zinc-800 text-white text-sm min-h-[120px] resize-none leading-relaxed"
              data-testid="action-escalate-body"
            />
          </div>
        </div>
      );
    }
    if (action.type === 'navigate') {
      return (
        <p className="text-sm text-zinc-300">
          You'll be taken to <span className="text-white font-mono text-xs px-1.5 py-0.5 rounded bg-zinc-800">{params.path}</span>
        </p>
      );
    }
    if (action.type === 'cancel_subscription') {
      return (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/[0.08] border border-red-500/20">
          <ShieldAlert className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-red-200 leading-relaxed">
            This is permanent. You'll keep access until the end of your billing period, but auto-renewal stops immediately.
          </div>
        </div>
      );
    }
    if (action.type === 'open_billing_portal') {
      return (
        <p className="text-sm text-zinc-300">
          Stripe's secure billing portal will open in a new tab. You can update your card, change plan, manage seats, or download invoices.
        </p>
      );
    }
    return null;
  };

  const handleApprove = async () => {
    // Pass the (possibly edited) params back to backend
    await onApprove(params);
  };

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl overflow-hidden shadow-xl" data-testid="agent-action-card">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}>
          <Icon className={`w-4 h-4 ${meta.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{action.label || meta.label}</p>
          {action.reason && <p className="text-xs text-zinc-500 mt-0.5 truncate">{action.reason}</p>}
        </div>
      </div>

      {renderEditableParams() && (
        <div className="px-5 py-4">{renderEditableParams()}</div>
      )}

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
          onClick={handleApprove}
          disabled={busy || (action.type === 'invite_member' && !params.email)}
          className={`h-8 px-4 ${meta.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
          data-testid="agent-action-approve-btn"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
          Approve
        </Button>
      </div>
    </div>
  );
};

const CustomerCenter = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const startSession = useCallback(async () => {
    setMessages([]);
    setPendingAction(null);
    setInput('');
    setThinking(false);
    try {
      const r = await fetch(`${API_URL}/api/customer/agent/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) throw new Error('Failed to start chat');
      const data = await r.json();
      setSessionId(data.session_id);
      setMessages([{ role: 'assistant', content: data.greeting }]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) {
      setBootError(e.message || 'Could not connect.');
    }
  }, []);

  useEffect(() => {
    document.title = 'Flow AI · Customer Centre';
    startSession();
  }, [startSession]);

  const sendMessage = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || !sessionId || thinking) return;
    if (!overrideText) setInput('');
    setMessages(m => [...m, { role: 'user', content: text }]);
    setThinking(true);
    try {
      const r = await fetch(`${API_URL}/api/customer/agent/chat`, {
        method: 'POST',
        credentials: 'include',
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
        { role: 'assistant', content: data.message, action: data.proposed_action || null },
      ]);
      setPendingAction(data.proposed_action || null);
    } catch (e) {
      toast.error(e.message);
      setMessages(m => [...m, { role: 'assistant', content: "Sorry, I had trouble with that. Try again?" }]);
    } finally {
      setThinking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, sessionId, thinking]);

  const approveAction = async (params) => {
    if (!pendingAction || !sessionId) return;
    setActionBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/customer/agent/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, action_id: pendingAction.id, edits: params }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || 'Action failed');
      }
      const data = await r.json();
      setMessages(m => {
        const next = m.map(msg => msg.action?.id === pendingAction.id ? { ...msg, action: null, executed: true } : msg);
        return [...next, { role: 'assistant', content: data.message, system: true, executed: data.executed }];
      });
      setPendingAction(null);

      // Side-effects after execute
      if (data.executed?.type === 'open_billing_portal' && data.executed.url) {
        window.open(data.executed.url, '_blank', 'noopener,noreferrer');
      }
      if (data.executed?.type === 'navigate' && data.executed.path) {
        // Small delay so user sees the confirmation before redirect
        setTimeout(() => navigate(data.executed.path), 800);
      }
      if (data.executed?.type === 'cancel_subscription') {
        toast.success('Subscription cancelled');
      }
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
      await fetch(`${API_URL}/api/customer/agent/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, action_id: pendingAction.id }),
      });
      setMessages(m => {
        const next = m.map(msg => msg.action?.id === pendingAction.id ? { ...msg, action: null, cancelled: true } : msg);
        return [...next, { role: 'assistant', content: 'No problem — what else can I help with?' }];
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

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <DashboardLayout>
      <Toaster position="top-right" richColors />
      <div className="h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] flex flex-col bg-[#0a0a0c]">
        {/* Top bar */}
        <header className="border-b border-white/[0.06] bg-[#0a0a0c]/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FlowAIMark size="sm" />
              <div className="leading-tight">
                <p className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'Outfit' }} data-testid="customer-center-brand">
                  Flow AI
                </p>
                <p className="text-[11px] text-zinc-500">Customer Centre</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/settings')}
                className="hidden sm:flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
                data-testid="open-settings-btn"
              >
                <SettingsIcon className="w-3.5 h-3.5" />
                Settings
              </button>
              <button
                onClick={startSession}
                className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
                data-testid="new-chat-btn"
                title="Start a new chat"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New chat</span>
              </button>
            </div>
          </div>
        </header>

        {/* Body */}
        {isWelcome ? (
          <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10" data-testid="customer-welcome-state">
            <div className="w-full max-w-2xl text-center animate-in fade-in slide-in-from-bottom-3 duration-500">
              <div className="flex justify-center mb-6">
                <FlowAIMark size="lg" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3" style={{ fontFamily: 'Outfit' }}>
                Hi {firstName}, I'm <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">Flow AI</span>
              </h1>
              <p className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-10 max-w-md mx-auto">
                Manage your account in plain English — I'll confirm before acting.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto text-left">
                {STARTER_PROMPTS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => sendMessage(p.label)}
                      disabled={!sessionId}
                      className="group flex items-start gap-3 p-4 rounded-xl bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.10] transition-all text-left disabled:opacity-40 disabled:pointer-events-none"
                      data-testid={`customer-prompt-${i}`}
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
          <div ref={scrollRef} className="flex-1 overflow-y-auto" data-testid="customer-chat-scroll">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-7">
              {messages.map((m, i) => (
                <div key={i} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {m.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-indigo-600/90 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm" data-testid={`cust-chat-msg-user-${i}`}>
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-4" data-testid={`cust-chat-msg-assistant-${i}`}>
                      <FlowAIMark size="sm" />
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-zinc-100 text-[15px] leading-[1.7] whitespace-pre-wrap">{m.content}</p>
                        {m.action && (
                          <ActionCard
                            action={m.action}
                            onApprove={approveAction}
                            onCancel={cancelAction}
                            busy={actionBusy}
                          />
                        )}
                        {m.executed && (
                          <p className="text-[11px] text-emerald-400/80 mt-2 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Done
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
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3 text-sm" data-testid="customer-boot-error">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-amber-300 font-medium">Couldn't reach Flow AI</p>
                    <p className="text-amber-200/70 text-xs mt-1">{bootError}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-white/[0.04] bg-[#0a0a0c]/80 backdrop-blur-xl">
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
                placeholder={pendingAction ? 'Approve or cancel the action above…' : 'Message Flow AI'}
                disabled={!sessionId || !!bootError || !!pendingAction}
                className="bg-transparent border-0 text-white text-[15px] resize-none min-h-[52px] max-h-48 focus-visible:ring-0 focus-visible:ring-offset-0 px-5 py-4 placeholder:text-zinc-500"
                data-testid="customer-composer-input"
                rows={1}
              />
              <Button
                size="icon"
                onClick={() => sendMessage()}
                disabled={!input.trim() || thinking || !sessionId || !!pendingAction}
                className="bg-white text-zinc-900 hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 h-9 w-9 rounded-full flex-shrink-0 mb-2 mr-2"
                data-testid="customer-composer-send-btn"
              >
                {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={2.4} />}
              </Button>
            </div>
            <p className="text-[11px] text-zinc-600 text-center mt-2.5">
              Flow AI confirms with you before acting.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CustomerCenter;
