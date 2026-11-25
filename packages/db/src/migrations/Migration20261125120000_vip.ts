/**
 * Migration20261125120000_vip.ts — VIP Points and lifetime tiers (STO-1170).
 *
 * `vip_progress` is one row per player: lifetime points, the tier-reward high-water mark, and the
 * current UTC day's play points toward the daily cap. `vip_point_log` makes every award pay once
 * per token (a hand, a day's streak, a purchase). The three VIP wallet kinds join the pay-once index.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20261125120000_vip extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "vip_progress" (
        "user_id" text primary key,
        "points" bigint not null default 0 check ("points" >= 0),
        "tier_paid" integer not null default 0,
        "play_day" date,
        "play_today" integer not null default 0,
        "updated_at" timestamptz not null default now()
      );
    `);
    this.addSql(`
      create table "vip_point_log" (
        "user_id" text not null,
        "token" text not null,
        "points" integer not null,
        "created_at" timestamptz not null default now(),
        primary key ("user_id", "token")
      );
    `);
    this.addSql(`drop index if exists "wallet_event_reward_once";`);
    this.addSql(
      `create unique index "wallet_event_reward_once" on "wallet_event" ("user_id", "kind", "ref") where "kind" in ('quest', 'streak', 'level', 'referral', 'vip_tier', 'vip_daily', 'vip_purchase_bonus');`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "wallet_event_reward_once";`);
    this.addSql(
      `create unique index "wallet_event_reward_once" on "wallet_event" ("user_id", "kind", "ref") where "kind" in ('quest', 'streak', 'level', 'referral');`,
    );
    this.addSql(`drop table if exists "vip_point_log";`);
    this.addSql(`drop table if exists "vip_progress";`);
  }
}
