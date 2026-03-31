import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  MessageCircle,
  X,
  Send,
  Plus,
  Trash2,
  ChevronRight,
  Loader2,
  Sparkles,
  History,
  ArrowLeft,
  Wrench,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const PAGE_LABELS = {
  '/dashboard': 'Dashboard',
  '/pipeline': 'Sales Pipeline',
  '/sales-performance': 'Sales Performance',
  '/sales-revenue': 'Sales Revenue',
  '/pricing': 'Pricing Optimizer',
  '/revenue': 'Revenue Intelligence',
  '/churn': 'Churn & Retention',
  '/cro': 'Conversion Optimization',
  '/forecast': 'Revenue Forecast',
  '/connect-business': 'Integrations',
  '/settings': 'Settings',
  '/support': 'Support',
};

const SUGGESTIONS = {
  '/dashboard': [
    'How is my pipeline performing?',
    'What deals need attention?',
    'Give me a revenue summary',
  ],
  '/pipeline': [
    'Which deals are stalling?',
    'Score my top deals',
    'What is my win rate?',
  ],
  '/forecast': [
    'What is my 6-month forecast?',
    'Show best vs worst case',
    'Which deals drive my forecast?',
  ],
  '/pricing': [
    'Analyze my pricing strategy',
    'How do I compare to competitors?',
    'What margin improvements can I make?',
  ],
  default: [
    'How is my pipeline doing?',
    'What are my top opportunities?',
    'Show me at-risk deals',
  ],
};

