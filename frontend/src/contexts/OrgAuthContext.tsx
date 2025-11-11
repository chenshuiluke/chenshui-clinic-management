// Organization authentication context

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { OrganizationUser, OrgAuthContextType } from '../types/auth';
import { orgLogin as apiOrgLogin, orgLogout as apiOrgLogout, orgRefresh as apiOrgRefresh, getOrgMe } from '../api/org-auth';
import { getOrgTokens, setOrgTokens, clearOrgTokens, getStoredOrgName } from '../utils/storage';
import { shouldRefreshToken } from '../utils/jwt';

const OrgAuthContext = createContext<OrgAuthContextType | undefined>(undefined);

interface OrgAuthProviderProps {
  children: ReactNode;
}

export const OrgAuthProvider: React.FC<OrgAuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<OrganizationUser | null>(null);
  const [orgName, setOrgNameState] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Set organization name
  const setOrgName = useCallback((name: string) => {
    setOrgNameState(name);
  }, []);

  // Refresh token function
  const refreshToken = useCallback(async () => {
    try {
      const { refreshToken: storedRefreshToken, orgName: storedOrgName } = getOrgTokens();
      if (!storedRefreshToken || !storedOrgName) {
        throw new Error('No refresh token or org name available');
      }

      const response = await apiOrgRefresh(storedOrgName, storedRefreshToken);
      setOrgTokens(response.accessToken, response.refreshToken, storedOrgName);
    } catch (err) {
      console.error('Token refresh failed:', err);
      clearOrgTokens();
      setUser(null);
      setOrgNameState(null);
      throw err;
    }
  }, []);

  // Login function
  const login = useCallback(async (orgName: string, email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      const response = await apiOrgLogin(orgName, email, password);
      setOrgTokens(response.accessToken, response.refreshToken, orgName);
      setUser(response.user);
      setOrgNameState(orgName);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      const storedOrgName = getStoredOrgName();
      if (storedOrgName) {
        await apiOrgLogout(storedOrgName);
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      clearOrgTokens();
      setUser(null);
      setOrgNameState(null);
    }
  }, []);

  // Set auth from registration function
  const setAuthFromRegistration = useCallback((accessToken: string, refreshToken: string, user: OrganizationUser, orgName: string) => {
    setOrgTokens(accessToken, refreshToken, orgName);
    setUser(user);
    setOrgNameState(orgName);
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { accessToken, orgName: storedOrgName } = getOrgTokens();
        if (!accessToken || !storedOrgName) {
          setLoading(false);
          return;
        }

        // Fetch current user
        const currentUser = await getOrgMe(storedOrgName);
        setUser(currentUser);
        setOrgNameState(storedOrgName);
      } catch (err) {
        console.error('Failed to initialize auth:', err);
        clearOrgTokens();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Setup token refresh interval
  useEffect(() => {
    if (!user || !orgName) return;

    const interval = setInterval(() => {
      const { accessToken } = getOrgTokens();
      if (accessToken && shouldRefreshToken(accessToken)) {
        refreshToken().catch((err) => {
          console.error('Auto token refresh failed:', err);
        });
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [user, orgName, refreshToken]);

  const value: OrgAuthContextType = {
    user,
    orgName,
    loading,
    error,
    login,
    logout,
    refreshToken,
    setOrgName,
    setAuthFromRegistration,
  };

  return <OrgAuthContext.Provider value={value}>{children}</OrgAuthContext.Provider>;
};

// Custom hook to use org auth context
export const useOrgAuth = (): OrgAuthContextType => {
  const context = useContext(OrgAuthContext);
  if (!context) {
    throw new Error('useOrgAuth must be used within OrgAuthProvider');
  }
  return context;
};
