import axios from 'axios';
import { centralApiClient } from './client';
import type { Organization, CreateOrganizationRequest, CreateAdminUserRequest } from '../types/api';

export const getAllOrganizations = async (): Promise<Organization[]> => {
  try {
    const response = await centralApiClient.get<Organization[]>('/organizations');
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to fetch organizations';
      throw new Error(errorMessage);
    }
    throw new Error('Failed to fetch organizations');
  }
};

export const getOrganizationsCount = async (): Promise<number> => {
  try {
    const response = await centralApiClient.get<{ count: number }>('/organizations/count');
    return response.data.count;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to fetch organizations count';
      throw new Error(errorMessage);
    }
    throw new Error('Failed to fetch organizations count');
  }
};

interface CreateOrganizationResponse {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  database: {
    created: boolean;
    dbName: string;
    secretName: string;
    message: string;
  };
}

export const createOrganization = async (name: string): Promise<CreateOrganizationResponse> => {
  try {
    const response = await centralApiClient.post<CreateOrganizationResponse>(
      '/organizations',
      { name } as CreateOrganizationRequest
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (error.response?.status === 409) {
        throw new Error(errorMessage || 'Organization already exists');
      }
      if (error.response?.status === 400) {
        throw new Error(errorMessage || 'Validation error');
      }
      throw new Error(errorMessage || 'Failed to create organization');
    }
    throw new Error('Failed to create organization');
  }
};

interface CreateAdminUserResponse {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export const createAdminUser = async (
  orgId: number,
  data: CreateAdminUserRequest
): Promise<CreateAdminUserResponse> => {
  try {
    const response = await centralApiClient.post<CreateAdminUserResponse>(
      `/organizations/${orgId}/users`,
      data
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (error.response?.status === 404) {
        throw new Error(errorMessage || 'Organization not found');
      }
      if (error.response?.status === 409) {
        throw new Error(errorMessage || 'User with this email already exists');
      }
      throw new Error(errorMessage || 'Failed to create admin user');
    }
    throw new Error('Failed to create admin user');
  }
};
