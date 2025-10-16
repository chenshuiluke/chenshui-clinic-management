import { defineConfig } from "@mikro-orm/postgresql";
import { TsMorphMetadataProvider } from "@mikro-orm/reflection";

const config = defineConfig({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "clinic_user",
  password: process.env.DB_PASSWORD || "clinic_password",
  dbName: process.env.DB_NAME || "clinic_db",

  // Use folder-based discovery
  entities: ['./dist/entitites/**/*.js'],
  entitiesTs: ['./src/entitites/**/*.ts'],

  // Use TsMorphMetadataProvider to avoid needing emitDecoratorMetadata
  metadataProvider: TsMorphMetadataProvider,

  // Enable debug mode to log SQL queries
  debug: process.env.NODE_ENV !== "production",
});

export default config;
