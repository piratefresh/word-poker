/** The player's grid actions — spin, nudge, swap (§48, Spins and moves) — each refused with a reason, nothing changed. */

import type { Tile } from "@wordpoker/contracts";

import { weightedSampleWithoutReplacement } from "../core/sample";
import { LETTER_VALUES, type Letter } from "../tiles/letters";
import { DEFAULT_SPECIAL_TILES } from "../tiles/special-tiles";
import { hasPower, powerCount } from "./powers";
import { rowCount, stripAt, windowAt, wrap } from "./reels";
import { slotRng } from "./seed";
import type { SlotCell, SlotSpellerState } from "./state";
import { isBlank, isChoice } from "./word-score";

export type SlotRejectionReason =
  | "wrong-phase"
  | "no-spins"
  | "no-moves"
  | "out-of-range"
  | "same-cell"
  | "not-enough-tokens"
  | "not-on-sale"
  | "sold"
  | "max-reels"
  | "extra-spin-used"
  | "no-power"
  | "lock-used"
  | "lock-full";

/** Either the next state, or the reason the action was refused with the state handed back unchanged. */
export type SlotActionResult =
  | { readonly ok: true; readonly state: SlotSpellerState }
  | { readonly ok: false; readonly state: SlotSpellerState; readonly reason: SlotRejectionReason };

/** Up (`-1`) brings the next strip tile in at the bottom; down (`1`) the previous one in at the top. */
export type NudgeDirection = -1 | 1;

export function refuse(state: SlotSpellerState, reason: SlotRejectionReason): SlotActionResult {
  return { ok: false, state, reason };
}

/** Moves a spin grants: the config's plus Extra Move's bonus. */
export function movesPerSpin(state: SlotSpellerState): number {
  return state.config.movesPerSpin + powerCount(state.powers, "extraMove") * state.config.extraMoveBonus;
}

/**
 * Spins every unlocked reel to a new random top and refills its column from the strip; a locked
 * reel keeps its column (unless the row count changed under it). Only from `ready` or `between`.
 * Consumes the locks and a spin, and opens `moving` with a fresh set of moves. With Split Tiles,
 * the landed grid then gains its second faces.
 */
export function spin(state: SlotSpellerState): SlotActionResult {
  if (state.phase !== "ready" && state.phase !== "between") return refuse(state, "wrong-phase");
  if (state.spinsLeft <= 0) return refuse(state, "no-spins");

  const rng = slotRng(state.seed, "spin", state.spinCount);
  const rows = rowCount(state.config, state.powers);
  const top: number[] = [];
  const grid: Tile[][] = [];

  for (let reel = 0; reel < state.reels; reel += 1) {
    const strip = state.strips[reel] ?? [];
    const kept = state.grid[reel];
    const nextTop = Math.floor(rng() * strip.length);
    if (state.locks.includes(reel) && kept !== undefined && kept.length === rows) {
      top.push(state.top[reel] ?? 0);
      grid.push([...kept]);
    } else {
      top.push(nextTop);
      grid.push(windowAt(strip, nextTop, rows));
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      top,
      grid: hasPower(state.powers, "split") ? splitTiles(state, grid) : grid,
      locks: [],
      lockUsed: state.lockUsed || state.locks.length > 0,
      phase: "moving",
      moves: movesPerSpin(state),
      spinsLeft: state.spinsLeft - 1,
      spinCount: state.spinCount + 1,
    },
  };
}

/** Letters Split Tiles picks from for a letter in no choice pair. */
const SPLIT_FALLBACK_LETTERS = ["A", "E", "I", "O", "R", "S", "T", "N"] as const;

/**
 * Split Tiles: `splitTilesPerSpin` random plain grid tiles (not blank, not already a choice tile,
 * not on a locked reel) gain a second face — the letter's partner in the first choice pair
 * holding it, else a random one of `SPLIT_FALLBACK_LETTERS` other than itself. Grid only.
 */
