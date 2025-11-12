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
import { sanitizeOrgName } from "../utils/organization";

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
 * Check if organization exists in central database and return the actual org name
 */
async function findOrganizationBySlug(orgSlug: string): Promise<string | null> {
  // Check cache first
  const cached = orgExistenceCache.get(orgSlug);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // Move to end (LRU behavior)
    orgExistenceCache.delete(orgSlug);
    orgExistenceCache.set(orgSlug, cached);
    return cached.exists ? orgSlug : null;
  }

  try {
    const db = await getDrizzleDb();
    const allOrgs = await db.select().from(organizationTable);

    // Find an organization whose sanitized name matches the slug
    const matchedOrg = allOrgs.find(org => sanitizeOrgName(org.name) === sanitizeOrgName(orgSlug));

    const exists = !!matchedOrg;
    const actualOrgName = matchedOrg?.name || null;

    // Implement LRU eviction: if cache is full, remove oldest entry
    if (orgExistenceCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = orgExistenceCache.keys().next().value;
      if (oldestKey !== undefined) {
        orgExistenceCache.delete(oldestKey);
      }
    }

    // Update cache
    orgExistenceCache.set(orgSlug, { exists, timestamp: Date.now() });

    return actualOrgName;
  } catch (error) {
    logger.error({ error, orgSlug }, 'Failed to check organization existence');
    return null;
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
  const match = req.url.match(/^\/([^\/]+)(\/.*)?$/);

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

    // Check if this is the existence check endpoint - skip org validation for it
    const isExistsPath = match[2] === '/exists' || req.path === `/${match[1]}/exists`;

    // Perform async operations and create context once ORM is available
    (async () => {
      try {
        // Skip organization existence check for the /exists endpoint
        if (isExistsPath) {
          // For exists endpoint, just set central DB and continue
          req.centralDb = await getDrizzleDb();
          next();
          return;
        }

        // Verify organization exists before creating ORM connection
        // orgName from URL might be sanitized (e.g., "test_org_1"), we need to find the actual org name
        const actualOrgName = await findOrganizationBySlug(orgName);

        if (!actualOrgName) {
          // Don't create ORM for non-existent organizations
          logger.warn({ orgName, path: req.path }, 'Request for non-existent organization');

          // Add artificial delay to mitigate timing-based org enumeration attacks
          const delay = 50 + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, delay));

          res.status(404).json({
            error: "Organization not found"
          });
          return; // Important: return after sending response
        }

        // Organization exists, create Drizzle connection using the actual org name
        const orgDb = await getOrgDb(actualOrgName);
        req.organization = actualOrgName;

        // Attach plain Drizzle DB instances (not transactions)
        // Controllers will use db.transaction() for operations requiring atomicity
        req.db = orgDb;
        req.centralDb = await getDrizzleDb();

        next(); // Call next() on success
      } catch (error) {
        logger.error({ error, orgName }, 'Failed to create org database connection');
        if (!res.headersSent) {
          res.status(500).json({
            error: "Failed to connect to organization database"
          });
        }
        // Don't call next() on error - response already sent
      }
    })().catch(error => {
      // Catch any unhandled promise rejections from the async IIFE itself
      logger.error({ error, orgName }, 'Unhandled error in orgContext middleware');
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    });
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
        if (!res.headersSent) {
          res.status(500).json({ error: "Internal server error" });
        }
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