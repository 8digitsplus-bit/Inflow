import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import {
  Send,
  Plus,
  Loader2,
  AlertCircle,
  Sparkles,
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
  Lock,
  UserRound,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { talkToHuman } from '../lib/featurebase';

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
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agentMode, setAgentMode] = useState(false);
  const messagesEndRef = useRef(null);

  // Smart Assist AI (the data-investigating Agent mode) is Enterprise-only.
  const isEnterprise = user?.subscription_tier?.includes('enterprise');

  // Default to Agent mode for Enterprise users; everyone else uses basic chat.
  useEffect(() => { setAgentMode(isEnterprise); }, [isEnterprise]);

  const fetchData = useCallback(async () => {
    try {
      const convRes = await fetch(`${API_URL}/api/support/conversations`, { credentials: 'include' });
      if (convRes.ok) setConversations(await convRes.json());
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
        setAgentMode((data.mode === 'agent' || convId.startsWith('agent_')) && isEnterprise);
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
          toast.info('Need a person? Tap "Talk to a human" to reach the InFlow team.');
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

  const AgentSteps = ({ steps }) => {
    if (!steps?.length) return null;
    return (
      <div className="mt-2 mb-3 space-y-1.5" data-testid="agent-steps">
        <p className="text-[10px] uppercase tracking-wider text-slate-400/70 font-medium">Investigation</p>
        {steps.map((step, i) => {
          const Icon = TOOL_ICONS[step.tool] || Database;
          const label = TOOL_LABELS[step.tool] || step.tool;
          return (
            <div key={i} className="flex items-center gap-2 text-xs" data-testid={`agent-step-${i}`}>
              <div className="w-5 h-5 rounded bg-slate-500/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3 h-3 text-slate-400" />
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
            </div>
            <p className="text-zinc-400 mt-1 text-sm">AI answers instantly — talk to a human anytime</p>
          </div>
        </div>

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
                      activeConv === c.conversation_id ? 'bg-slate-500/10 border border-slate-500/20' : 'hover:bg-white/5 border border-transparent'
                    }`}
                    data-testid={`conv-${c.conversation_id}`}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.conversation_id?.startsWith('agent_') && <BrainCircuit className="w-3 h-3 text-violet-400 flex-shrink-0" />}
                      <p className="text-zinc-300 text-xs truncate">{c.last_message || 'New conversation'}</p>
                    </div>
                    <p className="text-zinc-600 text-[10px] mt-1">{new Date(c.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
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
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${agentMode ? 'bg-violet-500/20' : 'bg-slate-500/20'}`}>
                      {agentMode ? <BrainCircuit className="w-4 h-4 text-violet-400" /> : <Sparkles className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{agentMode ? 'InFlow Agent' : 'InFlow AI Support'}</p>
                      <p className="text-[10px] text-emerald-400">Online</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Agent Mode Toggle (Smart Assist AI — Enterprise only) */}
                    <button
                      onClick={() => {
                        if (!isEnterprise) {
                          toast.error('Smart Assist AI is an Enterprise feature. Upgrade to unlock the data-investigating agent.');
                          return;
                        }
                        setAgentMode(!agentMode);
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        !isEnterprise
                          ? 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:text-amber-300 hover:border-amber-500/30'
                          : agentMode
                          ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                          : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                      }`}
                      title={!isEnterprise ? 'Smart Assist AI — Enterprise only' : undefined}
                      data-testid="agent-mode-toggle"
                    >
                      {!isEnterprise ? <Lock className="w-3 h-3" /> : <BrainCircuit className="w-3 h-3" />}
                      {!isEnterprise ? 'Agent (Enterprise)' : agentMode ? 'Agent' : 'Basic'}
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-zinc-700 text-zinc-300 text-xs h-7 hover:bg-cyan-500/10 hover:text-cyan-300 hover:border-cyan-500/30"
                      onClick={() => talkToHuman()}
                      data-testid="talk-to-human-btn"
                    >
                      <UserRound className="w-3 h-3 mr-1" /> Talk to a human
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
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${agentMode ? 'bg-violet-500/10' : 'bg-slate-500/10'}`}>
                        {agentMode ? <BrainCircuit className="w-8 h-8 text-violet-400" /> : <Sparkles className="w-8 h-8 text-slate-400" />}
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
                          ? 'bg-slate-600 rounded-2xl rounded-br-md px-4 py-2.5'
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
                              <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Needs a human</span>
                            </div>
                            <p className="text-zinc-300 text-xs mb-2">
                              This needs a person. Send it to the InFlow team and we'll pick it up from here.
                            </p>
                            <button
                              onClick={() => talkToHuman(`Smart Assist escalated an issue (${msg.escalated.ticket_id}). ${msg.escalated.subject || ''}`.trim())}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-medium transition-colors"
                              data-testid="escalation-talk-human-btn"
                            >
                              <UserRound className="w-3.5 h-3.5" /> Talk to a human
                            </button>
                          </div>
                        )}

                        {/* Memory Saved Indicator */}
                        {msg.memory_saved && (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-violet-400/70" data-testid="memory-saved-indicator">
                            <Database className="w-3 h-3" />
                            <span>Context saved to memory</span>
                          </div>
                        )}

                        <p className={`text-[10px] mt-1.5 ${msg.role === 'user' ? 'text-slate-200' : 'text-zinc-600'}`}>
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
                    <Button type="submit" size="sm" className={`h-9 w-9 p-0 ${agentMode ? 'bg-white/15 hover:bg-white/25' : 'bg-white/10 hover:bg-white/20'}`} disabled={sending || !input.trim()} data-testid="send-btn">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

      </div>
    </DashboardLayout>
  );
};

export default Support;
