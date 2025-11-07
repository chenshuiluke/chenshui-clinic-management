import { Migration } from "@mikro-orm/migrations";

export class Migration20251107051531_AddMissingProfileColumns extends Migration {
  override async up(): Promise<void> {
    // Add missing columns to doctor_profile
    this.addSql(
      `alter table "doctor_profile" add column "specialization" varchar(255) not null default '';`,
    );
    this.addSql(
      `alter table "doctor_profile" add column "license_number" varchar(255) not null default '';`,
    );
    this.addSql(
      `alter table "doctor_profile" add column "phone_number" varchar(255) null;`,
    );

    // Add missing columns to patient_profile
    this.addSql(
      `alter table "patient_profile" add column "date_of_birth" date not null default CURRENT_DATE;`,
    );
    this.addSql(
      `alter table "patient_profile" add column "phone_number" varchar(255) not null default '';`,
    );
    this.addSql(
      `alter table "patient_profile" add column "address" varchar(255) null;`,
    );
    this.addSql(
      `alter table "patient_profile" add column "emergency_contact_name" varchar(255) null;`,
    );
    this.addSql(
      `alter table "patient_profile" add column "emergency_contact_phone" varchar(255) null;`,
    );
    this.addSql(
      `alter table "patient_profile" add column "blood_type" varchar(255) null;`,
    );
    this.addSql(
      `alter table "patient_profile" add column "allergies" varchar(255) null;`,
    );
    this.addSql(
      `alter table "patient_profile" add column "chronic_conditions" varchar(255) null;`,
    );
    this.addSql(
      `alter table "patient_profile" add column "ip_address" varchar(255) not null default '';`,
    );

    // Add missing column to organization_user
    this.addSql(
      `alter table "organization_user" add column "refresh_token" text null;`,
    );
  }

  override async down(): Promise<void> {
    // Remove columns from doctor_profile
    this.addSql(
      `alter table "doctor_profile" drop column "specialization";`,
    );
    this.addSql(
      `alter table "doctor_profile" drop column "license_number";`,
    );
    this.addSql(
      `alter table "doctor_profile" drop column "phone_number";`,
    );

    // Remove columns from patient_profile
    this.addSql(
      `alter table "patient_profile" drop column "date_of_birth";`,
    );
    this.addSql(
      `alter table "patient_profile" drop column "phone_number";`,
    );
    this.addSql(`alter table "patient_profile" drop column "address";`);
    this.addSql(
      `alter table "patient_profile" drop column "emergency_contact_name";`,
    );
    this.addSql(
      `alter table "patient_profile" drop column "emergency_contact_phone";`,
    );
    this.addSql(`alter table "patient_profile" drop column "blood_type";`);
    this.addSql(`alter table "patient_profile" drop column "allergies";`);
    this.addSql(
      `alter table "patient_profile" drop column "chronic_conditions";`,
    );
    this.addSql(`alter table "patient_profile" drop column "ip_address";`);

    // Remove column from organization_user
    this.addSql(
      `alter table "organization_user" drop column "refresh_token";`,
    );
  }
}
