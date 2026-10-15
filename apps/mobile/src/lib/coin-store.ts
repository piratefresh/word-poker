/**
 * The Coin Store (and Quests beside it) stays hidden until table buy-ins spend the Wallet
 * (STO-346). Expo inlines the `EXPO_PUBLIC_*` name at build time; reading it in a call rather than
 * at module load lets a test set it.
 */
export function coinStoreEnabled(): boolean {
  return process.env.EXPO_PUBLIC_COIN_STORE === "1";
}
