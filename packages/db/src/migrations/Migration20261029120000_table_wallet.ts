import { Migration } from "@mikro-orm/migrations";

/**
 * A table's buy-in and cash-out rows, once each per seat (docs/rules/balances-and-tables.md §4).
 * The seat's ref is `room:session`, so a repeated cash-out lands on this index and pays nothing.
 */
export class Migration20261029120000_table_wallet extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create unique index "wallet_event_table_once" on "wallet_event" ("user_id", "kind", "ref") where "kind" in ('buy_in', 'cash_out');`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "wallet_event_table_once";`);
  }
}
