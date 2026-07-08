import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import SalesPerformance from './pages/SalesPerformance';
import SalesRevenue from './pages/SalesRevenue';
import PricingOptimizer from './pages/PricingOptimizer';
import RevenueIntelligence from './pages/RevenueIntelligence';
import ChurnRetention from './pages/ChurnRetention';
import ConversionOptimization from './pages/ConversionOptimization';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import ConnectBusiness from './pages/ConnectBusiness';
import AuthPage from './pages/AuthPage';
import Onboarding from './pages/Onboarding';
import ChoosePlan from './pages/ChoosePlan';
import Checkout from './pages/Checkout';
import CheckoutReturn from './pages/CheckoutReturn';
import Support from './pages/Support';
import RevenueForecast from './pages/RevenueForecast';
import AuthCallback from './pages/AuthCallback';
import PrivacyPolicy from './pages/PrivacyPolicy';
import CookiePolicy from './pages/CookiePolicy';
import Terms from './pages/Terms';
import Contact from './pages/Contact';
import RevenueLeaks from './pages/RevenueLeaks';
import CompetitorIntel from './pages/CompetitorIntel';
import GlowPreview from './pages/GlowPreview';
import TrialNotification from './components/TrialNotification';
import ProtectedRoute from './components/ProtectedRoute';
import TierGate from './components/TierGate';
import './App.css';

// Router component that handles session_id detection
const AppRouter = () => {
  const location = useLocation();
  
  // Check URL fragment for session_id synchronously during render
  // This prevents race conditions with ProtectedRoute
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
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
            <RevenueIntelligence />
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
            <TierGate requiredLevel={2}>
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
