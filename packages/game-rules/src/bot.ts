/**
 * bot.ts — the offline opponent: what a written-down policy does with a hand it can see.
 *
 * The policy is an ordered set of leaves whose every reachable answer is one `bettingBounds`
 * enables, so the bot can only ever pick an action the engine would accept — a bot that guesses
 * at legality stalls a hand. What changed in STO-361 is *what it decides with*: the leaves used
 * to be a coin flip over a fixed size list and a flat call threshold, and they are now the
 * showdown equity of the seat's own hand (`./equity`), read against the price of continuing.
 * A score is not a probability and the two were never comparable; `equity` is one.
 *
 * Three things the policy reads, and nothing else:
 *
 * - **What the seat may see** — `./observation`, built first and never worked around. The seat's
 *   own tiles, the revealed board, the public money: no hidden tile reaches a decision.
 * - **What its hand is worth** — how often it wins, and which pots it can win. Not its §7 total,
 *   which says nothing about the other racks.
 * - **Its own streams** — one per purpose (`./observation`'s `decisionSeed`), named by the hand,
 *   the street, the seat and the state of the betting. Nothing here reads a clock or an ambient
 *   RNG, so the same table always replays the same way, and the rolls do not move when the deal
 *   behind a seat's knowledge does (`AGENTS.md`).
 *
 * The numbers the policy is tuned by — how far above an even share a hand has to stand to bet,
 * how often it bluffs, what fractions of the pot it sizes by — are heuristics, and are named and
 * exported as such. They are not a claim of balance against an opponent who is watching.
 */

import type { BettingAction, OfflineAction, PlayerId, WordSubmission } from "@wordpoker/contracts";

import { estimateBotEquity, type BotEquity } from "./equity";
import { decisionSeed, observeTable, type BotObservation } from "./observation";
import { OfflineActionError, type OfflineState } from "./offline";
import { createRng } from "./rng";
import { evaluateBestWord, type SearchWordsOptions } from "./word-search";

/**
 * How far above an even share a hand has to stand before the bot bets or raises it for value.
 *
 * A seat's showdown equity against a field of `n` averages `1/n` — the pot is split between
 * them, and a hand no better than the average takes an average share of it — so the bar is
 * read as a multiple of that: at 1.35 the bot puts money in when it expects to win a third
 * more often than an average hand at the same table would. A flat equity threshold cannot do
 * this job, because the same number is a strong hand heads-up and a weak one at a full table.
 */
export const BOT_VALUE_BET_EDGE = 1.35;

/** How often the bot opens a bet with a hand it does not believe in. A heuristic, not balance. */
export const BOT_BLUFF_BET_FREQUENCY = 0.12;

/**
 * How often a hand that stands above the field raises a bet rather than settling for a call.
 *
 * Deliberately short of every time, and the reason is the model the estimate is built on:
 * nothing in it reads the betting, so a seat that has been raised back sees the same hand, the
 * same equity and the same decision it saw before — and a policy that raised whenever it was
 * ahead would raise until the stacks were gone, on the strength of a hand the rival's raise was
 * saying something about that this estimator cannot hear. The mixing roll is named by the price
 * the seat faces (`./observation`), so a seat that is raised back rolls again, and a raising
 * war decays geometrically instead of repeating until the chips run out.
 *
 * A bluff raise is the same action with nothing behind it, and is rarer.
 */
export const BOT_VALUE_RAISE_FREQUENCY = 0.55;

/** How often it raises a bet with a hand it does not believe in. A heuristic, not balance. */
export const BOT_BLUFF_RAISE_FREQUENCY = 0.07;

/**
 * The fractions of the sizing base a bet or a raise is sized by — one list, for value and
 * bluff alike.
 *
 * The size is the one part of a bet the whole table sees, so a policy whose bluffs were always
 * the small size and whose value bets always the large one would be announcing which it held:
 * both draws come from this list, so the two distributions do not merely overlap, they are the
 * same one, and nothing about an amount says whether the seat means it.
 *
 * The base is the pot, or what an unopened round is worth where there is no pot yet
 * (`sizingBase`), so the same fraction is a different bet on every street: half of a starting
 * round preflop, half of a pot that four seats have been feeding by the river. What the seat
 * cannot cover and what the table can answer then cap it.
 */
