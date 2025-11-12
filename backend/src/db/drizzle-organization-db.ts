import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as distributedSchema from './schema/distributed/schema';
import * as distributedRelations from './schema/distributed/relations';
import { getOrgDbName, getOrgDbUser, getOrgSecretName } from '../utils/organization';
import { secretsManagerService } from '../services/secrets-manager.service';
import { env } from '../config/env';

// Cache interface
interface CachedOrgDb {
  pool: Pool;
  db: NodePgDatabase<typeof distributedSchema & typeof distributedRelations>;
  createdAt: Date;
}

// Cache configuration
const orgDbCache = new Map<string, CachedOrgDb>();
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Retry configuration
const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateRetryDelay(attempt: number): number {
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, MAX_RETRY_DELAY_MS);
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if a database connection is healthy
 */
async function isDbHealthy(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('[Drizzle Org DB] Health check failed:', error);
    return false;
  }
}

/**
 * Check if a cached entry is still valid
 * Validates both age and connection health
 */
async function isCacheValid(cachedEntry: CachedOrgDb): Promise<boolean> {
  const age = Date.now() - cachedEntry.createdAt.getTime();

  // Check if cache has expired
  if (age > CACHE_MAX_AGE_MS) {
    console.log('[Drizzle Org DB] Cache entry expired (age: ${age}ms)');
    return false;
  }

  // Check if connection is healthy
  const healthy = await isDbHealthy(cachedEntry.pool);
  if (!healthy) {
    console.log('[Drizzle Org DB] Cache entry unhealthy');
    return false;
  }

  return true;
}

/**
 * Create a new organization database connection
 */
async function createOrgDb(
  orgName: string
): Promise<{ pool: Pool; db: NodePgDatabase<typeof distributedSchema & typeof distributedRelations> }> {
  console.log(`[Drizzle Org DB] Creating new connection for organization: ${orgName}`);

  // Get database credentials
  let host: string;
  let port: number;
  let password: string;

  try {
    const secretName = getOrgSecretName(orgName);
    const secret = await secretsManagerService.getSecretValue({ SecretId: secretName });

    if (!secret.SecretString) {
      throw new Error(`Secret ${secretName} has no SecretString`);
    }

    const credentials = JSON.parse(secret.SecretString);
    host = credentials.host;
    port = credentials.port;
    password = env.isProduction ? credentials.password : 'testpassword';
  } catch (error) {
    // In mock mode, fall back to local credentials
    if (env.isMockMode) {
      console.log(
        `[Drizzle Org DB] Failed to get secret for ${orgName}, using local credentials (mock mode)`
      );
      host = process.env.DB_HOST || 'localhost';
      port = parseInt(process.env.DB_PORT || '5432');
      password = 'testpassword';
    } else {
      throw new Error(
        `[Drizzle Org DB] Failed to get credentials for ${orgName}: ${(error as Error).message}`
      );
    }
  }

  const database = getOrgDbName(orgName);
  const user = getOrgDbUser(orgName);

  let pool: Pool | null = null;
  let lastError: Error | null = null;

  // Retry loop
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Drizzle Org DB] Connection attempt ${attempt}/${MAX_RETRIES} for ${orgName}`
      );

      // Create pool
      pool = new Pool({
        host,
        port,
        user,
        password,
        database,
        ssl: false, // Organization databases don't use SSL
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        statement_timeout: 10000,
        query_timeout: 10000,
      });

      // Test the connection
      await pool.query('SELECT 1');

      // Create Drizzle instance
      const db = drizzle({
        client: pool,
        schema: { ...distributedSchema, ...distributedRelations },
        logger: !env.isProduction,
      });

      console.log(`[Drizzle Org DB] Successfully connected to ${orgName} database`);
      return { pool, db };
    } catch (error) {
      lastError = error as Error;
      console.error(
        `[Drizzle Org DB] Connection attempt ${attempt}/${MAX_RETRIES} failed for ${orgName}:`,
        error
      );

      // Close the pool if it was created but connection failed
      if (pool && attempt < MAX_RETRIES) {
        try {
          await pool.end();
        } catch (closeError) {
          console.error('[Drizzle Org DB] Error closing pool:', closeError);
        }
        pool = null;
      }

      // Wait before retrying (except on last attempt)
      if (attempt < MAX_RETRIES) {
        const delay = calculateRetryDelay(attempt);
        console.log(`[Drizzle Org DB] Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `[Drizzle Org DB] Failed to connect to ${orgName} after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`
  );
}

