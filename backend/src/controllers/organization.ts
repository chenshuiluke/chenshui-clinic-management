import { Request, Response } from "express";
import { BaseController } from "./base";
import Organization from "../entitites/organization.entity";

export default class OrganizationController extends BaseController {
  async create(req: Request, res: Response) {
    const organization = this.em.create(Organization, req.body);
    await this.em.persistAndFlush(organization);
    res.status(201).json(organization);
  }

  async getAllOrganizations(req: Request, res: Response) {
    try {
      const organizations = await this.em.find(Organization, {});
      res.status(200).json(organizations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  }
}
