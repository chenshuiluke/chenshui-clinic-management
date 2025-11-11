import axios from 'axios';
import { createOrgApiClient } from './client';
import type { Doctor, CreateDoctorRequest } from '../types/api';

export const getAllDoctors = async (orgName: string): Promise<Doctor[]> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.get('/doctors');
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error || error.response?.data?.message || 'Failed to fetch doctors';
      throw new Error(message);
    }
    throw new Error('Failed to fetch doctors');
  }
};

export const createDoctor = async (orgName: string, data: CreateDoctorRequest): Promise<Doctor> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.post('/doctors', data);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 409) {
        throw new Error(errorMessage || 'User with this email already exists in the organization');
      } else if (status === 400) {
        throw new Error(errorMessage || 'Invalid input data');
      } else if (status === 403) {
        throw new Error('Admin access required');
      } else if (status === 401) {
        throw new Error('Authentication required');
      } else {
        throw new Error(errorMessage || 'Failed to create doctor');
      }
    }
    throw new Error('Failed to create doctor');
  }
};
