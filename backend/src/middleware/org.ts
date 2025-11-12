import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";
import { getDrizzleDb } from "../db/drizzle-centralized-db";
import { getOrgDb } from "../db/drizzle-organization-db";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { organizationTable } from "../db/schema/central/schema";
import * as centralSchema from "../db/schema/central/schema";
import * as distributedSchema from "../db/schema/distributed/schema";
import * as distributedRelations from "../db/schema/distributed/relations";
import type { OrganizationUserWithProfile } from "./auth";

// This adds organization and Drizzle database instances as fields to the request object
declare global {
  namespace Express {
    interface Request {
      organization?: string;
      organizationUser?: OrganizationUserWithProfile;
      db?: NodePgDatabase<typeof distributedSchema & typeof distributedRelations>;
      centralDb?: NodePgDatabase<typeof centralSchema>;
    }
  }
}

// LRU Cache for organization existence checks (5 minute TTL, max 1000 entries)
// Using Map with manual LRU eviction to prevent memory growth from unique org name probes
const orgExistenceCache = new Map<string, { exists: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000; // Maximum number of cached org names

/**
 * Check if organization exists in central database
 */
async function organizationExists(orgName: string): Promise<boolean> {
  // Check cache first
  const cached = orgExistenceCache.get(orgName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // Move to end (LRU behavior)
    orgExistenceCache.delete(orgName);
    orgExistenceCache.set(orgName, cached);
    return cached.exists;
  }

  try {
    const db = await getDrizzleDb();
    const result = await db
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.name, orgName))
      .limit(1);

    const exists = result.length > 0;

    // Implement LRU eviction: if cache is full, remove oldest entry
    if (orgExistenceCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = orgExistenceCache.keys().next().value;
      if (oldestKey !== undefined) {
        orgExistenceCache.delete(oldestKey);
      }
    }

    // Update cache
    orgExistenceCache.set(orgName, { exists, timestamp: Date.now() });

    return exists;
  } catch (error) {
    logger.error({ error, orgName }, 'Failed to check organization existence');
    return false;
  }
}

/**
 * Extract organization from URL path and set appropriate ORM context
 */
export function orgContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Check if path starts with an organization name
  const match = req.path.match(/^\/([^\/]+)(\/.*)?$/);

  // List of known system routes that should not be treated as organizations
  const systemRoutes = [
    "auth",
    "healthz",
    "organizations",
    "api",
    "unknown-route",
    "test",
    "does-not-exist",
    "swagger",
    "docs",
    "static",
    "public",
    "favicon.ico"
  ];

  // Additional patterns that indicate this is not an organization route
  const isSystemPath =
    match &&
    match[1] &&
    (systemRoutes.includes(match[1]) ||
      match[1].includes(".") || // File extensions
      match[1].length > 50 || // Unreasonably long org names
      match[1].startsWith("_")); // System prefixes

  if (match && match[1] && !isSystemPath) {
    // This might be an organization-specific request
    // Decode the URL-encoded organization name (e.g., Test%20Hospital -> Test Hospital)
    const orgName = decodeURIComponent(match[1]);

    // Perform async operations and create context once ORM is available
    (async () => {
      try {
        // Verify organization exists before creating ORM connection
        const exists = await organizationExists(orgName);

        if (!exists) {
          // Don't create ORM for non-existent organizations
          logger.warn({ orgName, path: req.path }, 'Request for non-existent organization');

          // Add artificial delay to mitigate timing-based org enumeration attacks
          const delay = 50 + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, delay));

          res.status(404).json({
            error: "Organization not found"
          });
          return;
        }

        // Organization exists, create Drizzle connection
        const orgDb = await getOrgDb(orgName);
        req.organization = orgName;

        // Attach plain Drizzle DB instances (not transactions)
        // Controllers will use db.transaction() for operations requiring atomicity
        req.db = orgDb;
        req.centralDb = await getDrizzleDb();

        next();
      } catch (error) {
        logger.error({ error, orgName }, 'Failed to create org database connection');
        res.status(500).json({
          error: "Failed to connect to organization database"
        });
      }
    })();
  } else {
    // Use central database for non-organization requests
    getDrizzleDb()
      .then(async (centralDb) => {
        // Attach plain DB instance (not transaction)
        // Controllers will use db.transaction() for operations requiring atomicity
        req.centralDb = centralDb;
        next();
      })
      .catch(error => {
        logger.error({ error, path: req.path }, 'Failed to get central database');
        res.status(500).json({ error: "Internal server error" });
      });
  }
}

/**
 * Clear organization existence cache (useful for testing or when orgs are created/deleted)
 */
export function clearOrgCache(orgName?: string): void {
  if (orgName) {
    orgExistenceCache.delete(orgName);
  } else {
    orgExistenceCache.clear();
  }
}