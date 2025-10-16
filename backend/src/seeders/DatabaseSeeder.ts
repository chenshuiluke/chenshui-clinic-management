import { EntityManager } from "@mikro-orm/core";
import { Seeder } from "@mikro-orm/seeder";
import Organization from "../entitites/organization.entity";
import Patient from "../entitites/patient.entity";

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

    // Create patient
    const patient = new Patient();
    patient.organization = org;
    patient.firstName = "Shenseea";
    patient.lastName = "";
    patient.email = "shenseea@example.com";
    patient.phone = "555-0123";

    await em.persistAndFlush([org, patient]);

    console.log("Database seeded successfully!");
  }
}
