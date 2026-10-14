import { Migration } from "@mikro-orm/migrations";

/**
 * Push notifications (STO-585): one row per device token, and the three per-kind switches as
 * columns on Better Auth's "user" table (camelCase, like its own), so they follow the account.
 */
export class Migration20261016120000_notifications extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table push_token (
      token text primary key, user_id text not null, updated_at timestamptz not null default now()
    );`);
    this.addSql(`create index push_token_user on push_token (user_id);`);
    this.addSql(`alter table "user" add column if not exists "notifyTableInvite" boolean not null default true;`);
    this.addSql(`alter table "user" add column if not exists "notifyFriendRequest" boolean not null default true;`);
    this.addSql(`alter table "user" add column if not exists "notifyFriendOnline" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column if exists "notifyFriendOnline";`);
    this.addSql(`alter table "user" drop column if exists "notifyFriendRequest";`);
    this.addSql(`alter table "user" drop column if exists "notifyTableInvite";`);
    this.addSql(`drop table if exists push_token;`);
  }
}
