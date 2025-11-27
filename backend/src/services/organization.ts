import { Client } from "pg";
import {
  getOrgDbName,
  getOrgDbUser,
  getOrgSecretName,
  sanitizeOrgName,
} from "../utils/organization";
import format from "pg-format";
import { secretsManagerService } from "./secrets-manager.service";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, sql, asc } from "drizzle-orm";
import * as centralSchema from "../db/schema/central/schema";
import { organizationTable } from "../db/schema/central/schema";
import { Organization, NewOrganization } from "../db/schema/central/types";
import { organizationUserTable, adminProfileTable } from "../db/schema/distributed/schema";
import { getOrgDb } from "../db/drizzle-organization-db";
import jwtService from "./jwt.service";
import { securityLogger } from "../utils/logger";
import { clearOrgCache } from "../middleware/org";
import { runMigrationsForSingleDistributedDb } from "../utils/migrations";

type CentralDatabase = NodePgDatabase<typeof centralSchema>;

/**
 * Organization Database Management Service
 *
 * This service handles physical PostgreSQL database creation and deletion
 * for multi-tenant organizations. It uses raw pg.Client for admin operations
 * that cannot be performed through an ORM (CREATE DATABASE, CREATE USER, etc.).
 *
 *
 */

// Generate a random password
const generatePassword = (length: number = 16): string => {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    return "testpassword";
  }
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export const createOrganizationDb = async (orgName: string) => {
  // Generate database identifiers using utility functions
  const dbName = getOrgDbName(orgName);
  const dbUser = getOrgDbUser(orgName);
  const secretName = getOrgSecretName(orgName);

  // Generate secure password for the new database user
  const dbPassword = generatePassword(24);

  // Get the main RDS instance details
  const masterDbHost = process.env.DB_HOST;
  const masterDbPort = process.env.DB_PORT || "5432";
  const masterDbUser = process.env.DB_USER;
  const masterDbPassword = process.env.DB_PASSWORD;

  if (!masterDbHost || !masterDbUser || !masterDbPassword) {
    throw new Error(
      "Master database connection details not found in environment variables",
    );
  }

  console.log(`Creating database and user for organization: ${orgName}`);

  // Connect to the main PostgreSQL instance as master user
  const masterConnection = {
    host: masterDbHost,
    port: parseInt(masterDbPort),
    user: masterDbUser,
    password: masterDbPassword,
    database: process.env.DB_NAME,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  };

  // Step 1: Create database and user with proper isolation
  let client: Client = new Client(masterConnection);
  let clientConnected = false;
  try {
    await client.connect();
    clientConnected = true;

    // Create the new database
    console.log(`Creating database: ${dbName}`);
    try {
      await client.query(`CREATE DATABASE "${dbName}"`);
      await client.query(`REVOKE CONNECT ON DATABASE "${dbName}" FROM PUBLIC`);
    } catch (createError: any) {
      // In test environment, if database exists (from failed cleanup), drop and recreate
      if (createError.code === '42P04' && process.env.NODE_ENV === 'test') {
        console.log(`Database ${dbName} exists from previous test, dropping and recreating...`);
        // Close current connection before force drop (force drop kills all connections)
        await client.end();
        clientConnected = false;

        // Reconnect with a new client
        const newClient = new Client(masterConnection);
        await newClient.connect();
        clientConnected = true;

        // Terminate all connections to the database first
        console.log(`Terminating connections to database: ${dbName}`);
        const terminateResult = await newClient.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
            AND pid <> pg_backend_pid()
        `, [dbName]);
        console.log(`Terminated ${terminateResult.rowCount} connections`);

        // Wait for termination to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Drop and recreate
        await newClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        await new Promise(resolve => setTimeout(resolve, 500));
        await newClient.query(`CREATE DATABASE "${dbName}"`);
        await newClient.query(`REVOKE CONNECT ON DATABASE "${dbName}" FROM PUBLIC`);

        // Use the new client for the rest of the function
        client = newClient;
      } else {
        throw createError;
      }
    }

    // Create the new user with a secure password
    // Explicitly set NOCREATEDB, NOCREATEROLE, NOSUPERUSER for security
    // (these are defaults, but being explicit is better for security clarity)
    console.log(`Creating user: ${dbUser}`);
    try {
      await client.query(
        format("CREATE USER %I WITH PASSWORD %L NOCREATEDB NOCREATEROLE NOSUPERUSER", dbUser, dbPassword),
      );
    } catch (userError: any) {
      // Handle user already exists in test environment
      if (userError.code === '42710' && process.env.NODE_ENV === 'test') {
        console.log(`User ${dbUser} already exists in test environment, continuing...`);
      } else {
        throw userError;
      }
    }

    // Revoke default permissions to improve isolation
    console.log(`Setting up proper isolation for ${dbUser}`);

    // Revoke any default CONNECT permissions the user might have
    // Get list of all databases and revoke CONNECT from all except the org's database
    const dbListResult = await client.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false AND datname != $1`,
      [dbName],
    );

    for (const row of dbListResult.rows) {
      const otherDbName = row.datname;
      try {
        await client.query(
          `REVOKE CONNECT ON DATABASE "${otherDbName}" FROM "${dbUser}"`,
        );
      } catch (revokeError) {
        // It's okay if revoke fails - user might not have had permission anyway
        console.log(
          `Note: Could not revoke CONNECT on ${otherDbName} from ${dbUser} (expected if no permission existed)`,
        );
      }
    }

    // Now grant CONNECT permission to the organization's database
    console.log(
      `Granting connect permission to ${dbUser} for database ${dbName}`,
    );
    await client.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${dbUser}"`);

    // Note: No need to explicitly set NOCREATEDB, NOCREATEROLE, and NOSUPERUSER
    // as these are the default settings when creating a user with CREATE USER.
    // Attempting to set NOSUPERUSER requires SUPERUSER privileges which the
    // RDS master user doesn't have in AWS RDS PostgreSQL.

    console.log(
      `Database and user created successfully for organization: ${orgName}`,
    );
  } catch (error) {
    console.error(`Error creating database and user:`, error);
    throw new Error(
      `Failed to create database and user: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    if (clientConnected) {
      await client.end();
    }
  }

  // Step 2: Connect to the new database and set schema ownership
  const orgDbConnection = {
    ...masterConnection,
    database: dbName,
  };

  const orgClient = new Client(orgDbConnection);
  try {
    await orgClient.connect();

    // Make the new user the owner of the public schema
    console.log(`Setting ${dbUser} as owner of public schema in ${dbName}`);
    await orgClient.query(`ALTER SCHEMA public OWNER TO "${dbUser}"`);

    // Grant all privileges on the database to the user (but only this database)
    await orgClient.query(
      `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`,
    );

    // Grant all privileges on all tables in public schema
    await orgClient.query(
      `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${dbUser}"`,
    );

    // Grant all privileges on all sequences in public schema
    await orgClient.query(
      `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${dbUser}"`,
    );

    // Set default privileges for future objects
    await orgClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}"`,
    );
    await orgClient.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${dbUser}"`,
    );

    console.log(
      `Schema ownership and privileges granted successfully for ${dbUser}`,
    );
  } catch (error) {
    console.error(`Error setting schema ownership:`, error);
    throw new Error(
      `Failed to set schema ownership: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    await orgClient.end();
  }

  // Create secret in secrets manager
  console.log(`Creating secret in AWS Secrets Manager: ${secretName}`);

  const secretValue = {
    username: dbUser,
    password: dbPassword,
    engine: "postgres",
    host: masterDbHost,
    port: parseInt(masterDbPort),
    dbname: dbName,
  };

  const createSecretParams = {
    Name: secretName,
    Description: `Database credentials for ${orgName} clinic organization`,
    SecretString: JSON.stringify(secretValue),
    Tags: [
      {
        Key: "Organization",
        Value: orgName,
      },
    ],
  };

  try {
    await secretsManagerService.createSecret(createSecretParams);
    console.log(`Secret created successfully: ${secretName}`);
  } catch (error) {
    // Handle existing secret idempotently
    if (error instanceof Error && error.name === 'ResourceExistsException') {
      console.log(`Secret ${secretName} already exists, updating in test environment...`);
      if (process.env.NODE_ENV === 'test') {
        // In test environment, delete and recreate the secret
        try {
          await secretsManagerService.deleteSecret({
            SecretId: secretName,
            ForceDeleteWithoutRecovery: true,
          });
          // Wait for deletion to complete
          await new Promise(resolve => setTimeout(resolve, 200));
          // Recreate the secret
          await secretsManagerService.createSecret(createSecretParams);
          console.log(`Secret recreated successfully: ${secretName}`);
        } catch (updateError) {
          console.error("Error updating secret in test environment:", updateError);
          throw new Error(
            `Failed to update secret: ${updateError instanceof Error ? updateError.message : "Unknown error"}`,
          );
        }
      } else {
        // In production, treat existing secret as an error
        throw error;
      }
    } else {
      console.error("Error creating secret in AWS Secrets Manager:", error);
      throw new Error(
        `Failed to create secret: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return {
    success: true,
    dbName,
    dbUser,
    secretName,
    message: `Successfully created database and credentials for organization: ${orgName}`,
  };
};

export const deleteOrganizationDb = async (orgName: string) => {
  try {
    // Generate database identifiers using utility functions
    const dbName = getOrgDbName(orgName);
    const dbUser = getOrgDbUser(orgName);
    const secretName = getOrgSecretName(orgName);

    console.log(`Cleaning up database and user for organization: ${orgName}`);

    // Delete the secret
    try {
      console.log(`Deleting secret from AWS Secrets Manager: ${secretName}`);
      await secretsManagerService.deleteSecret({
        SecretId: secretName,
        ForceDeleteWithoutRecovery: true,
      });
      console.log(`Secret deleted successfully: ${secretName}`);
    } catch (secretError) {
      console.error(`Failed to delete secret ${secretName}:`, secretError);
      // Continue with database cleanup even if secret deletion fails
    }

    const masterDbHost = process.env.DB_HOST;
    const masterDbPort = process.env.DB_PORT || "5432";
    const masterDbUser = process.env.DB_USER;
    const masterDbPassword = process.env.DB_PASSWORD;

    if (masterDbHost && masterDbUser && masterDbPassword) {
      const masterConnection = {
        host: masterDbHost,
        port: parseInt(masterDbPort),
        user: masterDbUser,
        password: masterDbPassword,
        database: process.env.DB_NAME,
        ssl:
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
      };

      const client = new Client(masterConnection);
      let clientConnected = false;

      try {
        await client.connect();
        clientConnected = true;

        // Terminate all connections to the database first
        console.log(`Terminating connections to database: ${dbName}`);
        const terminateResult = await client.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
            AND pid <> pg_backend_pid()
        `, [dbName]);
        console.log(`Terminated ${terminateResult.rowCount} connections`);

        // Wait for termination to complete
        await new Promise(resolve => setTimeout(resolve, 300));

        // Clean up ownership and privileges before dropping the database
        try {
          // Check if database exists before attempting cleanup
          const dbCheckResult = await client.query(
            `SELECT 1 FROM pg_database WHERE datname = $1`,
            [dbName]
          );

          if (dbCheckResult.rowCount && dbCheckResult.rowCount > 0) {
            console.log(`Cleaning up ownership and privileges for ${dbUser}`);

            // Connect to the organization database to reassign ownership
            const orgDbConnection = {
              ...masterConnection,
              database: dbName,
            };

            const orgClient = new Client(orgDbConnection);
            try {
              await orgClient.connect();

              // Reassign ownership of all objects to master user
              console.log(`Reassigning ownership from ${dbUser} to ${masterDbUser}`);
              await orgClient.query(format('REASSIGN OWNED BY %I TO %I', dbUser, masterDbUser));

              // Drop all privileges granted to the user
              console.log(`Dropping privileges for ${dbUser}`);
              await orgClient.query(format('DROP OWNED BY %I', dbUser));

              console.log(`Ownership cleanup completed for ${dbUser}`);
            } finally {
              await orgClient.end();
            }

            // Wait for ownership changes to be processed
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            console.log(`Database ${dbName} does not exist, skipping ownership cleanup`);
          }
        } catch (ownershipError: any) {
          // If database doesn't exist (error code 3D000), that's fine
          if (ownershipError.code === '3D000') {
            console.log(`Database ${dbName} does not exist during ownership cleanup (already cleaned up)`);
          } else if (ownershipError.code === '42704') {
            // Role does not exist - this is fine, nothing to clean up
            console.log(`Role ${dbUser} does not exist during ownership cleanup`);
          } else {
            // Log other errors but continue - the FORCE drop might still work
            console.error(`Error during ownership cleanup for ${dbUser}:`, ownershipError);
            console.log(`Continuing with database drop despite ownership cleanup error`);
          }
        }

        // Drop the database with FORCE to handle checkpoint issues
        console.log(`Dropping database: ${dbName}`);
        try {
          // Use FORCE to skip checkpoint and forcefully drop
          await client.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
          console.log(`Successfully dropped database: ${dbName}`);
        } catch (dropError: any) {
          // If database doesn't exist, that's fine (already cleaned up)
          if (dropError.code === '3D000') {
            console.log(`Database ${dbName} does not exist (already cleaned up)`);
          } else if (dropError.message?.includes('checkpoint request failed') && process.env.NODE_ENV === 'test') {
            // In tests, checkpoint failures on tmpfs are expected - database will be cleaned on container restart
            console.log(`Checkpoint failed for ${dbName} (expected in test environment with tmpfs)`);
          } else {
            console.error(`Failed to drop database ${dbName}:`, dropError);
            throw dropError;
          }
        }

        // Drop the user
        console.log(`Dropping user: ${dbUser}`);
        try {
          await client.query(`DROP USER IF EXISTS "${dbUser}"`);
          console.log(`Successfully dropped user: ${dbUser}`);
        } catch (dropUserError: any) {
          // Handle specific error codes
          if (dropUserError.code === '42704') {
            // Role does not exist - this is a no-op
            console.log(`User ${dbUser} does not exist (already cleaned up)`);
          } else if (dropUserError.code === '2BP01') {
            // Dependent objects still exist
            console.error(`Cannot drop user ${dbUser}: dependent objects still exist`);
            console.log(`Error details:`, dropUserError.message);
          } else {
            // Log other errors and continue
            console.error(`Error dropping user ${dbUser}:`, dropUserError);
          }
        }

        console.log(
          `Database and user deleted successfully for organization: ${orgName}`,
        );
      } finally {
        if (clientConnected) {
          await client.end();
        }
      }
    } else {
      console.log(
        "Skipping database deletion - missing database connection details",
      );
    }

    // In test environment, wait to ensure PostgreSQL fully processes the drop
    if (process.env.NODE_ENV === 'test') {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error("Error deleting organization database:", error);
  }
};

/**
 * Helper function to check if error has a code property
 */
function isDatabaseError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof (error as any).code === 'string';
}

/**
 * OrganizationService
 *
 * Handles organization CRUD business logic including organization creation,
 * retrieval, counting, admin user creation, and existence checks.
 */
class OrganizationService {
  /**
   * Create a new organization with database provisioning and migration
   */
  async createOrganization(
    db: CentralDatabase,
    orgName: string,
    createdBy: number
  ) {
    // Check if organization already exists (exact match)
    const existingOrg = await db
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.name, orgName))
      .limit(1);

    if (existingOrg.length > 0) {
      throw new Error(`Organization with name '${orgName}' already exists`);
    }

    // Check for sanitized-name collision to prevent 500 errors during DB creation
    const sanitizedName = sanitizeOrgName(orgName);
    const allOrgs = await db.select().from(organizationTable);
    const sanitizedCollision = allOrgs.find(
      (org) => sanitizeOrgName(org.name) === sanitizedName
    );

    if (sanitizedCollision) {
      throw new Error('Organization with this name already exists');
    }

    // Prepare organization data
    const newOrgData: NewOrganization = {
      name: orgName,
    };

    // Create physical database
    let dbResult;
    try {
      dbResult = await createOrganizationDb(orgName);
    } catch (error) {
      throw new Error(`Failed to create organization database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Run migrations on the new database
    try {
      await runMigrationsForSingleDistributedDb({ name: orgName });
    } catch (migrationError) {
      // Rollback database creation on migration failure
      try {
        await deleteOrganizationDb(orgName);
      } catch (rollbackError) {
        console.error('Failed to rollback database creation:', rollbackError);
      }
      throw new Error(`Failed to initialize organization database schema: ${migrationError instanceof Error ? migrationError.message : 'Unknown error'}`);
    }

    // Persist organization record
    let organization: Organization;
    try {
      const [inserted] = await db
        .insert(organizationTable)
        .values(newOrgData)
        .returning();

      if (!inserted) {
        throw new Error('Failed to insert organization record');
      }

      organization = inserted;
    } catch (persistError) {
      // Rollback database creation on persist failure
      try {
        await deleteOrganizationDb(orgName);
      } catch (rollbackError) {
        console.error('Failed to rollback database creation:', rollbackError);
      }

      // Check for unique constraint violation
      if (
        isDatabaseError(persistError) && persistError.code === '23505' ||
        (persistError instanceof Error && persistError.message.includes('unique'))
      ) {
        throw new Error('Organization with this name already exists');
      }

      throw persistError;
    }

    // Clear organization cache (use sanitized name to match cache key)
    await clearOrgCache(sanitizeOrgName(organization.name));

    // Log security event
    securityLogger.organizationCreated(organization.name, createdBy);

    // Return structured response
    return {
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
    };
  }

  /**
   * Get all organizations ordered by ID
   */
  async getAllOrganizations(db: CentralDatabase) {
    const organizations = await db
      .select()
      .from(organizationTable)
      .orderBy(asc(organizationTable.id));

    return organizations;
  }

  /**
   * Get count of all organizations
   */
  async getOrganizationsCount(db: CentralDatabase) {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(organizationTable);

    const count = result[0]?.count || 0;

    return { count };
  }

  /**
   * Create an admin user for an organization
   */
  async createAdminUser(
    db: CentralDatabase,
    orgId: number,
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) {
    // Find organization by ID
    const [organization] = await db
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.id, orgId))
      .limit(1);

    if (!organization) {
      throw new Error('Organization not found');
    }

    // Get organization database
    const orgDb = await getOrgDb(organization.name);

    // Check if user already exists
    const existingUser = await orgDb
      .select()
      .from(organizationUserTable)
      .where(eq(organizationUserTable.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('User with this email already exists in the organization');
    }

    // Hash password
    const hashedPassword = await jwtService.hashPassword(password);

    // Create admin user with transaction
    const result = await orgDb.transaction(async (tx) => {
      // Insert admin profile
      const [adminProfile] = await tx
        .insert(adminProfileTable)
        .values({})
        .returning();

      if (!adminProfile) {
        throw new Error('Failed to create admin profile');
      }

      // Insert organization user
      const [user] = await tx
        .insert(organizationUserTable)
        .values({
          email,
          password: hashedPassword,
          firstName,
          lastName,
          adminProfileId: adminProfile.id,
        })
        .returning();

      if (!user) {
        throw new Error('Failed to create organization user');
      }

      return { user, adminProfile };
    });

    // Return structured response
    return {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: 'admin' as const,
    };
  }

  /**
   * Check if organization exists by slug
   */
  async checkOrganizationExists(db: CentralDatabase, orgSlug: string) {
    // Fetch all organizations
    const allOrgs = await db.select().from(organizationTable);

    // Find organization with matching sanitized name
    const organization = allOrgs.find(
      (org) => sanitizeOrgName(org.name) === sanitizeOrgName(orgSlug)
    );

    return !!organization;
  }
}

export const organizationService = new OrganizationService();
