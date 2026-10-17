/**
 * claim-store.ts — the device's durable slot for unsent quest claims (STO-563), native side:
 * expo-sqlite's kv-store, which STO-457's offline outbox will share. `.web.ts` is localStorage.
 */

import { Storage } from "expo-sqlite/kv-store";

/** Set once the guided hand reaches its payout; until then the street menu highlights Tutorial (STO-597). */
export const TUTORIAL_DONE = "tutorial-done";

export function readItem(key: string): string | null {
  return Storage.getItemSync(key);
}

export function writeItem(key: string, value: string): void {
  Storage.setItemSync(key, value);
}
