/**
 * lesson-coach.ts — which coach step the guided hand shows, given where its script stands.
 *
 * Pure, so the pacing is testable without a table. A step that names a checkpoint waits for the
 * script to reach it: until then nothing is shown, the table runs, and the bots take their beats.
 * An `action` step is done once the script has moved past its checkpoint — the player made the
 * move — and the coach moves on by itself; a `next` step waits for the player's Next. A step with
 * `prep` is also done while the seat has that prep ready, and comes back if the seat undoes it
 * (slides off the amount, breaks the word) before making the move.
 */

import { TUTORIAL_SCRIPT } from "@wordpoker/game-rules";

import type { LessonCoachStep, LessonPrep } from "@/components/onboarding/tours";

/** Which of the seat's preps are ready right now. */
export type LessonPrepReady = Readonly<Record<LessonPrep, boolean>>;

const NOTHING_READY: LessonPrepReady = { raise: false, word: false };

export interface LessonCoachView {
  /** The step the coach is on: the requested one, past any action steps already done. */
  index: number;
  /** The step to show now, or `null` while the table plays on toward it (or the tour is over). */
  step: LessonCoachStep | null;
}

/** Where a checkpoint sits in the script; `-1` for a step that waits on none. */
function checkpointIndex(checkpoint: string | undefined): number {
  if (checkpoint === undefined) return -1;
  const index = TUTORIAL_SCRIPT.findIndex((step) => step.id === checkpoint);
  if (index < 0) throw new Error(`the lesson's coach waits on an unknown checkpoint: ${checkpoint}`);
  return index;
}

/**
 * The coach's step for a script at `runStep` (`TutorialRun.step`), starting from the one the
 * player last moved to.
 */
export function lessonCoach(
  tour: readonly LessonCoachStep[],
  requested: number,
  runStep: number,
  ready: LessonPrepReady = NOTHING_READY,
): LessonCoachView {
  for (let index = requested; ; index += 1) {
    const step = tour[index];
    if (step === undefined) return { index, step: null };
    const at = checkpointIndex(step.checkpoint);
    if (step.advance === "action" && runStep > at) continue;
    if (step.prep !== undefined && ready[step.prep]) continue;
    return { index, step: runStep >= at ? step : null };
  }
}
