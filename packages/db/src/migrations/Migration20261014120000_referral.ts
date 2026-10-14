import { Migration } from "@mikro-orm/migrations";

/** Who invited whom (STO-582): one row per referred account, and `referral` joins the pay-once kinds. */
export class Migration20261014120000_referral extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table referral (
      referee_id text primary key, referrer_id text not null,
      created_at timestamptz not null default now(), check (referee_id <> referrer_id)
    );`);
    this.addSql(`create index referral_referrer on referral (referrer_id);`);
    this.addSql(`drop index if exists "wallet_event_reward_once";`);
    this.addSql(
      `create unique index "wallet_event_reward_once" on "wallet_event" ("user_id", "kind", "ref") where "kind" in ('quest', 'streak', 'level', 'referral');`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "wallet_event_reward_once";`);
    this.addSql(
      `create unique index "wallet_event_reward_once" on "wallet_event" ("user_id", "kind", "ref") where "kind" in ('quest', 'streak', 'level');`,
    );
    this.addSql(`drop table if exists referral;`);
  }
}
