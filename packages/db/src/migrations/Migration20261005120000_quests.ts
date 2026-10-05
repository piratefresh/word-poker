/**
 * Migration20261005120000_quests.ts — quests and the login streak (STO-525).
 *
 * Hand-written like the two tables before it. `quest_progress` is keyed by `(user_id, quest_id)`
 * because a player has at most one row per quest; `quest_hand_log`'s unique index on `(user_id,
 * hand_token)` is what makes a retried claim a no-op. The `wallet_event` index is the one that
 * actually pays each reward once — `quest_progress` can be rebuilt from nothing, that index can't.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20261005120000_quests extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "quest_progress" (
        "user_id" text not null,
        "quest_id" text not null,
        "progress" integer not null default 0,
        "streak" integer not null default 0,
        "completed_at" timestamptz null,
        constraint "quest_progress_pkey" primary key ("user_id", "quest_id")
      );
    `);
    this.addSql(`
      create table "quest_hand_log" (
        "id" uuid primary key default gen_random_uuid(),
        "created_at" timestamptz not null default now(),
        "user_id" text not null,
        "hand_token" text not null
      );
    `);
    this.addSql(
      `create unique index "quest_hand_log_user_token_unique" on "quest_hand_log" ("user_id", "hand_token");`,
    );
    this.addSql(
      `create unique index "wallet_event_reward_once" on "wallet_event" ("user_id", "kind", "ref") where "kind" in ('quest', 'streak');`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "wallet_event_reward_once";`);
    this.addSql(`drop table if exists "quest_hand_log";`);
    this.addSql(`drop table if exists "quest_progress";`);
  }
}
