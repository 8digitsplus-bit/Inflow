import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  Plus, 
  MoreVertical, 
  DollarSign, 
  Calendar,
  Trash2,
  Edit2,
  Target,
  TrendingUp,
  ArrowUpRight,
  Layers,
  Briefcase,
  GripVertical,
  Loader2,
  Filter,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { STAGE_COLORS } from '../constants/colors';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STAGES = [
  { id: 'lead', label: 'Lead', color: STAGE_COLORS.lead, bg: 'bg-indigo-500' },
  { id: 'qualified', label: 'Qualified', color: STAGE_COLORS.qualified, bg: 'bg-violet-500' },
  { id: 'proposal', label: 'Proposal', color: STAGE_COLORS.proposal, bg: 'bg-cyan-500' },
  { id: 'negotiation', label: 'Negotiation', color: STAGE_COLORS.negotiation, bg: 'bg-amber-500' },
  { id: 'closed_won', label: 'Closed Win', color: STAGE_COLORS.closed_won, bg: 'bg-emerald-500' },
  { id: 'closed_lost', label: 'Closed Lost', color: STAGE_COLORS.closed_lost, bg: 'bg-red-500' },
];

const fmt = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl">
      <p className="text-zinc-400 text-sm mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: e.color || e.fill }}>
          {e.name}: {fmt(e.value)}
        </p>
      ))}
    </div>
  );
};

