import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import { CoachTarget } from "@/components/ui/coach";
import { webTestID } from "@/lib/web-id";
import { fonts, palette, radius } from "@/constants/theme";

import type { BettingState } from "../game-types";
import { useCompactControls, useScreenScale } from "../screen-scale";
import { formatCompactAmount } from "./format-amount";

/** The wager slider. */
export function RaiseSlider({
  state,
  amount,
  pot,
  disabled,
  onAmountChange,
}: {
  state: BettingState;
  amount: number;
  /** The chips currently in the pot, including this round's commitments. */
  pot: number;
  disabled: boolean;
  onAmountChange: (amount: number) => void;
}) {
  const scale = useScreenScale();
  const tight = useCompactControls();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [trackWidth, setTrackWidth] = useState(1);

  const range = Math.max(1, state.maxRaise - state.minRaise + state.raiseStep);
  const progress = amount === 0 ? 0 : (amount - state.minRaise + state.raiseStep) / range;
  const potAfterCall = pot + (state.callAmount ?? 0);
  const wagerPhrase = state.wager === "bet" ? "bet" : "raise to";
  const presets = POT_PRESETS.map((preset) => {
    // Slider amounts are round totals (§22): add a fraction of the pot after calling to the
    // current round total. In an unopened round, this reduces to a fraction of the pot.
    const desired = state.currentBet + potAfterCall * preset.multiplier;
    const available =
      !disabled && desired >= state.minRaise && desired <= state.maxRaise;
    const stepped = Math.round(desired / state.raiseStep) * state.raiseStep;
    const presetAmount = Math.max(
      state.minRaise,
      Math.min(state.maxRaise, stepped),
    );
    return {
      ...preset,
      amount: presetAmount,
      available,
      selected: available && amount === presetAmount,
    };
  });
  const fromEvent = (event: GestureResponderEvent) => {
    const position = Math.max(0, Math.min(1, event.nativeEvent.locationX / trackWidth)) * range;
    onAmountChange(position < state.raiseStep / 2 ? 0 : Math.max(state.minRaise, state.minRaise + position - state.raiseStep));
  };
  return (
    <CoachTarget id="raise" style={styles.raiseRow}>
      <View
        style={[
          styles.presetRow,
          { marginHorizontal: 12 * scale },
          landscape && styles.presetRowLandscape,
        ]}
      >
        {presets.map((preset) => (
          <Pressable
            key={preset.label}
            accessibilityLabel={[
              preset.accessibilityLabel,
              wagerPhrase,
              formatCompactAmount(preset.amount),
            ].join(" ")}
            accessibilityRole="button"
            accessibilityState={{ selected: preset.selected }}
            disabled={!preset.available}
            hitSlop={{ top: 7, bottom: 7, left: 5, right: 5 }}
            onPress={() => onAmountChange(preset.amount)}
            style={({ pressed }) => [
              styles.presetButton,
              preset.available && pressed && styles.presetButtonPressed,
              !preset.available && styles.presetButtonDisabled,
            ]}
          >
            <View
              style={[
                styles.flagBadge,
                landscape && { paddingHorizontal: 3 * scale },
                preset.selected && styles.flagBadgeSelected,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.flagText,
                  landscape && { fontSize: 10 * scale },
                  preset.selected && styles.flagTextSelected,
                ]}
              >
                {preset.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.trackRow}>
        <View
          testID="wager-slider"
          id={webTestID("wager-slider")}
          accessibilityActions={[
            { name: "increment", label: "Increase wager" },
            { name: "decrement", label: "Decrease wager or return to check or call" },
          ]}
          accessibilityLabel="Wager amount"
          accessibilityRole="adjustable"
          accessibilityValue={{
            min: 0,
            max: state.maxRaise,
            now: amount,
            text: amount === 0 ? (state.primary === "call" ? `Call $${state.callAmount ?? 0}` : "Check") : `$${amount}`,
          }}
          onAccessibilityAction={(event) =>
            !disabled &&
            onAmountChange(
              event.nativeEvent.actionName === "increment"
                ? (amount === 0 ? state.minRaise : amount + state.raiseStep)
                : (amount <= state.minRaise ? 0 : amount - state.raiseStep),
            )
          }
          onLayout={(event: LayoutChangeEvent) =>
            setTrackWidth(event.nativeEvent.layout.width)
          }
          onMoveShouldSetResponder={() => !disabled}
          onResponderGrant={fromEvent}
          onResponderMove={fromEvent}
          onStartShouldSetResponder={() => !disabled}
          style={[
            styles.touchArea,
            { marginHorizontal: 12 * scale }, // room for the thumb's overhang
            tight && { height: 28 },
            scale !== 1 && { height: 36 * scale },
          ]}
        >
          {/* The touch area is the tall hit target; pointerEvents none keeps locationX measured on
            it (same width as the track), not on the fill or thumb. */}
          <View
            pointerEvents="none"
            style={[styles.slider, scale !== 1 && { height: 10 * scale }]}
          >
            <View
              style={[
                styles.sliderFill,
                scale !== 1 && { height: 10 * scale },
                { width: `${progress * 100}%` },
              ]}
            />
            <View
              style={[
                styles.sliderThumb,
                scale !== 1 && {
                  height: 24 * scale,
                  marginLeft: -12 * scale,
                  marginTop: -10 * scale,
                  width: 24 * scale,
                },
                { left: `${progress * 100}%` },
              ]}
            />
          </View>
        </View>
      </View>
    </CoachTarget>
  );
}

const POT_PRESETS = [
  { label: "½ POT", accessibilityLabel: "Half pot", multiplier: 0.5 },
  { label: "POT", accessibilityLabel: "Pot", multiplier: 1 },
  { label: "2× POT", accessibilityLabel: "Two times pot", multiplier: 2 },
] as const;

const styles = StyleSheet.create({
  raiseRow: { flex: 1, minWidth: 0 },
  presetRow: { flexDirection: "row", height: 30, marginBottom: 2 },
  presetRowLandscape: { marginHorizontal: 0 },
  presetButton: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
  },
  presetButtonPressed: { transform: [{ translateY: 1 }] },
  presetButtonDisabled: { opacity: 0.38 },
  flagBadge: {
    alignItems: "center",
    backgroundColor: "rgba(60,36,12,0.88)",
    borderColor: palette.gold400,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  flagBadgeSelected: {
    backgroundColor: palette.gold300,
    borderColor: palette.gold100,
  },
  flagText: {
    color: palette.cream100,
    fontFamily: fonts.sansBlack,
    fontSize: 12,
    lineHeight: 14,
  },
  flagTextSelected: { color: "#3c240c" },
  trackRow: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
    minHeight: 30,
  },
  touchArea: { flex: 1, height: 36, justifyContent: "center" },
  slider: {
    backgroundColor: "rgba(60,36,12,0.55)",
    borderColor: "#5a3a14",
    borderRadius: 6,
    borderWidth: 1.5,
    boxShadow: "inset 0px 2px 3px rgba(0,0,0,0.7)",
    height: 10,
    position: "relative",
  },
  sliderFill: {
    backgroundColor: "#ffc500",
    borderRadius: 4,
    boxShadow:
      "inset 0px 1px 0px rgba(255,248,220,0.9), inset 0px -2px 0px rgba(138,90,12,0.45)",
    height: 7,
  },
  sliderThumb: {
    backgroundColor: "#ffc500",
    borderColor: "#6b430a",
    borderRadius: radius.pill,
    borderWidth: 2.5,
    boxShadow:
      "0px 3px 4px rgba(40,20,0,0.65), inset 0px 2px 0px rgba(255,248,220,0.8)",
    height: 24,
    marginLeft: -12,
    marginTop: -10,
    position: "absolute",
    width: 24,
  },
});
