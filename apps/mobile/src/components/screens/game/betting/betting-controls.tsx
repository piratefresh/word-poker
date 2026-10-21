import { useState } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import type { ReactNode } from "react";

import type { TurnTimerView } from "@/components/hud/turn-clock";
import { CoachTarget } from "@/components/ui/coach";
import { GameButton } from "@/components/ui/game-button";

import type { BettingState } from "../game-types";
import { useCompactControls, useScreenScale, useShortControls } from "../screen-scale";
import { AllInSheet } from "./all-in-sheet";
import { formatCompactAmount } from "./format-amount";
import { RaiseSlider } from "./raise-slider";
import { WagerButton } from "./wager-button";

/** Whether the check/call control is live: not held, and one of its two faces is available. */
export function canCheckOrCall(state: BettingState, locked: boolean): boolean {
  return !locked && (state.canCheck || state.callAmount != null);
}

/** Whether a wager — a bet or a raise — can be made at all. */
export function canWager(state: BettingState, locked: boolean): boolean {
  return !locked && (state.canRaise || state.canBet);
}

/** The portrait betting row: the slider above the seat actions it sets the amount for. */
export function BettingControls({
  state,
  amount,
  pot,
  locked,
  waitingOn,
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
  const tight = useCompactControls();

  return (
    <View style={[styles.betting, tight && styles.bettingTight]}>
      <View style={[styles.controls, tight && styles.controlsTight]}>
        <View style={styles.sliderColumn}>
          <RaiseSlider
            amount={amount}
            disabled={!canWager(state, locked)}
            onAmountChange={onAmountChange}
            pot={pot}
            state={state}
          />
          <SeatActions
            amount={amount}
            locked={locked}
            onAllIn={onAllIn}
            onCheckOrCall={onCheckOrCall}
            onFold={onFold}
            onWager={onWager}
            state={state}
            waitingOn={waitingOn}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * The row of seat actions — fold, the wager or check/call, all in — drawn wherever the felt
 * puts it: under the slider in portrait, or spanning the whole controls panel in landscape with
 * a mode's own controls (`leading`, the word builder's shuffle and word check) beside them.
 */
export function SeatActions({
  state,
  amount,
  locked,
  waitingOn,
  leading,
  onFold,
  onCheckOrCall,
  onWager,
  onAllIn,
}: {
  state: BettingState;
  amount: number;
  locked: boolean;
  waitingOn?: {
    name?: string;
    view?: TurnTimerView;
  };
  /** A mode's own controls leading the row; nothing, where the felt draws none. */
  leading?: ReactNode;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  /** Commits `amount` as the action the button is labelled with — a bet, or a raise. */
  onWager?: () => void;
  onAllIn?: () => void;
}) {
  const scale = useScreenScale();
  const short = useShortControls();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
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

  return (
    <>
      <CoachTarget
        id="actions"
        style={[styles.actionRow, landscape && styles.actionRowLandscape]}
      >
        {leading == null ? null : <View style={styles.leading}>{leading}</View>}
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
          style={[styles.action, short && styles.actionShort, landscape && styles.actionLoose]}
          testID="action-fold"
          variant="danger"
        />
        <CoachTarget id="wager" style={{ flexShrink: 0 }}>
          <CoachTarget id="check">
            {/* The tutorial's hold keeps the disabled look: a lesson that wants the rack
            alone must not dress its controls up as a live wait. */}
            <WagerButton
              waitingOn={locked ? undefined : waitingOn}
              disabled={selectedWager ? !canWager(state, locked) : !canCheckOrCall(state, locked)}
              amount={selectedWager
                ? formatCompactAmount(amount)
                : state.primary === "call" ? formatCompactAmount(state.callAmount ?? 0) : undefined}
              label={wagerLabel}
              onPress={selectedWager ? onWager : onCheckOrCall}
              size={(landscape && height < 450 ? 68 : short ? 88 : 100) * scale}
              testID={selectedWager ? "action-wager" : "action-check-call"}
            />
          </CoachTarget>
        </CoachTarget>
        <GameButton
          // ALL IN is an action, not an amount: the stack is already on the felt and the
          // confirm sheet still names what it commits.
          disabled={locked || !state.canAllIn}
          label="ALL IN"
          horizontalPadding={8}
          onPress={() => setAllInOpen(true)}
          compact
          scale={scale}
          style={[styles.action, short && styles.actionShort, landscape && styles.actionLoose]}
          testID="all-in-button"
          variant="gold"
        />
      </CoachTarget>
      <AllInSheet
        amount={state.allInAmount}
        onCancel={() => setAllInOpen(false)}
        onConfirm={() => {
          setAllInOpen(false);
          onAllIn?.();
        }}
        visible={allInOpen}
      />
    </>
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
  /** The slider above the actions; the margin is the wager artwork's transparent room. */
  sliderColumn: { flex: 1, gap: 2, marginTop: 14, minWidth: 0 },
  actionRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  /** Landscape: the row spans the felt's whole controls panel, the mode's controls at one
   *  end and the seat actions spread across to the other. */
  actionRowLandscape: { gap: 0, justifyContent: "space-between", paddingHorizontal: 12 },
  leading: { flexDirection: "row", gap: 8 },
  /** A control that shares the row's width with its neighbours. */
  action: { flex: 0.7 },
  /** Landscape's spread row: each control keeps its own width rather than growing into it. */
  actionLoose: { flex: 0 },
  /** A short portrait window: still a 40-point touch target, under the compact 46. */
  actionShort: { height: 40 },
});
