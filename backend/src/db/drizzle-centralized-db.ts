import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as centralSchema from './schema/central/schema';
import { env } from '../config/env';

// Singleton instances
let poolInstance: Pool | null = null;
let dbInstance: NodePgDatabase<typeof centralSchema> | null = null;

// Retry configuration
const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateRetryDelay(attempt: number): number {
  // Exponential backoff: base * 2^(attempt-1)
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, MAX_RETRY_DELAY_MS);
  // Add random jitter (±25%)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Initialize the database connection with retry logic
 */
async function initWithRetry(): Promise<NodePgDatabase<typeof centralSchema>> {
  if (dbInstance) {
    return dbInstance;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Drizzle Central DB] Connection attempt ${attempt}/${MAX_RETRIES}`);

      // Create pool if not already created
      if (!poolInstance) {
        const sslConfig = env.isProduction
          ? { rejectUnauthorized: false } // For AWS RDS
          : false;

        poolInstance = new Pool({
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          user: process.env.DB_USER || 'clinic_user',
          password: process.env.DB_PASSWORD || 'clinic_password',
          database: process.env.DB_NAME || 'clinic_db',
          ssl: sslConfig,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
          statement_timeout: 10000,
          query_timeout: 10000,
        });
      }

      // Test the connection
      await poolInstance.query('SELECT 1');

      // Create Drizzle instance
      dbInstance = drizzle({
        client: poolInstance,
        schema: centralSchema,
        logger: !env.isProduction,
      });

      console.log('[Drizzle Central DB] Successfully connected to database');
      return dbInstance;
    } catch (error) {
      lastError = error as Error;
      console.error(
        `[Drizzle Central DB] Connection attempt ${attempt}/${MAX_RETRIES} failed:`,
        error
      );

      // Close the pool if it was created but connection failed
      if (poolInstance && attempt < MAX_RETRIES) {
        try {
          await poolInstance.end();
        } catch (closeError) {
          console.error('[Drizzle Central DB] Error closing pool:', closeError);
        }
        poolInstance = null;
      }

      // Wait before retrying (except on last attempt)
      if (attempt < MAX_RETRIES) {
        const delay = calculateRetryDelay(attempt);
        console.log(`[Drizzle Central DB] Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `[Drizzle Central DB] Failed to connect after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`
  );
}

/**
 * Get the Drizzle database instance (singleton)
 */
export async function getDrizzleDb(): Promise<NodePgDatabase<typeof centralSchema>> {
  if (!dbInstance) {
    await initWithRetry();
  }
  return dbInstance!;
}

/**
 * Get the underlying pg.Pool instance
 * Useful for health checks and direct pool operations
 */
export async function getPool(): Promise<Pool> {
  if (!poolInstance) {
    await initWithRetry();
  }
  return poolInstance!;
}

/**
 * Close the pool and clean up resources
 * Should be called during graceful shutdown
 */
export async function closePool(): Promise<void> {
  if (poolInstance) {
    console.log('[Drizzle Central DB] Closing connection pool...');
    try {
      await poolInstance.end();
      console.log('[Drizzle Central DB] Connection pool closed successfully');
    } catch (error) {
      console.error('[Drizzle Central DB] Error closing pool:', error);
    } finally {
      poolInstance = null;
      dbInstance = null;
    }
  }
}

/**
 * Health check function for readiness probes
 * Returns true if the database connection is healthy
 */
export async function isHealthy(): Promise<boolean> {
  try {
    const pool = await getPool();
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('[Drizzle Central DB] Health check failed:', error);
    return false;
  }
}

// Default export for convenience
export default getDrizzleDb;
