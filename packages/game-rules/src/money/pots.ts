/**
 * pots.ts — §25's layering and §24's settlement: which chips each contest is fought over,
 * who may win it, and how it lands back in Table Stacks.
 *
 * A hand's committed chips are not one pot: every time a seat ran out of stack and the
 * betting continued without it, the chips above its level became a side pot that seat
 * cannot win. `buildPots` recovers those layers from each seat's `committedHand` — the same
 * numbers the betting machine produced — and marks each layer with the seats still eligible
 * for it. A seat that folded keeps every chip it committed in the layers it reached; it is
 * simply eligible for none of them.
 *
 * `resolvePayout` then settles each layer independently: §21's ladder ranks the layer's
 * eligible seats (its own draw rng per layer, so one layer's tie-break cannot disturb
 * another's), a lone winner takes it, and a tie nothing can break splits it. Fold-outs
 * (§26) skip the ladder entirely: with nobody left to contest, every layer goes to the one
 * surviving seat and its `ranking` is `null`.
 *
 * Determinism is the reason the layers are ranked here rather than by the caller: the rngs
 * derive from the hand's seed (AGENTS.md — no ambient randomness), so the same seed and the
 * same action sequence pay out identically, however many layers there are.
 */

import type {
  PayoutResult,
  PlayerId,
  PotResult,
  StackDelta,
  WordScore,
} from "@wordpoker/contracts";

import type { BettingSeatState } from "./betting";
import { awardChips } from "./chips";
import { createRng } from "../core/rng";
import { DRAW_SEED_SALT, rankShowdown, type ShowdownEntry } from "./showdown";

/** One contest layer: the chips in it, and the seat indexes that may win it. */
export interface PotContest {
  /** The chips every contributor put into this layer. */
  amount: number;
  /** Seats that are in the hand and committed at least this layer's level, in seat order. */
  eligible: readonly number[];
}

/**
 * Layers a hand's committed chips into the main pot and its side pots (§25).
 *
 * Levels are the distinct `committedHand` amounts, walked ascending; each level's slice is
 * `Σ max(0, min(committed, level) − previous)` over every contributor, and its eligible
 * seats are the ones still in the hand that reached it. A level nobody eligible reached —
 * every seat that committed that far has folded — merges down into the pot beneath it,
 * because those chips are still contested there and must not vanish.
 *
 * The result is ascending: the main pot first, side pots after. An all-checked hand
 * contributes nothing and layers nothing, which is an empty list, not a pot of zero.
 */
export function buildPots(seats: readonly BettingSeatState[]): readonly PotContest[] {
  const contributions = seats.map((seat) => seat.committedHand);
  const levels = [...new Set(contributions.filter((amount) => amount > 0))].sort((a, b) => a - b);

  const pots: PotContest[] = [];
  let previous = 0;

  for (const level of levels) {
    let amount = 0;
    for (const contribution of contributions) {
      amount += Math.max(0, Math.min(contribution, level) - previous);
    }
    previous = level;

    const eligible = seats
      .map((seat, index) => ({ seat, index }))
      .filter(({ seat }) => !seat.folded && !seat.sittingOut && seat.committedHand >= level)
      .map(({ index }) => index);

    if (eligible.length === 0) {
      const below = pots[pots.length - 1];
      if (below === undefined) {
        // Unreachable for a hand that reached a payout: the seat that survived to the end
        // committed at least as much as any seat that folded to it.
        throw new Error(`no seat is eligible for the lowest pot: every contributor folded`);
      }
      pots[pots.length - 1] = { amount: below.amount + amount, eligible: below.eligible };
      continue;
    }

    pots.push({ amount, eligible });
  }

  return pots;
}

/**
 * Splits `amount` among `winners` (seat indexes) when §21.3's draw could not separate them:
 * every winner floors its share, and the odd chips go one each, clockwise from the dealer
 * button, to the winners in the order it reaches them. Returned in that clockwise order —
 * the order is what decides the odd chips, so it is the order the caller sees.
 */
export function splitAward(
  amount: number,
  winners: readonly number[],
  dealerSeat: number,
  seatCount: number,
): readonly { seatIndex: number; amount: number }[] {
  if (winners.length === 0) return [];

  const clockwise = winners
    .map((seatIndex) => ({
      seatIndex,
      distance: (((seatIndex - dealerSeat) % seatCount) + seatCount) % seatCount,
    }))
    .sort((a, b) => a.distance - b.distance);

  const share = Math.floor(amount / clockwise.length);
  let odd = amount - share * clockwise.length;

  return clockwise.map(({ seatIndex }) => {
    const extra = odd > 0 ? 1 : 0;
    odd -= extra;
    return { seatIndex, amount: share + extra };
  });
}

/** One seat as the payout judges it: its word's §7 score, or none at all (§11). */
export interface JudgedSeat {
  playerId: PlayerId;
  /** Its index in the seats array — how the ranking and the layers line up. */
  seat: number;
  /** §7's score of the seat's word; `null` when it had no valid word (0 points, §11). */
  word: WordScore | null;
}

