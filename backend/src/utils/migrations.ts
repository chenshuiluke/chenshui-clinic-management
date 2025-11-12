import { migrate } from "drizzle-orm/node-postgres/migrator";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { join } from "node:path";
import { cwd } from "node:process";
import { getDrizzleDb, getPool } from "../db/drizzle-centralized-db.js";
import { getOrgDb, getOrgPool } from "../db/drizzle-organization-db.js";
import { seedCentralDatabase } from "../seeders/DatabaseSeeder.js";

// PostgreSQL Advisory Lock ID for migrations
const MIGRATION_LOCK_ID = 123456789;

// Runs database migrations with distributed locking to prevent concurrent execution across multiple instances.
async function runMigrations<T extends Record<string, unknown>>(
  db: NodePgDatabase<T>,
  pool: any,
  migrationsFolder: string,
  dbName: string,
): Promise<void> {
  console.log(`Attempting to acquire migration lock for ${dbName}...`);

  try {
    const result = await pool.query(
      `SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) as acquired`,
    );

    const lockAcquired = result.rows[0]?.acquired;

    if (!lockAcquired) {
      console.log(
        `Another instance is running migrations for ${dbName}. Waiting for lock...`,
      );
      await pool.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`);
      console.log(`Lock acquired for ${dbName} after waiting.`);
    } else {
      console.log(`Migration lock acquired for ${dbName}`);
    }

    console.log(`Running migrations from ${migrationsFolder}...`);
    await migrate(db, { migrationsFolder });
    console.log("Migrations completed.");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    try {
      await pool.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`);
      console.log(`Migration lock released for ${dbName}`);
    } catch (unlockError) {
      console.error("Failed to release migration lock:", unlockError);
    }
  }
}

export async function runCentralMigrations(
  runSeeders: boolean = true,
): Promise<void> {
  const db = await getDrizzleDb();
  const pool = await getPool();
  const migrationsFolder = join(cwd(), "src/migrations/centralized-drizzle");
  await runMigrations(db, pool, migrationsFolder, "central database");

  if (runSeeders) {
    console.log(`Running database seeders for central database`);
    await seedCentralDatabase(db);
    console.log("Seeders completed");
  }
}

export async function runMigrationsForDistributedDbs(
  organizations: Array<{ name: string }>,
) {
  for (const organization of organizations) {
    await runMigrationsForSingleDistributedDb(organization);
  }
}

export async function runMigrationsForSingleDistributedDb(
  organization: { name: string },
) {
  const db = await getOrgDb(organization.name);
  const pool = await getOrgPool(organization.name);
  const migrationsFolder = join(cwd(), "src/migrations/distributed-drizzle");
  await runMigrations(
    db,
    pool,
    migrationsFolder,
    `organization ${organization.name}`,
  );
}
