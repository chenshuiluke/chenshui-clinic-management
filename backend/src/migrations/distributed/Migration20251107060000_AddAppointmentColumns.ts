import { Migration } from "@mikro-orm/migrations";

export class Migration20251107060000_AddAppointmentColumns extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "appointment" add column "patient_id" int not null;`,
    );
    this.addSql(
      `alter table "appointment" add column "doctor_id" int not null;`,
    );
    this.addSql(
      `alter table "appointment" add column "appointment_date_time" timestamptz not null;`,
    );
    this.addSql(
      `create type "appointment_status" as enum ('PENDING', 'APPROVED', 'DECLINED', 'COMPLETED', 'CANCELLED');`,
    );
    this.addSql(
      `alter table "appointment" add column "status" "appointment_status" not null default 'PENDING';`,
    );
    this.addSql(
      `alter table "appointment" add column "notes" text null;`,
    );

    this.addSql(
      `alter table "appointment" add constraint "appointment_patient_id_foreign" foreign key ("patient_id") references "organization_user" ("id") on update cascade;`,
    );
    this.addSql(
      `alter table "appointment" add constraint "appointment_doctor_id_foreign" foreign key ("doctor_id") references "organization_user" ("id") on update cascade;`,
    );

    this.addSql(
      `create index "appointment_patient_id_index" on "appointment" ("patient_id");`,
    );
    this.addSql(
      `create index "appointment_doctor_id_index" on "appointment" ("doctor_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "appointment_patient_id_index";`);
    this.addSql(`drop index "appointment_doctor_id_index";`);

    this.addSql(
      `alter table "appointment" drop constraint "appointment_patient_id_foreign";`,
    );
    this.addSql(
      `alter table "appointment" drop constraint "appointment_doctor_id_foreign";`,
    );

    this.addSql(`alter table "appointment" drop column "patient_id";`);
    this.addSql(`alter table "appointment" drop column "doctor_id";`);
    this.addSql(`alter table "appointment" drop column "appointment_date_time";`);
    this.addSql(`alter table "appointment" drop column "status";`);
    this.addSql(`drop type "appointment_status";`);
    this.addSql(`alter table "appointment" drop column "notes";`);
  }
}