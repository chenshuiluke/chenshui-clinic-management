import { Migration } from "@mikro-orm/migrations";

export class Migration20251023000001 extends Migration {
  override async up(): Promise<void> {
    // Create admin_profile table
    this.addSql(
      `create table "admin_profile" ("id" serial primary key, "created_at" timestamptz null, "updated_at" timestamptz null);`,
    );

    // Add admin_profile_id column to organization_user
    this.addSql(
      `alter table "organization_user" add column "admin_profile_id" int null;`,
    );

    // Add unique constraint on admin_profile_id
    this.addSql(
      `alter table "organization_user" add constraint "organization_user_admin_profile_id_unique" unique ("admin_profile_id");`,
    );

    // Add foreign key constraint
    this.addSql(
      `alter table "organization_user" add constraint "organization_user_admin_profile_id_foreign" foreign key ("admin_profile_id") references "admin_profile" ("id") on update cascade on delete set null;`,
    );
  }

  override async down(): Promise<void> {
    // Remove foreign key constraint
    this.addSql(
      `alter table "organization_user" drop constraint "organization_user_admin_profile_id_foreign";`,
    );

    // Remove unique constraint
    this.addSql(
      `alter table "organization_user" drop constraint "organization_user_admin_profile_id_unique";`,
    );

    // Remove admin_profile_id column
    this.addSql(
      `alter table "organization_user" drop column "admin_profile_id";`,
    );

    // Drop admin_profile table
    this.addSql(`drop table "admin_profile";`);
  }
}
