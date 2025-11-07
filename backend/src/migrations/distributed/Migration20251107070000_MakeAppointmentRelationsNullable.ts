import { Migration } from "@mikro-orm/migrations";

export class Migration20251107070000_MakeAppointmentRelationsNullable extends Migration {
  override async up(): Promise<void> {
    // Drop existing foreign key constraints
    this.addSql(
      `alter table "appointment" drop constraint "appointment_patient_id_foreign";`,
    );
    this.addSql(
      `alter table "appointment" drop constraint "appointment_doctor_id_foreign";`,
    );

    // Modify columns to allow NULL
    this.addSql(
      `alter table "appointment" alter column "patient_id" drop not null;`,
    );
    this.addSql(
      `alter table "appointment" alter column "doctor_id" drop not null;`,
    );

    // Recreate foreign key constraints with ON DELETE SET NULL
    this.addSql(
      `alter table "appointment" add constraint "appointment_patient_id_foreign" foreign key ("patient_id") references "organization_user" ("id") on update cascade on delete set null;`,
    );
    this.addSql(
      `alter table "appointment" add constraint "appointment_doctor_id_foreign" foreign key ("doctor_id") references "organization_user" ("id") on update cascade on delete set null;`,
    );
  }

  override async down(): Promise<void> {
    // Drop foreign key constraints with ON DELETE SET NULL
    this.addSql(
      `alter table "appointment" drop constraint "appointment_patient_id_foreign";`,
    );
    this.addSql(
      `alter table "appointment" drop constraint "appointment_doctor_id_foreign";`,
    );

    // Make columns NOT NULL again
    this.addSql(
      `alter table "appointment" alter column "patient_id" set not null;`,
    );
    this.addSql(
      `alter table "appointment" alter column "doctor_id" set not null;`,
    );

    // Recreate foreign key constraints without ON DELETE SET NULL
    this.addSql(
      `alter table "appointment" add constraint "appointment_patient_id_foreign" foreign key ("patient_id") references "organization_user" ("id") on update cascade;`,
    );
    this.addSql(
      `alter table "appointment" add constraint "appointment_doctor_id_foreign" foreign key ("doctor_id") references "organization_user" ("id") on update cascade;`,
    );
  }
}
