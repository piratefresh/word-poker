/**
 * results-copy.ts — every word the results screen prints as a sentence, in one place.
 *
 * The headline is a template, not a view detail: the serif sentence carries exactly one gold
 * italic span, so the sentence and the span are built here together and travel as pieces
 * (`{lead, emphasis, subline}`) rather than as markup a component would have to split back
 * apart (STO-379 decisions 11–12). A split pot and a fold-out read sensibly out of the same
 * three pieces, and a locale would have one module to translate instead of one per screen.
 *
 * Everything here is derived from the frozen snapshot alone: no engine call, no clock, no
 * state.
 */

import type { ResultsHeadline, ResultsSeat, ResultsSnapshot, ResultsTable } from "./results-types";

/** What the headline is built from: who the pots paid, and whether there was a reveal at all. */
type CopyInput = Pick<ResultsSnapshot, "seats" | "revealed"> & { table?: ResultsTable };

/**
 * The headline's three pieces: `Ellis takes` + `the pot`, and the line under the pot.
 *
 * The emphasis is always `the pot` — it is the one thing every ending of a hand has in
 * common, whether the pot was won on a word, split between two equal words, or walked into
 * because everybody else folded.
 */
export function resultsHeadline({ seats, revealed }: CopyInput): ResultsHeadline {
  const winners = winnersOf(seats);

  if (!revealed) {
    // §26's fold-out: nothing was revealed and no word was asked for, so the subline says
    // why the winner took the pot instead of naming a word nobody played.
    return {
      lead: `${winners[0]?.name ?? ""} takes`,
      emphasis: "the pot",
      subline: `${upper(winners[0]?.name ?? "")} · EVERYONE FOLDED`,
    };
  }

  if (winners.length > 1) {
    // A split is a tie the ladder's draw could not break (§21.3): every winner scored the
    // same total, which is the number worth printing beneath their names.
    const names = joinNames(winners.map((seat) => seat.name));
    return {
      lead: `${names} split`,
      emphasis: "the pot",
      subline: `${upper(names)} · ${winners[0]?.total ?? 0} PTS EACH`,
    };
  }

  const winner = winners[0] ?? seats[0];
  if (winner === undefined) return { lead: "", emphasis: "the pot", subline: "" };

  return {
    lead: `${winner.name} takes`,
    emphasis: "the pot",
    subline:
      winner.word === null
        ? // §11: a seat can top the table with no word at all — the draw settled it.
          `${upper(winner.name)} · NO WORD · ${winner.total} PTS`
        : `${upper(winner.name)} · ${winner.word} · ${winner.total} PTS`,
  };
}

/** The scoreboard's head: `4 PLAYERS · 1 FOLD · 3 WORDS PLAYED` (§20's reveal, counted). */
export function resultsSummary({ table, seats }: CopyInput): string {
  const folded = table?.folded ?? 0;
  const words = seats.filter((seat) => seat.word !== null).length;

  return [
    count(table?.players ?? seats.length + folded, "PLAYER", "PLAYERS"),
    count(folded, "FOLD", "FOLDS"),
    count(words, "WORD PLAYED", "WORDS PLAYED"),
  ].join(" · ");
}

/** The seats the hand's pots paid — §21's first place, or the one seat a fold-out left (§26). */
function winnersOf(seats: readonly ResultsSeat[]): readonly ResultsSeat[] {
  return seats.filter((seat) => seat.takesPot);
}

/** `Ellis`, `Ellis and Mira`, `Ellis, Mira and Jay` — a list read out loud names its last item. */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The mono lines print uppercase; the roster's names are not. */
function upper(text: string): string {
  return text.toUpperCase();
}

/** `1 FOLD` / `2 FOLDS` — the counts are read as words beside their noun. */
function count(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}
