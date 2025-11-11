// API-related type definitions

import { UserRole } from './auth';

// Organization
export interface Organization {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// Create organization request
export interface CreateOrganizationRequest {
  name: string;
}

// Create admin user request
export interface CreateAdminUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

// Appointment status enum (matches backend)
export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

// Patient Profile
export interface PatientProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phoneNumber: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodType?: string;
  allergies?: string;
  chronicConditions?: string;
}

// Patient Registration Request
export interface PatientRegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD format
  phoneNumber: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodType?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  allergies?: string;
  chronicConditions?: string;
}

// Doctor
export interface Doctor {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'doctor';
  specialization: string;
  licenseNumber: string;
  phoneNumber?: string | null;
}

// Create doctor request
export interface CreateDoctorRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  specialization: string;
  licenseNumber: string;
  phoneNumber?: string;
}

// Appointment (simplified for frontend)
export interface Appointment {
  id: number;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
  doctor: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    specialization?: string;
  };
  appointmentDateTime: Date;
  status: AppointmentStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Create appointment request
export interface CreateAppointmentRequest {
  doctorId: number;
  patientId: number;
  appointmentDateTime: string; // ISO string
  notes?: string;
}

// Update appointment request
export interface UpdateAppointmentRequest {
  appointmentDateTime?: string; // ISO string
  status?: AppointmentStatus;
  notes?: string;
}

// Update patient profile request
export interface UpdatePatientProfileRequest {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string; // YYYY-MM-DD format
  phoneNumber?: string;
  address?: string;
  allergies?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bloodType?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  chronicConditions?: string;
}

// Update doctor profile request
export interface UpdateDoctorProfileRequest {
  firstName?: string;
  lastName?: string;
  specialization?: string;
  licenseNumber?: string;
  phoneNumber?: string;
}
