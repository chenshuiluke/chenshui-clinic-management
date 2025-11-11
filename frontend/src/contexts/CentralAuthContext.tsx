// Central admin authentication context
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { CentralUser, CentralAuthContextType } from '../types/auth';
import { centralLogin as apiCentralLogin, centralLogout as apiCentralLogout, centralRefresh as apiCentralRefresh, getCentralMe } from '../api/auth';
import { getCentralTokens, setCentralTokens, clearCentralTokens } from '../utils/storage';
import { shouldRefreshToken } from '../utils/jwt';

const CentralAuthContext = createContext<CentralAuthContextType | undefined>(undefined);

interface CentralAuthProviderProps {
  children: ReactNode;
}

export const CentralAuthProvider: React.FC<CentralAuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<CentralUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Refresh token function
  const refreshToken = useCallback(async () => {
    try {
      const { refreshToken: storedRefreshToken } = getCentralTokens();
      if (!storedRefreshToken) {
        throw new Error('No refresh token available');
      }
      
      const response = await apiCentralRefresh(storedRefreshToken);
      setCentralTokens(response.accessToken, response.refreshToken);
    } catch (err) {
      console.error('Token refresh failed:', err);
      clearCentralTokens();
      setUser(null);
      throw err;
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      setError(null);

      const response = await apiCentralLogin(email, password);
      setCentralTokens(response.accessToken, response.refreshToken);
      setUser(response.user);

      return true; // Success
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      return false; 
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await apiCentralLogout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      clearCentralTokens();
      setUser(null);
    }
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { accessToken } = getCentralTokens();
        
        if (!accessToken) {
          setLoading(false);
          return;
        }

        // Fetch current user
        const currentUser = await getCentralMe();
        setUser(currentUser);
      } catch (err) {
        console.error('Failed to initialize auth:', err);
        clearCentralTokens();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Setup token refresh interval
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const { accessToken } = getCentralTokens();
      if (accessToken && shouldRefreshToken(accessToken)) {
        refreshToken().catch((err) => {
          console.error('Auto token refresh failed:', err);
        });
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [user, refreshToken]);

  const value: CentralAuthContextType = {
    user,
    loading,
    error,
    login,
    logout,
    refreshToken,
  };

  return <CentralAuthContext.Provider value={value}>{children}</CentralAuthContext.Provider>;
};

// Custom hook to use central auth context
export const useCentralAuth = (): CentralAuthContextType => {
  const context = useContext(CentralAuthContext);
  if (!context) {
    throw new Error('useCentralAuth must be used within CentralAuthProvider');
  }
  return context;
};