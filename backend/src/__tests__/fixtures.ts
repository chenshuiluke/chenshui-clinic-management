import express from "express";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { reset } from "drizzle-seed";
import { eq } from "drizzle-orm";

import { createApp } from "../app";
import jwtService from "../services/jwt.service";
import { deleteOrganizationDb } from "../services/organization";
import { secretsManagerService } from "../services/secrets-manager.service";
import { emailService } from "../services/email.service";
import {
  getDrizzleDb,
  getPool,
  closePool,
} from "../db/drizzle-centralized-db";
import {
  getOrgDb,
  closeAllOrgConnections as closeDrizzleOrgConnections,
  evictOrgFromCache as evictDrizzleOrgFromCache,
} from "../db/drizzle-organization-db";
import * as centralSchema from "../db/schema/central/schema";
import {
  userTable,
  organizationTable,
} from "../db/schema/central/schema";
import {
  User as DrizzleUser,
  Organization as DrizzleOrganization,
  NewUser,
  NewOrganization,
} from "../db/schema/central/types";
import { runCentralMigrations } from "../utils/migrations";

let cachedDb: NodePgDatabase<typeof centralSchema> | null = null;
let cachedApp: express.Application | null = null;

// Track organizations created during tests for cleanup
const createdOrganizations = new Set<string>();

/**
 * Initialize test environment, create the api without starting the server.
 */
export async function setupTestEnvironment(): Promise<{
  db: NodePgDatabase<typeof centralSchema>;
  app: express.Application;
}> {
  if (!cachedDb) {
    cachedDb = await getDrizzleDb();
    // Run migrations once during initialization
    await runCentralMigrations(true);
  }

  if (!cachedApp) {
    cachedApp = await createApp();
  }

  return {
    db: cachedDb!,
    app: cachedApp!,
  };
}

/**
 * Get the cached Drizzle database instance
 */
export function getDb(): NodePgDatabase<typeof centralSchema> {
  if (!cachedDb) {
    throw new Error(
      "Test environment not initialized. Call setupTestEnvironment() first.",
    );
  }
  return cachedDb;
}

/**
 * Get the cached Express app
 */
export function getApp(): express.Application {
  if (!cachedApp) {
    throw new Error(
      "Test environment not initialized. Call setupTestEnvironment() first.",
    );
  }
  return cachedApp;
}

/**
 * Track organization for cleanup
 */
export function trackOrganization(orgName: string): void {
  createdOrganizations.add(orgName);
}

/**
 * Clear all organization databases created during tests
 */
export async function clearOrganizationDatabases(): Promise<void> {
  for (const orgName of createdOrganizations) {
    try {
      // First evict from cache to close any active connections
      await evictDrizzleOrgFromCache(orgName); // Evicts from Drizzle cache
      // Wait for connections to fully close
      await new Promise(resolve => setTimeout(resolve, 100));
      // Then delete the database
      await deleteOrganizationDb(orgName);
    } catch (error) {
      console.error(`Failed to delete organization database ${orgName}:`, error);
    }
  }
  // Close all Drizzle organization connections
  await closeDrizzleOrgConnections();
  createdOrganizations.clear();
}

/**
 * Clears data from db tables using fast truncation.
 */
export async function clearDatabase(
  db: NodePgDatabase<typeof centralSchema>,
): Promise<void> {
  // Clear mock secrets before clearing organization databases
  secretsManagerService.clearMockSecrets();

  // Clear sent emails
  emailService.clearSentEmails();

  // First clear organization databases
  await clearOrganizationDatabases();

  // Drizzle path: fast truncate with cascade.
  // This resets all tables in the central schema by design for a clean test state.
  await reset(db, centralSchema);
}

/**
 * Get sent emails for test assertions
 */
export function getSentEmails() {
  return emailService.getSentEmails();
}

/**
 * Create test organization using Drizzle.
 */
export async function createTestOrganization(
  db: NodePgDatabase<typeof centralSchema>,
  data: Partial<{ name: string }> = {},
): Promise<DrizzleOrganization> {
  const orgData = {
    name: data.name || "Test Organization",
    ...data,
  };

  const rows = await db
    .insert(organizationTable)
    .values(orgData)
    .returning();
  const org = rows[0];
  if (!org) {
    throw new Error("Failed to create test organization");
  }
  return org;
}

/**
 * Create test user using Drizzle.
 */
export async function createTestUser(
  db: NodePgDatabase<typeof centralSchema>,
  data: Partial<{ email: string; name: string; password: string }> = {},
): Promise<DrizzleUser> {
  const hashedPassword = await jwtService.hashPassword(
    data.password || "password123",
  );

  const userData: NewUser = {
    email: data.email || "test@example.com",
    name: data.name || "Test User",
    password: hashedPassword,
    isVerified: false,
    ...data,
  };

  const rows = await db.insert(userTable).values(userData).returning();
  const user = rows[0];
  if (!user) {
    throw new Error("Failed to create test user");
  }
  return user;
}

// /**
//  * Create test patient
//  */
// export async function createTestPatient(
//   orm: MikroORM,
//   organizationId: number,
//   data: Partial<{
//     firstName: string;
//     lastName: string;
//     email: string;
//     phone: string;
//   }> = {},
// ): Promise<Patient> {
//   const em = orm.em.fork();
//   const org = await em.findOneOrFail(Organization, { id: organizationId });
//   const patient = em.create(Patient, {
//     organization: org,
//     firstName: data.firstName || "John",
//     lastName: data.lastName || "Doe",
//     email: data.email || "john.doe@example.com",
//     phone: data.phone || "555-0100",
//     ...data,
//   });
//   await em.persistAndFlush(patient);
//   return patient;
// }
