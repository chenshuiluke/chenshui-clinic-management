import { z } from 'zod';

export const patientRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string()
    .refine((value) => {
      // Enforce ISO 8601 date format (YYYY-MM-DD)
      const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!isoDatePattern.test(value)) {
        return false;
      }

      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return false;
      }

      // Verify the date components match the input to catch invalid dates like 2023-02-30
      const parts = value.split('-').map(Number);
      if (parts.length !== 3) {
        return false;
      }
      const year = parts[0]!;
      const month = parts[1]!;
      const day = parts[2]!;
      if (date.getFullYear() !== year ||
          date.getMonth() !== month - 1 ||
          date.getDate() !== day) {
        return false;
      }

      if (date > new Date()) {
        return false;
      }
      return true;
    }, 'Date must be in YYYY-MM-DD format, valid, and not in the future'),
  phoneNumber: z.string().min(10),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: z.string().optional(),
  chronicConditions: z.string().optional(),
});

export const updatePatientProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.string()
    .refine((value) => {
      // Enforce ISO 8601 date format (YYYY-MM-DD)
      const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (!isoDatePattern.test(value)) {
        return false;
      }

      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return false;
      }

      // Verify the date components match the input to catch invalid dates like 2023-02-30
      const parts = value.split('-').map(Number);
      if (parts.length !== 3) {
        return false;
      }
      const year = parts[0]!;
      const month = parts[1]!;
      const day = parts[2]!;
      if (date.getFullYear() !== year ||
          date.getMonth() !== month - 1 ||
          date.getDate() !== day) {
        return false;
      }

      if (date > new Date()) {
        return false;
      }
      return true;
    }, 'Date must be in YYYY-MM-DD format, valid, and not in the future')
    .optional(),
  phoneNumber: z.string().min(10).optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: z.string().optional(),
  chronicConditions: z.string().optional(),
});

export type PatientRegisterDto = z.infer<typeof patientRegisterSchema>;
export type UpdatePatientProfileDto = z.infer<typeof updatePatientProfileSchema>;
