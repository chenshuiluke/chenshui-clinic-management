import { RequestContext } from "@mikro-orm/core";
import Organization from "../entities/central/organization";
import { z } from "zod";

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(4)
    .refine(
      (value) => {
        const existing = RequestContext.getEntityManager()?.findOne(
          Organization,
          {
            name: value,
          },
        );
        return existing !== null;
      },
      {
        message: "Organization name has been taken.",
      },
    ),
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

export const createAdminUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export type CreateAdminUserDto = z.infer<typeof createAdminUserSchema>;

// Param validation schema
export const orgIdParamSchema = z.object({
  orgId: z.coerce.number().int().positive(),
});

export type OrgIdParam = z.infer<typeof orgIdParamSchema>;
