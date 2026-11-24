/**
 * One Slot Speller run on screen (§47), in-process on the engine. Holds the model, runs the
 * payout reveal's timer, and reports every run-state change through `onChange` — the seam a saved
 * run (and records) hang off.
 */

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";

import { createSlotRun, evaluateSlotGrid, type Dictionary, type SlotEvaluation, type SlotSpellerState } from "@wordpoker/game-rules";

import { haptic } from "@/components/word-builder/haptics";

import {
  createSlotModel,
  isRevealing,
  randomSlotSeed,
  reduceSlotSpeller,
  type SlotSpellerAction,
  type SlotSpellerModel,
} from "./slot-speller-model";

/** The beat between payout rows. */
const REVEAL_STEP_MS = 420;

export interface UseSlotSpellerOptions {
  readonly dictionary: Dictionary;
  /** A run to resume; a fresh one is dealt otherwise. */
  readonly initialState?: SlotSpellerState;
  /** Every run-state change, with the state it replaced (records compare the two). */
  readonly onChange?: (state: SlotSpellerState, previous: SlotSpellerState) => void;
}

export interface SlotSpeller extends SlotSpellerModel {
  /** What the grid would pay right now, while moving; otherwise `null`. */
  readonly preview: SlotEvaluation | null;
  readonly revealing: boolean;
  readonly dispatch: (action: SlotSpellerAction) => void;
}

export function useSlotSpeller({ dictionary, initialState, onChange }: UseSlotSpellerOptions): SlotSpeller {
  const [model, setModel] = useState<SlotSpellerModel>(() =>
    createSlotModel(initialState ?? createSlotRun(randomSlotSeed())),
  );
  const reduceMotion = useReducedMotion();
  const revealing = isRevealing(model);

  const dispatch = (action: SlotSpellerAction): void => {
    const next = reduceSlotSpeller(model, action, dictionary);
    if (next === model) return;
    setModel(next);
    if (next.state === model.state) return;
    onChange?.(next.state, model.state);
    if (action.type === "spin" || action.type === "nudge") haptic("lift");
    else if (action.type === "tapCell" || action.type === "toggleLock") haptic("settle");
    else if (action.type === "pay" && next.payout !== null && next.payout.total > 0) haptic("success");
  };

  // The reveal's own clock: one row per beat, or all at once under reduced motion.
  useEffect(() => {
    if (!revealing) return;
    const timer = setTimeout(
      () => setModel((current) => reduceSlotSpeller(current, { type: reduceMotion ? "skipReveal" : "revealNext" }, dictionary)),
      reduceMotion ? 0 : REVEAL_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [revealing, model.revealStep, reduceMotion, dictionary]);

  const { state } = model;
  const preview = useMemo(
    () => (state.phase === "moving" ? evaluateSlotGrid(state, dictionary) : null),
    [state, dictionary],
  );

  return { ...model, preview, revealing, dispatch };
}
