/**
 * Application-level enums for organization databases
 *
 * This file provides enums for use in application logic that complement
 * the database schema enums.
 */

import { appointmentStatus } from './schema';

/**
 * Organization user role enum
 * Derived from which profile is set on an organization_user record
 * This is NOT stored in the database but determined by which profile FK is non-null
 */
export enum OrganizationUserRole {
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  PATIENT = 'PATIENT',
}

/**
 * TypeScript type for OrganizationUserRole values
 */
export type OrganizationUserRoleType = `${OrganizationUserRole}`;

/**
 * Re-export the appointment status enum from the database schema for convenience
 */
export { appointmentStatus };

/**
 * TypeScript type for appointment status values
 */
export type AppointmentStatusType = 'PENDING' | 'APPROVED' | 'DECLINED' | 'COMPLETED' | 'CANCELLED';
