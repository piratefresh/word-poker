/**
 * tile-sets.ts — the cosmetic tile sets the store sells for coins (STO-1045).
 *
 * The ids and prices live here because the server charges them and the app shows them; a set's
 * colours are paint, so they stay in the app's theme. Every player owns the default set, and a
 * bought set is a `tile_set` wallet event whose `ref` is the set's id.
 */

/** Every set, in the order the store lists them; the first is the default every player owns. */
export const TILE_SET_IDS = ["ivory", "jade", "rosewood", "midnight", "neon-alley"] as const;

export type TileSetId = (typeof TILE_SET_IDS)[number];

export const DEFAULT_TILE_SET: TileSetId = "ivory";

/** What each set costs in coins. Placeholders until the economy pass sets real prices. */
export const TILE_SET_PRICES: Readonly<Record<TileSetId, number>> = {
  ivory: 0,
  jade: 2500,
  rosewood: 3000,
  midnight: 4000,
  "neon-alley": 6000,
};

/** `GET /api/tile-sets`, and the body of a successful `POST`: what the player owns and wears. */
export interface TileSetsResponse {
  /** Always includes the default set. */
  readonly owned: readonly TileSetId[];
  readonly equipped: TileSetId;
  /** The Wallet's balance after a purchase; only a `buy` that took coins reports it. */
  readonly coins?: number;
}

/** `POST /api/tile-sets`: buy a set (which also equips it), or equip one already owned. */
export interface TileSetRequest {
  readonly action: "buy" | "equip";
  readonly tileSet: TileSetId;
}

/**
 * Why a `POST` changed nothing. `insufficient_coins`: the Wallet is short. `not_owned`: an equip
 * for a set the player has not bought. `pending`: the purchase is logged but the Wallet could not
 * be reached; it settles on a later read.
 */
export const TILE_SET_REFUSALS = ["insufficient_coins", "not_owned", "pending"] as const;

export type TileSetRefusal = (typeof TILE_SET_REFUSALS)[number];

export function isTileSetId(value: unknown): value is TileSetId {
  return (TILE_SET_IDS as readonly unknown[]).includes(value);
}

export function isTileSetRequest(value: unknown): value is TileSetRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (candidate.action === "buy" || candidate.action === "equip") && isTileSetId(candidate.tileSet);
}

export function isTileSetsResponse(value: unknown): value is TileSetsResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.owned) &&
    candidate.owned.every(isTileSetId) &&
    candidate.owned.includes(DEFAULT_TILE_SET) &&
    isTileSetId(candidate.equipped) &&
    (candidate.coins === undefined ||
      (typeof candidate.coins === "number" && Number.isInteger(candidate.coins) && candidate.coins >= 0))
  );
}
