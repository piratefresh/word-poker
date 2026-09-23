import type { RoundPhase } from "@wordpoker/contracts";

import type { TileData } from "@/components/game";
import type { SeatCount } from "@/components/table";

export type PlayerStatus =
  | "waiting"
  | "your-turn"
  | "thinking"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "fold"
  | "all-in"
  | "busted"
  | "winner";

/**
 * The markers a seat can carry (§5): the dealer button, and the two blinds that ride on it. A
 * seat holds a list because heads-up one seat is both the button and the small blind.
 */
export type PlayerRole = "dealer" | "small-blind" | "big-blind";

export type LetterTileData = TileData;

export interface GamePlayer {
  id: string;
  name: string;
  initials: string;
  stack: number;
  color: string;
  status: PlayerStatus;
  /** The markers this seat holds, in the order the felt prints them; absent when it holds none. */
  roles?: readonly PlayerRole[];
  bet?: number;
  isHero?: boolean;
}

/**
 * The action row as the engine sees it. Every amount is a **round total**, not an increment:
 * raise-to bounds and a call are read straight off `bettingBounds`, and the row never decides
 * legality for itself (§22's rule is the engine's).
 */
export interface BettingState {
  /** The smallest legal raise-to — the raise floor; also the opening bet when no bet is out. */
  minRaise: number;
  /** The largest raise-to the hero's stack can cover. */
  maxRaise: number;
  /** The slider's step: the table's minimum bet. */
  raiseStep: number;
  /** What the slider offers before the seat has moved it. */
  raiseAmount: number;
  canFold: boolean;
  canCheck: boolean;
  /** What a call would commit; present only when there is something to call. */
  callAmount?: number;
  canRaise: boolean;
  /** Whether the round's opening bet is still open to the hero (no bet out yet). */
  canBet: boolean;
  canAllIn: boolean;
  /** The hero's exact remaining Table Stack — what an all-in would commit (§22). */
  allInAmount: number;
  /** The highest amount committed this round, for labelling call and raise. */
  currentBet: number;
  /**
   * The move the check/call button makes: the engine's check or call, or — inside §19's window —
   * the confirm. The label and the tap both read this, so they cannot disagree.
   */
  primary: "confirm" | "check" | "call";
  /** The move the one bet/raise slider makes: a bet opens the round, a raise answers one (§22). */
  wager: "bet" | "raise";
}

/**
 * Chips on their way across the felt: what one seat's commitment sent to the middle, or — the
 * other way — what a payout hands back out (STO-354 emits those). A flight is a batch, not a
 * chip: the amount says how much travelled, and one node carries it.
 *
 * `id` names the batch — the hand, the street and the seat it belongs to, and which way it goes
 * — so the same flight is the same node on every render, and the layer reports a landing with
 * the id it was handed.
 */
export interface ChipFlight {
  id: string;
  seatIndex: number;
  amount: number;
  direction: "in" | "out";
}

export interface GameScreenState {
  id: string;
  /**
   * A stable id for the hand in play. `id` above names the *turn* and moves with every action;
   * this one holds for the whole hand, which is what a per-hand effect keys on (the HUD's phase
   * clock) and what a chip flight's id is built from.
   */
  handId: string;
  phase: RoundPhase;
  phaseNumber: number;
  secondsRemaining: number;
  seatCount: SeatCount;
  players: readonly (GamePlayer | null)[];
  /** Every chip in the middle: the seats' committed-this-hand, pots layered or not. */
  pot: number;
  /** The side pots above the main pot, in the order §25 layered them; empty when there is one. */
  sidePots: readonly number[];
  /**
   * The chips in flight, oldest first: one per seat per street that has committed since the felt
   * last finished one. Empty at rest — an empty array is a layer that draws nothing — and the
   * adapter that owns it prunes a flight when the layer reports it landed.
   */
  flights: readonly ChipFlight[];
  /**
   * Whether the session is over: the seats have played their last hand (a busted hero, or
   * fewer than two seats that can still pay — ADR 0002). The felt shows its end-state over
   * the table.
   */
  sessionOver: boolean;
  community: readonly (LetterTileData | null)[];
  privateTiles: readonly LetterTileData[];
  bestWord?: string;
  bestScore?: number;
  /**
   * §30's table information: the blinds this table plays (§5, ADR 0004), drawn with the pot. Both
   * numbers, because the table fixes both — the big blind is also the minimum bet the row's floor
   * is built from.
   */
  blinds: { smallBlind: number; bigBlind: number };
  betting: BettingState;
}
