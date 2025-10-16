import { Migration } from '@mikro-orm/migrations';

export class Migration20251016173412 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table "organization" ("id" serial primary key, "created_at" timestamptz not null, "updated_at" timestamptz not null, "name" varchar(255) not null);`);
    this.addSql(`alter table "organization" add constraint "organization_name_unique" unique ("name");`);

    this.addSql(`create table "patient" ("id" serial primary key, "created_at" timestamptz not null, "updated_at" timestamptz not null, "organization_id" int not null, "first_name" varchar(255) not null, "last_name" varchar(255) not null, "email" varchar(255) not null, "phone" varchar(255) not null);`);

    this.addSql(`alter table "patient" add constraint "patient_organization_id_foreign" foreign key ("organization_id") references "organization" ("id") on update cascade;`);
  }

}
