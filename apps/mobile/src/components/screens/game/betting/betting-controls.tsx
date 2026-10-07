import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { CoachTarget } from "@/components/ui/coach";
import { GameButton } from "@/components/ui/game-button";

import type { BettingState } from "../game-types";
import { useCompactControls, useScreenScale } from "../screen-scale";
import { AllInSheet } from "./all-in-sheet";
import { formatCompactAmount } from "./format-amount";
import { RaiseSlider } from "./raise-slider";

export function BettingControls({
  state,
  amount,
  pot,
  locked,
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
      <View style={[styles.controls, tight && styles.controlsTight]}>
        <View style={[styles.raiseActionRow, tight && styles.raiseActionRowTight]}>
          <RaiseSlider
            amount={amount}
            disabled={!canWager}
            onAmountChange={onAmountChange}
            pot={pot}
            state={state}
          />
          <CoachTarget
            id="wager"
            style={[styles.wagerAction, { minWidth: 76 * scale }]}
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
        </View>
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
          {/* The check is a coach target of its own, so a lesson can point at the one press it asks
          for. */}
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
          <GameButton
            disabled={!canAllIn}
            // ALL IN is an action, not an amount: the stack is already on the felt and the
            // confirm sheet still names what it commits.
            label="ALL IN"
            horizontalPadding={8}
            onPress={() => setAllInOpen(true)}
            compact={tight}
            scale={scale}
            style={styles.allIn}
            testID="all-in-button"
            variant="gold"
          />
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

const styles = StyleSheet.create({
  betting: bettingRowStyle,
  controls: { paddingHorizontal: 10, paddingVertical: 8 },
  bettingTight: { paddingHorizontal: 12 },
  controlsTight: { paddingVertical: 4 },
  raiseActionRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  raiseActionRowTight: { gap: 4 },
  actionRowTight: { gap: 4 },
  actionRow: { flexDirection: "row", gap: 6, paddingTop: 4 },
  /** A control that shares the row's width with its neighbours. */
  action: { flex: 1 },
  /** Keep the call action and raise action large enough for their amounts. */
  callAction: { flex: 1 },
  wagerAction: { flexShrink: 0 },
  allIn: { minWidth: 64 },
});
