import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Target, 
  DollarSign, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu,
  Zap,
  Users,
  TrendingUp,
  Plug,
  Headphones,
  Lock,
  Tag,
  LineChart,
  MessageCircle,
  Radar,
  Swords,
  Rocket,
  Telescope,
  Workflow,
  ChevronDown,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Toaster } from './ui/sonner';
import TrialBanner from './TrialBanner';
import LegalBanner from './LegalBanner';

const TIER_LEVEL = {
  trial: 0, expired: -1, cancelled: -1, free: 0,
  essential_monthly: 1, essential_yearly: 1,
  pro_monthly: 2, pro_yearly: 2,
  enterprise_monthly: 3, enterprise_yearly: 3,
};

const navGroups = [
  {
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, minTier: 0 },
    ]
  },
  {
    label: 'Sales',
    items: [
      { name: 'Pipeline', href: '/pipeline', icon: Target, minTier: 0 },
      { name: 'Performance', href: '/sales-performance', icon: TrendingUp, minTier: 2 },
      { name: 'Revenue', href: '/sales-revenue', icon: DollarSign, minTier: 3 },
    ]
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Intelligence', href: '/revenue', icon: BarChart3, minTier: 0 },
      { name: 'Forecast', href: '/forecast', icon: LineChart, minTier: 2 },
      { name: 'Churn', href: '/churn', icon: Users, minTier: 1 },
      { name: 'CRO', href: '/cro', icon: Zap, minTier: 0 },
      { name: 'Pricing', href: '/pricing', icon: Tag, minTier: 2 },
      { name: 'Competitors', href: '/competitor-intel', icon: Swords, minTier: 3 },
    ]
  },
  {
    label: 'Revenue Execution',
    items: [
      { name: 'Upsell Engine', href: '/discover', icon: Rocket, minTier: 1 },
      { name: 'High-Intent Buyers', href: '/upsell', icon: Telescope, minTier: 3 },
      { name: 'Workspace', href: '/workspace', icon: Workflow, minTier: 1 },
    ]
  },
  {
    label: 'Tools',
    items: [
      { name: 'Integration', href: '/connect-business', icon: Plug, minTier: 0 },
      { name: 'Revenue Leaks', href: '/revenue-leaks', icon: Radar, minTier: 3 },
      { name: 'Smart Assist', href: '/support', icon: Headphones, minTier: 0 },
      { name: 'Settings', href: '/settings', icon: Settings, minTier: 0 },
    ]
  },
];

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [openGroups, setOpenGroups] = useState(() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('sidebar_groups') || '{}'); } catch {}
    const init = {};
    navGroups.forEach((g) => { if (g.label) init[g.label] = g.label in saved ? saved[g.label] : true; });
    return init;
  });

  const tier = user?.subscription_tier || 'trial';
  const userLevel = TIER_LEVEL[tier] ?? 0;

  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', String(collapsed)); } catch {}
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem('sidebar_groups', JSON.stringify(openGroups)); } catch {}
  }, [openGroups]);

  useEffect(() => {
    const active = navGroups.find((g) => g.label && g.items.some((it) => it.href === location.pathname));
    if (active) setOpenGroups((prev) => (prev[active.label] ? prev : { ...prev, [active.label]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (label) => setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const isActive = (href) => location.pathname === href;

  const tierLabel = () => {
    const t = user?.subscription_tier;
    if (t === 'trial') return `Trial · ${user?.trial_days_left ?? 0}d`;
    if (t === 'expired') return 'Expired';
    if (t === 'cancelled') return 'Cancelled';
    return t?.split('_')[0]?.charAt(0).toUpperCase() + t?.split('_')[0]?.slice(1) || 'Trial';
  };

  const tierColor = () => {
    const t = user?.subscription_tier;
    if (t?.includes('enterprise')) return 'bg-purple-500/20 text-purple-400';
    if (t?.includes('pro')) return 'bg-slate-500/20 text-slate-400';
    if (t?.includes('essential')) return 'bg-cyan-500/20 text-cyan-400';
    if (t === 'trial') return 'bg-amber-500/20 text-amber-400';
    if (t === 'expired' || t === 'cancelled') return 'bg-red-500/20 text-red-400';
    return 'bg-zinc-700 text-zinc-300';
  };

  return (
    <div className="dashboard-layout">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside 
        className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        data-testid="sidebar"
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className={`h-12 flex items-center flex-shrink-0 border-b border-white/[0.06] ${collapsed ? 'justify-center px-2' : 'justify-between px-3'}`}>
            {!collapsed && (
              <Link to="/dashboard" className="flex items-center">
                <img src="/inflow-logo.png?v=6" alt="InFlow" className="h-5 w-auto object-contain" />
              </Link>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
              data-testid="sidebar-toggle-btn"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          {/* Nav */}
          <nav className={`flex-1 py-2 overflow-y-auto overflow-x-hidden ${collapsed ? 'px-1.5' : 'px-2'}`}>
            {navGroups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
                {group.label && !collapsed && (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={openGroups[group.label]}
                    className="w-full px-2 mb-1 flex items-center justify-between group/lbl"
                    data-testid={`nav-group-${group.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 group-hover/lbl:text-zinc-400 transition-colors">{group.label}</span>
                    <ChevronDown className={`w-3 h-3 text-zinc-600 group-hover/lbl:text-zinc-400 transition-transform duration-200 ${openGroups[group.label] ? '' : '-rotate-90'}`} />
                  </button>
                )}
                {collapsed && gi > 0 && <div className="mx-2 my-2 border-t border-white/[0.04]" />}
                {(collapsed || !group.label || openGroups[group.label]) && group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  const locked = userLevel < item.minTier;

                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      title={collapsed ? item.name : undefined}
                      className={`flex items-center gap-2.5 rounded-md transition-colors whitespace-nowrap mb-px ${
                        collapsed ? 'justify-center py-1.5 px-0' : 'py-1.5 px-2'
                      } ${locked ? 'opacity-30' : ''} ${
                        active && !locked
                          ? 'bg-white/[0.06] text-white' 
                          : locked ? '' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]'
                      }`}
                      data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${active && !locked ? 'text-slate-400' : ''}`} />
                      {!collapsed && (
                        <>
                          <span className="text-[13px] truncate">{item.name}</span>
                          {locked && <Lock className="w-2.5 h-2.5 ml-auto text-zinc-700 flex-shrink-0" />}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* User */}
          <div className={`border-t border-white/[0.06] flex-shrink-0 ${collapsed ? 'p-2' : 'p-2.5'}`}>
            {collapsed ? (
              <div className="flex flex-col items-center gap-1.5">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={user?.picture} alt={user?.name} />
                  <AvatarFallback className="bg-slate-600 text-white text-[9px]">{getInitials(user?.name)}</AvatarFallback>
                </Avatar>
                <button onClick={() => setShowLogoutConfirm(true)} className="text-zinc-600 hover:text-red-400 transition-colors p-1" data-testid="sidebar-logout-btn">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarImage src={user?.picture} alt={user?.name} />
                  <AvatarFallback className="bg-slate-600 text-white text-[9px]">{getInitials(user?.name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-zinc-300 truncate">{user?.name}</p>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tierColor()}`}>{tierLabel()}</span>
                <button onClick={() => setShowLogoutConfirm(true)} className="text-zinc-600 hover:text-red-400 transition-colors p-1 flex-shrink-0" data-testid="sidebar-logout-btn">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className={`dashboard-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="lg:hidden fixed top-0 left-0 right-0 h-12 bg-[#050507] border-b border-white/[0.06] flex items-center px-4 z-20">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 text-zinc-500 hover:text-white" data-testid="mobile-sidebar-btn">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center ml-3">
            <img src="/inflow-logo.png?v=6" alt="InFlow" className="h-4 w-auto object-contain" />
          </div>
        </div>
        <div className="lg:pt-0 pt-12">
          <TrialBanner />
          <LegalBanner />
          {children}
        </div>
      </main>

      <Toaster position="top-right" richColors />

      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800" data-testid="logout-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white" style={{ fontFamily: 'Outfit' }}>Are you sure you want to sign out?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              You'll need to sign back in to access your dashboard and analytics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" data-testid="logout-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-500 text-white" onClick={logout} data-testid="logout-confirm-btn">Sign Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DashboardLayout;
