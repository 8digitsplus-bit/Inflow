import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import {
  Send,
  Plus,
  MessageSquare,
  Ticket,
  Loader2,
  Clock,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Zap,
  CreditCard,
  Plug,
  XCircle,
  Bot,
  Search,
  Database,
  TrendingUp,
  Activity,
  BarChart3,
  FileSearch,
  ArrowRightLeft,
  BrainCircuit,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TOOL_ICONS = {
  query_deals: BarChart3,
  get_analytics_summary: TrendingUp,
  check_integrations: Plug,
  get_revenue_breakdown: TrendingUp,
  get_churn_analysis: Activity,
  get_deal_details: FileSearch,
  update_deal_stage: ArrowRightLeft,
  get_forecast: TrendingUp,
  search_deals: Search,
  remember: Database,
  recall_memory: Database,
  escalate_to_ticket: AlertCircle,
};

const TOOL_LABELS = {
  query_deals: 'Querying deals',
  get_analytics_summary: 'Analyzing pipeline',
  check_integrations: 'Checking integrations',
  get_revenue_breakdown: 'Analyzing revenue',
  get_churn_analysis: 'Assessing churn risk',
  get_deal_details: 'Looking up deal',
  update_deal_stage: 'Updating deal',
  get_forecast: 'Running forecast',
  search_deals: 'Searching deals',
  remember: 'Saving to memory',
  recall_memory: 'Loading memories',
  escalate_to_ticket: 'Escalating to ticket',
};

const Support = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('chat');
  const [agentMode, setAgentMode] = useState(true);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: '', description: '' });
  const messagesEndRef = useRef(null);

  const isPriority = user?.subscription_tier?.includes('pro') || user?.subscription_tier?.includes('enterprise');

  const fetchData = useCallback(async () => {
    try {
      const [convRes, ticketRes] = await Promise.all([
        fetch(`${API_URL}/api/support/conversations`, { credentials: 'include' }),
        fetch(`${API_URL}/api/support/tickets`, { credentials: 'include' }),
      ]);
      if (convRes.ok) setConversations(await convRes.json());
      if (ticketRes.ok) setTickets(await ticketRes.json());
    } catch (err) {
      console.error('Failed to fetch support data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversation = async (convId) => {
    try {
      const res = await fetch(`${API_URL}/api/support/conversations/${convId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setActiveConv(convId);
        setMessages(data.messages || []);
        setAgentMode(data.mode === 'agent' || convId.startsWith('agent_'));
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  };

  const startNewConversation = () => {
    setActiveConv(null);
    setMessages([]);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg = input.trim();
    setInput('');
    setSending(true);

    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date().toISOString() }]);

    const endpoint = agentMode ? '/api/support/agent' : '/api/support/chat';

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: userMsg, conversation_id: activeConv }),
      });

      if (res.ok) {
        const data = await res.json();
        if (!activeConv) setActiveConv(data.conversation_id);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response,
          actions: data.actions || [],
          steps: data.steps || [],
          mode: data.mode || (agentMode ? 'agent' : 'chat'),
          escalated: data.escalated || null,
          memory_saved: data.memory_saved || false,
          timestamp: new Date().toISOString(),
        }]);
        if (data.escalated) {
          toast.success(`Issue auto-escalated to support ticket`);
        }
        fetchData();
      } else {
        toast.error('Failed to send message');
        setMessages(prev => prev.slice(0, -1));
      }
    } catch {
      toast.error('Failed to connect to support');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const executeAction = async (action) => {
    const params = {};
    if (action.type === 'upgrade') params.plan = action.param;
    if (action.type === 'connect') params.platform = action.param;

    try {
      const res = await fetch(`${API_URL}/api/support/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: action.type, params, conversation_id: activeConv }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success(data.message);
          if (data.redirect) setTimeout(() => { window.location.href = data.redirect; }, 1000);
        } else {
          toast.error(data.message);
        }
      }
    } catch {
      toast.error('Failed to execute action');
    }
  };

  const getActionButton = (action) => {
    if (action.type === 'upgrade') {
      const planLabel = (action.param || '').replace('_monthly', ' Monthly').replace('_yearly', ' Yearly').replace(/^\w/, c => c.toUpperCase());
      return { label: `Upgrade to ${planLabel}`, icon: CreditCard, color: 'bg-emerald-600 hover:bg-emerald-500' };
    }
    if (action.type === 'cancel') return { label: 'Cancel Subscription', icon: XCircle, color: 'bg-red-600 hover:bg-red-500' };
    if (action.type === 'connect') return { label: `Connect ${(action.param || '').replace(/^\w/, c => c.toUpperCase())}`, icon: Plug, color: 'bg-cyan-600 hover:bg-cyan-500' };
    return null;
  };

  const createTicket = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/support/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...ticketForm, conversation_id: activeConv }),
      });
      if (res.ok) {
        toast.success('Support ticket created');
        setShowTicketModal(false);
        setTicketForm({ subject: '', description: '' });
        fetchData();
      }
    } catch {
      toast.error('Failed to create ticket');
    }
  };

  const statusIcon = {
    open: <AlertCircle className="w-3.5 h-3.5 text-amber-400" />,
    'in-progress': <Clock className="w-3.5 h-3.5 text-indigo-400" />,
    resolved: <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />,
  };

  const statusColor = {
    open: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'in-progress': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };

  const AgentSteps = ({ steps }) => {
    if (!steps?.length) return null;
    return (
      <div className="mt-2 mb-3 space-y-1.5" data-testid="agent-steps">
        <p className="text-[10px] uppercase tracking-wider text-indigo-400/70 font-medium">Investigation</p>
        {steps.map((step, i) => {
          const Icon = TOOL_ICONS[step.tool] || Database;
          const label = TOOL_LABELS[step.tool] || step.tool;
          return (
            <div key={i} className="flex items-center gap-2 text-xs" data-testid={`agent-step-${i}`}>
              <div className="w-5 h-5 rounded bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3 h-3 text-indigo-400" />
              </div>
              <span className="text-zinc-500">{label}</span>
              <span className="text-zinc-600 mx-1">-</span>
              <span className="text-zinc-400 truncate">{step.summary}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="support-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
                Smart Assist
              </h1>
              {isPriority && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 text-xs rounded-full" data-testid="priority-badge">
                  <Zap className="w-3 h-3" /> Priority
                </span>
              )}
            </div>
            <p className="text-zinc-400 mt-1 text-sm">AI-powered support — chat or let the agent investigate your data</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={view === 'chat' ? 'default' : 'outline'}
              size="sm"
              className={view === 'chat' ? 'bg-indigo-600 hover:bg-indigo-500' : 'border-zinc-700 text-zinc-400 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30'}
              onClick={() => setView('chat')}
              data-testid="view-chat-btn"
            >
              <MessageSquare className="w-4 h-4 mr-1.5" /> Chat
            </Button>
            <Button
              variant={view === 'tickets' ? 'default' : 'outline'}
              size="sm"
              className={view === 'tickets' ? 'bg-indigo-600 hover:bg-indigo-500' : 'border-zinc-700 text-zinc-400 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30'}
              onClick={() => setView('tickets')}
              data-testid="view-tickets-btn"
            >
              <Ticket className="w-4 h-4 mr-1.5" /> Tickets {tickets.length > 0 && `(${tickets.length})`}
            </Button>
          </div>
        </div>

        {view === 'chat' ? (
          <div className="grid lg:grid-cols-[280px_1fr] gap-4">
            {/* Conversation List */}
            <Card className="bg-zinc-950/50 border-white/10 hidden lg:block" data-testid="conversation-list">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Conversations</CardTitle>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-zinc-400 hover:text-white" onClick={startNewConversation} data-testid="new-chat-btn">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-2 space-y-1 max-h-[500px] overflow-y-auto">
                {conversations.length === 0 && (
                  <p className="text-zinc-600 text-xs text-center py-4">No conversations yet</p>
                )}
                {conversations.map((c) => (
                  <button
                    key={c.conversation_id}
                    onClick={() => loadConversation(c.conversation_id)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all text-sm ${
                      activeConv === c.conversation_id ? 'bg-indigo-500/10 border border-indigo-500/20' : 'hover:bg-white/5 border border-transparent'
                    }`}
                    data-testid={`conv-${c.conversation_id}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.conversation_id?.startsWith('agent_') && <BrainCircuit className="w-3 h-3 text-violet-400 flex-shrink-0" />}
                      <p className="text-zinc-300 text-xs truncate">{c.last_message || 'New conversation'}</p>
                    </div>
                    <p className="text-zinc-600 text-[10px] mt-1">{new Date(c.updated_at).toLocaleDateString()}</p>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Chat Area */}
            <Card className="bg-zinc-950/50 border-white/10" data-testid="chat-area">
              <CardContent className="p-0 flex flex-col" style={{ height: 'calc(100vh - 260px)', minHeight: '400px' }}>
                {/* Chat Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${agentMode ? 'bg-violet-500/20' : 'bg-indigo-500/20'}`}>
                      {agentMode ? <BrainCircuit className="w-4 h-4 text-violet-400" /> : <Sparkles className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{agentMode ? 'InFlow Agent' : 'InFlow AI Support'}</p>
                      <p className="text-[10px] text-emerald-400">Online</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Agent Mode Toggle */}
                    <button
                      onClick={() => setAgentMode(!agentMode)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        agentMode
                          ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                          : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                      }`}
                      data-testid="agent-mode-toggle"
                    >
                      <BrainCircuit className="w-3 h-3" />
                      {agentMode ? 'Agent' : 'Basic'}
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-zinc-700 text-zinc-400 text-xs h-7 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30"
                      onClick={() => setShowTicketModal(true)}
                      data-testid="escalate-btn"
                    >
                      <Ticket className="w-3 h-3 mr-1" /> Create Ticket
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-zinc-400 text-xs lg:hidden" onClick={startNewConversation}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> New
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${agentMode ? 'bg-violet-500/10' : 'bg-indigo-500/10'}`}>
                        {agentMode ? <BrainCircuit className="w-8 h-8 text-violet-400" /> : <Sparkles className="w-8 h-8 text-indigo-400" />}
                      </div>
                      <h3 className="text-white font-semibold mb-1" style={{ fontFamily: 'Outfit' }}>
                        {agentMode ? 'What should I investigate?' : 'How can I help?'}
                      </h3>
                      <p className="text-zinc-500 text-sm max-w-sm mb-6">
                        {agentMode
                          ? "I can query your data, analyze trends, check integrations, and take actions. Ask me anything about your business."
                          : "I know everything about InFlow — ask me about features, billing, your account, or any issue you're facing."
                        }
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center max-w-md">
                        {(agentMode
                          ? ['How is my pipeline doing?', 'Which deals are at risk?', 'Run a revenue forecast', 'Check my integrations']
                          : ['Upgrade my plan', 'Connect my Stripe', 'What features are in my plan?', 'Cancel my subscription']
                        ).map((q) => (
                          <button
                            key={q}
                            onClick={() => setInput(q)}
                            className="px-3 py-1.5 rounded-full bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 text-xs hover:bg-zinc-800 hover:text-white transition-all"
                            data-testid={`quick-q-${q.slice(0, 15).replace(/\s/g, '-').replace(/\?/g, '')}`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] sm:max-w-[75%] ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 rounded-2xl rounded-br-md px-4 py-2.5'
                          : 'bg-zinc-800/70 border border-white/5 rounded-2xl rounded-bl-md px-4 py-2.5'
                      }`}>
                        {/* Agent Mode Badge */}
                        {msg.role === 'assistant' && msg.mode === 'agent' && (
                          <div className="flex items-center gap-1.5 mb-2">
                            <BrainCircuit className="w-3 h-3 text-violet-400" />
                            <span className="text-[10px] text-violet-400 font-medium uppercase tracking-wider">Agent Analysis</span>
                          </div>
                        )}

                        {/* Investigation Steps */}
                        {msg.role === 'assistant' && <AgentSteps steps={msg.steps} />}

                        {/* Message Content */}
                        <div className={`text-sm leading-relaxed ${
                          msg.role === 'user' ? 'text-white' : 'text-zinc-200'
                        }`}>
                          {msg.content?.split('\n').map((line, li) => {
                            const renderBold = (text) => {
                              const parts = text.split(/\*\*(.*?)\*\*/g);
                              return parts.map((p, pi) => pi % 2 === 1 ? <strong key={pi} className="text-white font-semibold">{p}</strong> : p);
                            };
                            if (line.startsWith('## ')) return <h3 key={li} className="text-white font-semibold text-base mt-3 mb-1" style={{ fontFamily: 'Outfit' }}>{renderBold(line.replace('## ', ''))}</h3>;
                            if (line.startsWith('### ')) return <h4 key={li} className="text-white font-medium text-sm mt-2 mb-0.5">{renderBold(line.replace('### ', ''))}</h4>;
                            if (line.startsWith('---')) return <hr key={li} className="border-white/5 my-2" />;
                            if (line.match(/^\d+\.\s/)) return <p key={li} className="text-zinc-300 text-sm ml-1 my-0.5">{renderBold(line)}</p>;
                            if (line.startsWith('- ')) return <p key={li} className="text-zinc-300 text-sm ml-2 my-0.5">{renderBold(line)}</p>;
                            if (line.trim() === '') return <div key={li} className="h-1.5" />;
                            return <p key={li} className="my-0.5">{renderBold(line)}</p>;
                          })}
                        </div>

                        {/* Action Buttons */}
                        {msg.actions?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-white/5">
                            {msg.actions.map((action, j) => {
                              const btn = getActionButton(action);
                              if (!btn) return null;
                              const Icon = btn.icon;
                              return (
                                <button
                                  key={j}
                                  onClick={() => executeAction(action)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-all ${btn.color}`}
                                  data-testid={`action-btn-${action.type}-${action.param || ''}`}
                                >
                                  <Icon className="w-3.5 h-3.5" /> {btn.label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Auto-Escalation Card */}
                        {msg.escalated && (
                          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg" data-testid="escalation-card">
                            <div className="flex items-center gap-2 mb-1.5">
                              <AlertCircle className="w-4 h-4 text-amber-400" />
                              <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Auto-Escalated</span>
                            </div>
                            <p className="text-zinc-300 text-xs">
                              Ticket <span className="text-white font-mono">{msg.escalated.ticket_id}</span> created with {msg.escalated.severity || 'medium'} severity.
                              Our team will review and follow up.
                            </p>
                          </div>
                        )}

                        {/* Memory Saved Indicator */}
                        {msg.memory_saved && (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-violet-400/70" data-testid="memory-saved-indicator">
                            <Database className="w-3 h-3" />
                            <span>Context saved to memory</span>
                          </div>
                        )}

                        <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-indigo-200' : 'text-zinc-600'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}

                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-800/70 border border-white/5 rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                          <span className="text-zinc-400 text-sm">
                            {agentMode ? 'Investigating...' : 'Thinking...'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <form onSubmit={sendMessage} className="px-4 py-3 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={agentMode ? "Ask the agent to investigate..." : "Ask anything about InFlow..."}
                      className="bg-zinc-800/50 border-zinc-700 text-white flex-1"
                      disabled={sending}
                      data-testid="chat-input"
                    />
                    <Button type="submit" size="sm" className={`h-9 w-9 p-0 ${agentMode ? 'bg-violet-600 hover:bg-violet-500' : 'bg-indigo-600 hover:bg-indigo-500'}`} disabled={sending || !input.trim()} data-testid="send-btn">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Tickets View */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-zinc-400 text-sm">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-sm" onClick={() => setShowTicketModal(true)} data-testid="create-ticket-btn">
                <Plus className="w-4 h-4 mr-1.5" /> New Ticket
              </Button>
            </div>

            {tickets.length === 0 && (
              <Card className="bg-zinc-950/50 border-white/10">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Ticket className="w-10 h-10 text-zinc-700 mb-3" />
                  <p className="text-zinc-400 text-sm mb-1">No tickets yet</p>
                  <p className="text-zinc-600 text-xs">Chat with AI support first — create a ticket if the issue needs attention</p>
                </CardContent>
              </Card>
            )}

            {tickets.map((t) => (
              <Card key={t.ticket_id} className="bg-zinc-950/50 border-white/10 hover:border-white/15 transition-all" data-testid={`ticket-${t.ticket_id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-medium text-sm truncate">{t.subject}</h4>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColor[t.status] || statusColor.open}`}>
                          {statusIcon[t.status]} {t.status}
                        </span>
                        {t.priority === 'priority' && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 text-[10px] rounded-full border border-indigo-500/20">
                            <Zap className="w-2.5 h-2.5" /> Priority
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-500 text-xs line-clamp-2">{t.description}</p>
                      <p className="text-zinc-600 text-[10px] mt-2">Created {new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Ticket Modal */}
        <Dialog open={showTicketModal} onOpenChange={setShowTicketModal}>
          <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white" style={{ fontFamily: 'Outfit' }}>Create Support Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={createTicket} className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Subject</label>
                <Input
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  placeholder="Brief description of the issue"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                  data-testid="ticket-subject-input"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Description</label>
                <textarea
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                  placeholder="Describe your issue in detail..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md p-3 text-sm resize-none h-28"
                  required
                  data-testid="ticket-description-input"
                />
              </div>
              {activeConv && (
                <p className="text-xs text-zinc-500 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> This ticket will be linked to your current chat conversation
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowTicketModal(false)} className="border-zinc-700 text-zinc-300 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30">Cancel</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500" data-testid="submit-ticket-btn">Submit Ticket</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Support;
