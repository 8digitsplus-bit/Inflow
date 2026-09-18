import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
// Eager: public entry points needed for first paint.
import Landing from './pages/Landing';
import AuthPage from './pages/AuthPage';
import AuthCallback from './pages/AuthCallback';
import TrialNotification from './components/TrialNotification';
import ProtectedRoute from './components/ProtectedRoute';
import TierGate from './components/TierGate';
import './App.css';

// Code-split everything behind auth (dashboard/analytics pages pull in Recharts and other
// heavy deps) plus secondary public pages, so the landing bundle stays lean and mobile
// first paint is fast. Each is fetched on demand when its route is visited.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const SalesPerformance = lazy(() => import('./pages/SalesPerformance'));
const SalesRevenue = lazy(() => import('./pages/SalesRevenue'));
const PricingOptimizer = lazy(() => import('./pages/PricingOptimizer'));
const RevenueIntelligence = lazy(() => import('./pages/RevenueIntelligence'));
const ChurnRetention = lazy(() => import('./pages/ChurnRetention'));
const UpsellEngine = lazy(() => import('./pages/UpsellEngine'));
const HighIntent = lazy(() => import('./pages/HighIntent'));
const Workspace = lazy(() => import('./pages/Workspace'));
const AccountWorkspace = lazy(() => import('./pages/AccountWorkspace'));
const ConversionOptimization = lazy(() => import('./pages/ConversionOptimization'));
const Settings = lazy(() => import('./pages/Settings'));
const Integrations = lazy(() => import('./pages/Integrations'));
const ConnectBusiness = lazy(() => import('./pages/ConnectBusiness'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const ChoosePlan = lazy(() => import('./pages/ChoosePlan'));
const Checkout = lazy(() => import('./pages/Checkout'));
const CheckoutReturn = lazy(() => import('./pages/CheckoutReturn'));
const Support = lazy(() => import('./pages/Support'));
const RevenueForecast = lazy(() => import('./pages/RevenueForecast'));
const RevenueLeaks = lazy(() => import('./pages/RevenueLeaks'));
const CompetitorIntel = lazy(() => import('./pages/CompetitorIntel'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const Terms = lazy(() => import('./pages/Terms'));
const Contact = lazy(() => import('./pages/Contact'));

// Router component that handles session_id detection
const AppRouter = () => {
  const location = useLocation();
  
  // Check URL fragment for session_id synchronously during render
  // This prevents race conditions with ProtectedRoute
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050507' }} />}>
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/cookies" element={<CookiePolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/onboarding" element={
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      } />
      <Route path="/choose-plan" element={<ChoosePlan />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/checkout/return" element={<CheckoutReturn />} />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/pipeline" 
        element={
          <ProtectedRoute>
            <Pipeline />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/sales-performance" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={2}>
              <SalesPerformance />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/sales-revenue" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={3}>
              <SalesRevenue />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/pricing" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={2}>
              <PricingOptimizer />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/revenue" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={2}>
              <RevenueIntelligence />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/churn" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={1}>
              <ChurnRetention />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/upsell" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={3}>
              <UpsellEngine />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/discover" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={1}>
              <HighIntent />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/workspace" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={1}>
              <Workspace />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/workspace/account/:leadId" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={1}>
              <AccountWorkspace />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/cro" 
        element={
          <ProtectedRoute>
            <ConversionOptimization />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/forecast" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={3}>
              <RevenueForecast />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/settings" 
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/integrations" 
        element={
          <ProtectedRoute>
            <Integrations />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/connect-business" 
        element={
          <ProtectedRoute>
            <ConnectBusiness />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/revenue-leaks" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={3}>
              <RevenueLeaks />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/competitor-intel" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={3}>
              <CompetitorIntel />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/support" 
        element={
          <ProtectedRoute>
            <Support />
          </ProtectedRoute>
        } 
      />
    </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <TrialNotification />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
