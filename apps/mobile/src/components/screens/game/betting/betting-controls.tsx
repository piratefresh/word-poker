import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { CoachTarget } from "@/components/ui/coach";
import { GameButton } from "@/components/ui/game-button";
import { palette } from "@/constants/theme";

import type { BettingState } from "../game-types";
import { useCompactControls, useScreenScale } from "../screen-scale";
import { AllInSheet } from "./all-in-sheet";
import { formatCompactAmount } from "./format-amount";
import { RaiseSlider } from "./raise-slider";

export function BettingControls({
  state,
  amount,
  locked,
  onAmountChange,
  onFold,
  onCheckOrCall,
  onWager,
  onAllIn,
}: {
  state: BettingState;
  amount: number;
  /** The row's own actions and the slider are held disabled (`actionsLocked`). */
  locked: boolean;
  onAmountChange: (amount: number) => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  /** Commits `amount` as the action the button is labelled with — a bet, or a raise. */
  onWager?: () => void;
  onAllIn?: () => void;
}) {
  const scale = useScreenScale();
  const tight = useCompactControls();
  const [allInOpen, setAllInOpen] = useState(false);
  // The turn can move on under the sheet — the hero's own clock, most often — and a seat that
  // no longer has a stack to commit is not asked to confirm one.
  if (allInOpen && !state.canAllIn) setAllInOpen(false);

  // §19's window keeps the check's own word on the confirm: the row's check is what locks it in.
  // The same slider opens the round or raises it: with no bet out the action is a bet, and
  // the amount is the round total either way (§22).
  const wagerLabel = state.wager === "bet" ? "BET" : "RAISE";
  const canFold = !locked && state.canFold;
  const canCheckOrCall =
    !locked && (state.canCheck || state.callAmount != null);
  const canWager = !locked && (state.canRaise || state.canBet);
  const canAllIn = !locked && state.canAllIn;
  return (
    <View style={[styles.betting, tight && styles.bettingTight]}>
      <View style={[styles.panel, tight && styles.panelTight]}>
        <RaiseSlider
          amount={amount}
          disabled={!canWager}
          label={wagerLabel}
          onAmountChange={onAmountChange}
          state={state}
        >
          <GameButton
            disabled={!canAllIn}
            // ALL IN is an action, not an amount: the stack is already on the felt and the
            // confirm sheet still names what it commits.
            label="ALL IN"
            horizontalPadding={8}
            onPress={() => setAllInOpen(true)}
            compact
            scale={scale}
            style={styles.allIn}
            testID="all-in-button"
            variant="gold"
          />
        </RaiseSlider>
        <CoachTarget
          id="actions"
          style={[styles.actionRow, tight && styles.actionRowTight]}
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
            compact={tight}
            scale={scale}
            style={styles.action}
            testID="action-fold"
            variant="danger"
          />
          {/* Check and the wager are coach targets of their own, so a lesson can point at the one
            press it asks for; the target takes the button's share of the row. */}
          <CoachTarget
            id="check"
            style={[styles.callAction, { minWidth: 48 * scale }]}
          >
            <GameButton
              disabled={!canCheckOrCall}
              amount={
                state.primary === "call"
                  ? formatCompactAmount(state.callAmount ?? 0)
                  : undefined
              }
              label={state.primary === "call" ? "CALL" : "CHECK"}
              horizontalPadding={8}
              onPress={onCheckOrCall}
              compact={tight}
              scale={scale}
              variant="blue"
              // The one control the row arms for two actions, so a test cannot name it by its label:
              // the felt's nameplates print CHECK and CALL as seat status too, and a text selector
              // lands on whichever the tree puts first.
              testID="action-check-call"
            />
          </CoachTarget>
          <CoachTarget
            id="wager"
            style={[styles.wideAction, { minWidth: 48 * scale }]}
          >
            <GameButton
              disabled={!canWager}
              amount={formatCompactAmount(amount)}
              label={wagerLabel}
              horizontalPadding={8}
              onPress={onWager}
              compact={tight}
              scale={scale}
              testID="action-wager"
              variant="gold"
            />
          </CoachTarget>
        </CoachTarget>
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

/** The cream panel the raise row and the actions sit on. */
const panelStyle = {
  backgroundColor: palette.cream200,
  borderColor: "rgba(60,36,12,0.45)",
  borderRadius: 14,
  borderWidth: 2,
  paddingHorizontal: 10,
  paddingVertical: 6,
} as const;

const styles = StyleSheet.create({
  betting: bettingRowStyle,
  panel: panelStyle,
  bettingTight: { paddingHorizontal: 12 },
  panelTight: { borderWidth: 1, paddingVertical: 3 },
  actionRowTight: { gap: 4 },
  actionRow: { flexDirection: "row", gap: 6, paddingTop: 4 },
  /** A control that shares the row's width with its neighbours. */
  action: { flex: 0.8 },
  /** Keep the label-only actions narrower; call and raise also have amounts to fit. */
  callAction: { flex: 1.1 },
  wideAction: { flex: 1.25 },
  allIn: { minWidth: 64 },
});
