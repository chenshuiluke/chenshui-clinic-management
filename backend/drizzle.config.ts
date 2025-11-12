import { defineConfig } from "drizzle-kit";
import { env } from "./src/config/env";

export default defineConfig({
  out: "./src/migrations/centralized-drizzle",
  schema: "./src/db/schema/central/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USER || "clinic_user",
    password: process.env.DB_PASSWORD || "clinic_password",
    database: process.env.DB_NAME || "clinic_db",
    ssl: env.isProduction ? { rejectUnauthorized: false } : false,
  },
});
