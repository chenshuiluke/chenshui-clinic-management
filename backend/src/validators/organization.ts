import { RequestContext } from "@mikro-orm/core";
import Organization from "../entitites/organization.entity";
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
