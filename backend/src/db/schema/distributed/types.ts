/**
 * TypeScript types derived from the distributed database schema
 *
 * These types provide type-safe interfaces for working with organization-specific entities
 * throughout the application.
 */

import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  organizationUserTable,
  adminProfileTable,
  doctorProfileTable,
  patientProfileTable,
  appointmentTable
} from './schema';

// Select types (for reading from database)
export type OrganizationUser = InferSelectModel<typeof organizationUserTable>;
export type AdminProfile = InferSelectModel<typeof adminProfileTable>;
export type DoctorProfile = InferSelectModel<typeof doctorProfileTable>;
export type PatientProfile = InferSelectModel<typeof patientProfileTable>;
export type Appointment = InferSelectModel<typeof appointmentTable>;

// Insert types (for inserting into database)
export type NewOrganizationUser = InferInsertModel<typeof organizationUserTable>;
export type NewAdminProfile = InferInsertModel<typeof adminProfileTable>;
export type NewDoctorProfile = InferInsertModel<typeof doctorProfileTable>;
export type NewPatientProfile = InferInsertModel<typeof patientProfileTable>;
export type NewAppointment = InferInsertModel<typeof appointmentTable>;

// Partial update types (for updates)
export type OrganizationUserUpdate = Partial<NewOrganizationUser>;
export type AdminProfileUpdate = Partial<NewAdminProfile>;
export type DoctorProfileUpdate = Partial<NewDoctorProfile>;
export type PatientProfileUpdate = Partial<NewPatientProfile>;
export type AppointmentUpdate = Partial<NewAppointment>;

// Composite types (for queries with joins)

/**
 * OrganizationUser with populated profile
 * Used when fetching a user with their associated profile data
 */
export type OrganizationUserWithProfile = OrganizationUser & {
  adminProfile?: AdminProfile | null;
  doctorProfile?: DoctorProfile | null;
  patientProfile?: PatientProfile | null;
};

/**
 * Appointment with populated relations
 * Used when fetching an appointment with patient and doctor information
 */
export type AppointmentWithRelations = Appointment & {
  patient?: OrganizationUser | null;
  doctor?: OrganizationUser | null;
};
