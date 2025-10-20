import {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";
import {
  getOrgDbName,
  getOrgDbUser,
  getOrgSecretName,
} from "../utils/organization";
import format from "pg-format";

// Allow injection of mock clients for testing
let secretsClient: SecretsManagerClient;

// Initialize the secrets client
const getSecretsClient = (): SecretsManagerClient => {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return secretsClient;
};

// Allow injection of a mock client for testing
export const setSecretsClient = (client: SecretsManagerClient): void => {
  secretsClient = client;
};

// Generate a random password
const generatePassword = (length: number = 16): string => {
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
  // Step 1: Create database and user
  const client = new Client(masterConnection);
  try {
    await client.connect();

    // Create the new database
    console.log(`Creating database: ${dbName}`);
    await client.query(`CREATE DATABASE "${dbName}"`);

    // Create the new user with a secure password
    console.log(`Creating user: ${dbUser}`);
    await client.query(
      format("CREATE USER %I WITH PASSWORD %L", dbUser, dbPassword),
    );

    // Grant necessary permissions to the user for their database only
    console.log(`Granting permissions to ${dbUser} for database ${dbName}`);
    await client.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${dbUser}"`);
    await client.query(`GRANT USAGE ON SCHEMA public TO "${dbUser}"`);
    await client.query(`GRANT CREATE ON SCHEMA public TO "${dbUser}"`);

    console.log(
      `Database and user created successfully for organization: ${orgName}`,
    );
  } catch (error) {
    console.error(`Error creating database and user:`, error);
    throw new Error(
      `Failed to create database and user: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    await client.end();
  }

  // Step 2: Grant privileges on the new database
  const orgDbConnection = {
    ...masterConnection,
    database: dbName,
  };

  const orgClient = new Client(orgDbConnection);
  try {
    await orgClient.connect();

    // Grant all privileges on the new database to the user
    await orgClient.query(
      `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`,
    );

    console.log(`Privileges granted successfully for ${dbUser}`);
  } catch (error) {
    console.error(`Error granting privileges:`, error);
    throw new Error(
      `Failed to grant privileges: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    await orgClient.end();
  }

  // Step 3: Create secret in AWS Secrets Manager with the database credentials
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
    const secretsClient = getSecretsClient();
    await secretsClient.send(new CreateSecretCommand(createSecretParams));
    console.log(`Secret created successfully: ${secretName}`);
  } catch (error) {
    console.error("Error creating secret in AWS Secrets Manager:", error);
    throw new Error(
      `Failed to create secret: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
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
      const client = getSecretsClient();
      await client.send(
        new DeleteSecretCommand({
          SecretId: secretName,
          ForceDeleteWithoutRecovery: true,
        }),
      );
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

        // Drop the database
        console.log(`Dropping database: ${dbName}`);
        await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);

        // Drop the user
        console.log(`Dropping user: ${dbUser}`);
        await client.query(`DROP USER IF EXISTS "${dbUser}"`);

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
  } catch (error) {
    console.error("Error deleting organization database:", error);
  }
};
