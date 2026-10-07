/**
 * Migration20261006120000_xp_levels.ts — account XP and level-up rewards (STO-543).
 *
 * Hand-written like the tables before it, and transactional as one unit: the reward-once index
 * is what makes each `quest`/`streak`/`level` wallet event pay exactly once, so dropping and
 * recreating it inside this migration never leaves a window where two claims could both pay.
 * `player_progress` is one row per player — Better Auth owns `user`, so XP gets its own table.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20261006120000_xp_levels extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "player_progress" (
        "user_id" text not null,
        "xp" integer not null default 0,
        "level_paid" integer not null default 1,
        constraint "player_progress_pkey" primary key ("user_id")
      );
    `);
    this.addSql(`drop index if exists "wallet_event_reward_once";`);
    this.addSql(
      `create unique index "wallet_event_reward_once" on "wallet_event" ("user_id", "kind", "ref") where "kind" in ('quest', 'streak', 'level');`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "wallet_event_reward_once";`);
    this.addSql(
      `create unique index "wallet_event_reward_once" on "wallet_event" ("user_id", "kind", "ref") where "kind" in ('quest', 'streak');`,
    );
    this.addSql(`drop table if exists "player_progress";`);
  }
}
