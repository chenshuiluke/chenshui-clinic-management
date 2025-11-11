// API-related type definitions

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

// Appointment status (matches backend)
export const APPOINTMENT_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type AppointmentStatus = typeof APPOINTMENT_STATUS[keyof typeof APPOINTMENT_STATUS];

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

// Appointment (doctor-facing/admin-facing only - not returned to patients)
// Note: This interface uses Date types but the backend returns ISO 8601 strings.
// This interface is kept for potential future use with doctor/admin endpoints.
// Patients should use PatientAppointment interface instead.
export interface Appointment {
  id: number;
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
  doctor?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    specialization?: string;
  };
  appointmentDateTime: Date;
  status: AppointmentStatus;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Patient-facing appointment interface (from patient endpoints)
export interface PatientAppointment {
  id: number;
  appointmentDateTime: string; // ISO 8601 string
  status: AppointmentStatus;
  notes?: string | null;
  doctor: {
    id: number;
    firstName: string;
    lastName: string;
    specialization: string;
  } | null;
  createdAt: string; // ISO 8601 string
}

// Paginated response for patient appointments
export interface PatientAppointmentsResponse {
  appointments: PatientAppointment[];
  total: number;
  limit: number;
  offset: number;
}

// Doctor-facing appointment interface (from doctor endpoints)
export interface DoctorAppointment {
  id: number;
  appointmentDateTime: string; // ISO 8601 string
  status: AppointmentStatus;
  notes?: string | null;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    phoneNumber: string;
    allergies?: string | null;
    chronicConditions?: string | null;
  } | null;
  createdAt: string; // ISO 8601 string
}

// Paginated response for doctor appointments
export interface DoctorAppointmentsResponse {
  appointments: DoctorAppointment[];
  total: number;
  limit: number;
  offset: number;
}

// Book appointment request (patient-facing)
export interface BookAppointmentRequest {
  doctorId: number;
  appointmentDateTime: string; // ISO 8601 string, must be in future
  notes?: string; // max 1000 characters
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
