import { Request } from "express";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as centralSchema from "../db/schema/central/schema";
import * as distributedSchema from "../db/schema/distributed/schema";
import * as distributedRelations from "../db/schema/distributed/relations";

/**
 * Base controller providing database access utilities for Drizzle ORM.
 *
 * Controllers can use these methods to get database instances:
 * - `getDb(req)`: For organization-specific database
 * - `getCentralDb(req)`: For the central database
 * - `getDbSafe(req)`: For context-aware database access
 */
export default abstract class BaseController {
  /**
   * Get the organization-specific Drizzle database instance
   *
   * @param req - Express request object
   * @returns Drizzle database instance for the organization
   * @throws Error if not in organization context
   *
   * @example
   * const db = this.getDb(req);
   * const doctors = await db.select().from(doctorProfileTable);
   */
  protected getDb(req: Request): NodePgDatabase<typeof distributedSchema & typeof distributedRelations> {
    if (!req.db) {
      throw new Error("Organization database not available. Ensure request is in organization context.");
    }
    return req.db;
  }

  /**
   * Get the centralized Drizzle database instance
   *
   * @param req - Express request object
   * @returns Drizzle database instance for the central database
   * @throws Error if central database not available
   *
   * @example
   * const db = this.getCentralDb(req);
   * const orgs = await db.select().from(organizationTable);
   */
  protected getCentralDb(req: Request): NodePgDatabase<typeof centralSchema> {
    if (!req.centralDb) {
      throw new Error("Central database not available");
    }
    return req.centralDb;
  }

  /**
   * Get database instance with automatic context detection
   *
   * @param req - Express request object
   * @returns Organization database if in org context, otherwise central database
   *
   * @example
   * const db = this.getDbSafe(req);
   * // Use db for operations that work in both contexts
   */
  protected getDbSafe(req: Request): NodePgDatabase<typeof distributedSchema & typeof distributedRelations> | NodePgDatabase<typeof centralSchema> {
    if (req.organization && req.db) {
      return req.db;
    }
    return this.getCentralDb(req);
  }
}
