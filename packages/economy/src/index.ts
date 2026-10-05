/**
 * index.ts — the Wallet's server side (STO-346).
 *
 * Server-only: it holds RevenueCat's secret key. The app's API routes and `apps/server` import it;
 * client code never does (`scripts/check-boundaries.mjs` enforces that).
 */

export {
  CATALOG_TTL_MS,
  clearCatalogCache,
  coinCatalog,
  type CatalogDeps,
} from "./catalog";
export {
  EconomyNotConfiguredError,
  InsufficientCoinsError,
  RevenueCatError,
  createRevenueCatClient,
  revenueCat,
  type CoinGrant,
  type RevenueCatClient,
  type RevenueCatClientOptions,
} from "./revenuecat";
export {
  applyWalletChange,
  getCoinBalance,
  grantWelcome,
  retryPending,
  type WalletChangeExtras,
  type WalletChangeResult,
  type WalletDeps,
  type WalletStore,
} from "./wallet";
export {
  claimQuestHand,
  creditDailyStreak,
  payCompletedQuests,
  streakLength,
  type QuestStore,
  type RewardsDeps,
} from "./rewards";
export { CURRENCY_EVENT_TYPE, parseCurrencyEvent, type ParsedWebhook } from "./webhook";
