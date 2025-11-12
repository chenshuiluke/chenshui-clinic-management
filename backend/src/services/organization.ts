import { Client } from "pg";
import {
  getOrgDbName,
  getOrgDbUser,
  getOrgSecretName,
} from "../utils/organization";
import format from "pg-format";
import { secretsManagerService } from "./secrets-manager.service";

/**
 * Organization Database Management Service
 *
 * This service handles physical PostgreSQL database creation and deletion
 * for multi-tenant organizations. It uses raw pg.Client for admin operations
 * that cannot be performed through an ORM (CREATE DATABASE, CREATE USER, etc.).
 *
 * Note: This service is ORM-agnostic and uses raw PostgreSQL client for database operations.
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
    console.log(`Creating user: ${dbUser}`);
    try {
      await client.query(
        format("CREATE USER %I WITH PASSWORD %L", dbUser, dbPassword),
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

    // Ensure the user cannot create new databases
    await client.query(`ALTER USER "${dbUser}" NOCREATEDB`);

    // Ensure the user cannot create new roles
    await client.query(`ALTER USER "${dbUser}" NOCREATEROLE`);

    // Ensure the user is not a superuser
    await client.query(`ALTER USER "${dbUser}" NOSUPERUSER`);

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
