// JWT utility functions

import { TOKEN_REFRESH_THRESHOLD_MS } from '../config/constants';

interface JWTPayload {
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

// Decode JWT token without verification (client-side only)
export const decodeToken = (token: string): JWTPayload | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JWTPayload;
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
};

// Check if token is expired
export const isTokenExpired = (token: string): boolean => {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) {
    return true;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
};

// Get token expiry time (in milliseconds)
export const getTokenExpiryTime = (token: string): number | null => {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) {
    return null;
  }

  return payload.exp * 1000; // Convert to milliseconds
};

// Check if token should be refreshed (expires within threshold)
export const shouldRefreshToken = (token: string): boolean => {
  const expiryTime = getTokenExpiryTime(token);
  if (!expiryTime) {
    return true; // Refresh if we can't determine expiry
  }

  const currentTime = Date.now();
  const timeUntilExpiry = expiryTime - currentTime;

  return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD_MS;
};
