import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { whenReady } from 'featurebase-js';
import { FeaturebaseProvider, useFeedbackWidget } from 'featurebase-js/react';
import { useAuth } from '../contexts/AuthContext';
import { setMessengerReady } from '../lib/featurebase';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const APP_ID = process.env.REACT_APP_FEATUREBASE_APP_ID;
const PUBLIC_PATHS = ['/', '/auth', '/privacy', '/cookies', '/terms', '/contact'];
const isPublic = (path) => PUBLIC_PATHS.includes(path) || path.startsWith('/quote');

const Widgets = ({ plan }) => {
  useFeedbackWidget({ theme: 'dark', placement: 'right', metadata: { plan: plan || 'unknown' } });
  useEffect(() => {
    whenReady(() => setMessengerReady(true));
    return () => setMessengerReady(false);
  }, []);
  return null;
};

// Boots Featurebase (Messenger with hidden launcher + Feedback tab) for logged-in users once
// they enter the app; stays mounted across page changes and tears down on logout.
export const FeaturebaseBoot = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);
  const [token, setToken] = useState(null);
  const userId = user?.user_id;

  useEffect(() => {
    if (!userId) { setActive(false); setToken(null); return; }
    if (!isPublic(pathname)) setActive(true);
  }, [userId, pathname]);

  useEffect(() => {
    if (!active || !userId || !APP_ID) return undefined;
    let cancelled = false;
    fetch(`${API_URL}/api/support/featurebase-token`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.token) setToken(d.token); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active, userId]);

  if (!active || !token || !userId) return null;
  return (
    <FeaturebaseProvider key={userId} appId={APP_ID} featurebaseJwt={token} hideDefaultLauncher theme="dark">
      <Widgets plan={user?.subscription_tier} />
    </FeaturebaseProvider>
  );
};
