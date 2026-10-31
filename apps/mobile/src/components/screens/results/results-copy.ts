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

import type { PlayerId } from "@wordpoker/contracts";

import { formatAmount } from "@/lib/ui/format";

import type {
  ResultsHeadline,
  ResultsPotPlate,
  ResultsSeat,
  ResultsSeatTag,
  ResultsSnapshot,
  ResultsTable,
} from "./results-types";

/** What the headline is built from: who the pots paid, and whether there was a reveal at all. */
type CopyInput = Pick<ResultsSnapshot, "seats" | "revealed"> & {
  table?: ResultsTable;
  pots?: readonly ResultsPotPlate[];
};

/** What a card's read tag prints. */
export const SEAT_TAG_COPY: Record<ResultsSeatTag, string> = {
  "best-word": "BEST WORD",
  called: "CALLED",
  "all-in": "ALL-IN",
  folded: "FOLDED",
};

/** `+$500`, `−$240`, `$0`: the true minus sign, since it sits beside other figures on the card. */
export function formatNet(net: number): string {
  return `${net > 0 ? "+" : net < 0 ? "−" : ""}${formatAmount(Math.abs(net))}`;
}

/** `1ST`, `2ND`, `3RD`, `4TH`: §21's place, as the avatar's cap prints it. */
export function placeCopy(place: number): string {
  return `${place}${["TH", "ST", "ND", "RD"][place] ?? "TH"}`;
}

/** One plate per contested pot, main pot first; a lone pot is the plain `POT` the headline names. */
export function potPlates(
  pots: readonly { readonly amount: number; readonly winners: readonly PlayerId[] }[],
  seats: readonly Pick<ResultsSeat, "playerId" | "name" | "isYou">[],
): readonly ResultsPotPlate[] {
  return pots.map((pot, index) => ({
    label: index === 0 ? "MAIN POT" : pots.length > 2 ? `SIDE POT ${index}` : "SIDE POT",
    amount: pot.amount,
    to: `TO ${upper(
      joinNames(
        pot.winners.map((id) => {
          const seat = seats.find((candidate) => candidate.playerId === id);
          return seat?.isYou ? "you" : (seat?.name ?? id);
        }),
      ),
    )}`,
  }));
}

/** The line under an all-in seat's tag: how far its chips reached (§25). */
export function cappedCopy(isYou: boolean, canWin: number, pots: number): string {
  const reach = canWin === 1 ? "the main pot" : `${canWin} of ${pots} pots`;
  return `${isYou ? "You can" : "Can"} only win ${reach}`;
}

/**
 * The headline's three pieces: `Ellis takes` + `the pot`, and the line under the pot.
 *
 * The emphasis is always `the pot` — it is the one thing every ending of a hand has in
 * common, whether the pot was won on a word, split between two equal words, or walked into
 * because everybody else folded.
 */
export function resultsHeadline({ seats, revealed, pots = [] }: CopyInput): ResultsHeadline {
  const winners = winnersOf(seats);

  if (pots.length > 1) {
    // The plates say who took what, so the headline only counts them.
    const total = pots.reduce((sum, pot) => sum + pot.amount, 0);
    return { lead: `${pots.length} pots ·`, emphasis: formatAmount(total), subline: "" };
  }

  if (!revealed) {
    // §26's fold-out: nothing was revealed and no word was asked for, so the subline says
    // why the winner took the pot instead of naming a word nobody played.
    return {
      lead: takes(winners[0]),
      emphasis: "the pot",
      subline: `${upper(winners[0]?.name ?? "")} · WON, EVERYONE ELSE FOLDED`,
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
    lead: takes(winner),
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

/** `Ellis takes`, or `You take`: the online roster names the hero `You`, and that has to agree. */
function takes(seat: ResultsSeat | undefined): string {
  return seat?.isYou ? "You take" : `${seat?.name ?? ""} takes`;
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
