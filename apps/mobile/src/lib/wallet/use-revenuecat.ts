/**
 * use-revenuecat.ts — keeps RevenueCat's customer the signed-in player (STO-346).
 *
 * `useRevenueCatIdentity` runs once, in `RootLayout`, beside the session: it logs the SDK in as the
 * Better Auth user id when one appears and out when it goes. Every purchase credits that customer's
 * Wallet, so a buy button must wait for `logIn` to resolve — `useRevenueCatReady` is that gate. The
 * flag lives in this module, not in React state, because the layout sets it and the store reads it.
 */

import { useEffect, useSyncExternalStore } from "react";

import { logInRevenueCat, logOutRevenueCat, revenuecatAvailable } from "@/lib/wallet/revenuecat";

/** The user id RevenueCat is logged in as, once `logIn` has resolved. */
let readyFor: string | null = null;
const listeners = new Set<() => void>();

function setReadyFor(userId: string | null): void {
  readyFor = userId;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/** Logs RevenueCat in and out with the session. Does nothing where the store cannot sell. */
export function useRevenueCatIdentity(userId: string | undefined): void {
  useEffect(() => {
    if (!revenuecatAvailable()) return;

    if (!userId) {
      setReadyFor(null);
      void logOutRevenueCat().catch((error: unknown) => console.warn("[revenuecat] logOut failed:", error));
      return;
    }

    let current = true;
    setReadyFor(null);
    logInRevenueCat(userId)
      .then(() => {
        if (current) setReadyFor(userId);
      })
      .catch((error: unknown) => console.warn("[revenuecat] logIn failed:", error));

    return () => {
      current = false;
    };
  }, [userId]);
}

/** Whether RevenueCat is logged in as `userId` — the buy buttons' gate. */
export function useRevenueCatReady(userId: string | undefined): boolean {
  const ready = useSyncExternalStore(subscribe, () => readyFor);

  return userId !== undefined && ready === userId;
}