export const BOT_BET_FRACTIONS = [0.5, 0.75, 1] as const;

/**
 * What `botId` plays on its turn.
 *
 * At `payout` the hand is over and there is no turn left, so the only move that keeps the table
 * moving is a fresh deal. During §19's word window there is no turn at all — a bot's word comes
 * from {@link chooseOfflineWord}, which the caller plays for it — so asking this function during
 * the window is a caller bug that gets named rather than silently answered.
 *
 * On a betting turn the policy is tried in order, first match acting:
 *
 * 1. checking is free and the hand stands above the field → `bet` for value;
 * 2. checking is free and the mixing roll says so → `bet` as a bluff;
 * 3. checking is free → `check`;
 * 4. facing a bet, the hand stands above the field → `raise` for value;
 * 5. facing a bet, the mixing roll says so → `raise` as a bluff;
 * 6. the call is priced in — what the pots would pay beats what the call costs → `call`
 *    (a call the stack cannot cover is §23's short all-in, and the engine caps it);
 * 7. nothing left → `fold`.
 *
 * Throws when the bot is not the seat to act — a caller that skipped the turn order has a bug,
 * and a move applied out of turn would desync the table silently.
 */
export function decideOfflineMove(state: OfflineState, botId: PlayerId): OfflineAction {
  if (state.phase === "payout") return { type: "deal" };

  // The window is shared and has no seat to act, so a bot that is asked for one has nothing
  // to answer with: its slot runs out with the clock, like any seat that never confirmed.
  if (state.wordWindow?.status === "open") {
    throw new OfflineActionError(`${botId} has no word to play: the table is in its word window`);
  }

  // What this seat is allowed to know, and the guards that keep its move in turn.
  const observation = observeTable(state, botId);

  // §25's pots are layered as the seat's own call would leave them: a seat deciding whether to
  // pay for a pot has to be priced against the pot its chips would be in, not the one it is in
  // now — an estimate built on the table as it stands would tell it it cannot win the very
  // chips it is being asked to play for.
  const equity = estimateBotEquity({
    observation,
    dictionary: state.dictionary,
    commit: observation.callCost,
  });

  return moveFor(observation, equity, {
    mix: createRng(decisionSeed(observation, "mixing")),
    size: createRng(decisionSeed(observation, "sizing")),
  });
}

/** The two streams a decision mixes and sizes with, already named by its key. */
interface Draws {
  readonly mix: () => number;
  readonly size: () => number;
}

/** The policy itself: which leaf fires, given what the seat knows and what its hand is worth. */
function moveFor(observation: BotObservation, equity: BotEquity, draws: Draws): BettingAction {
  const bounds = observation.bounds;
  const playerId = observation.playerId;

  // How many times an even share the hand is worth. At 1 it is an average hand for this table.
  const edge = equity.equity * equity.diagnostics.contenders;

  if (bounds.canCheck) {
    // A seat that cannot cover §22's minimum cannot open at all, and checking is free.
    if (bounds.canBet && (edge >= BOT_VALUE_BET_EDGE || draws.mix() < BOT_BLUFF_BET_FREQUENCY)) {
      return { type: "bet", playerId, amount: openSize(observation, draws) };
    }
    return { type: "check", playerId };
  }

  // `canRaise` is false for a seat that has already acted since the last full raise, so the
  // bets that have not reopened are never raised at — the engine would refuse the action.
  // Past that, the roll is what stops a raising war from repeating: see the frequency's doc.
  if (bounds.canRaise) {
    const raised =
      edge >= BOT_VALUE_BET_EDGE
        ? draws.mix() < BOT_VALUE_RAISE_FREQUENCY
        : draws.mix() < BOT_BLUFF_RAISE_FREQUENCY;
    if (raised) {
      return { type: "raise", playerId, amount: raiseSize(observation, draws) };
    }
  }

  // §23's price, against §25's pots: the seat calls when what those pots would pay it is worth
  // more than the chips the call takes. For one pot the call is worth
  // `equity × (pot + call)`, so this is exactly the pot-odds comparison the rules imply; for a
  // layered pot each layer pays its own share, and a layer the seat cannot reach pays nothing.
  //
  // On a street with betting still to come this is a heuristic and is meant to be: the model
  // prices the run-out to the showdown, and neither the bets a rival will make behind nor the
  // ones this seat will get to make are in it.
  if (bounds.canCall && equity.expectedPayout - observation.callCost >= 0) {
    return { type: "call", playerId };
  }

  // Unreachable while a seat that can act always has fold and an amount it can pay or refuse;
  // spelled out so the function has no path that returns nothing.
  return { type: "fold", playerId };
}

