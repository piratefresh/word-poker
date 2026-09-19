/**
 * Showdown: ordering the seats that reached the reveal, and breaking the ties between them
 * (docs/rules/hand-flow.md §20, docs/rules/betting-and-pots.md §21).
 *
 * The caller hands over each contesting seat's §7 breakdown — or nothing, when the seat had
 * no valid word — and gets back the ordered ranking: every seat placed, with the comparison
 * that placed it, because pot settlement walks the order (§25 settles every pot by these
 * same rules) and the reveal shows it. A single winner would not be enough for either.
 *
 * Folded seats are not entries here at all: §20 keeps them out of the showdown, so there is
 * nothing to rank and no flag to get wrong.
 *
 * Three of the ladder's four steps read their number off the score — the final total that
 * orders the field, the letter count (§21.1, where a two-letter tile counts both letters),
 * and the highest printed letter value (§21.2, which is why scoring carries
 * `WordLetterScore.baseValue` beside the multiplied `value`). Only §21.3's draw needs
 * something the score does not hold, and it is the one step that consumes randomness: it
 * draws from the injected `rng` (AGENTS.md), so a seed replays a tie-break exactly as it
 * replays a deal, and a showdown that never reaches the draw consumes no randomness at all.
 */

import type {
  PlayerId,
  ShowdownComparison,
  ShowdownComparisonValue,
  ShowdownDecider,
  ShowdownRanking,
  ShowdownStanding,
  Tile,
  WordLetterScore,
  WordScore,
} from "@wordpoker/contracts";

import { shuffle } from "./deal";
import { createTileBag } from "./tiles";

/** One seat contesting the showdown: §7's breakdown when it had a valid word. */
export interface ShowdownEntry {
  readonly playerId: PlayerId;
  readonly seat: number;
  /**
   * The score of the word this seat submitted, or absent when it had none — an invalid
   * submission or no submission at all. §11 scores that 0 points and leaves the seat in the
   * showdown, where the ladder's draw is what eventually separates it.
   */
  readonly word?: WordScore;
}

/** What the ladder is handed: the contesting seats, and the randomness its draw needs. */
export interface RankShowdownOptions {
  /**
   * The seats that reached the reveal, in any order: the ladder sorts them by seat so the
   * ranking never depends on how a caller listed them.
   */
  readonly entries: readonly ShowdownEntry[];
  /** §21.3's draw, from the seeded generator `createRng` builds. */
  readonly rng: () => number;
  /**
   * §21.3's configuration: whether a two-letter tile may come out of a tie-break draw. The
   * rules allow it; a table that disables it draws from the single-letter bag alone.
   */
  readonly twoLetterDrawTiles?: boolean;
}

/** A showdown with nobody in it — every seat folded, which §26 settles without one. */
export class NoContestantsError extends Error {
  constructor() {
    super("rankShowdown needs at least one contesting seat, but the showdown is empty");
    this.name = "NoContestantsError";
  }
}

/**
 * The §21.3 draw used its whole pool.
 *
 * Unreachable for any table the bag can seat: a round takes one tile per still-tied seat, so
 * a hundred tiles outlast any run of tied draws a real table can produce. It is refused
 * rather than papered over, because the alternative — drawing a tile that was already drawn
 * and discarded — would rank the seats by a value the rules do not give them.
 */
export class DrawPoolExhaustedError extends Error {
  constructor(tiles: number) {
    super(`the §21.3 tie-break draw ran out of tiles after drawing ${tiles}`);
    this.name = "DrawPoolExhaustedError";
  }
}

/**
 * §21.3's draw pool: a fresh, unshuffled bag, or the single-letter bag when the table's
 * configuration disables two-letter tiles in tie-break draws.
 *
 * Exported because the pool is half of what §21.3 leaves open — which tiles can come out of
 * it — and a caller that configures the draw should be able to see what it configured.
 */
export function showdownDrawPool(twoLetterDrawTiles: boolean): Tile[] {
  const bag = createTileBag();
  return twoLetterDrawTiles
    ? bag
    : bag.filter((tile) => !("alternativeLetter" in tile) && !("sequenceLetter" in tile));
}

/** A seat with the three numbers §21's comparison steps read off its score. */
interface Contestant {
  readonly entry: ShowdownEntry;
  readonly score: number;
  /** §21.1: how many letters the word has; `null` when there is no valid word to count. */
  readonly length: number | null;
  /** §21.2: the highest *printed* letter value; `null` when there is no word to read it off. */
  readonly highest: number | null;
}

