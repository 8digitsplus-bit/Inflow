import { useState } from 'react';
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
  Plug
} from 'lucide-react';
// Note: Zap used for CRO sidebar icon, TrendingUp for Sales Performance
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Toaster } from './ui/sonner';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Sales Pipeline', href: '/pipeline', icon: Target },
  { name: 'Sales Performance', href: '/sales-performance', icon: TrendingUp },
  { name: 'Sales Revenue', href: '/sales-revenue', icon: DollarSign },
  { name: 'Revenue Intelligence', href: '/revenue', icon: BarChart3 },
  { name: 'Churn & Retention', href: '/churn', icon: Users },
  { name: 'CRO', href: '/cro', icon: Zap },
  { name: 'Integrations', href: '/integrations', icon: Plug },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-white/10">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg text-white" style={{ fontFamily: 'Outfit' }}>
                Zelta
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
                    active 
                      ? 'bg-indigo-500/10 text-white' 
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                  data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                >
                  <Icon className={`w-5 h-5 ${active ? 'text-indigo-400' : 'group-hover:text-indigo-400'}`} />
                  <span className="font-medium">{item.name}</span>
                  {active && (
                    <ChevronRight className="w-4 h-4 ml-auto text-indigo-400" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="w-10 h-10">
                <AvatarImage src={user?.picture} alt={user?.name} />
                <AvatarFallback className="bg-indigo-600 text-white">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-zinc-400 truncate">{user?.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <span className={`flex-1 px-2 py-1 rounded text-xs font-medium text-center ${
                user?.subscription_tier === 'enterprise' ? 'bg-purple-500/20 text-purple-400' :
                user?.subscription_tier === 'pro' ? 'bg-indigo-500/20 text-indigo-400' :
                'bg-zinc-700 text-zinc-300'
              }`}>
                {user?.subscription_tier?.charAt(0).toUpperCase() + user?.subscription_tier?.slice(1) || 'Free'}
              </span>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={logout}
                className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                data-testid="sidebar-logout-btn"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-content">
        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#09090B] border-b border-white/10 flex items-center px-4 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-zinc-400 hover:text-white"
            data-testid="mobile-sidebar-btn"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Zelta</span>
          </div>
        </div>

        {/* Page Content */}
        <div className="lg:pt-0 pt-16">
          {children}
        </div>
      </main>

      {/* Toast notifications */}
      <Toaster position="top-right" richColors />
    </div>
  );
};

export default DashboardLayout;
