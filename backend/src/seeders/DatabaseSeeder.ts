import { EntityManager } from "@mikro-orm/core";
import { Seeder } from "@mikro-orm/seeder";
import Organization from "../entities/central/organization";
import Patient from "../entities/distributed/patient_profile";
import User from "../entities/central/user";
import { createOrganizationDb } from "../services/organization";
import bcrypt from "bcrypt";

export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    // Check if data already exists
    const existingUsers = await em.count(User);

    if (existingUsers > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    // Create a test user
    const user = new User();
    user.email = "chenshuiluke+admin@gmail.com";
    user.name = "Admin User";
    user.password = await bcrypt.hash("TestPassword123!@#", 10);
    user.isVerified = true;

    await em.persistAndFlush(user);

    console.log("Database seeded successfully!");
    console.log(`Created user: ${user.email} with password: password123`);
  }
}
