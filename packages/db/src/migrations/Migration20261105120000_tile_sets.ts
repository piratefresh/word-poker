import { Migration } from "@mikro-orm/migrations";

/**
 * Tile sets bought with coins (STO-1045). A purchase is a `tile_set` wallet event whose `ref` is the
 * set's id, so ownership needs no table of its own: it is that player's applied `tile_set` rows.
 * The partial unique index keeps a set from being charged twice. A `failed` row (the Wallet was
 * short) leaves the index, so the player can try again once they have the coins.
 *
 * The equipped set is one column on `player_progress`, the one-row-per-player table. Null means the
 * default set, so existing players need no backfill. Account erasure already deletes the row.
 */
export class Migration20261105120000_tile_sets extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create unique index "wallet_event_tile_set_once" on "wallet_event" ("user_id", "ref") where "kind" = 'tile_set' and "status" <> 'failed';`,
    );
    this.addSql(`alter table "player_progress" add column if not exists "tile_set" text;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "player_progress" drop column if exists "tile_set";`);
    this.addSql(`drop index if exists "wallet_event_tile_set_once";`);
  }
}
