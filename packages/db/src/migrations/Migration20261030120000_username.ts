import { Migration } from "@mikro-orm/migrations";

/**
 * Better Auth's username plugin (STO-961): the handle a player signs in with. The columns are the
 * plugin's own, named the way Better Auth names the rest of `"user"`; both stay null on accounts
 * from before handles, on guests and on platform sign-ins.
 */
export class Migration20261030120000_username extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "user" add column if not exists "username" text unique;`);
    this.addSql(`alter table "user" add column if not exists "displayUsername" text;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column if exists "displayUsername";`);
    this.addSql(`alter table "user" drop column if exists "username";`);
  }
}
