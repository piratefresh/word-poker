/**
 * use-coins-back.ts — design 1a Flow B's "coins back": the Wallet rises past the cheapest buy-in
 * while the lobby is open. The wallet chip counts up to the new balance, the gain rides under it,
 * a toast says why, and Join glows for about a second. Reduced motion skips the count-up and the
 * glow, so the end values show at once.
 */

import { useEffect, useState } from "react";

const COUNT_MS = 800;
const GLOW_MS = 1000;
const TOAST_MS = 3000;

export interface CoinsBack {
  /** The balance the wallet chip draws: counting up during a crossing, the Wallet's otherwise. */
  readonly shown: number | null;
  /** The coins the crossing added, while its badge and toast are up. */
  readonly gained: number | null;
  /** Why the coins came, when it is known. */
  readonly reason: string | null;
  readonly glow: boolean;
}

interface Crossing {
  readonly from: number;
  readonly to: number;
  readonly reason: string | null;
}

export function useCoinsBack(
  coins: number | null,
  threshold: number,
  reason: string | null,
  reduceMotion: boolean,
): CoinsBack {
  const [seen, setSeen] = useState(coins);
  const [crossing, setCrossing] = useState<Crossing | null>(null);
  const [counted, setCounted] = useState<number | null>(null);
  const [glow, setGlow] = useState(false);

  // React's "adjust state when a prop changes": the crossing is caught in the render that sees it.
  if (coins !== seen) {
    setSeen(coins);
    if (seen !== null && coins !== null && seen < threshold && coins >= threshold) {
      setCrossing({ from: seen, to: coins, reason });
      setCounted(reduceMotion ? null : seen);
      setGlow(!reduceMotion);
    }
  }

  useEffect(() => {
    if (crossing === null) return;
    const done = setTimeout(() => setCrossing(null), TOAST_MS);
    const unglow = setTimeout(() => setGlow(false), GLOW_MS);
    return () => {
      clearTimeout(done);
      clearTimeout(unglow);
    };
  }, [crossing]);

  useEffect(() => {
    if (crossing === null || reduceMotion) return;
    const start = Date.now();
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_MS);
      const eased = 1 - (1 - t) ** 3;
      setCounted(t === 1 ? null : Math.round(crossing.from + (crossing.to - crossing.from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [crossing, reduceMotion]);

  return {
    shown: counted ?? coins,
    gained: crossing === null ? null : crossing.to - crossing.from,
    reason: crossing?.reason ?? null,
    glow,
  };
}