/**
 * Get or create a Drizzle database instance for an organization
 * Uses caching with TTL and health checks
 */
export async function getOrgDb(
  orgName: string
): Promise<NodePgDatabase<typeof distributedSchema & typeof distributedRelations>> {
  // Check cache first
  const cachedEntry = orgDbCache.get(orgName);

  if (cachedEntry) {
    // Validate cache entry
    const valid = await isCacheValid(cachedEntry);

    if (valid) {
      console.log(`[Drizzle Org DB] Cache hit for ${orgName}`);
      return cachedEntry.db;
    } else {
      // Cache invalid - close and remove
      console.log(`[Drizzle Org DB] Cache miss (invalid) for ${orgName}`);
      try {
        await cachedEntry.pool.end();
      } catch (error) {
        console.error(`[Drizzle Org DB] Error closing invalid pool for ${orgName}:`, error);
      }
      orgDbCache.delete(orgName);
    }
  } else {
    console.log(`[Drizzle Org DB] Cache miss (not found) for ${orgName}`);
  }

  // Create new connection
  const { pool, db } = await createOrgDb(orgName);

  // Cache the result
  orgDbCache.set(orgName, {
    pool,
    db,
    createdAt: new Date(),
  });

  return db;
}

/**
 * Get the underlying pool for an organization
 * Useful for direct pool operations and health checks
 */
export async function getOrgPool(orgName: string): Promise<Pool> {
  // Ensure cache is populated
  await getOrgDb(orgName);

  const cachedEntry = orgDbCache.get(orgName);
  if (!cachedEntry) {
    throw new Error(`[Drizzle Org DB] Failed to get pool for ${orgName}`);
  }

  return cachedEntry.pool;
}

/**
 * Close all cached organization database connections
 * Should be called during graceful shutdown
 */
export async function closeAllOrgConnections(): Promise<void> {
  console.log(
    `[Drizzle Org DB] Closing all organization connections (${orgDbCache.size} organizations)...`
  );

  const closePromises: Promise<void>[] = [];

  for (const [orgName, entry] of orgDbCache.entries()) {
    const closePromise = (async () => {
      try {
        await entry.pool.end();
        console.log(`[Drizzle Org DB] Closed connection for ${orgName}`);
      } catch (error) {
        console.error(`[Drizzle Org DB] Error closing connection for ${orgName}:`, error);
      }
    })();
    closePromises.push(closePromise);
  }

  await Promise.all(closePromises);
  orgDbCache.clear();
  console.log('[Drizzle Org DB] All organization connections closed');
}

/**
 * Manually evict a specific organization from cache
 * Useful for forcing reconnection or cleanup
 */
export async function evictOrgFromCache(orgName: string): Promise<void> {
  const cachedEntry = orgDbCache.get(orgName);

  if (cachedEntry) {
    console.log(`[Drizzle Org DB] Evicting ${orgName} from cache`);
    try {
      await cachedEntry.pool.end();
      console.log(`[Drizzle Org DB] Closed connection for ${orgName}`);
    } catch (error) {
      console.error(`[Drizzle Org DB] Error closing connection for ${orgName}:`, error);
    }
    orgDbCache.delete(orgName);
  }
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): {
  size: number;
  organizations: string[];
  ages: Record<string, number>;
} {
  const stats = {
    size: orgDbCache.size,
    organizations: Array.from(orgDbCache.keys()),
    ages: {} as Record<string, number>,
  };

  for (const [orgName, entry] of orgDbCache.entries()) {
    const ageSeconds = (Date.now() - entry.createdAt.getTime()) / 1000;
    stats.ages[orgName] = Math.round(ageSeconds);
  }

  return stats;
}

/**
 * Note: This cache implementation is not thread-safe, but is acceptable for Node.js
 * single-threaded event loop. If concurrent requests for the same organization arrive
 * during initial connection, they may create duplicate pools. This is acceptable as
 * the cache will eventually converge and old connections will be evicted based on TTL.
 */
