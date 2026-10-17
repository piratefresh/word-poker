/**
 * use-coin-store.ts — what the coin store shows, and the buy flow (STO-346).
 *
 * The balance always comes from `GET /api/wallet` (RevenueCat Virtual Currency, read by the server);
 * the packs come from the store through the SDK, joined with the server's catalog. A purchase
 * credits the Wallet on RevenueCat's side, so after one the balance is re-read until it rises.
 */

import { useCallback, useEffect, useState } from "react";

import { fetchCoinOffering, purchaseCoinPack, revenuecatAvailable } from "@/lib/wallet/revenuecat";
import { useRevenueCatReady } from "@/lib/wallet/use-revenuecat";
import { fetchCoinCatalog, fetchWallet, WalletAuthError } from "@/lib/wallet/wallet-client";

import { joinCoinPacks, type CoinPackRow } from "./coin-packs";

/** How many times, and how far apart, the balance is re-read after a purchase. */
export const BALANCE_RETRIES = 5;
export const BALANCE_RETRY_MS = 1500;

export type BalanceState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly coins: number; readonly welcomed: boolean }
  | { readonly status: "signed-out" }
  | { readonly status: "error"; readonly message: string };

export type PacksState =
  | { readonly status: "unavailable" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly rows: readonly CoinPackRow[] }
  | { readonly status: "error"; readonly message: string };

/** What the last purchase came to, for the line under the balance. */
export type PurchaseNotice =
  | { readonly kind: "added"; readonly coins: number }
  | { readonly kind: "on-the-way" }
  | { readonly kind: "error"; readonly message: string };

export interface CoinStore {
  readonly balance: BalanceState;
  readonly packs: PacksState;
  /** The pack being bought, while its purchase is open. */
  readonly buying: string | null;
  /** Buy buttons wait until RevenueCat is logged in as this player. */
  readonly canBuy: boolean;
  readonly notice: PurchaseNotice | null;
  buy(row: CoinPackRow): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useCoinStore(userId: string | undefined): CoinStore {
  const available = revenuecatAvailable();
  const ready = useRevenueCatReady(userId);
  const [balance, setBalance] = useState<BalanceState>({ status: "loading" });
  const [packs, setPacks] = useState<PacksState>(available ? { status: "loading" } : { status: "unavailable" });
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<PurchaseNotice | null>(null);

  // Both reads synchronise with the server and the store, once per signed-in player.
  useEffect(() => {
    let current = true;

    fetchWallet()
      .then((wallet) => current && setBalance({ status: "ready", ...wallet }))
      .catch((error: unknown) => {
        if (!current) return;
        setBalance(
          error instanceof WalletAuthError
            ? { status: "signed-out" }
            : { status: "error", message: message(error, "The coin store could not be reached.") },
        );
      });

    if (available) {
      Promise.all([fetchCoinOffering(), fetchCoinCatalog()])
        .then(([offering, catalog]) => {
          if (!current) return;
          const { rows, hidden } = joinCoinPacks(offering.packages, catalog, offering.display);
          if (hidden.length > 0) console.warn(`[store] no catalog grant for ${hidden.join(", ")}; hidden`);
          setPacks({ status: "ready", rows });
        })
        .catch((error: unknown) => {
          if (current) setPacks({ status: "error", message: message(error, "The coin packs could not be loaded.") });
        });
    }

    return () => {
      current = false;
    };
  }, [available, userId]);

  const buy = useCallback(
    async (row: CoinPackRow) => {
      const before = balance.status === "ready" ? balance.coins : null;
      setBuying(row.productId);
      setNotice(null);

      try {
        if ((await purchaseCoinPack(row.pack)) === "cancelled") return;

        for (let attempt = 0; attempt < BALANCE_RETRIES; attempt += 1) {
          if (attempt > 0) await sleep(BALANCE_RETRY_MS);
          const wallet = await fetchWallet().catch(() => null);
          if (wallet === null) continue;
          setBalance({ status: "ready", ...wallet });
          if (before === null || wallet.coins > before) {
            setNotice({ kind: "added", coins: before === null ? row.coins : wallet.coins - before });
            return;
          }
        }
        setNotice({ kind: "on-the-way" });
      } catch (error) {
        setNotice({ kind: "error", message: message(error, "The purchase did not go through.") });
      } finally {
        setBuying(null);
      }
    },
    [balance],
  );

  return { balance, packs, buying, canBuy: available && ready, notice, buy };
}
