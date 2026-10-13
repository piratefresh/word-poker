import { Migration } from "@mikro-orm/migrations";

/**
 * Better Auth's anonymous plugin (STO-581): a friend invited by link plays as a guest with a real
 * session, and the plugin flags that user. The column is the plugin's own (`isAnonymous`), named
 * the way Better Auth names the rest of `"user"`.
 */
export class Migration20261013120000_anonymous_user extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "user" add column if not exists "isAnonymous" boolean default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column if exists "isAnonymous";`);
  }
}
