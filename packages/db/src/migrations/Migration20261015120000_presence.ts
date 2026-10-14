import { Migration } from "@mikro-orm/migrations";

/**
 * Who is in the app right now and who has been invited to a table (STO-584). Postgres rather than
 * server memory: the API runs as several instances with nothing shared between them.
 */
export class Migration20261015120000_presence extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table presence (
      user_id text primary key, seen_at timestamptz not null,
      at_table boolean not null default false, announced_at timestamptz
    );`);
    this.addSql(`create table table_invite (
      to_user text not null, from_user text not null, room_id text not null,
      created_at timestamptz not null default now(), primary key (to_user, from_user)
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists table_invite;`);
    this.addSql(`drop table if exists presence;`);
  }
}
