/**
 * table-wallet.ts — what a table does to the Wallet (docs/rules/balances-and-tables.md §4, §5):
 * debit the buy-in before a seat is handed out, and credit the remaining Table Stack when the seat
 * goes for good.
 *
 * Both rows carry the seat's ref (`room:session`), and the database keeps one of each per ref, so a
 * repeated cash-out can never pay twice.
 */

import { applyWalletChange, type WalletDeps } from "@wordpoker/economy";
import { openWalletEvent, pendingWalletEvents, settleWalletEvent } from "@wordpoker/db";

import { serverOrm } from "../database.js";

/** `paid`: the seat may be handed out. `insufficient`: the Wallet is too small. `unavailable`: try again. */
export type BuyInResult = "paid" | "insufficient" | "unavailable";

export interface TableWallet {
  buyIn(userId: string, amount: number, ref: string): Promise<BuyInResult>;
  /** Never throws: a leaving seat is not held up by the Wallet. A `pending` row is retried by `GET /api/wallet`. */
  cashOut(userId: string, amount: number, ref: string): Promise<void>;
}

export function createTableWallet(deps: WalletDeps): TableWallet {
  const cashOut = async (userId: string, amount: number, ref: string) => {
    if (amount <= 0) return;
    try {
      const result = await applyWalletChange(userId, "cash_out", amount, { ref }, deps);
      if (!result.applied && result.reason !== "already_recorded") {
        console.error(`wallet: cash-out ${ref} is ${result.reason}`);
      }
    } catch (error) {
      console.error(`wallet: cash-out ${ref} was not recorded`, error);
    }
  };

  return {
    async buyIn(userId, amount, ref) {
      const result = await applyWalletChange(userId, "buy_in", -amount, { ref }, deps);
      if (result.applied) return "paid";
      if (result.reason === "insufficient_coins") return "insufficient";
      // A `pending` debit may still land when it is retried, so the seat that was never handed out
      // is paid back under the same ref: the two rows retry together and net to nothing.
      if (result.reason === "pending") await cashOut(userId, amount, ref);
      return "unavailable";
    },
    cashOut,
  };
}

/**
 * The Wallet the server's database and RevenueCat keys describe, or null when either is missing.
 * Outside production that means free tables (a dev server, a smoke run); in production the room
 * refuses every join instead, so a missing key can never seat a player for nothing.
 */
export async function tableWalletFromEnv(): Promise<TableWallet | null> {
  if (!process.env.REVENUECAT_PROJECT_ID || !process.env.REVENUECAT_SECRET_API_KEY) return null;
  const orm = await serverOrm();
  if (orm === null) return null;

  return createTableWallet({
    store: {
      openWalletEvent: (input) => openWalletEvent(input, { orm }),
      settleWalletEvent: (id, input) => settleWalletEvent(id, input, { orm }),
      pendingWalletEvents: (userId) => pendingWalletEvents(userId, { orm }),
    },
  });
}
