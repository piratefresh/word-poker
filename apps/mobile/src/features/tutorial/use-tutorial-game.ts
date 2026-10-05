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
  TUTORIAL_MAX_RAISE_TO,
  TUTORIAL_RAISE_TO,
  TUTORIAL_SCRIPT,
  TUTORIAL_TARGET_WORD,
  type Dictionary,
  type OfflineState,
  type TutorialDivergence,
  type TutorialRun,
} from "@wordpoker/game-rules";

import { LESSON_TOUR } from "@/components/onboarding/tours";
import type { CoachTour } from "@/components/ui/coach";
import { lessonCoach, type LessonPrepReady } from "./lesson-coach";
import { useOfflineGame, type OfflineGame, type OfflineSession } from "@/features/offline/use-offline-game";

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

/** Where the script waits for the hero's flop raise (`TutorialRun.step` while it does). */
const RAISE_CHECKPOINT = TUTORIAL_SCRIPT.findIndex((step) => step.id === "flop-hero-raise");

export interface TutorialGame extends OfflineGame {
  /** The coach's tour as `CoachProvider` draws it, or `null` while the table plays on. */
  coach: CoachTour | null;
  /** Whether the lesson's clock is held — the felt's countdown stands still with it. */
  held: boolean;
  /** The last move the lesson refused, for the felt to say so; cleared by the next one it takes. */
  divergence: TutorialDivergence | null;
  /** Deals the lesson again from the start: script, deal, drafts, checks, stacks and coach. */
  restart: () => void;
  /** The felt's slider moved: the coach hands the raise to its button once it stands on 60. */
  changeRaise: (amount: number) => void;
  /** A step that holds the player is up: the felt's actions are disabled until it is done. */
  actionsLocked: boolean;
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
  // The slider's amount, as the felt last reported it, under the bounds it was set against: the
  // felt re-seeds the slider when they move without reporting it, so an amount from another
  // street is no amount at all.
  const [raise, setRaise] = useState<{ bounds: string; amount: number } | null>(null);
  // Whether a card is up does not hang on the seat's preps — a prep step hands off to the press
  // that waits on the same checkpoint — so the clock is held from the script alone, before the
  // table (which the preps are read off) exists.
  const held = lessonCoach(LESSON_TOUR, requested, runStep).step !== null || paused;
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
  const offline = useOfflineGame({ seed: 0, dictionary, session });

  // While the script waits on the flop raise, the slider stops at the coached amount: across a
  // whole stack, 60 is a sliver of the track, and at the cap it is simply the slider's far end.
  // It follows the script, not the coach, so handing the raise from the slider's card to the
  // button's does not move the bounds — which would re-seed the slider under the player.
  const offBetting = offline.game.betting;
  const game: OfflineGame =
    runStep === RAISE_CHECKPOINT
      ? {
          ...offline,
          game: {
            ...offline.game,
            betting: {
              ...offBetting,
              maxRaise: Math.max(offBetting.minRaise, Math.min(offBetting.maxRaise, TUTORIAL_RAISE_TO)),
              raiseAmount: Math.min(offBetting.raiseAmount, TUTORIAL_RAISE_TO),
            },
          },
        }
      : offline;

  const { minRaise, maxRaise } = game.game.betting;
  const bounds = `${minRaise}:${maxRaise}`;
  const changeRaise = useCallback(
    (amount: number) => setRaise({ bounds, amount }),
    [bounds],
  );
  const raiseAmount = raise?.bounds === bounds ? raise.amount : null;
  const ready: LessonPrepReady = {
    raise: raiseAmount !== null && raiseAmount >= TUTORIAL_RAISE_TO && raiseAmount <= TUTORIAL_MAX_RAISE_TO,
    word: game.words?.word === TUTORIAL_TARGET_WORD,
  };
  const view = lessonCoach(LESSON_TOUR, requested, runStep, ready);

  const restart = useCallback(() => {
    setRequested(0);
    setRunStep(0);
    setDivergence(null);
    setRaise(null);
    offline.newGame();
  }, [offline]);

  const coach = useMemo<CoachTour | null>(
    () =>
      view.step === null
        ? null
        : {
            kind: "coach",
            steps: LESSON_TOUR,
            index: view.index,
            onNext: () => setRequested(view.index + 1),
            // A step that holds the player offers no way back off it.
            ...(view.index > 0 && view.step.holds !== true
              ? { onPrevious: () => setRequested(Math.max(0, view.index - 1)) }
              : {}),
          },
    [view.index, view.step],
  );
  const actionsLocked = view.step?.holds === true;

  return { ...game, coach, held, divergence, restart, changeRaise, actionsLocked };
}

/**
 * The script's run for the table the adapter holds. They move together, so this is the run the
 * lesson last committed; before the first deal is read back, it is the deal itself.
 */
function runAt(current: TutorialRun | null, state: OfflineState): TutorialRun {
  return current !== null && current.state === state ? current : { state, step: current?.step ?? 0 };
}
