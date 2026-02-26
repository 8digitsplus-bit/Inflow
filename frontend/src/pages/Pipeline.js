import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { 
  Plus, 
  MoreVertical, 
  DollarSign, 
  Calendar,
  Trash2,
  Edit2,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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

const API_URL = process.env.REACT_APP_BACKEND_URL;

const STAGES = [
  { id: 'lead', label: 'Lead', color: '#6366F1' },
  { id: 'qualified', label: 'Qualified', color: '#8B5CF6' },
  { id: 'proposal', label: 'Proposal', color: '#06B6D4' },
  { id: 'negotiation', label: 'Negotiation', color: '#F59E0B' },
  { id: 'closed_won', label: 'Closed Won', color: '#10B981' },
  { id: 'closed_lost', label: 'Closed Lost', color: '#EF4444' }
];

const Pipeline = () => {
  const { user } = useAuth();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDealModal, setShowDealModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [draggedDeal, setDraggedDeal] = useState(null);
  
  const [dealForm, setDealForm] = useState({
    name: '',
    company: '',
    value: '',
    stage: 'lead',
    probability: 20,
    expected_close_date: '',
    notes: ''
  });

  useEffect(() => {
    fetchDeals();
  }, []);

  const fetchDeals = async () => {
    try {
      const response = await fetch(`${API_URL}/api/deals`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setDeals(data);
      }
    } catch (error) {
      console.error('Failed to fetch deals:', error);
    } finally {
      setLoading(false);
    }
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
          probability: parseInt(dealForm.probability) || 20
        })
      });

      if (response.ok) {
        toast.success(editingDeal ? 'Deal updated' : 'Deal created');
        fetchDeals();
        closeModal();
      } else {
        toast.error('Failed to save deal');
      }
    } catch (error) {
      console.error('Failed to save deal:', error);
      toast.error('Failed to save deal');
    }
  };

  const handleDelete = async (dealId) => {
    try {
      const response = await fetch(`${API_URL}/api/deals/${dealId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Deal deleted');
        fetchDeals();
      }
    } catch (error) {
      console.error('Failed to delete deal:', error);
      toast.error('Failed to delete deal');
    }
  };

  const handleDragStart = (deal) => {
    setDraggedDeal(deal);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (stageId) => {
    if (!draggedDeal || draggedDeal.stage === stageId) {
      setDraggedDeal(null);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/deals/${draggedDeal.deal_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ stage: stageId })
      });

      if (response.ok) {
        toast.success(`Moved to ${STAGES.find(s => s.id === stageId)?.label}`);
        fetchDeals();
      }
    } catch (error) {
      console.error('Failed to update deal:', error);
    }
    
    setDraggedDeal(null);
  };

  const openEditModal = (deal) => {
    setEditingDeal(deal);
    setDealForm({
      name: deal.name,
      company: deal.company,
      value: deal.value.toString(),
      stage: deal.stage,
      probability: deal.probability,
      expected_close_date: deal.expected_close_date || '',
      notes: deal.notes || ''
    });
    setShowDealModal(true);
  };

  const closeModal = () => {
    setShowDealModal(false);
    setEditingDeal(null);
    setDealForm({
      name: '',
      company: '',
      value: '',
      stage: 'lead',
      probability: 20,
      expected_close_date: '',
      notes: ''
    });
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(value);
  };

  const getDealsByStage = (stageId) => {
    return deals.filter(deal => deal.stage === stageId);
  };

  const getStageTotal = (stageId) => {
    return getDealsByStage(stageId).reduce((sum, deal) => sum + deal.value, 0);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="pipeline-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>
              Sales Pipeline
            </h1>
            <p className="text-zinc-400 mt-1">Manage and track your deals</p>
          </div>
          <Button 
            className="bg-indigo-600 hover:bg-indigo-500 btn-glow"
            onClick={() => setShowDealModal(true)}
            data-testid="add-deal-btn"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Deal
          </Button>
        </div>

        {/* Kanban Board */}
        <div className="kanban-board">
          {STAGES.map((stage) => (
            <div 
              key={stage.id}
              className="kanban-column"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(stage.id)}
              data-testid={`stage-${stage.id}`}
            >
              <div 
                className="kanban-column-header flex items-center justify-between"
                style={{ borderLeftWidth: '3px', borderLeftColor: stage.color }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{stage.label}</span>
                  <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full text-zinc-400">
                    {getDealsByStage(stage.id).length}
                  </span>
                </div>
                <span className="text-sm font-mono text-zinc-400">
                  {formatCurrency(getStageTotal(stage.id))}
                </span>
              </div>
              
              <div className="kanban-column-content">
                {getDealsByStage(stage.id).map((deal) => (
                  <div
                    key={deal.deal_id}
                    className={`deal-card ${draggedDeal?.deal_id === deal.deal_id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(deal)}
                    data-testid={`deal-card-${deal.deal_id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-white font-medium text-sm">{deal.name}</h4>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="text-zinc-500 hover:text-zinc-300" data-testid={`deal-menu-${deal.deal_id}`}>
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                          <DropdownMenuItem 
                            onClick={() => openEditModal(deal)}
                            className="text-zinc-300 hover:text-white focus:text-white"
                          >
                            <Edit2 className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(deal.deal_id)}
                            className="text-red-400 hover:text-red-300 focus:text-red-300"
                          >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    <p className="text-zinc-400 text-xs mb-3">{deal.company}</p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <DollarSign className="w-3 h-3" />
                        <span className="text-sm font-mono">{formatCurrency(deal.value)}</span>
                      </div>
                      {deal.expected_close_date && (
                        <div className="flex items-center gap-1 text-zinc-500 text-xs">
                          <Calendar className="w-3 h-3" />
                          {deal.expected_close_date}
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Probability</span>
                        <span className="text-zinc-300">{deal.probability}%</span>
                      </div>
                      <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${deal.probability}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {getDealsByStage(stage.id).length === 0 && (
                  <div className="text-center py-8 text-zinc-500 text-sm">
                    No deals in this stage
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

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
                <Input
                  value={dealForm.name}
                  onChange={(e) => setDealForm({ ...dealForm, name: e.target.value })}
                  placeholder="e.g., Enterprise Contract"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                  data-testid="deal-name-input"
                />
              </div>
              
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Company</label>
                <Input
                  value={dealForm.company}
                  onChange={(e) => setDealForm({ ...dealForm, company: e.target.value })}
                  placeholder="e.g., Acme Corp"
                  className="bg-zinc-800 border-zinc-700 text-white"
                  required
                  data-testid="deal-company-input"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Value ($)</label>
                  <Input
                    type="number"
                    value={dealForm.value}
                    onChange={(e) => setDealForm({ ...dealForm, value: e.target.value })}
                    placeholder="50000"
                    className="bg-zinc-800 border-zinc-700 text-white"
                    required
                    data-testid="deal-value-input"
                  />
                </div>
                
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Stage</label>
                  <Select 
                    value={dealForm.stage} 
                    onValueChange={(val) => setDealForm({ ...dealForm, stage: val })}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="deal-stage-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800">
                      {STAGES.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id} className="text-zinc-300">
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Probability (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={dealForm.probability}
                    onChange={(e) => setDealForm({ ...dealForm, probability: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-white"
                    data-testid="deal-probability-input"
                  />
                </div>
                
                <div>
                  <label className="text-sm text-zinc-400 mb-1.5 block">Expected Close</label>
                  <Input
                    type="date"
                    value={dealForm.expected_close_date}
                    onChange={(e) => setDealForm({ ...dealForm, expected_close_date: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-white"
                    data-testid="deal-date-input"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Notes</label>
                <textarea
                  value={dealForm.notes}
                  onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })}
                  placeholder="Add any notes about this deal..."
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md p-3 text-sm resize-none h-20"
                  data-testid="deal-notes-input"
                />
              </div>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={closeModal}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-indigo-600 hover:bg-indigo-500"
                  data-testid="deal-submit-btn"
                >
                  {editingDeal ? 'Update Deal' : 'Create Deal'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Pipeline;
