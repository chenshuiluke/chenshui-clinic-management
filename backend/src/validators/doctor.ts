import { z } from "zod";

export const createDoctorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  specialization: z.string().min(1),
  licenseNumber: z.string().min(1),
  phoneNumber: z.string().optional(),
});

export type CreateDoctorDto = z.infer<typeof createDoctorSchema>;
