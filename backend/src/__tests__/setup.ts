import { before, beforeEach, after } from "mocha";
import {
  setupTestEnvironment,
  clearDatabase,
  getDb,
} from "./fixtures";
import { closePool } from "../db/drizzle-centralized-db";
import { closeAllOrgConnections as closeDrizzleOrgConnections } from "../db/drizzle-organization-db";

// Global setup - runs once before all test files
before(async function () {
  process.env.NODE_ENV = "test"; // Ensure NODE_ENV is 'test' before app creation
  process.env.DB_HOST = 'clinic-db-test';
  process.env.DB_PORT = '5432';
  await setupTestEnvironment();
});

// Global beforeEach - clears database before each test
beforeEach(async function () {
  await clearDatabase(getDb());
});

// Global cleanup - runs once after all tests complete
after(async function () {
  try {
    // Close Drizzle connections
    await closeDrizzleOrgConnections();
    await closePool();
  } catch (error) {
    console.error("Failed to close Drizzle connections:", error);
  }
});
