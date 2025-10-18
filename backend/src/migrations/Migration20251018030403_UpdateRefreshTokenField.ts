import { Migration } from "@mikro-orm/migrations";

export class Migration20251018030403_UpdateRefreshTokenField extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "user" ("id" serial primary key, "created_at" timestamptz null, "updated_at" timestamptz null, "email" varchar(255) not null, "name" varchar(255) not null, "password" varchar(255) not null, "refresh_token" varchar(255) null);`,
    );
    this.addSql(
      `alter table "user" add constraint "user_email_unique" unique ("email");`,
    );
    this.addSql(
      `alter table "user" add constraint "user_name_unique" unique ("name");`,
    );

    this.addSql(
      `alter table "organization_user" drop constraint "organization_user_organization_id_foreign";`,
    );

    this.addSql(
      `alter table "organization_user" drop column "organization_id";`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "organization_user" add column "organization_id" int not null;`,
    );
    this.addSql(
      `alter table "organization_user" add constraint "organization_user_organization_id_foreign" foreign key ("organization_id") references "organization" ("id") on update cascade;`,
    );
  }
}
