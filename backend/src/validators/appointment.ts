import { z } from 'zod';

export const bookAppointmentSchema = z.object({
  doctorId: z.number().int().positive(),
  appointmentDateTime: z.string().datetime()
    .refine((value) => {
      const date = new Date(value);
      if (date <= new Date()) {
        return false;
      }
      return true;
    }, 'Appointment date must be in the future'),
  notes: z.string().optional(),
});

export type BookAppointmentDto = z.infer<typeof bookAppointmentSchema>;