const Pipeline = () => {
  const { user } = useAuth();
  const [deals, setDeals] = useState([]);
  const [pipelineData, setPipelineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDealModal, setShowDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [draggedDeal, setDraggedDeal] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  
  const [dealForm, setDealForm] = useState({
    name: '', company: '', value: '', stage: 'lead',
    probability: 20, expected_close_date: '', notes: '',
  });

  useEffect(() => { fetchDeals(); fetchPipelineData(); }, []);

  const fetchDeals = async () => {
    try {
      const response = await fetch(`${API_URL}/api/deals`, { credentials: 'include' });
      if (response.ok) setDeals(await response.json());
    } catch (error) {
      console.error('Failed to fetch deals:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipelineData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/pipeline`, { credentials: 'include' });
      if (res.ok) setPipelineData(await res.json());
    } catch (e) { console.error('Failed to fetch pipeline data:', e); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingDeal 
        ? `${API_URL}/api/deals/${editingDeal.deal_id}`
        : `${API_URL}/api/deals`;
      const response = await fetch(url, {
        method: editingDeal ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...dealForm,
          value: parseFloat(dealForm.value) || 0,
          probability: parseInt(dealForm.probability) || 20,
        }),
      });
      if (response.ok) {
        toast.success(editingDeal ? 'Deal updated' : 'Deal created');
        fetchDeals();
        closeModal();
      } else {
        toast.error('Failed to save deal');
      }
    } catch {
      toast.error('Failed to save deal');
    }
  };

  const handleDelete = async (dealId) => {
    try {
      const response = await fetch(`${API_URL}/api/deals/${dealId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (response.ok) { toast.success('Deal deleted'); fetchDeals(); }
    } catch { toast.error('Failed to delete deal'); }
  };

  const handleDragStart = (deal) => setDraggedDeal(deal);
  const handleDragOver = (e, stageId) => { e.preventDefault(); setDragOverStage(stageId); };
  const handleDragLeave = () => setDragOverStage(null);

  const handleDrop = async (stageId) => {
    setDragOverStage(null);
    if (!draggedDeal || draggedDeal.stage === stageId) { setDraggedDeal(null); return; }
    try {
      const response = await fetch(`${API_URL}/api/deals/${draggedDeal.deal_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stage: stageId }),
      });
      if (response.ok) {
        toast.success(`Moved to ${STAGES.find(s => s.id === stageId)?.label}`);
        fetchDeals();
      }
    } catch { /* silent */ }
    setDraggedDeal(null);
  };

  const openEditModal = (deal) => {
    setEditingDeal(deal);
    setDealForm({
      name: deal.name, company: deal.company, value: deal.value.toString(),
      stage: deal.stage, probability: deal.probability,
      expected_close_date: deal.expected_close_date || '', notes: deal.notes || '',
    });
    setShowDealModal(true);
  };

  const closeModal = () => {
    setShowDealModal(false);
    setEditingDeal(null);
    setDealForm({ name: '', company: '', value: '', stage: 'lead', probability: 20, expected_close_date: '', notes: '' });
  };

  const getDealsByStage = (stageId) => deals.filter(d => d.stage === stageId);
  const getStageTotal = (stageId) => getDealsByStage(stageId).reduce((s, d) => s + d.value, 0);

  const stats = useMemo(() => {
    const total = deals.reduce((s, d) => s + d.value, 0);
    const won = deals.filter(d => d.stage === 'closed_won');
    const wonValue = won.reduce((s, d) => s + d.value, 0);
    const active = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
    const activeValue = active.reduce((s, d) => s + d.value, 0);
    const avgDeal = deals.length ? total / deals.length : 0;
    const winRate = deals.length ? ((won.length / deals.length) * 100).toFixed(1) : 0;
    const weighted = active.reduce((s, d) => s + (d.value * (d.probability / 100)), 0);
    return { total, wonValue, activeCount: active.length, activeValue, avgDeal, winRate, totalDeals: deals.length, weighted };
  }, [deals]);

  const funnelData = useMemo(() => {
    return STAGES.filter(s => s.id !== 'closed_lost').map(stage => ({
      name: stage.label,
      value: getStageTotal(stage.id),
      count: getDealsByStage(stage.id).length,
      color: stage.color,
    }));
  }, [deals]);

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="pipeline-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Sales Pipeline
            </h1>
            <p className="text-zinc-400 mt-1 text-sm">Manage, track, and close your deals</p>
          </div>
          <Button
            className="bg-indigo-600 hover:bg-indigo-500 text-sm h-9 px-4 w-auto self-start sm:self-auto"
            onClick={() => setShowDealModal(true)}
            data-testid="add-deal-btn"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add Deal
          </Button>
        </div>

        {/* KPI Cards — Pipeline Specific */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-pipeline-value">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Pipeline Value</span>
                <div className="p-1.5 rounded bg-indigo-500/10"><DollarSign className="w-4 h-4 text-indigo-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">{fmt(stats.total)}</div>
              <div className="text-zinc-500 text-xs mt-1">{stats.activeCount} active deals</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-weighted">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Weighted Pipeline</span>
                <div className="p-1.5 rounded bg-emerald-500/10"><Target className="w-4 h-4 text-emerald-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">{fmt(stats.weighted)}</div>
              <div className="text-zinc-500 text-xs mt-1">Probability-adjusted</div>
            </CardContent>
          </Card>
          <Card className={`bg-zinc-950/50 border-white/10 ${pipelineData?.bottleneck_stuck_count > 0 ? 'border-amber-500/20' : ''}`} data-testid="kpi-bottleneck">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-xs sm:text-sm">Bottleneck</span>
                <div className={`p-1.5 rounded ${pipelineData?.bottleneck_stuck_count > 0 ? 'bg-amber-500/10' : 'bg-zinc-800'}`}>
                  <Filter className={`w-4 h-4 ${pipelineData?.bottleneck_stuck_count > 0 ? 'text-amber-400' : 'text-zinc-500'}`} />
                </div>
              </div>
              <div className="text-lg sm:text-2xl font-bold text-white truncate" style={{ fontFamily: 'Outfit' }}>
                {pipelineData?.bottleneck_stage || 'None'}
              </div>
              <div className={`text-xs mt-1 ${pipelineData?.bottleneck_stuck_count > 0 ? 'text-amber-400' : 'text-zinc-500'}`}>
                {pipelineData?.bottleneck_stuck_count || 0} deals stuck 14+ days
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-950/50 border-white/10" data-testid="kpi-conversion">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-sm">Top Conversion</span>
                <div className="p-1.5 rounded bg-cyan-500/10"><ChevronRight className="w-4 h-4 text-cyan-400" /></div>
              </div>
              <div className="text-lg sm:text-2xl font-bold font-mono text-white">
                {pipelineData?.conversion_rates?.[0]?.rate || 0}%
              </div>
              <div className="text-zinc-500 text-xs mt-1">
                from {pipelineData?.conversion_rates?.[0]?.from_stage || 'Lead'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Velocity + Conversion Rates */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="bg-zinc-950/50 border-white/10" data-testid="velocity-section">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Layers className="w-4 h-4 text-indigo-400" /> Stage Velocity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={(pipelineData?.pipeline_velocity || []).map(v => ({ ...v, stage: v.stage?.replace('Closed ', '') }))} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="stage" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}d`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 10px', fontSize: '11px' }}
                      itemStyle={{ color: '#e4e4e7' }}
                      cursor={{ stroke: '#27272A' }}
                      formatter={(v, name) => [name === 'avg_days' ? `${v} days avg` : `${v} deals`, name === 'avg_days' ? 'Velocity' : 'Deals']}
                    />
                    <Line type="monotone" dataKey="avg_days" name="avg_days" stroke="#6366F1" strokeWidth={2} dot={{ r: 5, fill: '#6366F1', stroke: '#0c0c10', strokeWidth: 2 }} activeDot={{ r: 7, stroke: '#6366F1', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {(pipelineData?.pipeline_velocity || []).some(v => v.stuck_count > 0) && (
                <div className="flex flex-wrap gap-3 mt-3">
                  {(pipelineData?.pipeline_velocity || []).filter(v => v.stuck_count > 0).map((v, i) => (
                    <span key={i} className="text-amber-400/70 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/15">{v.stage}: {v.stuck_count} stuck 14+ days</span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="conversion-section">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <ChevronRight className="w-4 h-4 text-cyan-400" /> Stage Conversion Rates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(pipelineData?.conversion_rates || []).map((c, i) => {
                const stageObj = STAGES.find(s => s.id === c.from_stage?.toLowerCase()?.replace(/\s/g, '_'));
                const barColor = stageObj?.color || '#6366F1';
                return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-300">{c.from_stage} &rarr; next</span>
                    <span className={`font-mono font-medium ${c.rate > 60 ? 'text-emerald-400' : c.rate > 30 ? 'text-zinc-400' : 'text-red-400'}`}>{c.rate}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{
                      width: `${c.rate}%`,
                      backgroundColor: barColor,
                    }} />
                  </div>
                </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Funnel Chart + Weighted Value */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="bg-zinc-950/50 border-white/10 lg:col-span-2" data-testid="pipeline-funnel-chart">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Filter className="w-5 h-5 text-indigo-400" /> Pipeline by Stage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(() => {
                  const maxVal = Math.max(...funnelData.map(d => d.value), 1);
                  return funnelData.map((d, i) => {
                    const widthPct = Math.max((d.value / maxVal) * 100, 15);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-20 text-right shrink-0">{d.name}</span>
                        <div className="flex-1 relative h-9">
                          <div
                            className="absolute inset-y-0 left-0 rounded-r-lg flex items-center px-3 transition-all duration-700 cursor-default"
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: d.color,
                              opacity: 0.85,
                              clipPath: `polygon(0 0, 100% 8%, 100% 92%, 0 100%)`,
                            }}
                            title={`${d.name}: ${fmt(d.value)} (${d.count} deals)`}
                          >
                            <span className="text-xs font-mono text-white font-medium">
                              ${d.value >= 1000 ? `${(d.value / 1000).toFixed(0)}k` : d.value}
                            </span>
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-500 w-12 shrink-0">{d.count} deals</span>
                      </div>
                    );
                  });
                })()}
                {funnelData.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-4">No pipeline data yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950/50 border-white/10" data-testid="weighted-pipeline">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                <Target className="w-5 h-5 text-emerald-400" /> Weighted Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const SAMPLE_DATA = [
                  { name: 'Lead', color: STAGE_COLORS.lead, value: 28500 },
                  { name: 'Qualified', color: STAGE_COLORS.qualified, value: 64000 },
                  { name: 'Proposal', color: STAGE_COLORS.proposal, value: 115000 },
                  { name: 'Negotiation', color: STAGE_COLORS.negotiation, value: 82000 },
                ];

                const realData = STAGES.filter(s => !['closed_won', 'closed_lost'].includes(s.id)).map((stage) => {
                  const stageDeals = getDealsByStage(stage.id);
                  const stageWeighted = stageDeals.reduce((s, d) => s + (d.value * (d.probability / 100)), 0);
                  return { name: stage.label, color: stage.color, value: stageWeighted };
                }).filter(s => s.value > 0);

                const isSample = realData.length === 0;
                const chartData = isSample ? SAMPLE_DATA : realData;
                const total = chartData.reduce((s, d) => s + d.value, 0);

                return (
                  <div className="flex flex-col items-center">
                    {isSample && (
                      <span className="text-[10px] text-zinc-600 mb-1 px-2 py-0.5 rounded-full bg-zinc-800/60 border border-zinc-700/40">Sample data</span>
                    )}
                    <div className="relative">
                      <ResponsiveContainer width={240} height={240}>
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {chartData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0c0c10', border: '1px solid #3f3f46', borderRadius: '6px', padding: '6px 10px', fontSize: '11px' }}
                            formatter={(value) => [fmt(value), 'Weighted']}
                            itemStyle={{ color: '#e4e4e7' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-sm font-bold font-mono text-white">{fmt(total)}</span>
                        <span className="text-[9px] text-zinc-500">Weighted total</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-2">
                      {chartData.map((s, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-zinc-400">{s.name}</span>
                          <span className="text-zinc-500 font-mono">{fmt(s.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Kanban Board */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2 snap-x" data-testid="kanban-board">
            {STAGES.map((stage) => {
              const stageDeals = getDealsByStage(stage.id);
              const isDragOver = dragOverStage === stage.id;
              return (
                <div
                  key={stage.id}
                  className={`flex-shrink-0 w-[240px] sm:w-[280px] rounded-xl transition-all duration-200 snap-start ${
                    isDragOver ? 'bg-white/[0.04] ring-1 ring-indigo-500/30' : 'bg-zinc-950/30'
                  }`}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop(stage.id)}
                  data-testid={`stage-${stage.id}`}
                >
                  {/* Column Header */}
                  <div className="p-3 border-b border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor: stage.color }} />
                        <span className="text-sm font-semibold text-white" style={{ fontFamily: 'Outfit' }}>{stage.label}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400">{stageDeals.length}</span>
                      </div>
                      <span className="text-xs font-mono text-zinc-500">{fmt(getStageTotal(stage.id))}</span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="p-2 space-y-2 min-h-[120px] max-h-[480px] overflow-y-auto">
                    {stageDeals.map((deal) => (
                      <div
                        key={deal.deal_id}
                        className={`group relative bg-zinc-900/70 border border-white/[0.06] rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all duration-200 hover:border-white/15 hover:bg-zinc-900/90 ${
                          draggedDeal?.deal_id === deal.deal_id ? 'opacity-40 scale-95' : ''
                        }`}
                        draggable
                        onDragStart={() => handleDragStart(deal)}
                        data-testid={`deal-card-${deal.deal_id}`}
                      >
                        {/* Drag handle */}
                        <div className="absolute top-2.5 left-1 opacity-0 group-hover:opacity-40 transition-opacity">
                          <GripVertical className="w-3 h-3 text-zinc-500" />
                        </div>

                        <div className="flex items-start justify-between mb-1.5 pl-2">
                          <h4 className="text-white font-medium text-[13px] leading-tight pr-4 line-clamp-2">{deal.name}</h4>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity" data-testid={`deal-menu-${deal.deal_id}`}>
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                              <DropdownMenuItem onClick={() => openEditModal(deal)} className="text-zinc-300 hover:text-white focus:text-white">
                                <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(deal.deal_id)} className="text-red-400 hover:text-red-300 focus:text-red-300">
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <p className="text-zinc-500 text-[11px] pl-2 mb-2.5">{deal.company}</p>

                        <div className="flex items-center justify-between pl-2">
                          <span className="text-emerald-400 text-sm font-mono font-medium">{fmt(deal.value)}</span>
                          {deal.expected_close_date && (
                            <span className="flex items-center gap-1 text-zinc-600 text-[10px]">
                              <Calendar className="w-2.5 h-2.5" />
                              {deal.expected_close_date}
                            </span>
                          )}
                        </div>

                        {/* Probability bar */}
                        <div className="mt-2.5 pl-2">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="text-zinc-600">Probability</span>
                            <span className="text-zinc-400 font-medium">{deal.probability}%</span>
                          </div>
                          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${deal.probability}%`, backgroundColor: stage.color }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {stageDeals.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                        <Layers className="w-5 h-5 mb-2 opacity-40" />
                        <span className="text-xs">No deals</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Deal Modal */}
        <Dialog open={showDealModal} onOpenChange={setShowDealModal}>
          <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white" style={{ fontFamily: 'Outfit' }}>
                {editingDeal ? 'Edit Deal' : 'Add New Deal'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Deal Name</label>
                <Input value={dealForm.name} onChange={(e) => setDealForm({ ...dealForm, name: e.target.value })} placeholder="e.g., Enterprise Contract" className="bg-zinc-800 border-zinc-700 text-white" required data-testid="deal-name-input" />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Company</label>
                <Input value={dealForm.company} onChange={(e) => setDealForm({ ...dealForm, company: e.target.value })} placeholder="e.g., Acme Corp" className="bg-zinc-800 border-zinc-700 text-white" required data-testid="deal-company-input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Value ($)</label>
                  <Input type="number" value={dealForm.value} onChange={(e) => setDealForm({ ...dealForm, value: e.target.value })} placeholder="50000" className="bg-zinc-800 border-zinc-700 text-white" required data-testid="deal-value-input" />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Stage</label>
                  <Select value={dealForm.stage} onValueChange={(val) => setDealForm({ ...dealForm, stage: val })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="deal-stage-select"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {STAGES.map((s) => (<SelectItem key={s.id} value={s.id} className="text-zinc-300">{s.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Probability (%)</label>
                  <Input type="number" min="0" max="100" value={dealForm.probability} onChange={(e) => setDealForm({ ...dealForm, probability: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" data-testid="deal-probability-input" />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Expected Close</label>
                  <Input type="date" value={dealForm.expected_close_date} onChange={(e) => setDealForm({ ...dealForm, expected_close_date: e.target.value })} className="bg-zinc-800 border-zinc-700 text-white" data-testid="deal-date-input" />
                </div>
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Notes</label>
                <textarea value={dealForm.notes} onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })} placeholder="Add any notes about this deal..." className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md p-3 text-sm resize-none h-20" data-testid="deal-notes-input" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeModal} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">Cancel</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500" data-testid="deal-submit-btn">{editingDeal ? 'Update Deal' : 'Create Deal'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Pipeline;