/** What `resolvePayout` is handed: the settled table and the hand's seed. */
export interface ResolvePayoutOptions<Seat extends BettingSeatState = BettingSeatState> {
  /** End-of-hand seats: stacks already net of every commitment. */
  readonly seats: readonly Seat[];
  /**
   * One entry per seat still in the hand (§19's judged words), or empty for a fold-out —
   * §26's only two shapes.
   */
  readonly judged: readonly JudgedSeat[];
  /** The seat holding the dealer button; §25's odd-chip order counts clockwise from it. */
  readonly dealerSeat: number;
  /** The hand's seed, stepped once per layer to name each layer's draw rng. */
  readonly handSeed: number;
}

/** What `resolvePayout` leaves behind: the wire payout and the seats with awards applied. */
export interface ResolvedPayout<Seat extends BettingSeatState = BettingSeatState> {
  payout: PayoutResult;
  seats: readonly Seat[];
}

/**
 * Settles every pot a hand built: ranks each layer's eligible seats (§21, each with its own
 * draw stream), awards the chips into the winners' Table Stacks (§24), and reports what each
 * seat won or lost.
 *
 * `judged` empty is §26's fold-out: no ladder runs — there is no tie to break — and every
 * layer goes to the one surviving seat with `ranking: null`.
 *
 * Generic over the seat shape, like the betting machine: a caller carrying more than the
 * chips gets its own seats back.
 */
export function resolvePayout<Seat extends BettingSeatState>({
  seats,
  judged,
  dealerSeat,
  handSeed,
}: ResolvePayoutOptions<Seat>): ResolvedPayout<Seat> {
  const pots = buildPots(seats);
  const awarded = [...seats];
  const results: PotResult[] = [];

  const foldOut = judged.length === 0;
  const survivor = foldOut ? seats.findIndex((seat) => !seat.folded && !seat.sittingOut) : -1;
  const words = new Map(judged.map((entry) => [entry.seat, entry]));

  pots.forEach((pot) => {
    // Each layer is ranked independently (§25) — but only its *eligibility* is its own. §21.3's
    // draw is a property of the tied seats and their words, not of the pot, so every pot the
    // same tied group contests draws the same tiles: two seats with identical words cannot win
    // the main pot and lose the side pot on two different draws, and the reveal's ladder, which
    // draws this same stream, can never name a different winner than the pot does.
    const ranking = foldOut
      ? null
      : rankShowdown({
          entries: pot.eligible.flatMap((seatIndex): ShowdownEntry[] => {
            const entry = words.get(seatIndex);
            if (entry === undefined) return [];
            return [
              {
                playerId: entry.playerId,
                seat: entry.seat,
                ...(entry.word === null ? {} : { word: entry.word }),
              },
            ];
          }),
          rng: createRng(handSeed + DRAW_SEED_SALT),
          exhaustedDrawPolicy: "tie",
        });

    const winnerIndexes = foldOut
      ? survivor >= 0
        ? [survivor]
        : []
      : (ranking?.standings ?? [])
          .filter((standing) => standing.place === 1)
          .map((standing) => standing.seat);

    const awards =
      winnerIndexes.length === 1 && winnerIndexes[0] !== undefined
        ? [{ seatIndex: winnerIndexes[0], amount: pot.amount }]
        : splitAward(pot.amount, winnerIndexes, dealerSeat, seats.length);

    for (const { seatIndex, amount } of awards) {
      const seat = awarded[seatIndex];
      if (seat !== undefined) awarded[seatIndex] = awardChips(seat, amount);
    }

    results.push({
      amount: pot.amount,
      eligible: pot.eligible.map((seatIndex) => seats[seatIndex]?.id ?? ""),
      winners: [...winnerIndexes].sort((a, b) => a - b).map((seatIndex) => seats[seatIndex]?.id ?? ""),
      ranking,
    });
  });

  return {
    payout: {
      pots: results,
      stackDeltas: stackDeltas(seats, awarded),
    },
    seats: awarded,
  };
}

/** What each seat dealt into the hand won or lost, read off the settled seats (§24). */
function stackDeltas<Seat extends BettingSeatState>(
  seats: readonly Seat[],
  settled: readonly Seat[],
): readonly StackDelta[] {
  const deltas: StackDelta[] = [];

  seats.forEach((seat, index) => {
    if (seat.sittingOut) return;

    // `seats` is the end-of-hand table before the awards, so its stack plus everything the
    // hand took is what the seat sat down with; `settled` is the same table after the pots
    // were paid. The difference is the hand's result for this seat, and summing it over the
    // table is what proves the chips were conserved.
    deltas.push({
      playerId: seat.id,
      start: seat.stack + seat.committedHand,
      end: settled[index]?.stack ?? seat.stack,
    });
  });

  return deltas;
}
