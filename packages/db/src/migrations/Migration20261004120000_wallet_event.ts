/**
 * Migration20261004120000_wallet_event.ts — the Wallet's audit log (STO-346).
 *
 * Hand-written like the rating table's. The partial unique indexes are the point: the welcome
 * index is what makes the grant once-only (a second `insert … on conflict do nothing` returns no
 * row), and the event index is what makes a redelivered webhook record once.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20261004120000_wallet_event extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "wallet_event" (
        "id" uuid primary key default gen_random_uuid(),
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "user_id" text not null,
        "kind" text not null,
        "amount" integer not null,
        "status" text not null,
        "attempts" integer not null default 0,
        "last_error" text null,
        "balance_after" integer null,
        "product_id" text null,
        "ref" text null,
        "rc_event_id" text null,
        "rc_transaction_id" text null
      );
    `);
    this.addSql(
      `create unique index "wallet_event_welcome_once" on "wallet_event" ("user_id") where "kind" = 'welcome';`,
    );
    this.addSql(
      `create unique index "wallet_event_rc_event_unique" on "wallet_event" ("rc_event_id") where "rc_event_id" is not null;`,
    );
    this.addSql(`create index "wallet_event_user_created_idx" on "wallet_event" ("user_id", "created_at");`);
    this.addSql(`create index "wallet_event_pending_idx" on "wallet_event" ("user_id") where "status" = 'pending';`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wallet_event";`);
  }
}
