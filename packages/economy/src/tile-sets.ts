/**
 * tile-sets.ts — buying and wearing the store's tile sets (STO-1045).
 *
 * A purchase is a `tile_set` wallet event that takes the set's price from the Wallet. It goes
 * through `applyWalletChange` like every other change, so RevenueCat refuses an overdraw and the
 * database's `wallet_event_tile_set_once` index refuses a second charge for the same set. What a
 * player owns is their applied `tile_set` rows plus the default set; nothing else records it.
 */

import {
  DEFAULT_TILE_SET,
  TILE_SET_IDS,
  TILE_SET_PRICES,
  isTileSetId,
  type TileSetId,
  type TileSetRefusal,
  type TileSetsResponse,
} from "@wordpoker/contracts";
import {
  equippedTileSet as equippedTileSetDb,
  setEquippedTileSet as setEquippedTileSetDb,
  tileSetPurchases as tileSetPurchasesDb,
  type WalletEventStatus,
} from "@wordpoker/db";

import { applyWalletChange, type WalletDeps } from "./wallet";

/** The tile-set reads and the one write this module needs; the database's by default, a fake in tests. */
export interface TileSetStore {
  tileSetPurchases(userId: string): Promise<Record<string, WalletEventStatus>>;
  equippedTileSet(userId: string): Promise<string | null>;
  setEquippedTileSet(userId: string, tileSet: TileSetId): Promise<void>;
}

export interface TileSetDeps extends WalletDeps {
  readonly tileSets?: TileSetStore;
}

const databaseTileSets: TileSetStore = {
  tileSetPurchases: (userId) => tileSetPurchasesDb(userId),
  equippedTileSet: (userId) => equippedTileSetDb(userId),
  setEquippedTileSet: (userId, tileSet) => setEquippedTileSetDb(userId, tileSet),
};

export type TileSetOutcome =
  | { readonly ok: true; readonly state: TileSetsResponse }
  | { readonly ok: false; readonly reason: TileSetRefusal };

function ownedFrom(purchases: Record<string, WalletEventStatus>): TileSetId[] {
  return TILE_SET_IDS.filter((id) => id === DEFAULT_TILE_SET || purchases[id] === "applied");
}

/**
 * What the player owns and wears. A stored set they no longer own, or one this build does not know,
 * reads as the default rather than as an error: the table still needs tiles to draw.
 */
export async function readTileSets(userId: string, deps: TileSetDeps = {}): Promise<TileSetsResponse> {
  const store = deps.tileSets ?? databaseTileSets;
  const [purchases, stored] = await Promise.all([store.tileSetPurchases(userId), store.equippedTileSet(userId)]);
  const owned = ownedFrom(purchases);
  const equipped = isTileSetId(stored) && owned.includes(stored) ? stored : DEFAULT_TILE_SET;

  return { owned, equipped };
}

/** Puts on a set the player already owns. */
export async function equipTileSet(userId: string, tileSet: TileSetId, deps: TileSetDeps = {}): Promise<TileSetOutcome> {
  const store = deps.tileSets ?? databaseTileSets;
  const { owned } = await readTileSets(userId, deps);
  if (!owned.includes(tileSet)) return { ok: false, reason: "not_owned" };
  await store.setEquippedTileSet(userId, tileSet);

  return { ok: true, state: { owned, equipped: tileSet } };
}

/**
 * Buys a set with coins and puts it on. Buying one the player already owns just equips it, and
 * charges nothing. Throws when RevenueCat rejects the change outright, which the route reports as
 * a failure rather than as a refusal the player can act on.
 */
export async function buyTileSet(userId: string, tileSet: TileSetId, deps: TileSetDeps = {}): Promise<TileSetOutcome> {
  const store = deps.tileSets ?? databaseTileSets;
  const before = await store.tileSetPurchases(userId);
  if (ownedFrom(before).includes(tileSet)) return equipTileSet(userId, tileSet, deps);
  if (before[tileSet] === "pending") return { ok: false, reason: "pending" };

  const result = await applyWalletChange(userId, "tile_set", -TILE_SET_PRICES[tileSet], { ref: tileSet }, deps);

  if (result.applied) {
    await store.setEquippedTileSet(userId, tileSet);
    const owned = ownedFrom({ ...before, [tileSet]: "applied" });

    return { ok: true, state: { owned, equipped: tileSet, coins: result.balance } };
  }

  switch (result.reason) {
    case "insufficient_coins":
      return { ok: false, reason: "insufficient_coins" };
    case "pending":
      return { ok: false, reason: "pending" };
    case "already_recorded": {
      // Another request opened this purchase between our read and our write.
      const after = await store.tileSetPurchases(userId);
      if (after[tileSet] === "applied") return equipTileSet(userId, tileSet, deps);

      return { ok: false, reason: "pending" };
    }
    case "rejected":
      throw new Error(`tile set ${tileSet}: the Wallet rejected the purchase`);
  }
}
