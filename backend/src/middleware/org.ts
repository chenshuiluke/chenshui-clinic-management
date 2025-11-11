import { Request, Response, NextFunction } from "express";
import { RequestContext, EntityManager } from "@mikro-orm/core";
import { getOrgOrm } from "../db/organization-db";
import { getOrm } from "../db/centralized-db";
import Organization from "../entities/central/organization";
import logger from "../utils/logger";

// This adds organization and EntityManager as fields to the request object
declare global {
  namespace Express {
    interface Request {
      organization?: string;
      em?: EntityManager;
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
    const centralOrm = await getOrm();
    const em = centralOrm.em.fork();
    const org = await em.findOne(Organization, { name: orgName });

    const exists = org !== null;

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
          // This narrows the timing gap between 404 (org not found) and 401 (org exists but auth failed)
          // Delay range: 50-150ms to prevent precise timing measurements
          const delay = 50 + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, delay));

          res.status(404).json({
            error: "Organization not found"
          });
          return;
        }

        // Organization exists, create ORM connection
        const orgOrm = await getOrgOrm(orgName);
        req.organization = orgName;

        // Create RequestContext and call next() within it to ensure context propagates
        RequestContext.create(orgOrm.em, () => {
          req.em = orgOrm.em;
          next();
        });
      } catch (error) {
        logger.error({ error, orgName }, 'Failed to create org database connection');
        res.status(500).json({
          error: "Failed to connect to organization database"
        });
      }
    })();
  } else {
    // Use central ORM for non-organization requests
    getOrm().then(centralizedOrm => {
      RequestContext.create(centralizedOrm.em, () => {
        req.em = centralizedOrm.em;
        next();
      });
    }).catch(error => {
      logger.error({ error, path: req.path }, 'Failed to get central ORM');
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