/** One draw from the sizing distribution, in the order the list prints them. */
function drawFraction(fractions: readonly number[], draws: Draws): number {
  return fractions[Math.floor(draws.size() * fractions.length)] ?? fractions[0] ?? 1;
}

/**
 * What this seat can win from anyone: its own stack, or the largest stack still in the hand,
 * whichever is smaller. A bet beyond it risks chips no rival can answer, so the sizing stops
 * there — but never below the table's minimum, where the seat would not be betting at all.
 */
function effectiveStack(observation: BotObservation): number {
  let largest = 0;

  for (const seat of observation.seats) {
    if (seat.seat === observation.seat || seat.folded || seat.sittingOut) continue;
    largest = Math.max(largest, seat.stack);
  }

  return Math.min(observation.standing.stack, largest);
}

/**
 * What a bet's fraction is read off: the pot, but never less than what an unopened round is
 * worth — §22's minimum bet for every seat still in the hand.
 *
 * A round opens with nothing in the pot (no blinds, ADR 0001), and a fraction of nothing is
 * nothing: sized off the pot alone, every opening bet in the game would be the table's bare
 * minimum, on every hand, whatever the bot held. Reading the fraction off a unit that is about
 * the pot a round is *starting* gives the open a size worth bluffing at and worth raising, and
 * it is what makes the sizes street-aware — once a flop has chips in it, the pot is the unit
 * and the minimum stops mattering.
 */
function sizingBase(observation: BotObservation): number {
  const live = observation.seats.filter((seat) => !seat.folded && !seat.sittingOut).length;

  return Math.max(observation.pot, observation.minBet * live);
}

/**
 * The amount an opening bet commits: a fraction of the sizing base, floored at §22's minimum
 * bet and capped at what the table can answer and the stack can cover.
 *
 * A `bet` is a raise-to total like every other amount, and the round is unopened when this is
 * legal, so the total is the amount — nothing is committed to add it to.
 */
function openSize(observation: BotObservation, draws: Draws): number {
  const bounds = observation.bounds;
  const wanted = Math.round(sizingBase(observation) * drawFraction(BOT_BET_FRACTIONS, draws));

  return Math.min(
    Math.max(wanted, bounds.minBet),
    Math.max(bounds.minBet, Math.min(bounds.maxRaiseTo, effectiveStack(observation))),
  );
}

/**
 * The round total a raise takes the seat to: the call it owes, plus a fraction of the pot that
 * call would make, held between §22's raise floor and what the stack can cover.
 *
 * Both ends are what `applyBettingAction` checks: below the floor the engine refuses the raise
 * (`below-min-raise`) unless it is the seat's whole stack, and above `maxRaiseTo` it refuses it
 * as `insufficient-stack`. `canRaise` has already established that the floor is reachable, so
 * the clamp is always a raise the engine will take.
 */
function raiseSize(observation: BotObservation, draws: Draws): number {
  const bounds = observation.bounds;
  const potAfterCall = observation.pot + observation.callCost;
  const wanted =
    observation.standing.committedRound +
    observation.callCost +
    Math.round(potAfterCall * drawFraction(BOT_BET_FRACTIONS, draws));

  return Math.min(Math.max(wanted, bounds.minRaiseTo), bounds.maxRaiseTo);
}

/**
 * The word a seat with nobody behind it confirms: the best word its tiles can spell, or
 * `null` when they spell none it could submit — which leaves the seat to §11's 0 points.
 *
 * A thin name over {@link evaluateBestWord} (`./word-search`), which is where the search and
 * the policy that picks its winner live; the window and the felt call it by this name because
 * this is the bot answering for a seat.
 *
 * @param options The seat's tiles and the table's dictionary.
 * @returns A submission ready for the window's confirm action, or `null` for no word.
 */
export function chooseOfflineWord({ available, dictionary }: SearchWordsOptions): WordSubmission | null {
  return evaluateBestWord({ available, dictionary })?.submission ?? null;
}
