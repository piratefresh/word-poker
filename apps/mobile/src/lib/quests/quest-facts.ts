/**
 * quest-facts.ts — one settled hand, from the hero's chair (STO-525).
 *
 * The only bridge between the results screen's payload and what a quest claim reports: both
 * tables already converge on one `ResultsSnapshot` (`results-snapshot.ts`), so this reads the
 * hero's own card off it rather than adding a second way to describe a hand. `wildTable` and
 * `heroUsedPower` are not on the snapshot — they come from the table's own power-ups state,
 * which the caller already holds.
 */

import type { QuestHandFacts } from "@wordpoker/contracts";

import type { ResultsSnapshot } from "@/components/screens/results/results-types";

/**
 * The hero's quest facts for one settled hand, or `null` when the snapshot carries no hero seat
 * at all — a payload a claim should never be sent for.
 */
export function resultsFacts(
  snapshot: ResultsSnapshot,
  extra: { readonly wildTable: boolean; readonly heroUsedPower: boolean },
): QuestHandFacts | null {
  const hero = snapshot.seats.find((seat) => seat.isYou && !seat.folded);
  if (hero === undefined) return null;

  return {
    revealed: snapshot.revealed,
    // The fold-out card sets `takesPot: true` for the one seat left (results-snapshot.ts),
    // which stands in for "won" when there was no reveal to place anyone by.
    heroWon: snapshot.revealed ? hero.place === 1 : hero.takesPot,
    heroWord: hero.word,
    heroScore: hero.total,
    heroDecidedBy: hero.decidedBy,
    pot: snapshot.pot,
    wildTable: extra.wildTable,
    heroUsedPower: extra.heroUsedPower,
  };
}
