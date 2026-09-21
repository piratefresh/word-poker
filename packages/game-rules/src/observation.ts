/**
 * observation.ts — the table as one seat is allowed to see it, and the streams it may draw from.
 *
 * `OfflineState` is the whole table: every seat's private tiles, and all five community tiles
 * whether or not a street has turned them over. A bot must not read either. §14 deals a seat
 * two tiles and nothing else, §18 turns the board face up one street at a time, and a bot that
 * helped itself to the rest would be playing a different game from the player across the felt.
 *
 * So a bot's decision starts here. One object holds exactly what a seat knows — its own tiles,
 * the revealed board, and the public money — and everything downstream reads that and nothing
 * else: the equity estimator (`./equity`), the betting policy (`./bot`). Anything not on this
 * object is not available to either, which is what makes the boundary checkable rather than
 * merely intended: two tables that differ only in what is face down produce the same
 * observation, and `observeTable` reads the hidden fields nowhere.
 *
 * Note what is deliberately missing. `availableTiles(state, seatIndex)` is *not* what a seat
 * may play from here: it returns the community board entire, so a caller that reached for it
 * preflop would be reading three face-down tiles. A seat's playable tiles are
 * `privateTiles` and `board` — the board only as far as the street has shown it.
 *
 * The streams come from the same public record. A bot's rolls are named by the hand, the
 * street, the seat, the state of the betting, and what the roll is for — never by a tile, so
 * the same decision rolls the same numbers whatever the deal put under it, and no two
 * purposes can consume each other's draws. `handSeed` names the stream and nothing else: a bot
 * that fed it to `dealHand` would be reading the deck, which is the one thing this module
 * exists to prevent.
 */

import { ROUND_PHASES, type PlayerId, type RoundPhase, type Tile } from "@wordpoker/contracts";

import { bettingBounds, type BettingBounds } from "./betting";
import { handSeed, OfflineActionError, type OfflineState } from "./offline";
import { mixSeed } from "./rng";

/**
 * The purposes one decision draws from, each with a stream of its own.
 *
 * Separate streams because the three are asked different questions: `simulation` walks the
 * worlds an equity estimate averages over, `mixing` picks between the actions a policy is
 * willing to take, and `sizing` picks an amount. One stream shared between them would make a
 * decision's bluff depend on how many samples the estimate happened to draw.
 */
export const BOT_STREAMS = ["simulation", "mixing", "sizing"] as const;

/** Which of a decision's streams a draw belongs to. */
export type BotStream = (typeof BOT_STREAMS)[number];

/**
 * The salts the purposes are named by, folded into the seed with everything else.
 *
 * Unrelated values rather than successive ones, because `mixSeed` is what makes them
 * independent and these read as the arbitrary names they are.
 */
const STREAM_SALTS: Readonly<Record<BotStream, number>> = {
  simulation: 0x1d0c_5e51,
  mixing: 0x2f9a_77c3,
  sizing: 0x3b6e_9ad1,
};

/** One seat's public standing (§30): its chips, and whether it is still in the hand. */
export interface BotSeatObservation {
  /** Its index in the table's seating — the index every other part of the state uses. */
  readonly seat: number;
  readonly playerId: PlayerId;
  readonly stack: number;
  /** Chips committed to the hand (§25) — what a pot's layers are built from. */
  readonly committedHand: number;
  /** Chips committed to the round now being bet (§22). */
  readonly committedRound: number;
  readonly folded: boolean;
  /** Committed its whole stack: still in the hand, no further action (§22). */
  readonly allIn: boolean;
  /** Busted and not dealt in (ADR 0002). */
  readonly sittingOut: boolean;
  readonly actedThisRound: boolean;
}

/** The public state of the betting round (§22): the round's numbers, and what each seat has in. */
export interface BotRoundObservation {
  /** §23's current bet: the highest amount committed this round. */
  readonly currentBet: number;
  /** The increment of the last full raise — half of §22's raise floor. */
  readonly lastRaiseSize: number;
}

