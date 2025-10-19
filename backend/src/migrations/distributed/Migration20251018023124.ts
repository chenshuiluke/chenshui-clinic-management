import { Migration } from "@mikro-orm/migrations";

export class Migration20251018023124 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "appointment" ("id" serial primary key, "created_at" timestamptz null, "updated_at" timestamptz null);`,
    );

    this.addSql(
      `create table "doctor_profile" ("id" serial primary key, "created_at" timestamptz null, "updated_at" timestamptz null);`,
    );

    this.addSql(
      `create table "patient_profile" ("id" serial primary key, "created_at" timestamptz null, "updated_at" timestamptz null);`,
    );

    this.addSql(
      `create table "organization_user" ("id" serial primary key, "created_at" timestamptz null, "updated_at" timestamptz null, "organization_id" int not null, "email" varchar(255) not null, "password" varchar(255) not null, "first_name" varchar(255) not null, "last_name" varchar(255) not null, "doctor_profile_id" int null, "patient_profile_id" int null);`,
    );
    this.addSql(
      `alter table "organization_user" add constraint "organization_user_doctor_profile_id_unique" unique ("doctor_profile_id");`,
    );
    this.addSql(
      `alter table "organization_user" add constraint "organization_user_patient_profile_id_unique" unique ("patient_profile_id");`,
    );

    this.addSql(
      `alter table "organization_user" add constraint "organization_user_organization_id_foreign" foreign key ("organization_id") references "organization" ("id") on update cascade;`,
    );
    this.addSql(
      `alter table "organization_user" add constraint "organization_user_doctor_profile_id_foreign" foreign key ("doctor_profile_id") references "doctor_profile" ("id") on update cascade on delete set null;`,
    );
    this.addSql(
      `alter table "organization_user" add constraint "organization_user_patient_profile_id_foreign" foreign key ("patient_profile_id") references "patient_profile" ("id") on update cascade on delete set null;`,
    );

    this
      .addSql(`alter table "organization_user" ADD CONSTRAINT check_only_one_role
          CHECK (
            (patient_profile_id IS NOT NULL AND doctor_profile_id IS NULL) OR
            (patient_profile_id IS NULL AND doctor_profile_id IS NOT NULL) OR
            (patient_profile_id IS NULL AND doctor_profile_id IS NULL)`);

    this.addSql(
      `alter table "organization_user" drop constraint "organization_user_organization_id_foreign";`,
    );

    this.addSql(
      `alter table "organization_user" drop column "organization_id";`,
    );
  }
}
