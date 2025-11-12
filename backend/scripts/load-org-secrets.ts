#!/usr/bin/env tsx

/**
 * Loader script for organization database credentials from AWS Secrets Manager
 *
 * This script:
 * 1. Takes DRIZZLE_ORG_NAME environment variable
 * 2. Fetches credentials from AWS Secrets Manager using secretsManagerService
 * 3. Sets environment variables: ORG_DB_HOST, ORG_DB_PORT, ORG_DB_USER, ORG_DB_PASSWORD, ORG_DB_NAME
 * 4. Spawns drizzle-kit with the provided arguments
 *
 * Usage:
 *   DRIZZLE_ORG_NAME=acme tsx scripts/load-org-secrets.ts pull --config=drizzle-org.config.ts
 */

import { spawn } from "child_process";
import { getOrgDbName, getOrgDbUser, getOrgSecretName } from "../src/utils/organization";
import { secretsManagerService } from "../src/services/secrets-manager.service";
import { env } from "../src/config/env";

async function main() {
  const orgName = process.env.DRIZZLE_ORG_NAME;

  if (!orgName) {
    console.error(
      "Error: DRIZZLE_ORG_NAME environment variable is required for organization database operations."
    );
    console.error("Example: DRIZZLE_ORG_NAME=acme npm run drizzle:pull:org");
    process.exit(1);
  }

  console.log(`Loading credentials for organization: ${orgName}`);

  const dbName = getOrgDbName(orgName);
  const dbUser = getOrgDbUser(orgName);

  // Get database credentials from Secrets Manager
  const secretName = getOrgSecretName(orgName);

  let credentials: {
    host: string;
    port: number;
    password: string;
  };

  try {
    const secret = await secretsManagerService.getSecretValue({
      SecretId: secretName,
    });

    if (!secret.SecretString) {
      // In dev/test mode, derive credentials locally when secret doesn't exist
      if (env.isMockMode) {
        console.log(`Mock mode: Using default credentials for ${orgName}`);
        credentials = {
          host: process.env.DB_HOST || "localhost",
          port: parseInt(process.env.DB_PORT || "5432"),
          password: "testpassword",
        };
      } else {
        // In production, throw error if secret is missing
        throw new Error(
          `No credentials found for organization: ${orgName} (secret: ${secretName})`
        );
      }
    } else {
      credentials = JSON.parse(secret.SecretString);
      console.log(`Successfully loaded credentials from ${secretName}`);
    }
  } catch (error) {
    console.error(`Failed to load credentials: ${error}`);
    process.exit(1);
  }

  // Set environment variables for drizzle-org.config.ts
  process.env.ORG_DB_HOST = credentials.host;
  process.env.ORG_DB_PORT = credentials.port.toString();
  process.env.ORG_DB_USER = dbUser;
  process.env.ORG_DB_PASSWORD = env.isProduction ? credentials.password : "testpassword";
  process.env.ORG_DB_NAME = dbName;

  console.log(`Database config: ${dbUser}@${credentials.host}:${credentials.port}/${dbName}`);

  // Get drizzle-kit arguments from command line (everything after the script name)
  const drizzleArgs = process.argv.slice(2);

  if (drizzleArgs.length === 0) {
    console.error("Error: No drizzle-kit command specified");
    console.error("Usage: tsx scripts/load-org-secrets.ts <drizzle-kit-command> [args...]");
    console.error("Example: tsx scripts/load-org-secrets.ts pull --config=drizzle-org.config.ts");
    process.exit(1);
  }

  console.log(`Running: drizzle-kit ${drizzleArgs.join(" ")}`);

  // Spawn drizzle-kit with the provided arguments
  const drizzleProcess = spawn("drizzle-kit", drizzleArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
    },
  });

  drizzleProcess.on("close", (code) => {
    process.exit(code || 0);
  });

  drizzleProcess.on("error", (error) => {
    console.error(`Failed to start drizzle-kit: ${error}`);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(`Unexpected error: ${error}`);
  process.exit(1);
});
