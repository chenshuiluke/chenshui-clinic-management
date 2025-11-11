import { MikroORM, EntityManager } from "@mikro-orm/postgresql";
import getOrgConfig from "../mikro-orm-org.config";
import { getOrgDbName } from "../utils/organization";

interface CachedOrgOrm {
  orm: MikroORM;
  createdAt: Date;
}

// Simple cache for organization ORM instances with timestamp
const orgOrmCache = new Map<string, CachedOrgOrm>();

// Cache max age in milliseconds (5 minutes)
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Check if cached ORM is still healthy
 */
async function isOrmHealthy(orm: MikroORM): Promise<boolean> {
  try {
    // Simple health check - verify connection is alive
    await orm.em.getConnection().execute("SELECT 1");
    return true;
  } catch (error) {
    console.error("ORM health check failed:", error);
    return false;
  }
}

/**
 * Check if cache entry is still valid (not expired and healthy)
 */
async function isCacheValid(cachedEntry: CachedOrgOrm): Promise<boolean> {
  const now = new Date();
  const age = now.getTime() - cachedEntry.createdAt.getTime();

  // Check if cache has expired
  if (age > CACHE_MAX_AGE_MS) {
    console.log(
      `Cache expired for organization (age: ${Math.round(age / 1000)}s)`,
    );
    return false;
  }

  // Check if connection is still healthy
  const isHealthy = await isOrmHealthy(cachedEntry.orm);
  if (!isHealthy) {
    console.log("Cached ORM connection is unhealthy");
    return false;
  }

  return true;
}

/**
 * Get or create an ORM instance for an organization
 */
export async function getOrgOrm(orgName: string): Promise<MikroORM> {
  // Check cache first
  const cachedEntry = orgOrmCache.get(orgName);

  if (cachedEntry) {
    // Validate cache entry
    if (await isCacheValid(cachedEntry)) {
      console.log(`Using cached ORM for organization: ${orgName}`);
      return cachedEntry.orm;
    }

    // Cache is invalid, close old connection and remove from cache
    console.log(`Cache invalid for organization: ${orgName}, refreshing...`);
    await cachedEntry.orm.close();
    orgOrmCache.delete(orgName);
  }

  // Create organization-specific database name
  const dbName = getOrgDbName(orgName);

  // Create new ORM instance with org-specific database
  console.log(
    `Creating new ORM instance for organization: ${orgName} (database: ${dbName})`,
  );

  // Retry logic for database connection
  let orm: MikroORM;
  const maxRetries = 10;
  const delay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to connect to org database (attempt ${attempt}/${maxRetries})...`);
      orm = await MikroORM.init({
        ...(await getOrgConfig(orgName)),
      });
      console.log(`Successfully connected to org database: ${dbName}`);
      break;
    } catch (error) {
      console.error(`Org database connection attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Cache it with timestamp
  orgOrmCache.set(orgName, {
    orm: orm!,
    createdAt: new Date(),
  });

  return orm!;
}

/**
 * Get a forked EntityManager for an organization
 */
export async function getOrgEm(orgName: string): Promise<EntityManager> {
  const orm = await getOrgOrm(orgName);
  return orm.em.fork();
}

/**
 * Clear cache and close all connections (for graceful shutdown)
 */
export async function closeAllOrgConnections(): Promise<void> {
  for (const [_, cachedEntry] of orgOrmCache) {
    await cachedEntry.orm.close();
  }
  orgOrmCache.clear();
}

/**
 * Manually evict a specific organization from cache
 */
export async function evictOrgFromCache(orgName: string): Promise<void> {
  const cachedEntry = orgOrmCache.get(orgName);
  if (cachedEntry) {
    await cachedEntry.orm.close();
    orgOrmCache.delete(orgName);
    console.log(`Evicted organization from cache: ${orgName}`);
  }
}

/**
 * Get cache statistics (useful for monitoring)
 */
export function getCacheStats(): {
  size: number;
  organizations: string[];
  ages: Record<string, number>;
} {
  const now = new Date();
  const ages: Record<string, number> = {};
  const organizations: string[] = [];

  for (const [orgName, cachedEntry] of orgOrmCache) {
    organizations.push(orgName);
    ages[orgName] = Math.round(
      (now.getTime() - cachedEntry.createdAt.getTime()) / 1000,
    );
  }

  return {
    size: orgOrmCache.size,
    organizations,
    ages,
  };
}
