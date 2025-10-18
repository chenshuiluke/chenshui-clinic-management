import { MikroORM } from "@mikro-orm/postgresql";
import express from "express";
import config from "../mikro-orm.config";
import { createApp } from "../app";
import Organization from "../entities/central/organization.entity";

let cachedOrm: MikroORM | null = null;
let cachedApp: express.Application | null = null;

/**
 * Initialize test environment and create the api without starting the server
 */
export async function setupTestEnvironment(): Promise<{
  orm: MikroORM;
  app: express.Application;
}> {
  if (!cachedOrm) {
    cachedOrm = await MikroORM.init({
      ...config,
      dbName: process.env.DB_NAME || "clinic_db",
      allowGlobalContext: true,
    });

    // Refresh schema once during initialization
    const generator = cachedOrm.getSchemaGenerator();
    await generator.refreshDatabase();
  }

  if (!cachedApp) {
    cachedApp = await createApp(cachedOrm);
  }

  return {
    orm: cachedOrm,
    app: cachedApp,
  };
}

/**
 * Get the cached ORM instance
 */
export function getOrm(): MikroORM {
  if (!cachedOrm) {
    throw new Error(
      "Test environment not initialized. Call setupTestEnvironment() first.",
    );
  }
  return cachedOrm;
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
 * Clears data from db tables. The deletions must happen in order due to foreign keys
 */
export async function clearDatabase(orm: MikroORM): Promise<void> {
  const em = orm.em.fork();

  // Delete in order to respect foreign key constraints
  // await em.nativeDelete(Patient, {});
  await em.nativeDelete(Organization, {});
}

/**
 * Create test organization
 */
export async function createTestOrganization(
  orm: MikroORM,
  data: Partial<{ name: string }> = {},
): Promise<Organization> {
  const em = orm.em.fork();
  const org = em.create(Organization, {
    name: data.name || "Test Organization",
    ...data,
  });
  await em.persistAndFlush(org);
  return org;
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
