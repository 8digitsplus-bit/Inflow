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
import AuthCallback from './pages/AuthCallback';
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
      <Route path="/onboarding" element={
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      } />
      <Route path="/choose-plan" element={
        <ProtectedRoute>
          <ChoosePlan />
        </ProtectedRoute>
      } />
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
            <TierGate requiredLevel={1}>
              <Pipeline />
            </TierGate>
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
            <PricingOptimizer />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/revenue" 
        element={
          <ProtectedRoute>
            <TierGate requiredLevel={3}>
              <RevenueIntelligence />
            </TierGate>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/churn" 
        element={
          <ProtectedRoute>
            <ChurnRetention />
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
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
