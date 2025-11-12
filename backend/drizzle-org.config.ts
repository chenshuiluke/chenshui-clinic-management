import { defineConfig } from "drizzle-kit";

// Synchronous default export for Drizzle Kit CLI usage
// Database credentials must be set via environment variables:
// - ORG_DB_HOST
// - ORG_DB_PORT
// - ORG_DB_USER
// - ORG_DB_PASSWORD
// - ORG_DB_NAME
// Use scripts/load-org-secrets.ts to load these from AWS Secrets Manager
export default defineConfig({
  out: "./src/migrations/distributed-drizzle",
  schema: "./src/db/schema/distributed/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.ORG_DB_HOST || "localhost",
    port: parseInt(process.env.ORG_DB_PORT || "5432"),
    user: process.env.ORG_DB_USER || "clinic_user",
    password: process.env.ORG_DB_PASSWORD || "testpassword",
    database: process.env.ORG_DB_NAME || "clinic_org_db",
    ssl: false,
  },
});
