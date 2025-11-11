// Organization authentication API functions

import { createOrgApiClient } from './client';
import type { OrganizationUser, LoginResponse, RefreshResponse } from '../types/auth';

// Login
export const orgLogin = async (orgName: string, email: string, password: string): Promise<LoginResponse<OrganizationUser>> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.post<LoginResponse<OrganizationUser>>('/auth/login', {
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

// Refresh token
export const orgRefresh = async (orgName: string, refreshToken: string): Promise<RefreshResponse> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.post<RefreshResponse>('/auth/refresh', {
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
export const orgLogout = async (orgName: string): Promise<void> => {
  try {
    const client = createOrgApiClient(orgName);
    await client.post('/auth/logout');
  } catch (error: unknown) {
    // Logout errors can be ignored as we clear tokens anyway
    console.error('Logout error:', error);
  }
};

// Get current user
export const getOrgMe = async (orgName: string): Promise<OrganizationUser> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.get<OrganizationUser>('/auth/me');
    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      throw new Error(axiosError.response?.data?.message || 'Failed to get user info');
    }
    throw new Error('Failed to get user info');
  }
};
