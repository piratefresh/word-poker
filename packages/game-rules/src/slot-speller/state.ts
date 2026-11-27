/**
 * The whole of a Slot Speller run as plain JSON (§48). No live generator rides in it: randomness
 * comes from `slotRng(seed, stream, counter)`, so `JSON.parse(JSON.stringify(state))` continues
 * exactly as the original would.
 */

import type { Tile } from "@wordpoker/contracts";

import { rollCells, type SlotPremiumCell } from "./cells";
import { DEFAULT_SLOT_SPELLER_CONFIG, roundTarget, type SlotSpellerConfig } from "./config";
import type { SlotPowerCounts, SlotPowerId } from "./powers";
import { buildStrip, rowCount, windowAt } from "./reels";

export type SlotPhase = "ready" | "moving" | "between" | "shop" | "short" | "over";

/** The run's best-scoring word so far. */
export interface SlotBestWord {
  readonly word: string;
  readonly score: number;
}

/** The shop opened by a clear, kept in the state so reopening the app cannot reroll it. */
export interface SlotShop {
  /** The power cards on offer. */
  readonly stock: readonly SlotPowerId[];
  /** Stock cards already bought this roll. */
  readonly sold: readonly SlotPowerId[];
  /** Rerolls paid for in this shop. */
  readonly rerolls: number;
  /** Tokens the clear that opened this shop paid. */
  readonly earned: number;
}

/** A grid position: `[reel, row]`. */
export type SlotCell = readonly [reel: number, row: number];

export interface SlotSpellerState {
  readonly seed: string;
  readonly config: SlotSpellerConfig;
  readonly powers: SlotPowerCounts;
  /** One strip per reel, `config.stripLength` tiles each. */
  readonly strips: readonly (readonly Tile[])[];
  /** Per reel, the strip index shown in row 0. */
  readonly top: readonly number[];
  /** `grid[reel][row]`. Stored, not derived: a swap changes the grid but not the strips. */
  readonly grid: readonly (readonly Tile[])[];
  readonly reels: number;
  /** The premium cells on the grid now. They belong to the grid: a nudge or swap moves tiles, not cells. */
  readonly cells: readonly SlotPremiumCell[];
  /** Every cell layout rolled so far: the index of the next roll's generator. */
  readonly cellRolls: number;
  readonly phase: SlotPhase;
  readonly moves: number;
  readonly round: number;
  readonly target: number;
  readonly roundScore: number;
  readonly spinsLeft: number;
  readonly tokens: number;
  /** Reels held through the next spin, chosen between spins; the spin consumes them. */
  readonly holds: readonly number[];
  /** Every spin of the run so far: the index of the next spin's generator. */
  readonly spinCount: number;
  /** Whether this round's one Extra Spin has been bought. */
  readonly extraSpinUsed: boolean;
  /** Open only in phase `shop`. */
  readonly shop: SlotShop | null;
  /** Every shop stock rolled so far (clears and rerolls): the index of the next roll's generator. */
  readonly shopRolls: number;
  /** Reels bought with Add Reel; sets its price. */
  readonly reelsBought: number;
  readonly bestWord: SlotBestWord | null;
}

/** Starts a run: strips built from the seed, every reel at strip index 0, cells laid, round 1, phase `ready`. */
export function createSlotRun(seed: string, config: SlotSpellerConfig = DEFAULT_SLOT_SPELLER_CONFIG): SlotSpellerState {
  const powers: SlotPowerCounts = {};
  const strips = Array.from({ length: config.reels }, (_, reel) => buildStrip(seed, reel, config));
  const rows = rowCount(config, powers);
  const top = strips.map(() => 0);

  return {
    seed,
    config,
    powers,
    strips,
    top,
    grid: strips.map((strip) => windowAt(strip, 0, rows)),
    reels: config.reels,
    ...rollCells({ seed, config, holds: [], cells: [], cellRolls: 0 }, config.reels, rows),
    phase: "ready",
    moves: 0,
    round: 1,
    target: roundTarget(config, 1),
    roundScore: 0,
    spinsLeft: config.spinsPerRound,
    tokens: 0,
    holds: [],
    spinCount: 0,
    extraSpinUsed: false,
    shop: null,
    shopRolls: 0,
    reelsBought: 0,
    bestWord: null,
  };
}
