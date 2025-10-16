import { Request, Response } from "express";
import Organization from "../entitites/organization.entity";
import { RequestContext } from "@mikro-orm/core";

export async function getAllOrganizations(req: Request, res: Response) {
  try {
    const em = RequestContext.getEntityManager();
    const organizations = await em?.find(Organization, {});
    res.status(200).json(organizations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch organizations" });
  }
}
