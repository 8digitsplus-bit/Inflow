import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { exchangeSession } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      const hash = window.location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (!sessionIdMatch) {
        console.error('No session_id found in URL');
        navigate('/');
        return;
      }

      const sessionId = sessionIdMatch[1];

      try {
        const user = await exchangeSession(sessionId);
        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
        
        // Check onboarding status
        try {
          const onboardResp = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/auth/onboarding-status`, {
            credentials: 'include',
          });
          if (onboardResp.ok) {
            const { onboarded } = await onboardResp.json();
            if (!onboarded) {
              navigate('/onboarding', { replace: true });
              return;
            }
          }
        } catch {}
        
        navigate('/dashboard', { state: { user }, replace: true });
      } catch (error) {
        console.error('Auth callback failed:', error);
        navigate('/', { replace: true });
      }
    };

    processAuth();
  }, [exchangeSession, navigate]);

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-4" />
        <p className="text-zinc-400">Signing you in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
