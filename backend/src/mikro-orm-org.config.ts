import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";

const config = defineConfig({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "clinic_user",
  password: process.env.DB_PASSWORD || "clinic_password",
  dbName: process.env.DB_NAME || "clinic_db",

  // SSL configuration for RDS
  driverOptions: {
    connection: {
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
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

  seeder: {
    path: "./dist/seeders",
    pathTs: "./src/seeders",
    glob: "!(*.d).{js,ts}",
    emit: "ts",
    defaultSeeder: "DatabaseSeeder",
  },
});

export default config;
