import { MikroORM } from "@mikro-orm/postgresql";
import Organization from "../entities/central/organization.js";
import { getOrgOrm } from "../db/organization-db.js";

import { DatabaseSeeder } from "../seeders/DatabaseSeeder.js";
// PostgreSQL Advisory Lock ID for migrations
const MIGRATION_LOCK_ID = 123456789;

// Runs database migrations with distributed locking to preventconcurrent execution across multiple instances.
export async function runMigrations(
  orm: MikroORM,
  runSeeders: boolean = true,
): Promise<void> {
  const connection = orm.em.getConnection();
  const migrator = orm.getMigrator();

  console.log("Attempting to acquire migration lock...");

  try {
    const result = await connection.execute(
      `SELECT pg_try_advisory_lock(${MIGRATION_LOCK_ID}) as acquired`,
    );

    const lockAcquired = result[0]?.acquired;

    if (!lockAcquired) {
      console.log("Another instance is running migrations. Waiting...");
      await connection.execute(`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`);
      await connection.execute(
        `SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`,
      );
      console.log("Migrations completed by another instance");
      return;
    }

    console.log("Migration lock acquired");

    const pending = await migrator.getPendingMigrations();

    if (pending.length === 0) {
      console.log("No pending migrations");
    } else {
      console.log(`Running ${pending.length} pending migration(s)...`);
      const migrations = await migrator.up();

      if (migrations.length > 0) {
        console.log(`Executed ${migrations.length} migration(s):`);
        migrations.forEach((migration) => {
          console.log(`  - ${migration.name}`);
        });
      }
    }

    if (runSeeders) {
      console.log(
        "Running database seeders for organization",
        orm.config.getAll().dbName,
      );
      await orm.seeder.seed(DatabaseSeeder);
      console.log("Seeders completed");
    }
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    try {
      await connection.execute(
        `SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`,
      );
      console.log("Migration lock released");
    } catch (unlockError) {
      console.error("Failed to release migration lock:", unlockError);
    }
  }
}

export async function runMigrationsForDistributedDbs(
  organizations: Organization[],
  runSeeders: boolean = false,
) {
  for (const organization of organizations) {
    await runMigrationsForSingleDistributedDb(organization, runSeeders);
  }
}

export async function runMigrationsForSingleDistributedDb(
  organization: Organization,
  runSeeders: boolean = false,
) {
  const organizationOrm = await getOrgOrm(organization.name);
  await runMigrations(organizationOrm, runSeeders);
}