function splitTiles(state: SlotSpellerState, grid: Tile[][]): Tile[][] {
  const rng = slotRng(state.seed, "split", state.spinCount);
  const eligible: SlotCell[] = [];
  grid.forEach((column, reel) => {
    if (state.locks.includes(reel)) return;
    column.forEach((tile, row) => {
      if (!isBlank(tile) && !isChoice(tile)) eligible.push([reel, row]);
    });
  });

  const next = grid.map((column) => [...column]);
  for (const [reel, row] of weightedSampleWithoutReplacement(eligible, () => 1, state.config.splitTilesPerSpin, rng)) {
    const column = next[reel];
    const tile = column?.[row];
    if (column === undefined || tile === undefined) continue;
    const pair = DEFAULT_SPECIAL_TILES.choicePairs.find((entry) => entry.includes(tile.letter));
    const others = SPLIT_FALLBACK_LETTERS.filter((letter) => letter !== tile.letter);
    const alternative = pair
      ? pair[0] === tile.letter
        ? pair[1]
        : pair[0]
      : (others[Math.floor(rng() * others.length)] ?? "E");
    column[row] = { ...tile, alternativeLetter: alternative, alternativePoints: LETTER_VALUES[alternative as Letter] ?? 0 };
  }
  return next;
}

/** Whether Reel Lock can hold reels now: between spins, with the power, not yet spent this round. */
export function canLock(state: SlotSpellerState): boolean {
  return state.phase === "between" && hasPower(state.powers, "lock") && !state.lockUsed;
}

/** Reel Lock: holds or releases `reel` for the next spin, up to `lockReels` reels. */
export function toggleLock(state: SlotSpellerState, reel: number): SlotActionResult {
  if (state.phase !== "between") return refuse(state, "wrong-phase");
  if (!hasPower(state.powers, "lock")) return refuse(state, "no-power");
  if (state.lockUsed) return refuse(state, "lock-used");
  if (!Number.isInteger(reel) || reel < 0 || reel >= state.reels) return refuse(state, "out-of-range");
  if (state.locks.includes(reel)) {
    return { ok: true, state: { ...state, locks: state.locks.filter((held) => held !== reel) } };
  }
  if (state.locks.length >= state.config.lockReels) return refuse(state, "lock-full");
  return { ok: true, state: { ...state, locks: [...state.locks, reel] } };
}

function moveRefusal(state: SlotSpellerState): SlotRejectionReason | null {
  if (state.phase !== "moving") return "wrong-phase";
  if (state.moves <= 0) return "no-moves";
  return null;
}

/** Steps one reel's column a tile along its strip, keeping any swapped-in tiles still in view. */
export function nudge(state: SlotSpellerState, reel: number, direction: NudgeDirection): SlotActionResult {
  const refusal = moveRefusal(state);
  if (refusal !== null) return refuse(state, refusal);
  const strip = state.strips[reel];
  const column = state.grid[reel];
  if (!Number.isInteger(reel) || strip === undefined || column === undefined || column.length === 0) {
    return refuse(state, "out-of-range");
  }

  const oldTop = state.top[reel] ?? 0;
  const newTop = wrap(oldTop - direction, strip.length);
  const nextColumn =
    direction === -1
      ? [...column.slice(1), stripAt(strip, newTop + column.length - 1)]
      : [stripAt(strip, newTop), ...column.slice(0, -1)];

  return {
    ok: true,
    state: {
      ...state,
      top: state.top.map((value, index) => (index === reel ? newTop : value)),
      grid: state.grid.map((value, index) => (index === reel ? nextColumn : value)),
      moves: state.moves - 1,
    },
  };
}

function cellTile(state: SlotSpellerState, [reel, row]: SlotCell): Tile | undefined {
  if (!Number.isInteger(reel) || !Number.isInteger(row)) return undefined;
  return state.grid[reel]?.[row];
}

/** Exchanges any two grid cells; the strips are untouched. */
export function swap(state: SlotSpellerState, a: SlotCell, b: SlotCell): SlotActionResult {
  const refusal = moveRefusal(state);
  if (refusal !== null) return refuse(state, refusal);
  const first = cellTile(state, a);
  const second = cellTile(state, b);
  if (first === undefined || second === undefined) return refuse(state, "out-of-range");
  if (a[0] === b[0] && a[1] === b[1]) return refuse(state, "same-cell");

  const grid = state.grid.map((column) => [...column]);
  const columnA = grid[a[0]];
  const columnB = grid[b[0]];
  if (columnA === undefined || columnB === undefined) return refuse(state, "out-of-range");
  columnA[a[1]] = second;
  columnB[b[1]] = first;

  return { ok: true, state: { ...state, grid, moves: state.moves - 1 } };
}
