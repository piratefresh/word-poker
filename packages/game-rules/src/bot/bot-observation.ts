import type { RoundPhase, Tile } from "@wordpoker/contracts";

import type { BettingRoundState, BettingSeatState } from "../money/betting";
import type { Dictionary } from "../words/dictionary";
import type { OfflineState } from "../table/offline";

/** The policy's entire knowledge. Hidden racks, future board and drafts cannot cross it. */
export interface BotObservation {
  readonly seed: number;
  readonly hand: number;
  readonly phase: RoundPhase;
  readonly seat: number;
  readonly dealerSeat: number;
  readonly bigBlind: number;
  readonly round: BettingRoundState;
  readonly seats: readonly BettingSeatState[];
  readonly privateTiles: readonly Tile[];
  readonly board: readonly Tile[];
  readonly dictionary: Dictionary;
}

export function observeBot(state: OfflineState, seat: number, round: BettingRoundState): BotObservation {
  return {
    seed: state.seed,
    hand: state.hand,
    phase: state.phase,
    seat,
    dealerSeat: state.dealerSeat,
    bigBlind: state.stakes.bigBlind,
    round: { ...round },
    seats: state.seats.map(({ id, stack, committedRound, committedHand, folded, allIn, sittingOut, actedThisRound }) => ({
      id, stack, committedRound, committedHand, folded, allIn, sittingOut, actedThisRound,
    })),
    privateTiles: state.seats[seat]?.privateTiles ?? [],
    board: state.community.slice(0, state.revealed),
    dictionary: state.dictionary,
  };
}

/** Purpose-separated rolls change with public betting context, including a re-raise. */
export function botDecisionSeed(view: BotObservation, purpose: string): number {
  const unit = (amount: number) => amount / view.bigBlind;
  const key = JSON.stringify([
    view.seed, view.hand, view.phase, view.seat, view.dealerSeat, purpose,
    unit(view.round.currentBet), unit(view.round.lastRaiseSize),
    view.seats.map((seat) => [
      unit(seat.stack), unit(seat.committedRound), unit(seat.committedHand),
      seat.folded, seat.allIn, seat.sittingOut, seat.actedThisRound,
    ]),
  ]);
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return hash >>> 0;
}
