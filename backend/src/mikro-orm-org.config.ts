import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import Organization from "./entities/central/organization";
import { getOrgDbName, getOrgDbUser } from "./utils/organization";
import { secretsManagerService } from "./services/secrets-manager.service";

export const getOrgConfig = async (organizationName: string) => {
  const dbName = getOrgDbName(organizationName);
  const dbUser = getOrgDbUser(organizationName);

  // Get database credentials from Secrets Manager
  const secretName = `clinic-db-${organizationName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  const secret = await secretsManagerService.getSecretValue({
    SecretId: secretName,
  });

  if (!secret.SecretString) {
    throw new Error(
      `No credentials found for organization: ${organizationName}`,
    );
  }

  const credentials = JSON.parse(secret.SecretString);

  return defineConfig({
    logger: (message: string) => {
      console.log("organization_" + organizationName + "_log", message);
    },
    host: credentials.host,
    port: credentials.port,
    user: dbUser,
    password:
      process.env.NODE_ENV === "production"
        ? credentials.password
        : "testpassword",
    dbName: dbName,

    // SSL configuration for RDS
    driverOptions: {
      connection: {
        ssl: false,
      },
    },

    entities: ["./dist/entities/**/*.js"],
    entitiesTs: ["./src/entities/**/*.ts"],

    // Enable debug mode to log SQL queries
    debug: process.env.NODE_ENV !== "production",

    extensions: [Migrator],

    migrations: {
      path: "./dist/migrations/distributed",
      pathTs: "./src/migrations/distributed",
      glob: "!(*.d).{js,ts}",
      transactional: true,
      disableForeignKeys: false,
      allOrNothing: true,
      dropTables: false,
      safe: false,
      snapshot: true,
      emit: "ts",
    },

    // seeder: {
    //   path: "./dist/seeders",
    //   pathTs: "./src/seeders",
    //   glob: "!(*.d).{js,ts}",
    //   emit: "ts",
    //   defaultSeeder: "DatabaseSeeder",
    // },
  });
};

export default getOrgConfig;
