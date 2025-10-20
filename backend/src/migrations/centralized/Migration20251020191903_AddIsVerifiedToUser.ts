import { Migration } from '@mikro-orm/migrations';

export class Migration20251020191903_AddIsVerifiedToUser extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "user" add column "is_verified" boolean not null default false;`);
    this.addSql(`alter table "user" alter column "refresh_token" type text using ("refresh_token"::text);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column "is_verified";`);

    this.addSql(`alter table "user" alter column "refresh_token" type varchar(255) using ("refresh_token"::varchar(255));`);
  }

}
