/**
 * The whole of a Slot Speller run as plain JSON (§47). No live generator rides in it: randomness
 * comes from `slotRng(seed, stream, counter)`, so `JSON.parse(JSON.stringify(state))` continues
 * exactly as the original would.
 */

import type { Tile } from "@wordpoker/contracts";

import { DEFAULT_SLOT_SPELLER_CONFIG, roundTarget, type SlotSpellerConfig } from "./config";
import type { SlotPowerCounts } from "./powers";
import { buildStrip, rowCount, windowAt } from "./reels";

export type SlotPhase = "ready" | "moving" | "between" | "shop" | "short" | "over";

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
  readonly phase: SlotPhase;
  readonly moves: number;
  readonly round: number;
  readonly target: number;
  readonly roundScore: number;
  readonly spinsLeft: number;
  readonly tokens: number;
  /** Reels held through the next spin (Reel Lock); the spin consumes them. */
  readonly locks: readonly number[];
  /** Every spin of the run so far: the index of the next spin's generator. */
  readonly spinCount: number;
}

/** Starts a run: strips built from the seed, every reel at strip index 0, round 1, phase `ready`. */
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
    phase: "ready",
    moves: 0,
    round: 1,
    target: roundTarget(config, 1),
    roundScore: 0,
    spinsLeft: config.spinsPerRound,
    tokens: 0,
    locks: [],
    spinCount: 0,
  };
}
