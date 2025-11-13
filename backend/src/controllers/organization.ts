import { Request, Response } from "express";
import BaseController from "./base";
import { organizationService } from "../services/organization";
import { CreateAdminUserDto, CreateOrganizationDto, OrgIdParam } from "../validators/organization";

export default class OrganizationController extends BaseController {
  create = async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      const createdBy = req.user?.userId || 0;
      const db = this.getCentralDb(req);

      const result = await organizationService.createOrganization(db, name, createdBy);

      res.status(201).json(result);
    } catch (error) {
      console.error("Failed to create organization:", error);

      if (error instanceof Error) {
        if (error.message.includes("already exists")) {
          return res.status(409).json({ error: error.message });
        }

        if (error.message.includes("Failed to initialize organization database schema")) {
          return res.status(500).json({ error: error.message });
        }

        if (error.message.includes("Failed to create organization database")) {
          return res.status(500).json({ error: error.message });
        }
      }

      res.status(500).json({
        error: "Failed to create organization",
      });
    }
  };

  getAllOrganizations = async (req: Request, res: Response) => {
    try {
      const db = this.getCentralDb(req);
      const organizations = await organizationService.getAllOrganizations(db);
      res.status(200).json(organizations);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  };

  getOrganizationsCount = async (req: Request, res: Response) => {
    try {
      const db = this.getCentralDb(req);
      const result = await organizationService.getOrganizationsCount(db);
      res.status(200).json(result);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to fetch organizations count" });
    }
  };

  createAdminUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = parseInt(req.params.orgId!);
      const { email, password, firstName, lastName } = req.body;
      const db = this.getCentralDb(req);

      const result = await organizationService.createAdminUser(
        db,
        orgId,
        email,
        password,
        firstName,
        lastName
      );

      res.status(201).json(result);
    } catch (error) {
      console.error("Failed to create admin user:", error);

      if (error instanceof Error) {
        if (error.message === "Organization not found") {
          res.status(404).json({ error: error.message });
          return;
        }

        if (error.message.includes("already exists")) {
          res.status(409).json({ error: error.message });
          return;
        }
      }

      res.status(500).json({ error: "Failed to create admin user" });
    }
  };

  checkExists = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const CONSTANT_DELAY_MS = 100; // Small constant-time delay to mitigate timing attacks

    try {
      let orgSlug = req.params.orgName;
      if (!orgSlug) {
        res.status(400).json({ error: "Organization name is required" });
        return;
      }

      // Decode URL-encoded organization name
      orgSlug = decodeURIComponent(orgSlug);
      const db = this.getCentralDb(req);

      const exists = await organizationService.checkOrganizationExists(db, orgSlug);

      // Add remaining delay to reach constant time
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, CONSTANT_DELAY_MS - elapsed);
      if (remainingDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingDelay));
      }

      res.status(200).json({ exists });
    } catch (error) {
      console.error("Failed to check organization existence:", error);

      // Even on error, maintain constant time
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, CONSTANT_DELAY_MS - elapsed);
      if (remainingDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingDelay));
      }

      res.status(200).json({ exists: false });
    }
  };
}
