// Central admin authentication API functions

import { centralApiClient } from './client';
import type { CentralUser, LoginResponse, RefreshResponse } from '../types/auth';

// Login
export const centralLogin = async (email: string, password: string): Promise<LoginResponse<CentralUser>> => {
  try {
    const response = await centralApiClient.post<LoginResponse<CentralUser>>('/auth/login', {
      email,
      password,
    });
    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      throw new Error(axiosError.response?.data?.message || 'Login failed');
    }
    throw new Error('Login failed');
  }
};

// Register
export const centralRegister = async (email: string, name: string, password: string): Promise<LoginResponse<CentralUser>> => {
  try {
    const response = await centralApiClient.post<LoginResponse<CentralUser>>('/auth/register', {
      email,
      name,
      password,
    });
    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      throw new Error(axiosError.response?.data?.message || 'Registration failed');
    }
    throw new Error('Registration failed');
  }
};

// Refresh token
export const centralRefresh = async (refreshToken: string): Promise<RefreshResponse> => {
  try {
    const response = await centralApiClient.post<RefreshResponse>('/auth/refresh', {
      refreshToken,
    });
    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      throw new Error(axiosError.response?.data?.message || 'Token refresh failed');
    }
    throw new Error('Token refresh failed');
  }
};

// Logout
export const centralLogout = async (): Promise<void> => {
  try {
    await centralApiClient.post('/auth/logout');
  } catch (error: unknown) {
    // Logout errors can be ignored as we clear tokens anyway
    console.error('Logout error:', error);
  }
};

// Get current user
export const getCentralMe = async (): Promise<CentralUser> => {
  try {
    const response = await centralApiClient.get<CentralUser>('/auth/me');
    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      throw new Error(axiosError.response?.data?.message || 'Failed to get user info');
    }
    throw new Error('Failed to get user info');
  }
};
