// Axios API client with automatic token refresh

import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { API_BASE_URL } from '../config/constants';
import { getCentralTokens, setCentralTokens, clearCentralTokens, getOrgTokens, setOrgTokens, clearOrgTokens } from '../utils/storage';

// Track ongoing refresh requests to prevent race conditions
let centralRefreshPromise: Promise<string> | null = null;
let orgRefreshPromise: Promise<string> | null = null;

// Create central admin API client
export const centralApiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Central admin request interceptor - attach access token
centralApiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = getCentralTokens();
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Central admin response interceptor - handle 401 and refresh token
centralApiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If 401 and not already retried, attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Use existing refresh promise or create new one
        if (!centralRefreshPromise) {
          const { refreshToken } = getCentralTokens();
          if (!refreshToken) {
            clearCentralTokens();
            window.location.href = '/admin/login';
            return Promise.reject(error);
          }

          centralRefreshPromise = axios
            .post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
            .then((response) => {
              const { accessToken, refreshToken: newRefreshToken } = response.data;
              setCentralTokens(accessToken, newRefreshToken);
              centralRefreshPromise = null;
              return accessToken;
            })
            .catch((refreshError) => {
              centralRefreshPromise = null;
              clearCentralTokens();
              window.location.href = '/admin/login';
              throw refreshError;
            });
        }

        const newAccessToken = await centralRefreshPromise;

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return centralApiClient(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Create organization API client factory
export const createOrgApiClient = (orgName: string): AxiosInstance => {
  const orgClient = axios.create({
    baseURL: `${API_BASE_URL}/${orgName}`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Organization request interceptor - attach access token
  orgClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const { accessToken } = getOrgTokens();
      if (accessToken && config.headers) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Organization response interceptor - handle 401 and refresh token
  orgClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // If 401 and not already retried, attempt token refresh
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          // Use existing refresh promise or create new one
          if (!orgRefreshPromise) {
            const { refreshToken, orgName: storedOrgName } = getOrgTokens();
            if (!refreshToken || !storedOrgName) {
              clearOrgTokens();
              window.location.href = `/${orgName}/login`;
              return Promise.reject(error);
            }

            orgRefreshPromise = axios
              .post(`${API_BASE_URL}/${storedOrgName}/auth/refresh`, { refreshToken })
              .then((response) => {
                const { accessToken, refreshToken: newRefreshToken } = response.data;
                setOrgTokens(accessToken, newRefreshToken, storedOrgName);
                orgRefreshPromise = null;
                return accessToken;
              })
              .catch((refreshError) => {
                orgRefreshPromise = null;
                clearOrgTokens();
                window.location.href = `/${orgName}/login`;
                throw refreshError;
              });
          }

          const newAccessToken = await orgRefreshPromise;

          // Retry original request with new token
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          }
          return orgClient(originalRequest);
        } catch (refreshError) {
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return orgClient;
};

// Default organization client (will be created when orgName is known)
export const orgApiClient = createOrgApiClient('');
