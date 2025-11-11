import axios from 'axios';
import { createOrgApiClient } from './client';
import type {
  PatientAppointment,
  PatientAppointmentsResponse,
  BookAppointmentRequest,
  DoctorAppointment,
  DoctorAppointmentsResponse,
  AppointmentStatus
} from '../types/api';

export const bookAppointment = async (
  orgName: string,
  data: BookAppointmentRequest
): Promise<PatientAppointment> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.post('/appointments', data);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 404) {
        throw new Error(errorMessage || 'Doctor not found or user is not a doctor');
      } else if (status === 400) {
        throw new Error(errorMessage || 'Invalid input data');
      } else if (status === 401) {
        throw new Error('Authentication required');
      } else {
        throw new Error(errorMessage || 'Failed to book appointment');
      }
    }
    throw new Error('Failed to book appointment');
  }
};

export const getMyAppointments = async (
  orgName: string,
  limit?: number,
  offset?: number
): Promise<PatientAppointmentsResponse> => {
  try {
    const client = createOrgApiClient(orgName);
    const queryParams: Record<string, string> = {};

    if (limit !== undefined) {
      queryParams.limit = limit.toString();
    }
    if (offset !== undefined) {
      queryParams.offset = offset.toString();
    }

    const response = await client.get('/appointments/me', { params: queryParams });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 401) {
        throw new Error('Authentication required');
      } else if (status === 403) {
        throw new Error(errorMessage || 'Patient access required');
      } else {
        throw new Error(errorMessage || 'Failed to fetch appointments');
      }
    }
    throw new Error('Failed to fetch appointments');
  }
};

export const cancelAppointment = async (
  orgName: string,
  appointmentId: number
): Promise<{ id: number; appointmentDateTime: string; status: string; message: string }> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.put(`/appointments/${appointmentId}/cancel`);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 404) {
        throw new Error(errorMessage || 'Appointment not found');
      } else if (status === 403) {
        throw new Error(errorMessage || 'Not authorized to cancel this appointment');
      } else if (status === 400) {
        throw new Error(errorMessage || 'Cannot cancel this appointment');
      } else if (status === 401) {
        throw new Error('Authentication required');
      } else {
        throw new Error(errorMessage || 'Failed to cancel appointment');
      }
    }
    throw new Error('Failed to cancel appointment');
  }
};

// Doctor-facing API functions

export const getDoctorAppointments = async (
  orgName: string,
  limit?: number,
  offset?: number,
  status?: AppointmentStatus
): Promise<DoctorAppointmentsResponse> => {
  try {
    const client = createOrgApiClient(orgName);
    const queryParams: Record<string, string> = {};

    if (limit !== undefined) {
      queryParams.limit = limit.toString();
    }
    if (offset !== undefined) {
      queryParams.offset = offset.toString();
    }
    if (status !== undefined) {
      queryParams.status = status;
    }

    const response = await client.get('/appointments', { params: queryParams });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 401) {
        throw new Error('Authentication required');
      } else if (status === 403) {
        throw new Error(errorMessage || 'Doctor access required');
      } else {
        throw new Error(errorMessage || 'Failed to fetch appointments');
      }
    }
    throw new Error('Failed to fetch appointments');
  }
};

export const getPendingAppointments = async (
  orgName: string,
  limit?: number,
  offset?: number
): Promise<DoctorAppointmentsResponse> => {
  try {
    const client = createOrgApiClient(orgName);
    const queryParams: Record<string, string> = {};

    if (limit !== undefined) {
      queryParams.limit = limit.toString();
    }
    if (offset !== undefined) {
      queryParams.offset = offset.toString();
    }

    const response = await client.get('/appointments/pending', { params: queryParams });
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 401) {
        throw new Error('Authentication required');
      } else if (status === 403) {
        throw new Error(errorMessage || 'Doctor access required');
      } else {
        throw new Error(errorMessage || 'Failed to fetch pending appointments');
      }
    }
    throw new Error('Failed to fetch pending appointments');
  }
};

export const approveAppointment = async (
  orgName: string,
  appointmentId: number
): Promise<DoctorAppointment> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.put(`/appointments/${appointmentId}/approve`);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 404) {
        throw new Error(errorMessage || 'Appointment not found');
      } else if (status === 403) {
        throw new Error(errorMessage || 'Not authorized to approve this appointment');
      } else if (status === 400) {
        throw new Error(errorMessage || 'Only pending appointments can be approved');
      } else if (status === 401) {
        throw new Error('Authentication required');
      } else {
        throw new Error(errorMessage || 'Failed to approve appointment');
      }
    }
    throw new Error('Failed to approve appointment');
  }
};

export const declineAppointment = async (
  orgName: string,
  appointmentId: number
): Promise<DoctorAppointment> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.put(`/appointments/${appointmentId}/decline`);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 404) {
        throw new Error(errorMessage || 'Appointment not found');
      } else if (status === 403) {
        throw new Error(errorMessage || 'Not authorized to decline this appointment');
      } else if (status === 400) {
        throw new Error(errorMessage || 'Only pending appointments can be declined');
      } else if (status === 401) {
        throw new Error('Authentication required');
      } else {
        throw new Error(errorMessage || 'Failed to decline appointment');
      }
    }
    throw new Error('Failed to decline appointment');
  }
};

export const completeAppointment = async (
  orgName: string,
  appointmentId: number
): Promise<DoctorAppointment> => {
  try {
    const client = createOrgApiClient(orgName);
    const response = await client.put(`/appointments/${appointmentId}/complete`);
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error || error.response?.data?.message;

      if (status === 404) {
        throw new Error(errorMessage || 'Appointment not found');
      } else if (status === 403) {
        throw new Error(errorMessage || 'Not authorized to complete this appointment');
      } else if (status === 400) {
        throw new Error(errorMessage || 'Only approved appointments can be marked as completed');
      } else if (status === 401) {
        throw new Error('Authentication required');
      } else {
        throw new Error(errorMessage || 'Failed to complete appointment');
      }
    }
    throw new Error('Failed to complete appointment');
  }
};
