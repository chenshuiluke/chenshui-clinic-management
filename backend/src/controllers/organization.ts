import { Request, Response } from "express";
import { BaseController } from "./base";
import Organization from "../entities/central/organization.entity";

export default class OrganizationController extends BaseController {
  create = async (req: Request, res: Response) => {
    const organization = this.em.create(Organization, req.body);
    await this.em.persistAndFlush(organization);
    res.status(201).json(organization);
  };

  getAllOrganizations = async (req: Request, res: Response) => {
    try {
      const organizations = await this.em.find(Organization, {});
      res.status(200).json(organizations);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  };
}
