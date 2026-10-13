import { Migration } from "@mikro-orm/migrations";

export class Migration20261013140000_friends extends Migration {
  override async up(): Promise<void> {
    // ponytail: rows outlive a deleted account; add an FK or deletion hook when account deletion ships.
    this.addSql(`create table friends (
      user_a text not null, user_b text not null,
      status text not null check (status in ('pending', 'accepted')),
      requested_by text not null, created_at timestamptz not null default now(),
      primary key (user_a, user_b), check (user_a < user_b),
      check (requested_by in (user_a, user_b))
    );`);
    this.addSql(`create index friends_user_b on friends (user_b);`);
    this.addSql(`create table friend_code (user_id text primary key, code text not null unique);`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists friend_code;`);
    this.addSql(`drop table if exists friends;`);
  }
}
