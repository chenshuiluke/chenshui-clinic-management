import { z } from 'zod';

// ISO 8601 datetime validator
const isValidISO8601 = (value: string): boolean => {
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString() === value;
};

export const bookAppointmentSchema = z.object({
  doctorId: z.number().int().positive(),
  appointmentDateTime: z.string()
    .refine(isValidISO8601, 'Appointment date must be a valid ISO 8601 datetime')
    .refine((value) => {
      const date = new Date(value);
      if (date <= new Date()) {
        return false;
      }
      return true;
    }, 'Appointment date must be in the future'),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
});

export type BookAppointmentDto = z.infer<typeof bookAppointmentSchema>;

export const appointmentIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Appointment ID must be a number')
});

export type AppointmentIdParam = z.infer<typeof appointmentIdParamSchema>;

// Query parameters validation for listing appointments
export const appointmentQuerySchema = z.object({
  limit: z.string()
    .optional()
    .default('20')
    .refine(val => !isNaN(Number(val)), 'Limit must be a number')
    .transform(val => Number(val))
    .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
  offset: z.string()
    .optional()
    .default('0')
    .refine(val => !isNaN(Number(val)), 'Offset must be a number')
    .transform(val => Number(val))
    .refine(val => val >= 0, 'Offset must be non-negative'),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'all'])
    .optional()
    .default('all'),
  startDate: z.string()
    .optional()
    .refine(val => !val || !isNaN(Date.parse(val)), 'Invalid start date'),
  endDate: z.string()
    .optional()
    .refine(val => !val || !isNaN(Date.parse(val)), 'Invalid end date'),
  doctorId: z.string()
    .optional()
    .refine(val => !val || !isNaN(Number(val)), 'Doctor ID must be a number')
    .transform(val => val ? Number(val) : undefined),
  patientId: z.string()
    .optional()
    .refine(val => !val || !isNaN(Number(val)), 'Patient ID must be a number')
    .transform(val => val ? Number(val) : undefined),
});

export type AppointmentQueryDto = z.infer<typeof appointmentQuerySchema>;

// Update appointment status validation
export const updateAppointmentStatusSchema = z.object({
  status: z.enum(['completed', 'cancelled']),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
});

export type UpdateAppointmentStatusDto = z.infer<typeof updateAppointmentStatusSchema>;
