import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { env } from "./config/env";

const config = defineConfig({
  logger: (message: string) => {
    console.log("central_log", message);
  },
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "clinic_user",
  password: process.env.DB_PASSWORD || "clinic_password",
  dbName: process.env.DB_NAME || "clinic_db",

  // Connection pool configuration
  pool: {
    min: 2,
    max: 10,
  },

  // SSL configuration for RDS
  driverOptions: {
    connection: {
      ssl:
        env.isProduction
          ? { rejectUnauthorized: false }
          : false,
      // Connection timeout
      connectionTimeoutMillis: 10000,
      // Query timeout
      query_timeout: 30000,
      // Statement timeout
      statement_timeout: 30000,
    },
  },

  // Use compiled JS files for entity discovery
  entities: ["./dist/entities/**/*.js"],
  entitiesTs: ["./src/entities/**/*.ts"],

  // Enable debug mode to log SQL queries
  debug: !env.isProduction,

  extensions: [Migrator],

  migrations: {
    path: "./dist/migrations/centralized",
    pathTs: "./src/migrations/centralized",
    glob: "!(*.d).{js,ts}",
    transactional: true,
    disableForeignKeys: false,
    allOrNothing: true,
    dropTables: false,
    safe: false,
    snapshot: true,
    emit: "ts",
  },

  seeder: {
    path: "./dist/seeders",
    pathTs: "./src/seeders",
    glob: "!(*.d).{js,ts}",
    emit: "ts",
    defaultSeeder: "DatabaseSeeder",
  },
});

export default config;
