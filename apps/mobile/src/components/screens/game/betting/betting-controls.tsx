import { useEffect, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import type { TurnTimerView } from "@/components/hud/turn-clock";
import { CoachTarget } from "@/components/ui/coach";
import { rackFor } from "@/components/word-builder/strip";
import { GameButton } from "@/components/ui/game-button";

import type { BettingState, GameScreenState } from "../game-types";
import { useCompactControls, useScreenScale, useShortControls } from "../screen-scale";
import { AllInSheet } from "./all-in-sheet";
import { formatCompactAmount } from "./format-amount";
import { WagerButton } from "./wager-button";
import { WordSubmissionControls } from "./word-submission-controls";

export function BettingControls({
  state,
  amount,
  locked,
  waitingOn,
  submission,
  timer,
  raiseOpen,
  onRaiseAnchor,
  onRaiseOpenChange,
  onFold,
  onCheckOrCall,
  onWager,
  onAllIn,
}: {
  state: BettingState;
  amount: number;
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
  /** The wager slider's panel is drawn by the screen over the table; this row only toggles it. */
  raiseOpen: boolean;
  /** Where the raise button sits in the window, so the slider can stand right above it. */
  onRaiseAnchor?: (anchor: { x: number; y: number; width: number }) => void;
  onRaiseOpenChange: (open: boolean) => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  /** Commits `amount` as the action the button is labelled with — a bet, or a raise. */
  onWager?: () => void;
  onAllIn?: () => void;
}) {
  const scale = useScreenScale();
  const tight = useCompactControls();
  const short = useShortControls();
  // Landscape's right thumb is plain buttons in a row of their own (`landscapeButton`).
  const window = useWindowDimensions();
  const landscape = window.width > window.height;
  const [allInOpen, setAllInOpen] = useState(false);
  const raiseRef = useRef<View>(null);
  // The turn can move on under the sheet — the hero's own clock, most often — and a seat that
  // no longer has a stack to commit is not asked to confirm one.
  if (allInOpen && !state.canAllIn) setAllInOpen(false);

  // The middle button is always the check/call (§19's word confirm included); the RAISE button
  // opens the slider and, once an amount is picked, commits it. Positive amounts are round totals.
  const wagerLabel =
    state.primary === "confirm" ? "SUBMIT WORD" : state.primary === "call" ? "CALL" : "CHECK";
  const canFold = !locked && state.canFold;
  const canCheckOrCall =
    !locked && (state.canCheck || state.callAmount != null);
  const canWager = !locked && (state.canRaise || state.canBet);
  const canAllIn = !locked && state.canAllIn;
  const dirty = amount > 0;
  const atMax = dirty && amount >= state.maxRaise;

  // Measured again as the slider opens: on the web a layout fires on a resize, not a move, so the
  // row settling after its first layout (a phone on its side) would leave the tube off the button.
  const measureRaise = () =>
    raiseRef.current?.measureInWindow((x, y, width) => onRaiseAnchor?.({ x, y, width }));

  // A turn that ends under the slider — the clock, a fold elsewhere — takes the slider with it.
  const overUnderSlider = raiseOpen && (!canWager || waitingOn !== undefined);
  useEffect(() => {
    if (overUnderSlider) onRaiseOpenChange(false);
  }, [overUnderSlider, onRaiseOpenChange]);

  /** Any action closes the slider. */
  const closing = (act?: () => void) => () => {
    onRaiseOpenChange(false);
    act?.();
  };

  // One button, four faces: RAISE ▲ opens, CLOSE ▼ backs out untouched, CONFIRM commits the
  // picked amount, and ALL IN stands in at the stack — or when the stack is too short to raise.
  const raise = (!canWager && canAllIn) || atMax
    ? { id: "all-in-button", label: "ALL IN", amount: atMax ? formatCompactAmount(amount) : undefined, variant: "gold" as const, disabled: !canAllIn, onPress: () => setAllInOpen(true) }
    : dirty
      ? { id: "action-wager", label: "CONFIRM", amount: formatCompactAmount(amount), variant: "gold" as const, disabled: !canWager, onPress: closing(onWager) }
      : raiseOpen
        ? { id: "action-raise", label: "CLOSE ▼", amount: undefined, variant: "dark" as const, disabled: !canWager, onPress: closing() }
        : { id: "action-raise", label: `${state.wager === "bet" ? "BET" : "RAISE"} ▲`, amount: undefined, variant: "gold" as const, disabled: !canWager, onPress: () => { measureRaise(); onRaiseOpenChange(true); } };

  // Landscape's right thumb (mocks 3a, 4a–4c): Fold and Raise one width, the round wager button
  // between them a tile across, so the row stands one tile tall.
  const tile = Math.round(rackFor(window).itemWidth);
  // A phone on its side shares one row with the rack, so its buttons run small: 0.8 of a tile.
  const buttonScale = landscape ? 0.8 : scale;
  const landscapeButton = landscape && {
    height: Math.round(tile * 0.8),
    width: LANDSCAPE_BUTTON_WIDTH[tile] ?? Math.round(tile * 1.5),
  };
  const wagerButton = (
    // Landscape's disc takes a tile of the row and lets its artwork's clear room overhang it.
    <CoachTarget
      id="wager"
      style={[{ flexShrink: 0 }, landscape && { alignItems: "center", width: Math.round(tile * 0.85) }]}
    >
      <CoachTarget id="check">
        {/* The tutorial's hold keeps the disabled look: a lesson that wants the rack
            alone must not dress its controls up as a live wait. */}
        <WagerButton
          waitingOn={locked ? undefined : waitingOn}
          disabled={!canCheckOrCall}
          amount={state.primary === "call" ? formatCompactAmount(state.callAmount ?? 0) : undefined}
          label={wagerLabel}
          onPress={closing(onCheckOrCall)}
          // The artwork has clear room round its disc: 1.7 tiles draws the disc about 1.2 tiles across.
          size={landscape ? tile * 1.4 : (short ? 104 : 124) * scale}
          testID="action-check-call"
        />
      </CoachTarget>
    </CoachTarget>
  );

  const actions = (
    <CoachTarget
      id="actions"
      style={[styles.actionRow, landscape && styles.actionRowLandscape]}
    >
      {/* The row's controls carry ids as well as labels: the felt's nameplates print
      CHECK, CALL and FOLD as seat status too, so a device flow that matched the
      row by text alone could land on a seat instead of a control (see
      .maestro/native/offline-hand.yaml). */}
      <GameButton
        disabled={!canFold}
        label="FOLD"
        horizontalPadding={8}
        onPress={closing(onFold)}
        compact
        scale={buttonScale}
        style={landscapeButton || [styles.action, short && styles.actionShort]}
        testID="action-fold"
        variant="danger"
      />
      {wagerButton}
      <View
        ref={raiseRef}
        onLayout={measureRaise}
        style={landscapeButton || styles.action}
      >
      <GameButton
        amount={raise.amount}
        disabled={raise.disabled}
        label={raise.label}
        horizontalPadding={8}
        onPress={raise.onPress}
        compact
        scale={buttonScale}
        style={landscapeButton ? { height: landscapeButton.height } : short && styles.actionShort}
        testID={raise.id}
        variant={raise.variant}
      />
      </View>
    </CoachTarget>
  );

  if (submission) {
    return (
      <WordSubmissionControls
        status={submission.status}
        timer={timer}
        disabled={!canCheckOrCall}
        canFold={canFold}
        onSubmit={onCheckOrCall}
        onFold={onFold}
      />
    );
  }

  const allInSheet = (
    <AllInSheet
      amount={state.allInAmount}
      onCancel={() => setAllInOpen(false)}
      onConfirm={() => {
        setAllInOpen(false);
        closing(onAllIn)();
      }}
      visible={allInOpen}
    />
  );

  if (landscape) {
    return (
      <View testID="betting-controls-panel">
        {actions}
        {allInSheet}
      </View>
    );
  }

  return (
    <View
      style={[styles.betting, tight && styles.bettingTight]}
      testID="betting-controls-panel"
    >
      <View style={[styles.controls, tight && styles.controlsTight]}>
        <View
          style={[styles.raiseActionRow, tight && styles.raiseActionRowTight]}
        >
          {actions}
        </View>
      </View>
      {allInSheet}
    </View>
  );
}

/** The row's padding, shared with the waiting table's controls that stand in its place. */
export const bettingRowStyle = {
  paddingBottom: 7,
  paddingHorizontal: 18,
} as const;

/** Landscape's Fold and Raise width for each tile size; 1.7 tiles otherwise. Floor is CONFIRM fitting. */
const LANDSCAPE_BUTTON_WIDTH: Record<number, number> = { 40: 58, 44: 62, 48: 68 };

const styles = StyleSheet.create({
  betting: bettingRowStyle,
  controls: { paddingHorizontal: 6, paddingVertical: 2 },
  bettingTight: { paddingHorizontal: 12 },
  controlsTight: { paddingVertical: 0 },
  raiseActionRow: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 14 },
  raiseActionRowTight: { gap: 4 },
  actionRow: { alignItems: "center", flex: 1, flexDirection: "row", gap: 6 },
  /** Landscape's right thumb: its buttons keep their own width, 8 apart. */
  actionRowLandscape: { flexBasis: "auto", flexGrow: 0, gap: 8 },
  /** A control that shares the row's width with its neighbours. */
  action: { flex: 0.5 },
  /** A short portrait window: still a 40-point touch target, under the compact 46. */
  actionShort: { height: 40 },
});
