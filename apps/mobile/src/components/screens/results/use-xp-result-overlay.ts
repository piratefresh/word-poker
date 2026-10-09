import { useCallback, useEffect, useRef, useState } from "react";

import { resultsFacts } from "@/lib/quest-facts";
import { useQuests, type HandReport } from "@/lib/quests-provider";

import type { ResultsSeat, ResultsSnapshot } from "./results-types";

/**
 * The hand-end quest claim and the non-winner XP overlay that rides on it (STO-573).
 *
 * Both tables report every settled hand here, once: `${session}:${hand}` is the guard, so a
 * rerender, a remount or a reconnect cannot claim twice, and a new session — whose hands count
 * from 1 again — is a new key. The overlay is held for a revealed hand whose local seat did not
 * take the pot; Continue marks that hand done for the session and opens the existing results.
 */
export function useXpResultOverlay(
  snapshot: ResultsSnapshot | null,
  session: number,
  extra: { readonly wildTable: boolean; readonly heroUsedPower: boolean },
): { hero: ResultsSeat | null; report: HandReport | null; complete: () => void } {
  const { reportHand } = useQuests();
  const key = snapshot === null ? null : `${session}:${snapshot.hand}`;
  const reportedKey = useRef<string | null>(null);
  const [reported, setReported] = useState<{ key: string; report: HandReport | null } | null>(null);
  const [completedKey, setCompletedKey] = useState<string | null>(null);

  useEffect(() => {
    if (snapshot === null || key === null || reportedKey.current === key) return;
    reportedKey.current = key;
    setReported({ key, report: reportHand(resultsFacts(snapshot, extra)) ?? null });
  }, [extra, key, reportHand, snapshot]);

  const hero = snapshot?.seats.find((seat) => seat.isYou && !seat.folded) ?? null;
  const eligible = snapshot?.revealed === true && hero !== null && !hero.takesPot;
  const ready = eligible && reported?.key === key && completedKey !== key;
  const complete = useCallback(() => setCompletedKey(key), [key]);

  return ready ? { hero, report: reported?.report ?? null, complete } : { hero: null, report: null, complete };
}
