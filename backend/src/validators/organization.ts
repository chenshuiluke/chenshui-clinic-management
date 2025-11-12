import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(4)
    .max(255),
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

// // Response schemas
export const createOrganizationResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type CreateOrganizationResponse = z.infer<
  typeof createOrganizationResponseSchema
>;

// Strong password validator for organization admin accounts
// Requires: 12+ chars, uppercase, lowercase, number, special char
const strongPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

export const createAdminUserSchema = z.object({
  email: z.string().email(),
  password: strongPasswordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export type CreateAdminUserDto = z.infer<typeof createAdminUserSchema>;

// Param validation schema
export const orgIdParamSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});

export type OrgIdParam = z.infer<typeof orgIdParamSchema>;

export const orgNameParamSchema = z.object({
  orgName: z.string().min(1).max(255),
});

export type OrgNameParam = z.infer<typeof orgNameParamSchema>;
