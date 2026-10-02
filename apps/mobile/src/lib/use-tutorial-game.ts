/**
 * use-tutorial-game.ts — the guided hand (STO-507): the offline table, run by the lesson.
 *
 * Not a second table. `useOfflineGame` runs it — the felt, the builder, the chip flights, the
 * seat pills and the results are the offline adapter's — and this hook hands it a session
 * (`OfflineSession`) with three things of the lesson's own:
 *
 * - **the deal and the gate**: the scripted hand from `@wordpoker/game-rules`' tutorial, and every
 *   action through `applyTutorialAction`, so a move off the script is dropped rather than played;
 * - **the opponents**: the script's moves, one per CPU beat, in place of the heuristic bots;
 * - **the clock**: a virtual one that stands still while the coach is explaining. Held, nothing on
 *   the table moves by itself — no beat, no deadline — and the HUD's countdown is pinned with it,
 *   so a player reading a card, or an app left in the background, never times out or comes back to
 *   a backlog of bot moves.
 *
 * The coach is held whenever a card is on screen; with no card up the table plays on toward the
 * next checkpoint (`lessonCoach`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyTutorialAction,
  nextScriptedAction,
  startTutorial,
  type Dictionary,
  type OfflineState,
  type TutorialDivergence,
  type TutorialRun,
} from "@wordpoker/game-rules";

import { LESSON_TOUR } from "@/components/onboarding/tours";
import type { CoachTour } from "@/components/ui/coach";
import { lessonCoach } from "@/lib/lesson-coach";
import { useOfflineGame, type OfflineGame, type OfflineSession } from "@/lib/use-offline-game";

/**
 * A clock that runs with the device's while released and stands still while held. Releasing it
 * resumes from where it stopped, so a deadline set on it keeps the time it had left.
 */
export function useLessonClock(held: boolean): () => number {
  const pausedTotal = useRef(0);
  const heldSince = useRef<number | null>(null);

  // Before the table's own effects (this hook is called first): a timer the table arms after this
  // render already reads the clock as held or released.
  useEffect(() => {
    if (held && heldSince.current === null) {
      heldSince.current = Date.now();
    } else if (!held && heldSince.current !== null) {
      pausedTotal.current += Date.now() - heldSince.current;
      heldSince.current = null;
    }
  }, [held]);

  return useCallback(() => (heldSince.current ?? Date.now()) - pausedTotal.current, []);
}

export interface TutorialGame extends OfflineGame {
  /** The coach's tour as `CoachProvider` draws it, or `null` while the table plays on. */
  coach: CoachTour | null;
  /** Whether the lesson's clock is held — the felt's countdown stands still with it. */
  held: boolean;
  /** The last move the lesson refused, for the felt to say so; cleared by the next one it takes. */
  divergence: TutorialDivergence | null;
  /** Deals the lesson again from the start: script, deal, drafts, checks, stacks and coach. */
  restart: () => void;
}

export function useTutorialGame({
  dictionary,
  paused = false,
}: {
  dictionary: Dictionary;
  /** Something else is explaining over the table — the felt's How to play — so hold it too. */
  paused?: boolean;
}): TutorialGame {
  const [requested, setRequested] = useState(0);
  const [runStep, setRunStep] = useState(0);
  const [divergence, setDivergence] = useState<TutorialDivergence | null>(null);
  const view = lessonCoach(LESSON_TOUR, requested, runStep);
  const held = view.step !== null || paused;
  const now = useLessonClock(held);

  // The run the script is at. The table's state is the adapter's; this holds the step beside it,
  // and every action the lesson takes moves both together.
  const run = useRef<TutorialRun | null>(null);

  const session = useMemo<OfflineSession>(
    () => ({
      now,
      held,
      open: (nowMs) => {
        const fresh = startTutorial({ dictionary, nowMs });
        run.current = fresh;
        return fresh.state;
      },
      reduce: (state, action, nowMs) => {
        const at = runAt(run.current, state);
        const applied = applyTutorialAction(at, action, nowMs);
        if (!applied.ok) {
          setDivergence(applied.divergence);
          return null;
        }
        run.current = applied.run;
        setRunStep(applied.run.step);
        setDivergence(null);
        return applied.run.state;
      },
      nextMove: (state, nowMs) => nextScriptedAction(runAt(run.current, state), nowMs),
    }),
    [dictionary, held, now],
  );

  // The seed is the script's (`TUTORIAL_SEED`): the session deals the table, so none is drawn here.
  const game = useOfflineGame({ seed: 0, dictionary, session });

  const restart = useCallback(() => {
    setRequested(0);
    setRunStep(0);
    setDivergence(null);
    game.newGame();
  }, [game]);

  const coach = useMemo<CoachTour | null>(
    () =>
      view.step === null
        ? null
        : {
            kind: "coach",
            steps: LESSON_TOUR,
            index: view.index,
            onNext: () => setRequested(view.index + 1),
            ...(view.index > 0 ? { onPrevious: () => setRequested(Math.max(0, view.index - 1)) } : {}),
          },
    [view.index, view.step],
  );

  return { ...game, coach, held, divergence, restart };
}

/**
 * The script's run for the table the adapter holds. They move together, so this is the run the
 * lesson last committed; before the first deal is read back, it is the deal itself.
 */
function runAt(current: TutorialRun | null, state: OfflineState): TutorialRun {
  return current !== null && current.state === state ? current : { state, step: current?.step ?? 0 };
}