/** Everything one seat knows when it has to decide. */
export interface BotObservation {
  /**
   * The hand's seed, stepped once per hand: the *name* of the streams this decision draws
   * from. It is never a source of tiles — the deal is behind this boundary, not inside it.
   */
  readonly handSeed: number;
  /** The seat this observation speaks for. */
  readonly seat: number;
  readonly playerId: PlayerId;
  readonly phase: RoundPhase;
  /** The seat's own two private tiles (§14) — the only dealt tiles it has seen. */
  readonly privateTiles: readonly Tile[];
  /** The community tiles the streets have turned over (§18), in deal order. */
  readonly board: readonly Tile[];
  /** Every tile the seat may play: its private tiles and the revealed board (§12). */
  readonly available: readonly Tile[];
  /** The table as it shows: every seat dealt in, in seat order (§30). */
  readonly seats: readonly BotSeatObservation[];
  /** Every chip committed to the hand so far — the pot as §25 layers it. */
  readonly pot: number;
  /** The seat's own standing: what it holds and what it has already put in. */
  readonly standing: BotSeatObservation;
  /** §23's call as the round reports it, before the stack caps it. */
  readonly toCall: number;
  /** What the call would actually cost: §23's amount, or the whole stack when it cannot cover it. */
  readonly callCost: number;
  /** The table's stakes (§22) and the button (§30). */
  readonly minBet: number;
  readonly dealerSeat: number;
  /** What the seat may legally do, as `bettingBounds` enables it. */
  readonly bounds: BettingBounds;
}

/**
 * Builds the observation for `botId`, refusing a seat that is not on the clock.
 *
 * The guards are the engine's: a table at `payout` has no turn left, §19's window has no turn
 * at all, and a move applied out of order would desync the table silently. They live here
 * because this is where the seat is resolved, and a caller reaching for the observation is
 * about to decide something.
 *
 * @throws {OfflineActionError} When no seat is to act, when it is not `botId`'s turn, when no
 *   betting round is open, or when `botId` cannot act in the one that is.
 */
export function observeTable(state: OfflineState, botId: PlayerId): BotObservation {
  const toAct = state.toActIndex;
  if (toAct === null) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }
  const acting = state.seats[toAct];
  if (acting === undefined) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }
  if (acting.id !== botId) {
    throw new OfflineActionError(`${botId} is not to act at ${state.phase}; ${acting.id} is`);
  }

  const betting = state.betting;
  if (betting === null) {
    throw new OfflineActionError(`no betting round is open at ${state.phase}`);
  }

  const bounds = bettingBounds(state.seats, betting, toAct, state.stakes.minBet);
  if (bounds === null) {
    throw new OfflineActionError(`${botId} cannot act at ${state.phase}`);
  }

  const seats = state.seats.map((seat, index): BotSeatObservation => ({
    seat: index,
    playerId: seat.id,
    stack: seat.stack,
    committedHand: seat.committedHand,
    committedRound: seat.committedRound,
    folded: seat.folded,
    allIn: seat.allIn,
    sittingOut: seat.sittingOut,
    actedThisRound: seat.actedThisRound,
  }));

  // The seat is in the list by construction: `toActIndex` is an index into `state.seats`.
  const standing = seats[toAct];
  if (standing === undefined) {
    throw new OfflineActionError(`no seat is to act at ${state.phase}`);
  }

  // §18: the board is the community as far as the street has turned it over. `state.community`
  // holds all five from the deal; reading past `revealed` would be reading face-down tiles.
  const board = state.community.slice(0, state.revealed);
  const privateTiles = acting.privateTiles;

  return {
    handSeed: handSeed(state),
    seat: toAct,
    playerId: botId,
    phase: state.phase,
    privateTiles,
    board,
    available: [...privateTiles, ...board],
    seats,
    pot: seats.reduce((total, seat) => total + seat.committedHand, 0),
    standing,
    toCall: bounds.callAmount,
    callCost: Math.min(bounds.callAmount, standing.stack),
    minBet: state.stakes.minBet,
    dealerSeat: state.dealerSeat,
    bounds,
  };
}

/**
 * The seed one decision's stream is built from: the hand, the street, the seat, the public
 * state of the betting, and what the stream is for.
 *
 * Public throughout, on purpose (STO-361's information rule): the deal cannot move these
 * numbers, so a decision rolls the same values whatever is face down, and two tables that
 * differ only in hidden tiles replay the same play. The betting state is a complete record of
 * how far into the hand the decision is — the round's numbers and what every seat has in
 * change on every action, and the seat to act tells two seats facing the same round apart — so
 * no two decision points in a hand share a seed.
 */
export function decisionSeed(observation: BotObservation, stream: BotStream): number {
  const parts: number[] = [
    observation.handSeed,
    ROUND_PHASES.indexOf(observation.phase),
    observation.seat,
    observation.bounds.currentBet,
    // The raise floor, which carries the last full raise's increment: a raise and a short
    // all-in that moved the current bet by the same amount are different decisions.
    observation.bounds.minRaiseTo,
    STREAM_SALTS[stream],
  ];

  // The public record of the betting so far. Commitments only ever rise, so the combination
  // of this seat on the clock, the round's numbers and every seat's round commitment names
  // one decision point and never comes round twice in a hand.
  for (const seat of observation.seats) {
    parts.push(seat.committedRound, seat.actedThisRound ? 1 : 0);
  }

  return mixSeed(parts);
}
