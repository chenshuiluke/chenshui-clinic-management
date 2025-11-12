import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as centralSchema from "../db/schema/central/schema.js";
import { userTable } from "../db/schema/central/schema.js";
import { count } from "drizzle-orm";
import bcrypt from "bcrypt";

export async function seedCentralDatabase(
  db: NodePgDatabase<typeof centralSchema>,
): Promise<void> {
  try {
    const result = await db.select({ value: count() }).from(userTable);
    const existingUsers = Number(result[0]?.value || 0);

    if (existingUsers > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    const hashedPassword = await bcrypt.hash("TestPassword123!@#", 10);

    const now = new Date();
    const [user] = await db
      .insert(userTable)
      .values({
        email: "chenshuiluke+admin@gmail.com",
        name: "Admin User",
        password: hashedPassword,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!user) {
      throw new Error('Failed to create seed user');
    }

    console.log("Database seeded successfully!");
    console.log(
      `Created user: ${user!.email} with password: TestPassword123!@#`,
    );
  } catch (error) {
    console.error("Seeding failed:", error);
    throw error;
  }
}