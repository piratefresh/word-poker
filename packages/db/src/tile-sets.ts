/**
 * tile-sets.ts — the reads and the one write behind the store's tile sets (STO-1045).
 *
 * What a player owns is read straight off their `tile_set` wallet events (`ref` = the set's id),
 * like the login streak: no ownership table to drift from the ledger. The set they wear is the
 * `player_progress.tile_set` column, null meaning the default.
 */

import type { MikroORM } from "@mikro-orm/postgresql";
import type { WalletEventKind } from "@wordpoker/contracts";

import type { WalletEventStatus } from "./entities/index";
import { getOrm } from "./orm";

type DbOptions = { orm?: MikroORM };

const KIND: WalletEventKind = "tile_set";

async function connection(options: DbOptions) {
  const instance = options.orm ?? (await getOrm());

  return instance.em.getConnection();
}

/**
 * The status of each set the player has a live (not `failed`) purchase row for, keyed by the set's
 * raw `ref`. `applied` is owned; `pending` was logged but the Wallet has not answered yet.
 */
export async function tileSetPurchases(
  userId: string,
  options: DbOptions = {},
): Promise<Record<string, WalletEventStatus>> {
  const db = await connection(options);
  const rows = await db.execute<{ ref: string; status: WalletEventStatus }[]>(
    `select "ref", "status" from "wallet_event"
      where "user_id" = ? and "kind" = ? and "status" <> 'failed' and "ref" is not null`,
    [userId, KIND],
  );

  return Object.fromEntries(rows.map((row) => [row.ref, row.status]));
}

/** The raw id of the set the player wears, or null for the default. Unchecked: the caller validates it. */
export async function equippedTileSet(userId: string, options: DbOptions = {}): Promise<string | null> {
  const db = await connection(options);
  const [row] = await db.execute<{ tile_set: string | null }[]>(
    `select "tile_set" from "player_progress" where "user_id" = ?`,
    [userId],
  );

  return row?.tile_set ?? null;
}

/** Puts a set on the player, creating their `player_progress` row when there is none. */
export async function setEquippedTileSet(userId: string, tileSet: string, options: DbOptions = {}): Promise<void> {
  const db = await connection(options);
  await db.execute(
    `insert into "player_progress" ("user_id", "tile_set") values (?, ?)
     on conflict ("user_id") do update set "tile_set" = excluded."tile_set"`,
    [userId, tileSet],
    "run",
  );
}
