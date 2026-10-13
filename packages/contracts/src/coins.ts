/**
 * coins.ts — the Wallet's vocabulary (docs/rules/balances-and-tables.md §1): the RevenueCat Virtual
 * Currency that holds it, the packs the store sells, and what a wallet_event can record.
 *
 * No pack's coin amount lives here: each product's grant is RevenueCat dashboard data, read through
 * the catalog endpoint, so a price change never needs a release.
 */

/** The RevenueCat Virtual Currency code the Wallet is held in. */
export const COIN_CURRENCY = "COIN";

/** The store's consumable products, smallest first. */
export const COIN_PACK_IDS = ["coins_small", "coins_medium", "coins_large"] as const;

export type CoinPackId = (typeof COIN_PACK_IDS)[number];

/** What a wallet_event records; `quest`/`streak`/`level` pay the rewards in `quests.ts` (STO-525, STO-543). */
export const WALLET_EVENT_KINDS = [
  "welcome",
  "purchase",
  "refund",
  "adjustment",
  "buy_in",
  "cash_out",
  "quest",
  "streak",
  "level",
] as const;

export type WalletEventKind = (typeof WALLET_EVENT_KINDS)[number];

/** The coins a player is granted, once, when they verify their email. */
export const WELCOME_GRANT = 5000;

/** A guest who registers is paid this much per hand they played, up to the cap, on top of the welcome grant. */
export const GUEST_HAND_BONUS = 100;
export const GUEST_HAND_BONUS_CAP = 1000;

/** `GET /api/wallet`: the signed-in player's balance. */
export interface WalletResponse {
  readonly coins: number;
  /** The welcome grant has been opened for this player, so there is nothing left to claim. */
  readonly welcomed: boolean;
}

/** One pack the store can sell: its store product id and the coins RevenueCat grants for it. */
export interface CoinCatalogPack {
  readonly productId: string;
  readonly coins: number;
}

/** `GET /api/store-catalog`: every pack that has a grant. A pack without one is left out. */
export interface CoinCatalog {
  readonly packs: readonly CoinCatalogPack[];
}

export function isCoinPackId(value: unknown): value is CoinPackId {
  return (COIN_PACK_IDS as readonly unknown[]).includes(value);
}

export function isWalletEventKind(value: unknown): value is WalletEventKind {
  return (WALLET_EVENT_KINDS as readonly unknown[]).includes(value);
}

function isCoinCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isWalletResponse(value: unknown): value is WalletResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isCoinCount(candidate.coins) && typeof candidate.welcomed === "boolean";
}

function isCoinCatalogPack(value: unknown): value is CoinCatalogPack {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.productId === "string" &&
    candidate.productId.length > 0 &&
    isCoinCount(candidate.coins) &&
    candidate.coins > 0
  );
}

export function isCoinCatalog(value: unknown): value is CoinCatalog {
  if (typeof value !== "object" || value === null) return false;
  const packs = (value as Record<string, unknown>).packs;
  return Array.isArray(packs) && packs.every(isCoinCatalogPack);
}
