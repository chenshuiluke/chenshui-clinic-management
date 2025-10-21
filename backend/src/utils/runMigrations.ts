import { MikroORM } from "@mikro-orm/postgresql";

// PostgreSQL Advisory Lock ID for migrations
const MIGRATION_LOCK_ID = 123456789;

/**
 * Runs database migrations with distributed locking to prevent
 * concurrent execution across multiple instances.
 *
 * Uses PostgreSQL advisory locks which are automatically released
 * when the connection closes.
 *
 * @param orm - The MikroORM instance
 * @param runSeeders - Whether to run seeders after migrations
 */
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
      console.log("Running database seeders...");
      const { DatabaseSeeder } = await import("../seeders/DatabaseSeeder.js");
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
