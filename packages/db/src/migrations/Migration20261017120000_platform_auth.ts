import { Migration } from "@mikro-orm/migrations";

/**
 * Game Center sign-in and Play Games restore (STO-593). Additive only; `down` drops what `up` made.
 *
 * - One owner per login identity: `account ("providerId", "accountId")` becomes unique. Duplicate
 *   rows already there make the index fail with Postgres naming the key — resolve those by hand,
 *   never by deleting here.
 * - `primaryIdentityVerified`: the server verified a Game Center or Google identity. Eligibility
 *   reads it beside `emailVerified`; the auth config refuses it as input.
 * - `rateLimit`: Better Auth's own table, so limits hold across API replicas.
 * - `pgs_account_restore`: a Play Games profile's last-played account — a mutable pointer, not
 *   ownership, so one account may be pointed at by several profiles.
 * - `platform_auth_attempt`: one begin → verify exchange, stored by token hash; `proof_hash` makes
 *   a Game Center proof single-use across replicas. No raw proof or token is stored.
 * - `guest_adoption`: the one account a guest's history moved into; a second target conflicts.
 */
export class Migration20261017120000_platform_auth extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create unique index if not exists "account_provider_identity" on "account" ("providerId", "accountId");`);
    this.addSql(`alter table "user" add column if not exists "primaryIdentityVerified" boolean not null default false;`);
    this.addSql(`create table if not exists "rateLimit" (
      "id" text primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null
    );`);
    this.addSql(`create table pgs_account_restore (
      application_id text not null, player_id text not null,
      user_id text not null references "user" (id) on delete cascade,
      version integer not null default 1, updated_at timestamptz not null default now(),
      primary key (application_id, player_id)
    );`);
    this.addSql(`create index pgs_account_restore_user on pgs_account_restore (user_id);`);
    this.addSql(`create table platform_auth_attempt (
      token_hash text primary key, provider text not null, intent text not null,
      session_id text, user_id text, expires_at timestamptz not null, consumed_at timestamptz,
      proof_hash text unique
    );`);
    this.addSql(`create index platform_auth_attempt_expires on platform_auth_attempt (expires_at);`);
    this.addSql(`create table guest_adoption (
      guest_id text primary key, user_id text not null, created_at timestamptz not null default now()
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists guest_adoption;`);
    this.addSql(`drop table if exists platform_auth_attempt;`);
    this.addSql(`drop table if exists pgs_account_restore;`);
    this.addSql(`drop table if exists "rateLimit";`);
    this.addSql(`alter table "user" drop column if exists "primaryIdentityVerified";`);
    this.addSql(`drop index if exists "account_provider_identity";`);
  }
}
