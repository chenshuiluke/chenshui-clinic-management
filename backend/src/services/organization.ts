import {
  SecretsManagerClient,
  CreateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import { Client } from "pg";
import {
  getOrgDbName,
  getOrgDbUser,
  getOrgSecretName,
} from "../utils/organization";

// Initialize AWS Secrets Manager client
const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION || "us-east-1",
});

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
  try {
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
      database: "postgres", // Connect to postgres database to create new database
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

      // Create the new database
      console.log(`Creating database: ${dbName}`);
      await client.query(`CREATE DATABASE "${dbName}"`);

      // Create the new user with a secure password
      console.log(`Creating user: ${dbUser}`);
      await client.query(`CREATE USER "${dbUser}" WITH PASSWORD $1`, [
        dbPassword,
      ]);

      // Grant necessary permissions to the user for their database only
      console.log(`Granting permissions to ${dbUser} for database ${dbName}`);
      await client.query(
        `GRANT CONNECT ON DATABASE "${dbName}" TO "${dbUser}"`,
      );
      await client.query(`GRANT USAGE ON SCHEMA public TO "${dbUser}"`);
      await client.query(`GRANT CREATE ON SCHEMA public TO "${dbUser}"`);

      // Connect to the new database to set up schema-level permissions
      await client.end();
      clientConnected = false;

      const orgDbConnection = {
        ...masterConnection,
        database: dbName,
      };

      const orgClient = new Client(orgDbConnection);
      await orgClient.connect();

      // Grant all privileges on the new database to the user
      await orgClient.query(
        `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`,
      );
      await orgClient.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}"`,
      );
      await orgClient.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${dbUser}"`,
      );
      await orgClient.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO "${dbUser}"`,
      );

      await orgClient.end();

      console.log(
        `Database and user created successfully for organization: ${orgName}`,
      );
    } finally {
      if (clientConnected) {
        await client.end();
      }
    }

    // Create secret in AWS Secrets Manager with the database credentials
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

    await secretsClient.send(new CreateSecretCommand(createSecretParams));

    console.log(`Secret created successfully: ${secretName}`);

    return {
      success: true,
      dbName,
      dbUser,
      secretName,
      message: `Successfully created database and credentials for organization: ${orgName}`,
    };
  } catch (error) {
    console.error("Error creating organization database:", error);

    if (error instanceof Error) {
      throw new Error(
        `Failed to create organization database: ${error.message}`,
      );
    }

    throw new Error("Failed to create organization database: Unknown error");
  }
};
