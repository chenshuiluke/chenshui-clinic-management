import { EntityManager } from "@mikro-orm/core";
import { Seeder } from "@mikro-orm/seeder";
import Organization from "../entities/central/organization.entity";
import Patient from "../entities/distributed/patient_profile.entity";

export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    // Check if data already exists
    const existingOrg = await em.count(Organization);

    if (existingOrg > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    // Create organization
    const org = new Organization();
    org.name = "Chen Shui Clinic";
    await em.persistAndFlush([org]);

    console.log("Database seeded successfully!");
  }
}
