/**
 * use-results-entrance.ts — the results screen's one clock.
 *
 * The screen enters as one sequence, not as seven components each timing itself: a single
 * progress value runs 0 → 1 over `resultsEntrance.total`, and every beat reads its own slice
 * of it with {@link beatProgress} inside its own `useAnimatedStyle`. That is what lets the pot
 * finish counting while the winner's tiles are still landing — the beats overlap, so no
 * component can own a start of its own without drifting from the clock.
 *
 * Nothing rendered is gated on an animated value. The one thing React is told is that the
 * sequence has settled, because the primary CTA has to go live exactly then and a disabled
 * control is a rendered fact rather than a style — and it is told through the animation's own
 * completion callback, never by polling the clock.
 *
 * Reduce Motion collapses the whole thing: the clock is pinned at its final value (so every
 * beat is already at its end state), one short fade covers the content, the primary is live on
 * the first frame, and no haptic is sent — a haptic is a movement the reader asked not to have.
 */

import { useEffect, useRef, useState } from "react";
import {
  Easing,
  Extrapolation,
  interpolate,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/components/word-builder/haptics";
import { resultsEntrance } from "@/constants/theme";

export interface ResultsEntrance {
  /** 0 → 1 over the sequence, on the UI thread. Pinned at 1 under Reduce Motion. */
  readonly clock: SharedValue<number>;
  /** 0 → 1 over `resultsEntrance.fade`: the whole scroll content's opacity, and all of it. */
  readonly fade: SharedValue<number>;
  /** False until the sequence settles — the primary CTA reads it, and nothing else does. */
  readonly ready: boolean;
  /** Whether Reduce Motion collapsed the sequence: final values, one fade, live CTA. */
  readonly reduced: boolean;
}

/**
 * Runs the entrance once, on mount. `heroWon` decides which of the two haptics the sequence
 * sends; it is read through a ref so a re-render cannot restart the sequence.
 */
export function useResultsEntrance({ heroWon }: { heroWon: boolean }): ResultsEntrance {
  const reduced = useReducedMotion();
  // Both values start where the sequence would leave them under Reduce Motion, so the first
  // frame is already the last frame and nothing has to be un-animated afterwards.
  const clock = useSharedValue(reduced ? 1 : 0);
  const fade = useSharedValue(reduced ? 1 : 0);
  const [ready, setReady] = useState(reduced);
  const won = useRef(heroWon);
  won.current = heroWon;

  useEffect(() => {
    const settled = () => setReady(true);

    if (reduced) {
      fade.set(
        withTiming(1, { duration: resultsEntrance.fade, easing: Easing.out(Easing.cubic) }),
      );
      return;
    }

    fade.set(withTiming(1, { duration: resultsEntrance.rise, easing: Easing.out(Easing.cubic) }));
    clock.set(
      withTiming(1, { duration: resultsEntrance.total, easing: Easing.linear }, (finished) => {
        "worklet";
        if (finished) scheduleOnRN(settled);
      }),
    );

    // The sequence's one haptic, at the pot's beat: the win it announces is already decided —
    // the pot is the hand's, and this only says so. Never a second one anywhere on the surface.
    const timer = setTimeout(
      () => haptic(won.current ? "success" : "lift"),
      resultsEntrance.pot,
    );

    return () => clearTimeout(timer);
    // Deliberately once, on mount: a re-render, a beat that has already started, or the OS
    // setting changing mid-sequence must not restart the clock under the reader's eyes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { clock, fade, ready, reduced };
}

/**
 * One beat's progress, 0 → 1, read off the shared clock.
 *
 * Call it inside `useAnimatedStyle`: it runs on the UI thread (`clock.get()` is the worklet
 * form of reading a shared value) and is clamped at both ends, so a beat that has not started
 * sits at 0 and one that has finished stays at 1 — no overshoot, no extrapolated negative
 * opacity.
 */
export function beatProgress(clock: SharedValue<number>, at: number, duration: number): number {
  "worklet";
  const from = at / resultsEntrance.total;
  const to = (at + Math.max(duration, 1)) / resultsEntrance.total;
  return interpolate(clock.get(), [from, to], [0, 1], Extrapolation.CLAMP);
}