/** One comparison step of the ladder: its name, and the number it ranks a seat by. */
interface ComparisonStep {
  readonly step: ShowdownDecider;
  readonly valueOf: (contestant: Contestant) => number | null;
}

/** §21's three comparison steps, in the order the rules apply them. The draw follows them. */
const COMPARISON_STEPS: readonly ComparisonStep[] = [
  { step: "final-score", valueOf: (contestant) => contestant.score },
  { step: "word-length", valueOf: (contestant) => contestant.length },
  { step: "highest-letter", valueOf: (contestant) => contestant.highest },
];

/**
 * What a drawn tile is worth in §21.3: the value printed on it, with both faces counting for
 * a two-letter tile, as §21.3 specifies ("use the combined printed value").
 *
 * That covers every tile the bag can hold: a sequence tile prints T and H, a choice tile
 * prints both of its faces, and a single letter prints one. A choice pair whose faces are
 * worth different amounts — the rules' Q/K — is therefore drawn at Q+K, not at the face a
 * player would have picked, because a draw has no face to pick.
 *
 * Exported because it is the other half of what §21.3 leaves open, alongside the pool: a
 * reveal that shows the draw should value it the way the ladder did.
 */
export function showdownDrawValue(tile: Tile): number {
  if ("sequenceLetter" in tile) {
    return tile.points + tile.sequencePoints;
  }
  if ("alternativeLetter" in tile) {
    return tile.points + tile.alternativePoints;
  }
  return tile.points;
}

/** §21.2's number: the highest value printed on any of the word's letters, multipliers aside. */
function highestPrinted(letters: readonly WordLetterScore[]): number | null {
  let highest: number | null = null;

  for (const letter of letters) {
    if (highest === null || letter.baseValue > highest) {
      highest = letter.baseValue;
    }
  }

  return highest;
}

/** One seat's number at one step: the value it offered, or `null` when it had none to offer. */
interface RankedSeat {
  readonly contestant: Contestant;
  readonly value: number | null;
}

/** Seats with equal values, still tied after this step, best first. */
interface Subgroup {
  readonly value: number | null;
  readonly members: Contestant[];
}

/**
 * Ranks the seats that reached the showdown (§21), returning them all in order.
 *
 * @param options The contesting seats, the seed for §21.3's draw, and the table's draw rule.
 * @throws {NoContestantsError} When there are no seats to rank.
 * @throws {DrawPoolExhaustedError} When §21.3's draws use up the pool — see the class.
 */
