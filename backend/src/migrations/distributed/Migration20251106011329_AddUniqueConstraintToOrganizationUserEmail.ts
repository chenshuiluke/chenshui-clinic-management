import { Migration } from "@mikro-orm/migrations";

export class Migration20251106011329_AddUniqueConstraintToOrganizationUserEmail extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "organization_user" add constraint "organization_user_email_unique" unique ("email");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "organization_user" drop constraint "organization_user_email_unique";`,
    );
  }
}
