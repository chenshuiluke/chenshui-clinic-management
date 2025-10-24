import { Migration } from "@mikro-orm/migrations";

export class Migration20251023000002 extends Migration {
  override async up(): Promise<void> {
    // Drop the existing check_only_one_role constraint
    this.addSql(
      `alter table "organization_user" drop constraint "check_only_one_role";`,
    );

    // Add new constraint that includes admin_profile_id
    // Enforces exactly one non-null profile (patient, doctor, or admin)
    this.addSql(`alter table "organization_user" ADD CONSTRAINT check_only_one_role
          CHECK (
            (patient_profile_id IS NOT NULL AND doctor_profile_id IS NULL AND admin_profile_id IS NULL) OR
            (patient_profile_id IS NULL AND doctor_profile_id IS NOT NULL AND admin_profile_id IS NULL) OR
            (patient_profile_id IS NULL AND doctor_profile_id IS NULL AND admin_profile_id IS NOT NULL) OR
            (patient_profile_id IS NULL AND doctor_profile_id IS NULL AND admin_profile_id IS NULL)
          )`);
  }

  override async down(): Promise<void> {
    // Drop the new constraint
    this.addSql(
      `alter table "organization_user" drop constraint "check_only_one_role";`,
    );

    // Restore the old constraint (without admin_profile_id)
    this.addSql(`alter table "organization_user" ADD CONSTRAINT check_only_one_role
          CHECK (
            (patient_profile_id IS NOT NULL AND doctor_profile_id IS NULL) OR
            (patient_profile_id IS NULL AND doctor_profile_id IS NOT NULL) OR
            (patient_profile_id IS NULL AND doctor_profile_id IS NULL)
          )`);
  }
}