export const AICopilot = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('chat'); // 'chat' | 'history'
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const pageContext = PAGE_LABELS[location.pathname] || 'Dashboard';
  const suggestions = SUGGESTIONS[location.pathname] || SUGGESTIONS.default;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const fetchOpts = (method, body) => ({
    method: method || 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API}/api/orchestrator/sessions`, fetchOpts());
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
    setSessionsLoading(false);
  };

  const loadSession = async (sessionId) => {
    try {
      const res = await fetch(`${API}/api/orchestrator/sessions/${sessionId}`, fetchOpts());
      if (res.ok) {
        const data = await res.json();
        setActiveSession(sessionId);
        setMessages(
          (data.messages || []).map((m) => ({
            role: m.role,
            content: m.content,
            steps: m.steps || [],
          }))
        );
        setView('chat');
      }
    } catch (e) {
      console.error('Failed to load session', e);
    }
  };

  const deleteSession = async (sessionId, e) => {
    e.stopPropagation();
    try {
      await fetch(`${API}/api/orchestrator/sessions/${sessionId}`, fetchOpts('DELETE'));
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      if (activeSession === sessionId) {
        setActiveSession(null);
        setMessages([]);
      }
    } catch (e) {
      console.error('Failed to delete session', e);
    }
  };

  const startNewChat = () => {
    setActiveSession(null);
    setMessages([]);
    setView('chat');
  };

  const sendMessage = async (text) => {
    const content = text || input.trim();
    if (!content || loading) return;
    setInput('');

    const userMsg = { role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/orchestrator/chat`, fetchOpts('POST', {
        message: content,
        session_id: activeSession,
        page_context: pageContext,
      }));

      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();

      if (!activeSession && data.session_id) {
        setActiveSession(data.session_id);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          steps: data.steps || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.', steps: [] },
      ]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatResponse = (text) => {
    if (!text) return null;
    // Convert markdown-ish to HTML
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('### ')) return <h4 key={i} className="text-sm font-semibold text-white mt-3 mb-1" style={{ fontFamily: 'Outfit' }}>{line.slice(4)}</h4>;
      if (line.startsWith('## ')) return <h3 key={i} className="text-sm font-semibold text-white mt-3 mb-1" style={{ fontFamily: 'Outfit' }}>{line.slice(3)}</h3>;
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="text-xs font-semibold text-zinc-200 mt-2">{line.slice(2, -2)}</p>;
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const content = line.slice(2);
        // Bold sections in list items
        const boldParts = content.split(/\*\*(.*?)\*\*/g);
        return (
          <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-300 ml-2 mt-0.5">
            <span className="text-indigo-400 mt-0.5 flex-shrink-0">&#8226;</span>
            <span>
              {boldParts.map((part, j) =>
                j % 2 === 1 ? <strong key={j} className="text-zinc-100">{part}</strong> : part
              )}
            </span>
          </div>
        );
      }
      if (line.match(/^\d+\.\s/)) {
        const content = line.replace(/^\d+\.\s/, '');
        const boldParts = content.split(/\*\*(.*?)\*\*/g);
        return (
          <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-300 ml-2 mt-0.5">
            <span className="text-cyan-400 flex-shrink-0 text-[10px] font-mono">{line.match(/^\d+/)[0]}.</span>
            <span>
              {boldParts.map((part, j) =>
                j % 2 === 1 ? <strong key={j} className="text-zinc-100">{part}</strong> : part
              )}
            </span>
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} className="h-1.5" />;
      // Inline bold
      const boldParts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <p key={i} className="text-xs text-zinc-300 mt-0.5">
          {boldParts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} className="text-zinc-100">{part}</strong> : part
          )}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        data-testid="copilot-trigger-btn"
        onClick={() => { setOpen(true); if (view === 'history') fetchSessions(); }}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
          open ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'
        } bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-[0_0_24px_rgba(99,102,241,0.4)]`}
        style={{ transitionProperty: 'transform, opacity, box-shadow, background-color' }}
      >
        <Sparkles className="w-5 h-5" />
      </button>

      {/* Sidebar overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:bg-transparent lg:pointer-events-none"
          onClick={() => setOpen(false)}
          data-testid="copilot-overlay"
        />
      )}

      {/* Sidebar panel */}
      <div
        data-testid="copilot-sidebar"
        className={`fixed top-0 right-0 h-full z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: 'min(400px, 90vw)' }}
      >
        <div className="flex flex-col h-full bg-[#0a0a0c] border-l border-white/[0.06] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between h-12 px-3 border-b border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2">
              {view === 'history' && (
                <button
                  onClick={() => setView('chat')}
                  className="p-1 text-zinc-500 hover:text-white transition-colors"
                  data-testid="copilot-back-btn"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-white" style={{ fontFamily: 'Outfit' }}>
                  {view === 'history' ? 'Chat History' : 'InFlow AI'}
                </span>
              </div>
              {view === 'chat' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-medium ml-1">
                  Opus 4.6
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {view === 'chat' && (
                <>
                  <button
                    onClick={() => { setView('history'); fetchSessions(); }}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Chat history"
                    data-testid="copilot-history-btn"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  <button
                    onClick={startNewChat}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="New chat"
                    data-testid="copilot-new-chat-btn"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                data-testid="copilot-close-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* History view */}
          {view === 'history' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-xs text-zinc-500">No conversations yet</p>
                </div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.session_id}
                    onClick={() => loadSession(s.session_id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors group ${
                      activeSession === s.session_id
                        ? 'bg-white/[0.06] text-white'
                        : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                    }`}
                    data-testid={`session-${s.session_id}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs truncate flex-1">{s.title}</span>
                    <button
                      onClick={(e) => deleteSession(s.session_id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all"
                      data-testid={`delete-session-${s.session_id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Chat view */}
          {view === 'chat' && (
            <>
              {/* Messages area */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && (
                  <div className="py-6">
                    <div className="text-center mb-5">
                      <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center mx-auto mb-2">
                        <Sparkles className="w-5 h-5 text-indigo-400" />
                      </div>
                      <p className="text-sm font-medium text-white" style={{ fontFamily: 'Outfit' }}>
                        Ask me anything
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Viewing: {pageContext}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors border border-white/[0.04] hover:border-white/[0.08]"
                          data-testid={`suggestion-${i}`}
                        >
                          <ChevronRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[90%] rounded-lg px-3 py-2 ${
                        m.role === 'user'
                          ? 'bg-indigo-600/20 border border-indigo-500/20 text-zinc-100'
                          : 'bg-white/[0.03] border border-white/[0.06]'
                      }`}
                      data-testid={`message-${m.role}-${i}`}
                    >
                      {m.role === 'user' ? (
                        <p className="text-xs">{m.content}</p>
                      ) : (
                        <>
                          {m.steps && m.steps.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {m.steps.map((s, j) => (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/10 text-[10px] text-cyan-400"
                                  title={s.summary}
                                >
                                  <Wrench className="w-2.5 h-2.5" />
                                  {s.tool.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                          <div>{formatResponse(m.content)}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start" data-testid="copilot-loading">
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                        <span className="text-[11px] text-zinc-500">Investigating...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-white/[0.06] p-3 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your pipeline, deals, revenue..."
                    rows={1}
                    className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-indigo-500/40 transition-colors"
                    style={{ maxHeight: '80px', minHeight: '36px' }}
                    data-testid="copilot-input"
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || loading}
                    className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white transition-colors"
                    data-testid="copilot-send-btn"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5 text-center">
                  Powered by Claude Opus 4.6 &middot; Read-only mode
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
