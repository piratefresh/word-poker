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
 * The ladder reads its first steps off the score — the final total that orders the field,
 * then the letter count (§21.1, where a choice tile contributes the one face that was
 * played, §10) — and §21.3's draw settles whatever those leave tied. Only the draw needs
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
   * What the draw does when its pool runs out with a tie still unbroken. `"throw"` (the
   * default) refuses — the pool outlasts any run of tied draws a real table can produce —
   * while `"tie"` leaves the still-tied seats on one shared place, which is what lets §25's
   * payout split the pot instead of failing the hand. The fallback changes no ranking a
   * served table has produced, because the pool is only exhausted when the draw cannot run.
   */
  readonly exhaustedDrawPolicy?: "throw" | "tie";
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
 * the bag outlasts any run of tied draws a real table can produce. It is refused rather than
 * papered over, because the alternative — drawing a tile that was already drawn and
 * discarded — would rank the seats by a value the rules do not give them.
 */
export class DrawPoolExhaustedError extends Error {
  constructor(tiles: number) {
    super(`the §21.3 tie-break draw ran out of tiles after drawing ${tiles}`);
    this.name = "DrawPoolExhaustedError";
  }
}

/**
 * The salt §21.3's draw derives its own stream of rolls with: the draw is derived from the
 * hand's seed rather than continuing the deal's, so a hand that reaches the draw replays the
 * same way and a draw cannot disturb the tiles a later hand deals.
 *
 * Shared by every caller that builds a rng for {@link rankShowdown} — the offline reveal and
 * §25's per-pot rankings — so one hand seed names one draw, not one per caller.
 */
export const DRAW_SEED_SALT = 0x5eed_21;

/**
 * §21.3's draw pool: a fresh, unshuffled single-letter bag (§6).
 *
 * §21 "The Draw's Pool" is explicit that the draw comes out of the single-letter bag, so
 * every drawn tile prints exactly one value — which is what the draw ranks the seats by.
 * §6's bag *is* that pool: since ADR 0005 the two-letter tiles live in the deal's pair pool
 * and never in the bag, so there is nothing here to filter out.
 *
 * Exported because the pool is half of what §21.3 leaves open — which tiles can come out of
 * it — and a caller that shows the draw should be able to see what it drew from.
 */
export function showdownDrawPool(): Tile[] {
  return createTileBag();
}

/** A seat with the numbers §21's comparison steps read off its score. */
interface Contestant {
  readonly entry: ShowdownEntry;
  readonly score: number;
  /** §21.1: how many letters the word has; `null` when there is no valid word to count. */
  readonly length: number | null;
}

/** One comparison step of the ladder: its name, and the number it ranks a seat by. */
interface ComparisonStep {
  readonly step: ShowdownDecider;
  readonly valueOf: (contestant: Contestant) => number | null;
}

/**
 * §21's comparison steps, in the order the rules apply them. The draw follows them.
 *
 * The rules revision left the ladder these two word steps — the final score, then the
 * letter count — and everything they leave tied goes to §21.3.
 */
const COMPARISON_STEPS: readonly ComparisonStep[] = [
  { step: "final-score", valueOf: (contestant) => contestant.score },
  { step: "word-length", valueOf: (contestant) => contestant.length },
];

/**
 * What a drawn tile is worth in §21.3: the value printed on the face it shows.
 *
 * §21's "The Draw's Pool" draws from the single-letter bag, so a tile the ladder draws is a
 * single letter and its value is its `points`. The two-letter shapes the wire can carry are
 * valued at both their faces, because a draw holding one would have no face to pick — the
 * rules' Q/K would be drawn at Q + K.
 *
 * Exported because it is the other half of what §21.3 leaves open, alongside the pool: a
 * reveal that shows the draw should value it the way the ladder did.
 */
export function showdownDrawValue(tile: Tile): number {
  if ("alternativeLetter" in tile) {
    return tile.points + tile.alternativePoints;
  }
  return tile.points;
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
  exhaustedDrawPolicy = "throw",
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
    // The pool is shuffled once, on the first tile the tie-break needs, so every later
    // round takes the next tile of the same bag rather than a fresh order.
    pool ??= shuffle(showdownDrawPool(), rng);

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

  /**
   * Places a whole group on one shared place: what `exhaustedDrawPolicy: "tie"` does when
   * the pool can no longer serve the group. The place is the one the group would have drawn
   * for, and `compared` is `null` because no tile was drawn to decide it.
   */
  const placeTied = (group: readonly Contestant[]): void => {
    const placeNumber = standings.length + 1;
    for (const contestant of group) {
      standings.push({
        playerId: contestant.entry.playerId,
        seat: contestant.entry.seat,
        score: contestant.score,
        place: placeNumber,
        decidedBy: "tile-draw",
        compared: null,
      });
    }
  };

  /**
   * §21.3's draw: one tile each, highest printed value first, and a round's tile **adds** to
   * what a seat has already drawn.
   *
   * The seats that share the highest total draw on — a seat on a lower total has already
   * lost the place they are drawing for — and any seats still tied among themselves draw on
   * for their own places. So `totals` rides down through every round of the group: each
   * comparison reports the seats' running totals rather than the tile the round happened to
   * draw. Drawing goes on until one seat leads.
   */
  const draw = (
    group: readonly Contestant[],
    totals: Map<Contestant, number> = new Map(),
  ): void => {
    drawRound += 1;

    // The pool is built here as well as inside `drawTile`, so that `"tie"` asks its question
    // of the same shuffled pool `"throw"` would have drawn from — and so that a tie the
    // pool cannot serve is settled before any tile of this round is taken.
    pool ??= shuffle(showdownDrawPool(), rng);
    if (exhaustedDrawPolicy === "tie" && pool.length - drawnTiles < group.length) {
      placeTied(group);
      return;
    }

    // One draw per still-tied seat, in the group's order — seat order, all the way down.
    const ranked: RankedSeat[] = group.map((contestant) => {
      const total = (totals.get(contestant) ?? 0) + showdownDrawValue(drawTile());
      totals.set(contestant, total);

      return { contestant, value: total };
    });

    const { values, subgroups } = split(ranked);
    comparisons.push({ step: "tile-draw", round: drawRound, values, advanced: idsOf(subgroups[0]) });

    for (const subgroup of subgroups) {
      const [only] = subgroup.members;
      if (subgroup.members.length === 1 && only !== undefined) {
        place(only, "tile-draw", subgroup.value);
        continue;
      }
      // Still tied on the highest total: §21.3 says those seats draw again, adding to what
      // they have already drawn.
      draw(subgroup.members, totals);
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

    // A step none of these seats can be compared at — §21's word steps read a word, and a
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