export function rankShowdown({
  entries,
  rng,
  twoLetterDrawTiles = true,
}: RankShowdownOptions): ShowdownRanking {
  if (entries.length === 0) {
    throw new NoContestantsError();
  }

  const standings: ShowdownStanding[] = [];
  const comparisons: ShowdownComparison[] = [];

  // The draw's pool: one shuffled bag for the whole tie-break, taken from the front and
  // never returned — §21.3 discards a drawn tile. Built on the first round that needs a
  // tile, so a showdown the draw never reaches leaves `rng` untouched.
  let pool: readonly Tile[] | null = null;
  let drawnTiles = 0;
  let drawRound = 0;

  const drawTile = (): Tile => {
    pool ??= shuffle(
      showdownDrawPool(twoLetterDrawTiles),
      // The configuration is read once, at the first draw, so a pool cannot be swapped
      // out from under a tie-break partway through.
      rng,
    );

    const tile = pool[drawnTiles];
    if (tile === undefined) {
      throw new DrawPoolExhaustedError(drawnTiles);
    }
    drawnTiles += 1;

    return tile;
  };

  /** Records one seat's place, in the order the ladder places them. */
  const place = (contestant: Contestant, decidedBy: ShowdownDecider, compared: number | null): void => {
    standings.push({
      playerId: contestant.entry.playerId,
      seat: contestant.entry.seat,
      score: contestant.score,
      place: standings.length + 1,
      decidedBy,
      compared,
    });
  };

  /**
   * Sorts the seats by the number the current step compares, highest first, and gathers the
   * equal numbers back into the subgroups the next step runs on.
   *
   * The values are sorted directly, never through a comparator that could draw a tile: the
   * only randomness in this module is `drawTile`, and it is called once per seat per round
   * before any sorting happens (STO-323's "no RNG inside a sort comparator").
   */
  const split = (ranked: readonly RankedSeat[]): {
    values: readonly ShowdownComparisonValue[];
    subgroups: readonly Subgroup[];
  } => {
    // Descending, with the seats that have nothing to compare last; the sort is stable, so
    // equal values keep the order they arrived in — seat order — and the draw, not the
    // caller's array order, is what eventually separates them.
    const ordered = ranked.slice().sort((a, b) => weight(b.value) - weight(a.value));

    const values: ShowdownComparisonValue[] = [];
    const subgroups: Subgroup[] = [];

    for (const { contestant, value } of ordered) {
      values.push({ playerId: contestant.entry.playerId, value });

      const current = subgroups[subgroups.length - 1];
      if (current !== undefined && current.value === value) {
        current.members.push(contestant);
      } else {
        subgroups.push({ value, members: [contestant] });
      }
    }

    return { values, subgroups };
  };

  /** The seat ids of a subgroup, for a comparison's `advanced` list. */
  const idsOf = (subgroup: Subgroup | undefined): readonly PlayerId[] =>
    subgroup === undefined ? [] : subgroup.members.map((member) => member.entry.playerId);

  /**
   * Places one seat, or splits a group further: a seat that ends up alone was separated from
   * the field by the step that handed it down, and everything else goes a step deeper.
   */
  const placeSubgroups = (
    subgroups: readonly Subgroup[],
    step: ComparisonStep,
    stepIndex: number,
  ): void => {
    for (const subgroup of subgroups) {
      const [only] = subgroup.members;
      if (subgroup.members.length === 1 && only !== undefined) {
        place(only, step.step, subgroup.value);
        continue;
      }
      arrange(subgroup.members, stepIndex + 1);
    }
  };

  /** §21.3: one tile each, highest printed value first, repeated until the tie is broken. */
  const draw = (group: readonly Contestant[]): void => {
    drawRound += 1;

    // One draw per still-tied seat, in the group's order — seat order, all the way down.
    const ranked: RankedSeat[] = group.map((contestant) => ({
      contestant,
      value: showdownDrawValue(drawTile()),
    }));

    const { values, subgroups } = split(ranked);
    comparisons.push({ step: "tile-draw", round: drawRound, values, advanced: idsOf(subgroups[0]) });

    for (const subgroup of subgroups) {
      const [only] = subgroup.members;
      if (subgroup.members.length === 1 && only !== undefined) {
        place(only, "tile-draw", subgroup.value);
        continue;
      }
      // Still tied on the draw: §21.3 says repeat until there is a winner.
      draw(subgroup.members);
    }
  };

  /** Applies the ladder from `stepIndex` down, or the draw once the comparisons are spent. */
  const arrange = (group: readonly Contestant[], stepIndex: number): void => {
    const step = COMPARISON_STEPS[stepIndex];

    // Past the last comparison: §21.3's draw is all that is left to separate this group.
    if (step === undefined) {
      draw(group);
      return;
    }

    const ranked = group.map((contestant) => ({ contestant, value: step.valueOf(contestant) }));
    const { values, subgroups } = split(ranked);

    // A step none of these seats can be compared at — §21.1 and §21.2 read a word, and a
    // seat with no valid word has none (§11) — is not a decision, so it is not recorded as
    // one, and the group carries on to the step that can separate it.
    if (subgroups.length === 1 && (subgroups[0]?.value ?? null) === null) {
      arrange(group, stepIndex + 1);
      return;
    }

    comparisons.push({ step: step.step, round: 1, values, advanced: idsOf(subgroups[0]) });
    placeSubgroups(subgroups, step, stepIndex);
  };

  // Seat order, not the caller's array order: the tiles a draw serves are then a property of
  // the table rather than of how a caller happened to list the seats.
  const field: Contestant[] = entries
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((entry) => ({
      entry,
      score: entry.word?.total ?? 0,
      length: entry.word?.letters.length ?? null,
      highest: entry.word === undefined ? null : highestPrinted(entry.word.letters),
    }));

  // A field of one has nothing to tie with: §7's score is the whole ranking, and no tile is
  // drawn for it.
  const [only] = field;
  if (field.length === 1 && only !== undefined) {
    place(only, "final-score", only.score);
  } else {
    arrange(field, 0);
  }

  return { standings, comparisons };
}

/** Sorts seats that have no value at all below every seat that has one. */
function weight(value: number | null): number {
  return value === null ? Number.NEGATIVE_INFINITY : value;
}
