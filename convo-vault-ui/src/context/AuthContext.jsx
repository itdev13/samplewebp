import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useGHLContext } from '../hooks/useGHLContext';
import { authAPI } from '../api/auth';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const { context: ghlContext, loading: ghlLoading, error: ghlError } = useGHLContext();
  const [session, setSession] = useState(null);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const authAttemptCount = useRef(0); // Track number of attempts
  const maxAttempts = 3; // Maximum 3 attempts

  // Authenticate with backend when GHL context is available (MAX 3 ATTEMPTS)
  useEffect(() => {
    if (ghlContext && !session && authAttemptCount.current < maxAttempts) {
      authenticateUser(ghlContext);
    } else if (authAttemptCount.current >= maxAttempts && !session) {
      // Stop trying after max attempts
      setLoading(false);
      if (!error) {
        setError('Maximum authentication attempts reached. Please refresh the page.');
      }
    }
  }, [ghlContext]);

  const authenticateUser = async (ghlContext) => {
    // Increment attempt counter
    authAttemptCount.current += 1;
    const attemptNum = authAttemptCount.current;
    
    console.log(`🔐 Authentication attempt ${attemptNum}/${maxAttempts}...`);

    // Check if we've exceeded max attempts
    if (attemptNum > maxAttempts) {
      console.error('❌ Max authentication attempts reached');
      setError('Maximum authentication attempts reached. Please refresh the page.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const response = await authAPI.verify({
        locationId: ghlContext.locationId,
        companyId: ghlContext.companyId,
        userId: ghlContext.userId
      });

      // Success! Store session token
      localStorage.setItem('sessionToken', response.sessionToken);
      
      setSession({
        token: response.sessionToken,
        user: response.user,
        locationId: response.location.id
      });
      
      setLocation(response.location);
      setError(null);
      setLoading(false);
      
      console.log('✅ Authenticated successfully');
    } catch (err) {
      console.error(`❌ Authentication attempt ${attemptNum} failed:`, err.message);
      
      const errorMessage = err.message || 'Authentication failed';
      setError(errorMessage);
      setLoading(false);
      
      // Stop all future attempts
      authAttemptCount.current = maxAttempts;
    }
  };

  const refreshSession = async () => {
    try {
      const response = await authAPI.refresh();
      localStorage.setItem('sessionToken', response.sessionToken);
      setSession(prev => ({ ...prev, token: response.sessionToken }));
      console.log('🔄 Session refreshed');
    } catch (err) {
      console.error('❌ Session refresh failed:', err);
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem('sessionToken');
    setSession(null);
    setLocation(null);
  };

  const value = {
    ghlContext,
    session,
    location,
    loading: ghlLoading || loading,
    error: ghlError || error,
    isAuthenticated: !!session,
    refreshSession,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

