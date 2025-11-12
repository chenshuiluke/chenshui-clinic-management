import { Request, Response } from "express";
import BaseController from "./base";
import { eq, sql, asc } from "drizzle-orm";
import {
  createOrganizationDb,
  deleteOrganizationDb,
} from "../services/organization";
import { organizationTable } from "../db/schema/central/schema";
import { Organization, NewOrganization } from "../db/schema/central/types";
import { organizationUserTable, adminProfileTable } from "../db/schema/distributed/schema";
import { OrganizationUser, NewOrganizationUser, AdminProfile, NewAdminProfile } from "../db/schema/distributed/types";
import { getOrgDb } from "../db/drizzle-organization-db";
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

    console.log(`Creating organization: ${orgName}`);

    try {
      const db = this.getCentralDb(req);

      // Check if organization with this name already exists FIRST
      console.log(`Checking for existing organization: ${orgName}`);
      const existingOrgs = await db.select().from(organizationTable).where(eq(organizationTable.name, orgName)).limit(1);
      const existingOrganization = existingOrgs.length > 0 ? existingOrgs[0] : null;
      if (existingOrganization) {
        return res.status(409).json({
          error: `Organization with name '${orgName}' already exists`,
        });
      }

      // Prepare the organization data but don't persist it yet
      const orgData: NewOrganization = { name: req.body.name };

      // Create the organization's dedicated database and credentials
      console.log(`Creating database for organization: ${orgData.name}`);
      const dbResult = await createOrganizationDb(orgData.name);
      dbCreated = true;
      console.log(`Database created successfully: ${dbResult.dbName}`);

      // Run migrations on the newly created database
      try {
        console.log(`Starting migrations for organization: ${orgData.name}`);
        await runMigrationsForSingleDistributedDb({ name: orgData.name });
        console.log(`Migrations completed successfully for: ${orgData.name}`);
      } catch (migrationError) {
        console.error(
          `Failed to run migrations for organization ${orgData.name}:`,
          migrationError,
        );
        await deleteOrganizationDb(orgData.name);
        return res.status(500).json({
          error: "Failed to initialize organization database schema",
        });
      }

      try {
        // Persist to central database only after the database creation succeeded
        const orgResults = await db.insert(organizationTable).values(orgData).returning();
        if (!orgResults || orgResults.length === 0 || !orgResults[0]) {
          throw new Error("Failed to insert organization: no data returned");
        }
        const organization = orgResults[0];

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

        await deleteOrganizationDb(orgData.name);
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
      const db = this.getCentralDb(req);
      const organizations = await db.select().from(organizationTable).orderBy(asc(organizationTable.id));
      res.status(200).json(organizations);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  };

  getOrganizationsCount = async (req: Request, res: Response) => {
    try {
      const db = this.getCentralDb(req);
      const result = await db.select({ count: sql<number>`count(*)::int` }).from(organizationTable);
      const count = result[0]?.count || 0;
      res.status(200).json({ count });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Failed to fetch organizations count" });
    }
  };

  createAdminUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const orgId = parseInt(req.params.orgId!);
      const { email, password, firstName, lastName } = req.body;

      // Find the organization in the central database
      const db = this.getCentralDb(req);
      const orgs = await db.select().from(organizationTable).where(eq(organizationTable.id, orgId)).limit(1);
      const organization = orgs.length > 0 ? orgs[0] : null;
      if (!organization) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      // Get the organization-specific database
      const orgDb = await getOrgDb(organization.name);

      // Check if user with this email already exists in the organization database
      const existingUsers = await orgDb.select().from(organizationUserTable).where(eq(organizationUserTable.email, email)).limit(1);
      const existingUser = existingUsers.length > 0 ? existingUsers[0] : null;
      if (existingUser) {
        res.status(409).json({
          error: "User with this email already exists in the organization",
        });
        return;
      }

      // Hash the password
      const hashedPassword = await jwtService.hashPassword(password);

      // Create AdminProfile and OrganizationUser in a transaction
      const result = await orgDb.transaction(async (tx) => {
        // Create AdminProfile first
        const adminProfileResults = await tx.insert(adminProfileTable).values({}).returning();
        if (!adminProfileResults || adminProfileResults.length === 0 || !adminProfileResults[0]) {
          throw new Error("Failed to insert admin profile: no data returned");
        }
        const adminProfile = adminProfileResults[0];

        // Create OrganizationUser with reference to adminProfile
        const organizationUserResults = await tx.insert(organizationUserTable).values({
          email,
          password: hashedPassword,
          firstName,
          lastName,
          adminProfileId: adminProfile.id,
        }).returning();
        if (!organizationUserResults || organizationUserResults.length === 0 || !organizationUserResults[0]) {
          throw new Error("Failed to insert organization user: no data returned");
        }
        const organizationUser = organizationUserResults[0];

        return { adminProfile, organizationUser };
      });

      const { adminProfile, organizationUser } = result;

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

  checkExists = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const CONSTANT_DELAY_MS = 100; // Small constant-time delay to mitigate timing attacks

    try {
      const orgName = req.params.orgName;
      const db = this.getCentralDb(req);

      const orgs = await db.select().from(organizationTable).where(eq(organizationTable.name, orgName)).limit(1);
      const organization = orgs.length > 0 ? orgs[0] : null;

      // Add remaining delay to reach constant time
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, CONSTANT_DELAY_MS - elapsed);
      if (remainingDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingDelay));
      }

      res.status(200).json({ exists: !!organization });
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
