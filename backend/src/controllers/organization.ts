import { Request, Response } from "express";
import BaseController from "./base";
import Organization from "../entities/central/organization";
import {
  createOrganizationDb,
  deleteOrganizationDb,
} from "../services/organization";
import { getOrgEm } from "../db/organization-db";
import OrganizationUser from "../entities/distributed/organization_user";
import AdminProfile from "../entities/distributed/admin_profile";
import jwtService from "../services/jwt.service";
import cryptoService from "../utils/crypto";
import { securityLogger } from "../utils/logger";
import { clearOrgCache } from "../middleware/org";
import { CreateAdminUserDto, CreateOrganizationDto, OrgIdParam } from "../validators/organization";
import { runMigrationsForSingleDistributedDb } from "../utils/migrations";

function isDatabaseError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof (error as any).code === 'string';
}

export default class OrganizationController extends BaseController {
  create = async (req: Request, res: Response) => {
    let dbCreated = false;
    const orgName = req.body.name;

    try {
      // Check if organization with this name already exists FIRST
      const existingOrganization = await this.em.findOne(Organization, { name: orgName });
      if (existingOrganization) {
        return res.status(409).json({
          error: `Organization with name '${orgName}' already exists`,
        });
      }

      // Create the organization entity in the central database but don't persist it yet
      const organization = this.em.create(Organization, req.body);

      // Create the organization's dedicated database and credentials
      const dbResult = await createOrganizationDb(organization.name);
      dbCreated = true;

      // Run migrations on the newly created database
      try {
        console.log(`Running migrations for organization: ${organization.name}`);
        await runMigrationsForSingleDistributedDb(organization, false);
        console.log(`Migrations completed successfully for: ${organization.name}`);
      } catch (migrationError) {
        console.error(
          `Failed to run migrations for organization ${organization.name}:`,
          migrationError,
        );
        await deleteOrganizationDb(organization.name);
        return res.status(500).json({
          error: "Failed to initialize organization database schema",
        });
      }

      try {
        // Persist to central database only after the database creation succeeded
        await this.em.persistAndFlush(organization);

        // Clear org cache since a new org was created
        clearOrgCache(organization.name);

        // Log organization creation
        securityLogger.organizationCreated(organization.name, req.user?.userId || 0);

        // Return the organization along with database creation info
        res.status(201).json({
          id: organization.id,
          name: organization.name,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
          database: {
            created: true,
            dbName: dbResult.dbName,
            secretName: dbResult.secretName,
            message: dbResult.message,
          },
        });
      } catch (persistError) {
        // If persisting to central DB fails, rollback the database creation
        console.error(
          "Failed to persist organization to central DB, rolling back database creation:",
          persistError,
        );

        await deleteOrganizationDb(organization.name);
        dbCreated = false;

        if (
          isDatabaseError(persistError) &&
          (persistError.code === '23505' || persistError.message.includes("unique"))
        ) {
          return res.status(409).json({
            error: "Organization with this name already exists",
          });
        }

        throw persistError;
      }
    } catch (error) {
      console.error("Failed to create organization:", error);

      // If database was created but we haven't returned yet, clean it up
      if (dbCreated && orgName) {
        await deleteOrganizationDb(orgName);
      }

      if (isDatabaseError(error) && (error.code === '23505' || error.message.includes("unique"))) {
        return res.status(409).json({
          error: "Organization with this name already exists",
        });
      }

      if (
        error instanceof Error &&
        error.message.includes("Failed to create organization database")
      ) {
        return res.status(500).json({
          error: error.message,
        });
      }

      res.status(500).json({
        error: "Failed to create organization",
      });
    }
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

  createAdminUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = parseInt(req.params.orgId!);
      const { email, password, firstName, lastName } = req.body;

      // Find the organization in the central database
      const organization = await this.em.findOne(Organization, { id: orgId! });
      if (!organization) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      // Get the organization-specific database EntityManager
      const orgEm = await getOrgEm(organization.name);

      // Check if user with this email already exists in the organization database
      const existingUser = await orgEm.findOne(OrganizationUser, { email });
      if (existingUser) {
        res.status(409).json({
          error: "User with this email already exists in the organization",
        });
        return;
      }

      // Hash the password
      const hashedPassword = await jwtService.hashPassword(password);

      // Create AdminProfile entity
      const adminProfile = orgEm.create(AdminProfile, {});

      // Create OrganizationUser entity with adminProfile
      const organizationUser = orgEm.create(OrganizationUser, {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        adminProfile,
      });

      // Persist both entities to the organization database
      await orgEm.persistAndFlush([adminProfile, organizationUser]);

      // Return the created user information
      res.status(201).json({
        id: organizationUser.id,
        email: organizationUser.email,
        firstName: organizationUser.firstName,
        lastName: organizationUser.lastName,
        role: "admin",
      });
    } catch (error) {
      console.error("Failed to create admin user:", error);
      res.status(500).json({ error: "Failed to create admin user" });
    }
  };
}
