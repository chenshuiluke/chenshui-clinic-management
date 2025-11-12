import axios from 'axios';
import { createOrgApiClient } from './client';
import type { PatientProfile, PatientRegisterRequest, UpdatePatientProfileRequest, PatientsResponse } from '../types/api';
import type { LoginResponse, OrganizationUser } from '../types/auth';

export const getAllPatients = async (
  orgName: string,
  query?: string,
  limit?: number,
  offset?: number
): Promise<PatientsResponse> => {
  try {
    const client = createOrgApiClient(orgName);
    const params: any = {};
    if (query) params.q = query;
    if (limit !== undefined) params.limit = limit;
    if (offset !== undefined) params.offset = offset;

    const response = await client.get('/patients', {
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error || error.response?.data?.message || 'Failed to fetch patients';
      throw new Error(message);
    }
    throw new Error('Failed to fetch patients');
  }
};

export const registerPatient = async (orgName: string, data: PatientRegisterRequest): Promise<LoginResponse<OrganizationUser>> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.post('/patients/register', data);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 409) {
        throw new Error(errorMessage || 'User with this email already exists in the organization');
      } else if (status === 400) {
        throw new Error(errorMessage || 'Invalid input data');
      } else {
        throw new Error(errorMessage || 'Failed to register patient');
      }
    }
    throw new Error('Failed to register patient');
  }
};

export const getPatientProfile = async (orgName: string): Promise<PatientProfile> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.get('/patients/me');
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 403) {
        throw new Error(errorMessage || 'User does not have a patient profile');
      } else if (status === 404) {
        throw new Error(errorMessage || 'User not found');
      } else if (status === 401) {
        throw new Error(errorMessage || 'Authentication required');
      } else {
        throw new Error(errorMessage || 'Failed to fetch patient profile');
      }
    }
    throw new Error('Failed to fetch patient profile');
  }
};

export const updatePatientProfile = async (orgName: string, data: UpdatePatientProfileRequest): Promise<PatientProfile> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.put('/patients/me', data);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 404) {
        throw new Error(errorMessage || 'User or profile not found');
      } else if (status === 400) {
        throw new Error(errorMessage || 'Invalid input data');
      } else {
        throw new Error(errorMessage || 'Failed to update patient profile');
      }
    }
    throw new Error('Failed to update patient profile');
  }
};

export const deletePatientAccount = async (orgName: string): Promise<void> => {
  try {
    const client = createOrgApiClient(orgName);
    await client.delete('/patients/me');
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 404) {
        throw new Error(errorMessage || 'User or profile not found');
      } else {
        throw new Error(errorMessage || 'Failed to delete patient account');
      }
    }
    throw new Error('Failed to delete patient account');
  }
};
