/**
 * table-wallet.ts — what a table does to the Wallet (docs/rules/balances-and-tables.md §4, §5):
 * debit the buy-in before a seat is handed out, and credit the remaining Table Stack when the seat
 * goes for good.
 *
 * Both rows carry the seat's ref (`room:session`), and the database keeps one of each per ref, so a
 * repeated cash-out can never pay twice. A cash-out is only sent once its buy-in has applied
 * (`@wordpoker/economy`), so paying back a buy-in whose outcome is unknown is always safe.
 */

import { applyWalletChange, type WalletDeps } from "@wordpoker/economy";
import { buyInFor, openWalletEvent, pendingWalletEvents, settleWalletEvent } from "@wordpoker/db";

import { serverOrm } from "../database.js";

/** `paid`: the seat may be handed out. `insufficient`: the Wallet is too small. `unavailable`: try again. */
export type BuyInResult = "paid" | "insufficient" | "unavailable";

export interface TableWallet {
  buyIn(userId: string, amount: number, ref: string): Promise<BuyInResult>;
  /** Never throws: a leaving seat is not held up by the Wallet. A `pending` row is retried by `GET /api/wallet`. */
  cashOut(userId: string, amount: number, ref: string): Promise<void>;
}

/** How many times a cash-out the database refused is tried before it is logged as lost. */
const CASH_OUT_ATTEMPTS = 8;
const CASH_OUT_MAX_WAIT_MS = 30_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createTableWallet(deps: WalletDeps, sleep: (ms: number) => Promise<void> = wait): TableWallet {
  const cashOut = async (userId: string, amount: number, ref: string) => {
    if (amount <= 0) return;
    // A database outage must not lose the Table Stack, so recording it is retried with backoff.
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await applyWalletChange(userId, "cash_out", amount, { ref }, deps);
        if (!result.applied && result.reason !== "already_recorded") {
          console.error(`wallet: cash-out ${ref} is ${result.reason}`);
        }
        return;
      } catch (error) {
        if (attempt === CASH_OUT_ATTEMPTS) {
          console.error(`wallet: cash-out ${ref} of ${amount} for ${userId} was not recorded`, error);
          return;
        }
        await sleep(Math.min(1000 * 2 ** (attempt - 1), CASH_OUT_MAX_WAIT_MS));
      }
    }
  };

  return {
    async buyIn(userId, amount, ref) {
      let result;
      try {
        result = await applyWalletChange(userId, "buy_in", -amount, { ref }, deps);
      } catch (error) {
        console.error(`wallet: buy-in ${ref} has an unknown outcome`, error);
        result = null;
      }
      if (result?.applied) return "paid";
      if (result?.reason === "insufficient_coins") return "insufficient";
      // A `pending` or unknown debit may still land, so the seat that was never handed out is paid
      // back under the same ref; that credit waits until the debit is known to have applied.
      if (result === null || result.reason === "pending") await cashOut(userId, amount, ref);
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
      buyInFor: (userId, ref) => buyInFor(userId, ref, { orm }),
    },
  });
}
