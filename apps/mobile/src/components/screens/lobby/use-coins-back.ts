/**
 * use-coins-back.ts — design 1a's two "coins back" moments in the lobby. The wallet chip counts up
 * to the new balance, the gain rides under it, and a toast says why.
 *
 * - Flow B: the Wallet rises past the cheapest buy-in while the lobby is open, and Join glows for
 *   about a second.
 * - Flow A8: back from a table, the stack has been cashed out (STO-954). The server credits it
 *   after the seat is gone, so the gain is the Wallet read now against the balance read just
 *   before leaving — read again briefly until it shows, and never guessed.
 *
 * Reduced motion skips the count-up and the glow, so the end values show at once.
 */

import { useEffect, useState } from "react";

import { formatCoins } from "@/lib/ui/format";

const CROSSING_COUNT_MS = 800;
const CASH_OUT_COUNT_MS = 1400;
const CASH_OUT_DELAY_MS = 200;
const GLOW_MS = 1000;
const TOAST_MS = 3000;
/** The cash-out may land a moment after the lobby does: this many reads, this far apart. */
const CASH_OUT_READS = 4;
const CASH_OUT_RETRY_MS = 750;

/** The table just left, and the Wallet's balance read just before leaving it. */
export interface CashOut {
  readonly table: string;
  readonly before: number;
}

export interface CoinsBack {
  /** The balance the wallet chip draws: counting up during a gain, the Wallet's otherwise. */
  readonly shown: number | null;
  /** The coins the gain added, while its badge and toast are up. */
  readonly gained: number | null;
  /** The toast's two lines, while it is up. */
  readonly title: string | null;
  readonly line: string | null;
  readonly glow: boolean;
}

interface Gain {
  readonly from: number;
  readonly to: number;
  readonly title: string;
  readonly line: string;
  readonly countMs: number;
  readonly delayMs: number;
}

export function useCoinsBack(
  coins: number | null,
  threshold: number,
  reason: string | null,
  reduceMotion: boolean,
  cashOut: CashOut | null,
  readCoins: () => Promise<number | null>,
): CoinsBack {
  const [seen, setSeen] = useState(coins);
  const [gain, setGain] = useState<Gain | null>(null);
  const [counted, setCounted] = useState<number | null>(null);
  const [glow, setGlow] = useState(false);
  /** A cash-out still waiting for the Wallet to show it; the chip holds the old balance meanwhile. */
  const [waiting, setWaiting] = useState<CashOut | null>(null);
  const [seenCashOut, setSeenCashOut] = useState<CashOut | null>(null);

  const start = (next: Gain) => {
    setGain(next);
    setCounted(reduceMotion ? null : next.from);
  };

  // React's "adjust state when a prop changes": the crossing is caught in the render that sees it.
  // A cash-out owns the chip while it is read, so the reads it causes are not a second crossing.
  if (cashOut !== seenCashOut) {
    setSeenCashOut(cashOut);
    if (cashOut !== null) setWaiting(cashOut);
  }
  if (coins !== seen) {
    setSeen(coins);
    if (waiting === null && gain === null && seen !== null && coins !== null && seen < threshold && coins >= threshold) {
      start({
        from: seen,
        to: coins,
        title: `+${formatCoins(coins - seen)} COINS`,
        line: reason === null ? "You're back in." : `${reason} You're back in.`,
        countMs: CROSSING_COUNT_MS,
        delayMs: 0,
      });
      setGlow(!reduceMotion);
    }
  }

  useEffect(() => {
    if (cashOut === null) return;
    let current = true;
    void (async () => {
      for (let read = 0; read < CASH_OUT_READS && current; read++) {
        if (read > 0) await new Promise((resolve) => setTimeout(resolve, CASH_OUT_RETRY_MS));
        const after = current ? await readCoins() : null;
        if (!current) return;
        if (after !== null && after > cashOut.before) {
          start({
            from: cashOut.before,
            to: after,
            title: `+${formatCoins(after - cashOut.before)} COINS BACK`,
            line: `Your chips from ${cashOut.table} are back in your wallet.`,
            countMs: CASH_OUT_COUNT_MS,
            delayMs: CASH_OUT_DELAY_MS,
          });
          break;
        }
      }
      // Busted, or a Wallet that never showed the credit: nothing is said rather than a guess.
      if (current) setWaiting(null);
    })();
    return () => {
      current = false;
    };
    // `readCoins` and `start` are read at the time of the cash-out; only a new one restarts this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashOut]);

  useEffect(() => {
    if (gain === null) return;
    const done = setTimeout(() => setGain(null), TOAST_MS);
    const unglow = setTimeout(() => setGlow(false), GLOW_MS);
    return () => {
      clearTimeout(done);
      clearTimeout(unglow);
    };
  }, [gain]);

  useEffect(() => {
    if (gain === null || reduceMotion) return;
    let frame = 0;
    let startedAt = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - startedAt) / gain.countMs);
      const eased = 1 - (1 - t) ** 3;
      setCounted(t === 1 ? null : Math.round(gain.from + (gain.to - gain.from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    const begin = setTimeout(() => {
      startedAt = Date.now();
      frame = requestAnimationFrame(step);
    }, gain.delayMs);
    return () => {
      clearTimeout(begin);
      cancelAnimationFrame(frame);
    };
  }, [gain, reduceMotion]);

  return {
    shown: counted ?? (waiting !== null && gain === null ? waiting.before : coins),
    gained: gain === null ? null : gain.to - gain.from,
    title: gain?.title ?? null,
    line: gain?.line ?? null,
    glow,
  };
}
