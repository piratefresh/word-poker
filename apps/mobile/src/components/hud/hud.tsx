import type { RoundPhase } from "@wordpoker/contracts";
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { spacing } from "@/constants/theme";
import { useLoopsEnabled, usePhaseClock } from "@/motion";

import type { ToastQueue } from "./hud-toasts";
import { HudToasts } from "./hud-toasts";
import { hudBarHeight, HudTopBar } from "./hud-top-bar";
import { BalanceView } from "./hud-types";
import type { TurnTimerView } from "./turn-clock";

export interface HudProps {
  /**
   * A stable id for the hand on the table. The phase clock counts a new hand as a change —
   * the next hand opens on preflop again, and the effects have to rise for it — so this is
   * the hand's identity, not the state's phase-and-actor composite id.
   */
  handId?: string;
  /** The hand's phase. The top bar names it, and numbers it, in its stamp. */
  phase: RoundPhase;
  /** The live turn, or null between turns. */
  turn: TurnTimerView | null;
  /** Words for the stamp in place of the phase's, for a table with no hand dealt yet. */
  stamp?: string;
  /** Spoken turn phrase, e.g. "Magnus to act". */
  turnPhrase?: string;
  balance: BalanceView;
  /**
   * Whether the header hangs the table's mode under the phase capsule. The screen decides it:
   * the tag takes a band under the header, and only the screen knows the room below it
   * (`hangsModeTag` for the mode and the window, `tabletopFitsTopChrome` for the room).
   */
  modeTag?: boolean;
  /** The screen owns the queue, because game events are what push to it. Without one the
   *  HUD draws no toasts at all — the offline table runs this way while its felt announces
   *  nothing. */
  toastQueue?: ToastQueue;
  /** The leave slot in the top bar. */
  onLeave?: () => void;
  onHelp?: () => void;
  onBalancePress?: () => void;
  /** Overrides the OS reduced-motion value for every effect the HUD carries; the tests use
   *  it. Absent means each effect asks the OS for itself. */
  reduceMotion?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Vertical room the HUD's chrome occupies in this window: the top bar, and nothing under it.
 *
 * Exported because a screen showing the HUD has to reserve it. The HUD floats over the
 * felt, so a screen that measured it instead would reserve nothing on the first frame
 * and then shove all of its content down once the measurement landed. It is derived from
 * the window the bar reads too, so the two agree on every frame of a resize.
 *
 * A tag the header hangs below the capsule (`hangsModeTag`) is not part of this: it hangs
 * over the room, which keeps its seats clear of it (`PokerTable`'s `topChrome`).
 */
export function useHudChromeHeight(): number {
  return hudBarHeight(useWindowDimensions());
}

/**
 * The in-hand HUD: one overlay that composes above the table without owning any
 * game state.
 *
 * Every layer here is `box-none`. The HUD covers the full width, so the empty space
 * around its controls has to stay transparent to touch — otherwise the top seats on
 * the felt would stop receiving taps. Toasts hang directly under the chrome rather
 * than at the bottom of the screen, which is what keeps the rack and the action row
 * clear at every viewport.
 */
export function Hud({
  handId,
  phase,
  turn,
  stamp,
  turnPhrase,
  balance,
  modeTag,
  toastQueue,
  onLeave,
  onHelp,
  onBalancePress,
  reduceMotion,
  style,
  testID,
}: HudProps) {
  // The container owns both, because both are the hand's rather than the bar's: the clock
  // says when the street moved, and the gate says whether a loop may run at all. The bar
  // only draws them.
  const { tick } = usePhaseClock(handId ?? "", phase);
  const loopsEnabled = useLoopsEnabled();

  return (
    <View pointerEvents="box-none" style={[styles.hud, style]} testID={testID}>
      <View pointerEvents="box-none" style={styles.chrome}>
        <HudTopBar
          balance={balance}
          loopsEnabled={loopsEnabled}
          modeTag={modeTag}
          onBalancePress={onBalancePress}
          onHelp={onHelp}
          onLeave={onLeave}
          phase={phase}
          // Derived rather than passed: the ordinal is a property of the phase, and two
          // screens each deciding what number a phase is would eventually disagree.

          reduceMotion={reduceMotion}
          stamp={stamp}
          tick={tick}
          turn={turn}
          turnPhrase={turnPhrase}
        />
      </View>
      {toastQueue === undefined ? null : (
        <HudToasts
          onDismiss={toastQueue.dismiss}
          reduceMotion={reduceMotion}
          toasts={toastQueue.toasts}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hud: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  chrome: {
    paddingHorizontal: spacing.md,
  },
});
