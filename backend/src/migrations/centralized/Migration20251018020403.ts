import { Migration } from "@mikro-orm/migrations";

export class Migration20251018020403 extends Migration {
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
      `create table "organization" ("id" serial primary key, "created_at" timestamptz null, "updated_at" timestamptz null, "name" varchar(255) not null);`,
    );
    this.addSql(
      `alter table "organization" add constraint "organization_name_unique" unique ("name");`,
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
