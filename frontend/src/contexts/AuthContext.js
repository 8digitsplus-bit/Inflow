import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Safely parse a Response body as JSON. Reads as text first to avoid the
// "body stream already read" error when the body has been consumed elsewhere
// (StrictMode double-render, dev tools, service workers, etc.) or when the
// server returns an empty/non-JSON response.
const safeJson = async (response) => {
  try {
    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
};

// Map HTTP status to a friendly message when the server didn't provide one.
const friendlyAuthError = (status, fallback = 'Something went wrong. Please try again.') => {
  if (status === 401) return 'Incorrect email or password';
  if (status === 404) return 'Account not found';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Server is having trouble. Please try again in a moment.';
  return fallback;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const loginWithGoogle = () => {
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const loginWithEmail = async (email, password) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await safeJson(response);

    if (!response.ok) {
      throw new Error(data.detail || friendlyAuthError(response.status, 'Login failed'));
    }

    // 2FA challenge
    if (data.requires_2fa) {
      return data;
    }

    setUser(data);
    localStorage.setItem('inflow_last_account', JSON.stringify({ name: data.name, email: data.email }));
    return data;
  };

  const verify2FA = async (userId, code) => {
    const response = await fetch(`${API_URL}/api/auth/2fa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_id: userId, code }),
    });

    const data = await safeJson(response);

    if (!response.ok) {
      throw new Error(data.detail || friendlyAuthError(response.status, 'Verification failed'));
    }

    setUser(data);
    localStorage.setItem('inflow_last_account', JSON.stringify({ name: data.name, email: data.email }));
    return data;
  };

  const registerWithEmail = async (name, email, password) => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password }),
    });

    const data = await safeJson(response);

    if (!response.ok) {
      throw new Error(data.detail || friendlyAuthError(response.status, 'Registration failed'));
    }

    setUser(data);
    localStorage.setItem('inflow_last_account', JSON.stringify({ name: data.name, email: data.email }));
    return data;
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
      window.location.href = '/';
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const exchangeSession = async (sessionId) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        throw new Error('Session exchange failed');
      }

      const userData = await response.json();
      setUser(userData);
      localStorage.setItem('inflow_last_account', JSON.stringify({ name: userData.name, email: userData.email }));
      return userData;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  // Backwards-compatible login (defaults to Google)
  const login = loginWithGoogle;

  const value = {
    user,
    loading,
    error,
    login,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    verify2FA,
    logout,
    exchangeSession,
    refreshUser,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
