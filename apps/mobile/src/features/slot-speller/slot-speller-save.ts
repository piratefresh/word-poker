/**
 * slot-speller-save.ts — the device's Slot Speller save (STO-1168): the run in progress, written
 * whole on every change and resumed exactly, and the records kept across runs. Both live in the
 * same durable slot as the story save (`claim-store`); the records keep one copy in memory so the
 * screen reads them without a reload.
 */

import { useSyncExternalStore } from "react";

import { SLOT_POWERS, type SlotBestWord, type SlotPowerId, type SlotSpellerState } from "@wordpoker/game-rules";

import { readItem, writeItem } from "@/lib/storage/claim-store";

const RUN_KEY = "slot-speller-run";
const RECORDS_KEY = "slot-speller-records";
/** Bumped when a saved run's shape stops matching the engine's; an older save starts a new run. */
// 2: the run config gained the `targets` table (STO-1165); a version-1 save has none and crashes the shop.
// 3: the run gained premium cells (`cells`, `cellRolls`, `config.cells`) (STO-1180).
// 4: holds are free (`holds` replaced `locks`/`lockUsed`) and Big Hold replaced Reel Lock (STO-1182).
const SAVE_VERSION = 4;

export interface SlotRecords {
  /** The furthest round any run has cleared. */
  readonly furthestRound: number;
  readonly bestWord: SlotBestWord | null;
  /** Every power seen in a shop's stock, in pool order. */
  readonly discovered: readonly SlotPowerId[];
}

export const EMPTY_SLOT_RECORDS: SlotRecords = { furthestRound: 0, bestWord: null, discovered: [] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Enough of the run's shape to trust the rest: the fields every action reads first. */
function isRunState(value: unknown): value is SlotSpellerState {
  return (
    isObject(value) &&
    typeof value.seed === "string" &&
    typeof value.phase === "string" &&
    typeof value.round === "number" &&
    typeof value.reels === "number" &&
    isObject(value.config) &&
    isObject(value.powers) &&
    Array.isArray(value.strips) &&
    Array.isArray(value.grid) &&
    Array.isArray(value.top) &&
    Array.isArray(value.holds) &&
    Array.isArray(value.cells)
  );
}

/** The saved run, or `null` when there is none or it no longer parses (the screen deals a new one). */
export function loadSlotRun(): SlotSpellerState | null {
  try {
    const parsed: unknown = JSON.parse(readItem(RUN_KEY) ?? "null");
    if (isObject(parsed) && parsed.version === SAVE_VERSION && isRunState(parsed.state)) return parsed.state;
  } catch {
    // fall through
  }
  return null;
}

export function saveSlotRun(state: SlotSpellerState): void {
  writeItem(RUN_KEY, JSON.stringify({ version: SAVE_VERSION, state }));
}

/**
 * The records after one run-state change: a newly opened shop counts its round cleared and its
 * stock discovered, and a better best word replaces the old. Unchanged records come back as is.
 */
export function updateRecords(records: SlotRecords, previous: SlotSpellerState, next: SlotSpellerState): SlotRecords {
  let { furthestRound, bestWord, discovered } = records;

  if (next.shop !== null && next.shop !== previous.shop) {
    furthestRound = Math.max(furthestRound, next.round);
    const seen = new Set([...discovered, ...next.shop.stock]);
    if (seen.size > discovered.length) discovered = SLOT_POWERS.map((power) => power.id).filter((id) => seen.has(id));
  }
  if (next.bestWord !== null && next.bestWord !== previous.bestWord && next.bestWord.score > (bestWord?.score ?? -1)) {
    bestWord = next.bestWord;
  }

  if (furthestRound === records.furthestRound && bestWord === records.bestWord && discovered === records.discovered) {
    return records;
  }
  return { furthestRound, bestWord, discovered };
}

let current: SlotRecords | null = null;
const listeners = new Set<() => void>();

function loadRecords(): SlotRecords {
  try {
    const parsed: unknown = JSON.parse(readItem(RECORDS_KEY) ?? "null");
    if (isObject(parsed) && typeof parsed.furthestRound === "number" && Array.isArray(parsed.discovered)) {
      return parsed as unknown as SlotRecords;
    }
  } catch {
    // fall through
  }
  return EMPTY_SLOT_RECORDS;
}

export function slotRecords(): SlotRecords {
  current ??= loadRecords();
  return current;
}

/** The screen's `onChange`: saves the run, and the records when the change moved them. */
export function persistSlotChange(next: SlotSpellerState, previous: SlotSpellerState): void {
  saveSlotRun(next);
  const records = slotRecords();
  const updated = updateRecords(records, previous, next);
  if (updated === records) return;
  current = updated;
  writeItem(RECORDS_KEY, JSON.stringify(updated));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSlotRecords(): SlotRecords {
  return useSyncExternalStore(subscribe, slotRecords, slotRecords);
}
