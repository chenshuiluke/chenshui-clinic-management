// LocalStorage utility functions for token management

import { TOKEN_STORAGE_KEYS } from '../config/constants';

interface Tokens {
  accessToken: string | null;
  refreshToken: string | null;
}

interface OrgTokens extends Tokens {
  orgName: string | null;
}

// Check if localStorage is available (may fail in private browsing mode)
const isStorageAvailable = (): boolean => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

// Central Admin Token Functions
export const getCentralTokens = (): Tokens => {
  if (!isStorageAvailable()) {
    return { accessToken: null, refreshToken: null };
  }

  try {
    return {
      accessToken: localStorage.getItem(TOKEN_STORAGE_KEYS.CENTRAL_ACCESS_TOKEN),
      refreshToken: localStorage.getItem(TOKEN_STORAGE_KEYS.CENTRAL_REFRESH_TOKEN),
    };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
};

export const setCentralTokens = (accessToken: string, refreshToken: string): void => {
  if (!isStorageAvailable()) {
    console.warn('LocalStorage not available');
    return;
  }

  try {
    localStorage.setItem(TOKEN_STORAGE_KEYS.CENTRAL_ACCESS_TOKEN, accessToken);
    localStorage.setItem(TOKEN_STORAGE_KEYS.CENTRAL_REFRESH_TOKEN, refreshToken);
  } catch (error) {
    console.error('Failed to set central tokens:', error);
  }
};

export const clearCentralTokens = (): void => {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    localStorage.removeItem(TOKEN_STORAGE_KEYS.CENTRAL_ACCESS_TOKEN);
    localStorage.removeItem(TOKEN_STORAGE_KEYS.CENTRAL_REFRESH_TOKEN);
  } catch (error) {
    console.error('Failed to clear central tokens:', error);
  }
};

// Organization Token Functions
export const getOrgTokens = (): OrgTokens => {
  if (!isStorageAvailable()) {
    return { accessToken: null, refreshToken: null, orgName: null };
  }

  try {
    return {
      accessToken: localStorage.getItem(TOKEN_STORAGE_KEYS.ORG_ACCESS_TOKEN),
      refreshToken: localStorage.getItem(TOKEN_STORAGE_KEYS.ORG_REFRESH_TOKEN),
      orgName: localStorage.getItem(TOKEN_STORAGE_KEYS.ORG_NAME),
    };
  } catch {
    return { accessToken: null, refreshToken: null, orgName: null };
  }
};

export const setOrgTokens = (accessToken: string, refreshToken: string, orgName: string): void => {
  if (!isStorageAvailable()) {
    console.warn('LocalStorage not available');
    return;
  }

  try {
    localStorage.setItem(TOKEN_STORAGE_KEYS.ORG_ACCESS_TOKEN, accessToken);
    localStorage.setItem(TOKEN_STORAGE_KEYS.ORG_REFRESH_TOKEN, refreshToken);
    localStorage.setItem(TOKEN_STORAGE_KEYS.ORG_NAME, orgName);
  } catch (error) {
    console.error('Failed to set org tokens:', error);
  }
};

export const clearOrgTokens = (): void => {
  if (!isStorageAvailable()) {
    return;
  }

  try {
    localStorage.removeItem(TOKEN_STORAGE_KEYS.ORG_ACCESS_TOKEN);
    localStorage.removeItem(TOKEN_STORAGE_KEYS.ORG_REFRESH_TOKEN);
    localStorage.removeItem(TOKEN_STORAGE_KEYS.ORG_NAME);
  } catch (error) {
    console.error('Failed to clear org tokens:', error);
  }
};

export const getStoredOrgName = (): string | null => {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    return localStorage.getItem(TOKEN_STORAGE_KEYS.ORG_NAME);
  } catch {
    return null;
  }
};
