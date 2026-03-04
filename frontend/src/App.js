import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import PricingOptimizer from './pages/PricingOptimizer';
import RevenueIntelligence from './pages/RevenueIntelligence';
import ChurnRetention from './pages/ChurnRetention';
import ConversionOptimization from './pages/ConversionOptimization';
import Settings from './pages/Settings';
import Integrations from './pages/Integrations';
import AuthCallback from './pages/AuthCallback';
import ProtectedRoute from './components/ProtectedRoute';
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
            <RevenueIntelligence />
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
