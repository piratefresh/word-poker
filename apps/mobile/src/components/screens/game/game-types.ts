import type { TileData } from "@/components/game";
import type { SeatCount } from "@/components/table";

export type GamePhase = "preflop" | "flop" | "turn" | "river" | "payout";
export type PlayerStatus =
  | "waiting"
  | "your-turn"
  | "thinking"
  | "check"
  | "call"
  | "raise"
  | "fold"
  | "winner";
export type PlayerRole = "dealer" | "small-blind" | "big-blind";

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

export interface BettingState {
  minRaise: number;
  maxRaise: number;
  raiseStep: number;
  raiseAmount: number;
  canFold: boolean;
  canCheck: boolean;
  callAmount?: number;
  canRaise: boolean;
}

export interface GameScreenState {
  id: string;
  phase: GamePhase;
  phaseNumber: number;
  secondsRemaining: number;
  seatCount: SeatCount;
  players: readonly (GamePlayer | null)[];
  pot: number;
  community: readonly (LetterTileData | null)[];
  privateTiles: readonly LetterTileData[];
  bestWord?: string;
  bestScore?: number;
  betting: BettingState;
}
