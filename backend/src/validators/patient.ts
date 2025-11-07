import { z } from 'zod';

export const patientRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().datetime()
    .refine((value) => {
      const date = new Date(value);
      if (date > new Date()) {
        return false;
      }
      return true;
    }, 'Date must not be in the future'),
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
  dateOfBirth: z.string().datetime()
    .refine((value) => {
      const date = new Date(value);
      if (date > new Date()) {
        return false;
      }
      return true;
    }, 'Date must not be in the future')
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
