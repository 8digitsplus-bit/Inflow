import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Target,
  DollarSign,
  BarChart3,
  Settings,
  Menu,
  X,
  Zap,
  Users,
  TrendingUp,
  Plug,
  Headphones,
  Lock,
  Tag,
  LineChart,
  Radar,
  RefreshCw,
  Swords,
  Rocket,
  Telescope,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Toaster } from './ui/sonner';
import TrialBanner from './TrialBanner';
import LegalBanner from './LegalBanner';
import UserMenu from './UserMenu';

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
      { name: 'Intelligence', href: '/revenue', icon: BarChart3, minTier: 2 },
      { name: 'Forecast', href: '/forecast', icon: LineChart, minTier: 3 },
      { name: 'Churn', href: '/churn', icon: Users, minTier: 1 },
      { name: 'CRO', href: '/cro', icon: Zap, minTier: 0 },
      { name: 'Pricing', href: '/pricing', icon: Tag, minTier: 2 },
      { name: 'Competitors', href: '/competitor-intel', icon: Swords, minTier: 3 },
    ]
  },
  {
    label: 'Revenue Execution',
    items: [
      { name: 'High-Intent Buyers', href: '/discover', icon: Telescope, minTier: 1 },
      { name: 'Upsell Engine', href: '/upsell', icon: Rocket, minTier: 3 },
    ]
  },
  {
    label: 'Tools',
    items: [
      { name: 'Integration', href: '/connect-business', icon: Plug, minTier: 0 },
      { name: 'Sync', href: '/sync', icon: RefreshCw, minTier: 0 },
      { name: 'Revenue Leaks', href: '/revenue-leaks', icon: Radar, minTier: 3 },
      { name: 'Smart Assist', href: '/support', icon: Headphones, minTier: 0 },
    ]
  },
];

const labelMotion = (open) => ({
  animate: { opacity: open ? 1 : 0, x: open ? 0 : -4 },
  transition: { duration: 0.15 },
});

const DashboardLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const tier = user?.subscription_tier || 'trial';
  const userLevel = TIER_LEVEL[tier] ?? 0;

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

  // open === true renders the full-width (expanded) state; false = icon rail.
  const accountItems = [
    { label: 'Settings', icon: Settings, onSelect: () => navigate('/settings') },
  ];

  const renderHeader = (open, isMobile = false) => (
    <div className={`flex items-center px-2 py-2 flex-shrink-0 border-b border-white/[0.06] ${isMobile ? 'pr-12' : ''}`}>
      <UserMenu
        user={user}
        planLabel={tierLabel()}
        planClass={tierColor()}
        items={accountItems}
        onSignOut={() => setShowLogoutConfirm(true)}
        onOpenChange={setUserMenuOpen}
        expanded={open}
      />
    </div>
  );

  const renderNav = (open) => (
    <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden px-2.5">
      {navGroups.map((group, gi) => (
        <div key={gi}>
          {group.label && (
            <motion.div
              className="px-2.5 mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 whitespace-nowrap overflow-hidden"
              {...labelMotion(open)}
            >
              {group.label}
            </motion.div>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const locked = userLevel < item.minTier;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                title={!open ? item.name : undefined}
                className={`relative group/link flex items-center gap-3 rounded-lg h-9 px-2.5 whitespace-nowrap mb-0.5 transition-colors ${locked ? 'opacity-30' : ''} ${
                  active && !locked ? 'bg-[#0052ff]/[0.14] text-white' : locked ? '' : 'text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.04]'
                }`}
                data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {active && !locked && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#0052ff]" />
                )}
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${active && !locked ? 'text-[#4d8bff]' : 'group-hover/link:text-zinc-200'}`} />
                <motion.span className="text-[13px] flex-1 min-w-0 truncate" {...labelMotion(open)}>
                  {item.name}
                </motion.span>
                {locked && open && (
                  <motion.span {...labelMotion(open)}>
                    <Lock className="w-3 h-3 text-zinc-700 flex-shrink-0" />
                  </motion.span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const renderFooter = (open) => (
    <div className="border-t border-white/[0.06] flex-shrink-0 px-4 py-3.5">
      <Link to="/dashboard" className="flex items-center min-w-0" onClick={() => setMobileOpen(false)}>
        <motion.img
          src="/inflow-logo.png?v=6"
          alt="InFlow"
          className="h-4 object-contain pointer-events-none"
          {...labelMotion(open)}
        />
      </Link>
    </div>
  );

  return (
    <div className="dashboard-layout">
      {/* Desktop hover-expand rail (overlays content when expanded; content never shifts) */}
      <motion.aside
        className="dashboard-sidebar hidden lg:flex lg:flex-col"
        data-testid="sidebar"
        animate={{ width: (expanded || userMenuOpen) ? 280 : 64, boxShadow: (expanded || userMenuOpen) ? '8px 0 40px rgba(0,0,0,0.5)' : '0px 0 0px rgba(0,0,0,0)' }}
        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {renderHeader(expanded || userMenuOpen)}
        {renderNav(expanded || userMenuOpen)}
        {renderFooter(expanded || userMenuOpen)}
      </motion.aside>

      {/* Mobile full-screen overlay drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[100] lg:hidden bg-[#050507] flex flex-col"
            data-testid="mobile-drawer"
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-5 top-4 z-50 text-zinc-400 hover:text-white p-1"
              data-testid="mobile-drawer-close"
            >
              <X className="w-5 h-5" />
            </button>
            {renderHeader(true, true)}
            {renderNav(true)}
            {renderFooter(true)}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="dashboard-content">
        <div className="lg:hidden fixed top-0 left-0 right-0 h-12 bg-[#050507] border-b border-white/[0.06] flex items-center px-4 z-20">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 text-zinc-500 hover:text-white" data-testid="mobile-sidebar-btn">
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
