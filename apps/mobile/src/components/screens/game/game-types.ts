import type { RoundPhase } from "@wordpoker/contracts";

import type { TileData } from "@/components/game";
import type { SeatCount } from "@/components/table";

export type PlayerStatus =
  | "waiting"
  | "your-turn"
  | "thinking"
  | "check"
  | "call"
  | "raise"
  | "fold"
  | "all-in"
  | "busted"
  | "winner";

/**
 * The one role the felt badges. There are no blinds to mark (§13, §5): the dealer button
 * rotates, forces no bet, and is the only marker a seat carries.
 */
export type PlayerRole = "dealer";

export type LetterTileData = TileData;

export interface GamePlayer {
  id: string;
  name: string;
  initials: string;
  stack: number;
  color: string;
  status: PlayerStatus;
  role?: PlayerRole;
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
}

export interface GameScreenState {
  id: string;
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
   * Whether the session is over: the seats have played their last hand (a busted hero, or
   * fewer than two seats that can still pay — ADR 0002). The felt shows its end-state over
   * the table.
   */
  sessionOver: boolean;
  community: readonly (LetterTileData | null)[];
  privateTiles: readonly LetterTileData[];
  bestWord?: string;
  bestScore?: number;
  betting: BettingState;
}
