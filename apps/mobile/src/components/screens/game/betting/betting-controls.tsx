import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import type { TurnTimerView } from "@/components/hud/turn-clock";
import { CoachTarget } from "@/components/ui/coach";
import { GameButton } from "@/components/ui/game-button";

import type { BettingState, GameScreenState } from "../game-types";
import { useCompactControls, useScreenScale, useShortControls } from "../screen-scale";
import { AllInSheet } from "./all-in-sheet";
import { formatCompactAmount } from "./format-amount";
import { RaiseSlider } from "./raise-slider";
import { WagerButton } from "./wager-button";
import { WordSubmissionControls } from "./word-submission-controls";

export function BettingControls({
  state,
  amount,
  pot,
  locked,
  waitingOn,
  submission,
  timer,
  onAmountChange,
  onFold,
  onCheckOrCall,
  onWager,
  onAllIn,
}: {
  state: BettingState;
  amount: number;
  pot: number;
  /** The row's own actions and the slider are held disabled (`actionsLocked`). */
  locked: boolean;
  submission?: GameScreenState["wordSubmission"];
  timer?: TurnTimerView;
  /**
   * Off-turn: the table waits on another seat, so the wager button waits too — WAITING, that
   * seat's name, its clock draining a ring. Omitted on the hero's turn.
   */
  waitingOn?: {
    name?: string;
    view?: TurnTimerView;
  };
  onAmountChange: (amount: number) => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  /** Commits `amount` as the action the button is labelled with — a bet, or a raise. */
  onWager?: () => void;
  onAllIn?: () => void;
}) {
  const scale = useScreenScale();
  const tight = useCompactControls();
  const short = useShortControls();
  // Landscape's side column is narrow: stack check/call above the slider and FOLD/ALL IN
  // instead of the portrait row's slider-beside-wager layout.
  const window = useWindowDimensions();
  const landscape = window.width > window.height;
  const [allInOpen, setAllInOpen] = useState(false);
  // The turn can move on under the sheet — the hero's own clock, most often — and a seat that
  // no longer has a stack to commit is not asked to confirm one.
  if (allInOpen && !state.canAllIn) setAllInOpen(false);

  // Zero selects check/call, including §19's word confirm. Positive amounts are round totals.
  const selectedWager = amount > 0 && (state.canRaise || state.canBet);
  const wagerLabel = selectedWager
    ? (state.wager === "bet" ? "BET" : "RAISE TO")
    : (state.primary === "confirm" ? "SUBMIT WORD" : state.primary === "call" ? "CALL" : "CHECK");
  const canFold = !locked && state.canFold;
  const canCheckOrCall =
    !locked && (state.canCheck || state.callAmount != null);
  const canWager = !locked && (state.canRaise || state.canBet);
  const canAllIn = !locked && state.canAllIn;

  const wagerButton = (
    <CoachTarget id="wager" style={{ flexShrink: 0 }}>
      <CoachTarget id="check">
        {/* The tutorial's hold keeps the disabled look: a lesson that wants the rack
            alone must not dress its controls up as a live wait. */}
        <WagerButton
          waitingOn={locked ? undefined : waitingOn}
          disabled={selectedWager ? !canWager : !canCheckOrCall}
          amount={selectedWager
            ? formatCompactAmount(amount)
            : state.primary === "call" ? formatCompactAmount(state.callAmount ?? 0) : undefined}
          label={wagerLabel}
          onPress={selectedWager ? onWager : onCheckOrCall}
          size={(short ? 88 : 100) * scale}
          testID={selectedWager ? "action-wager" : "action-check-call"}
        />
      </CoachTarget>
    </CoachTarget>
  );

  const sliderAndActions = (
    <View style={styles.leftColumn}>
      <RaiseSlider
        amount={amount}
        disabled={!canWager}
        onAmountChange={onAmountChange}
        pot={pot}
        state={state}
      />
      <CoachTarget
        id="actions"
        style={styles.actionRow}
      >
        {/* The row's controls carry ids as well as labels: the felt's nameplates print
        CHECK, CALL and FOLD as seat status too, so a device flow that matched the
        row by text alone could land on a seat instead of a control (see
        .maestro/native/offline-hand.yaml). */}
        <GameButton
          disabled={!canFold}
          label="FOLD"
          horizontalPadding={8}
          onPress={onFold}
          compact
          scale={scale}
          style={[styles.action, short && styles.actionShort]}
          testID="action-fold"
          variant="danger"
        />
        {wagerButton}
        <GameButton
          disabled={!canAllIn}
          // ALL IN is an action, not an amount: the stack is already on the felt and the
          // confirm sheet still names what it commits.
          label="ALL IN"
          horizontalPadding={8}
          onPress={() => setAllInOpen(true)}
          compact
          scale={scale}
          style={[styles.action, short && styles.actionShort]}
          testID="all-in-button"
          variant="gold"
        />
      </CoachTarget>
    </View>
  );

  if (submission) {
    return (
      <WordSubmissionControls
        status={submission.status}
        timer={timer}
        disabled={!canCheckOrCall}
        onSubmit={onCheckOrCall}
      />
    );
  }

  return (
    <View style={[styles.betting, tight && styles.bettingTight]}>
      <View style={[styles.controls, tight && styles.controlsTight]}>
        <View
          style={[
            styles.raiseActionRow,
            tight && styles.raiseActionRowTight,
            landscape && styles.raiseActionColumn,
          ]}
        >
          {sliderAndActions}
        </View>
      </View>
      <AllInSheet
        amount={state.allInAmount}
        onCancel={() => setAllInOpen(false)}
        onConfirm={() => {
          setAllInOpen(false);
          onAllIn?.();
        }}
        visible={allInOpen}
      />
    </View>
  );
}

/** The row's padding, shared with the waiting table's controls that stand in its place. */
export const bettingRowStyle = {
  paddingBottom: 7,
  paddingHorizontal: 18,
} as const;

const styles = StyleSheet.create({
  betting: bettingRowStyle,
  controls: { paddingHorizontal: 6, paddingVertical: 2 },
  bettingTight: { paddingHorizontal: 12 },
  controlsTight: { paddingVertical: 0 },
  raiseActionRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  raiseActionRowTight: { gap: 4 },
  /** Landscape's side column: check/call, slider and FOLD / ALL IN stack top to bottom. */
  raiseActionColumn: { alignItems: "stretch", flexDirection: "column", gap: 6 },
  /** Slider and FOLD / ALL IN stack at the slider's width, beside the wager button. */
  leftColumn: { flex: 1, gap: 2, marginTop: 14, minWidth: 0 },
  actionRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  /** A control that shares the row's width with its neighbours. */
  action: { flex: 0.7 },
  /** A short portrait window: still a 40-point touch target, under the compact 46. */
  actionShort: { height: 40 },
});
