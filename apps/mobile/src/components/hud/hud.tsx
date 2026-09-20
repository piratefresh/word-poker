import type { RoundPhase } from "@wordpoker/contracts";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { spacing } from "@/constants/theme";
import { useLoopsEnabled, usePhaseClock } from "@/motion";

import type { ToastQueue } from "./hud-toasts";
import { HudToasts } from "./hud-toasts";
import { HUD_BAR_HEIGHT, HudTopBar } from "./hud-top-bar";
import { BalanceView, PHASE_NUMBER } from "./hud-types";
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
  /** Spoken turn phrase, e.g. "Magnus to act". */
  turnPhrase?: string;
  balance: BalanceView;
  /** The screen owns the queue, because game events are what push to it. Without one the
   *  HUD draws no toasts at all — the offline table runs this way while its felt announces
   *  nothing. */
  toastQueue?: ToastQueue;
  /** The leave slot in the top bar. */
  onLeave?: () => void;
  onHelp?: () => void;
  onSettings?: () => void;
  onBalancePress?: () => void;
  /** Overrides the OS reduced-motion value for every effect the HUD carries; the tests use
   *  it. Absent means each effect asks the OS for itself. */
  reduceMotion?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Vertical room the HUD's chrome occupies: the top bar, and nothing under it.
 *
 * Exported because a screen showing the HUD has to reserve it. The HUD floats over the
 * felt, so a screen that measured it instead would reserve nothing on the first frame
 * and then shove all of its content down once the measurement landed.
 */
export const HUD_CHROME_HEIGHT = HUD_BAR_HEIGHT;

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
  turnPhrase,
  balance,
  toastQueue,
  onLeave,
  onHelp,
  onSettings,
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
          onBalancePress={onBalancePress}
          onHelp={onHelp}
          onLeave={onLeave}
          onSettings={onSettings}
          phase={phase}
          // Derived rather than passed: the ordinal is a property of the phase, and two
          // screens each deciding what number a phase is would eventually disagree.
          phaseNumber={PHASE_NUMBER[phase]}
          reduceMotion={reduceMotion}
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
