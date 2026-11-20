import { Migration } from "@mikro-orm/migrations";

/**
 * What the Friends screen shows about a friend beyond online or offline.
 *
 * `presence.room_id`: the table the friend's app holds, so a friend can Join it. `last_seen_at`:
 * the last heartbeat. `goOffline` resets `seen_at` to epoch, so `seen_at` can't serve as last seen.
 * `nudge`: when one player last nudged another, so a nudge goes out at most once per friend in a
 * set window. `notifyNudge`: the switch for that push, on Better Auth's "user" table like the others.
 */
export class Migration20261120120000_friends_social extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table presence add column if not exists room_id text;`);
    this.addSql(`alter table presence add column if not exists last_seen_at timestamptz;`);
    this.addSql(`update presence set last_seen_at = seen_at where last_seen_at is null and seen_at > 'epoch';`);
    this.addSql(`create table if not exists nudge (
      from_user text not null, to_user text not null, sent_at timestamptz not null default now(),
      primary key (from_user, to_user)
    );`);
    this.addSql(`alter table "user" add column if not exists "notifyNudge" boolean not null default true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "user" drop column if exists "notifyNudge";`);
    this.addSql(`drop table if exists nudge;`);
    this.addSql(`alter table presence drop column if exists last_seen_at;`);
    this.addSql(`alter table presence drop column if exists room_id;`);
  }
}
