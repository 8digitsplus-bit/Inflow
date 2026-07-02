import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // If user data was passed from AuthCallback, we're already authenticated
    if (location.state?.user) {
      setIsChecking(false);
      return;
    }

    // Otherwise, wait for auth check to complete
    if (!loading) {
      setIsChecking(false);
    }
  }, [loading, location.state?.user]);

  if (isChecking || loading) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-500 mx-auto mb-4" />
          <p className="text-zinc-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !location.state?.user) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
