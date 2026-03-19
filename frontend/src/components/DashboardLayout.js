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
  X,
  Zap,
  ChevronRight,
  Users,
  TrendingUp,
  Plug,
  Headphones,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Toaster } from './ui/sonner';

const TIER_LEVEL = {
  trial: 0, expired: -1, cancelled: -1, free: 0,
  essential_monthly: 1, essential_yearly: 1,
  pro_monthly: 2, pro_yearly: 2,
  enterprise_monthly: 3, enterprise_yearly: 3,
};

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, minTier: 0 },
  { name: 'Sales Pipeline', href: '/pipeline', icon: Target, minTier: 0 },
  { name: 'Sales Performance', href: '/sales-performance', icon: TrendingUp, minTier: 2 },
  { name: 'Sales Revenue', href: '/sales-revenue', icon: DollarSign, minTier: 3 },
  { name: 'Revenue Intelligence', href: '/revenue', icon: BarChart3, minTier: 3 },
  { name: 'Churn & Retention', href: '/churn', icon: Users, minTier: 1 },
  { name: 'CRO', href: '/cro', icon: Zap, minTier: 1 },
  { name: 'Connect Business', href: '/connect-business', icon: Plug, minTier: 1 },
  { name: 'Smart Assist', href: '/support', icon: Headphones, minTier: 0 },
  { name: 'Settings', href: '/settings', icon: Settings, minTier: 0 },
];

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });

  const tier = user?.subscription_tier || 'trial';
  const userLevel = TIER_LEVEL[tier] ?? 0;

  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', String(collapsed)); } catch {}
  }, [collapsed]);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const isActive = (href) => location.pathname === href;

  return (
    <div className="dashboard-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        data-testid="sidebar"
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo + Toggle */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 flex-shrink-0">
            <Link 
              to="/dashboard" 
              className={`flex items-center overflow-hidden transition-opacity duration-200 ${collapsed ? 'w-0 opacity-0' : 'opacity-100'}`}
            >
              <div className="h-6 overflow-hidden flex-shrink-0">
                <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-full w-auto object-contain" />
              </div>
            </Link>
            <button
              onClick={() => setCollapsed(c => !c)}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors flex-shrink-0"
              data-testid="sidebar-toggle-btn"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const locked = userLevel < item.minTier;
              
              if (locked) {
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={collapsed ? `${item.name} (Locked)` : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors opacity-40 cursor-pointer ${
                      collapsed ? 'justify-center px-2' : ''
                    }`}
                    data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Icon className="w-[18px] h-[18px] flex-shrink-0 text-zinc-600" />
                    {!collapsed && (
                      <>
                        <span className="text-sm text-zinc-600 truncate">{item.name}</span>
                        <Lock className="w-3 h-3 ml-auto text-zinc-700 flex-shrink-0" />
                      </>
                    )}
                  </Link>
                );
              }

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  title={collapsed ? item.name : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group ${
                    collapsed ? 'justify-center px-2' : ''
                  } ${
                    active 
                      ? 'bg-indigo-500/10 text-white' 
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-indigo-400' : 'group-hover:text-indigo-400'}`} />
                  {!collapsed && (
                    <>
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-indigo-400 flex-shrink-0" />}
                    </>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-3 border-t border-white/10 flex-shrink-0">
            {collapsed ? (
              <div className="flex flex-col items-center gap-2">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={user?.picture} alt={user?.name} />
                  <AvatarFallback className="bg-indigo-600 text-white text-[10px]">
                    {getInitials(user?.name)}
                  </AvatarFallback>
                </Avatar>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={logout}
                  className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10 w-7 h-7"
                  data-testid="sidebar-logout-btn"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={user?.picture} alt={user?.name} />
                    <AvatarFallback className="bg-indigo-600 text-white text-xs">
                      {getInitials(user?.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{user?.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`flex-1 px-2 py-1 rounded text-[11px] font-medium text-center ${
                    user?.subscription_tier?.includes('enterprise') ? 'bg-purple-500/20 text-purple-400' :
                    user?.subscription_tier?.includes('pro') ? 'bg-indigo-500/20 text-indigo-400' :
                    user?.subscription_tier?.includes('essential') ? 'bg-cyan-500/20 text-cyan-400' :
                    user?.subscription_tier === 'trial' ? 'bg-amber-500/20 text-amber-400' :
                    user?.subscription_tier === 'expired' ? 'bg-red-500/20 text-red-400' :
                    user?.subscription_tier === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                    'bg-zinc-700 text-zinc-300'
                  }`}>
                    {user?.subscription_tier === 'trial' ? `Trial · ${user?.trial_days_left ?? 0}d` :
                     user?.subscription_tier === 'expired' ? 'Expired' :
                     user?.subscription_tier === 'cancelled' ? 'Cancelled' :
                     user?.subscription_tier?.split('_')[0]?.charAt(0).toUpperCase() + user?.subscription_tier?.split('_')[0]?.slice(1) || 'Trial'}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={logout}
                    className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10 w-7 h-7"
                    data-testid="sidebar-logout-btn"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`dashboard-content ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#09090B] border-b border-white/10 flex items-center px-4 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-zinc-400 hover:text-white"
            data-testid="mobile-sidebar-btn"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center ml-3">
            <div className="h-5 overflow-hidden">
              <img src="/inflow-logo.png?v=3" alt="InFlow" className="h-full w-auto object-contain" />
            </div>
          </div>
        </div>

        {/* Page Content */}
        <div className="lg:pt-0 pt-14">
          {children}
        </div>
      </main>

      {/* Toast notifications */}
      <Toaster position="top-right" richColors />
    </div>
  );
};

export default DashboardLayout;
