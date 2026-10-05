import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import { CoachTarget } from "@/components/ui/coach";
import { colors, fonts, radius } from "@/constants/theme";

import type { BettingState } from "../game-types";
import { useScreenScale } from "../screen-scale";

/** The wager row's slider: its label, the track, and the amount. */
export function RaiseSlider({
  state,
  amount,
  label,
  disabled,
  onAmountChange,
}: {
  state: BettingState;
  amount: number;
  /** BET or RAISE — the action the wager button takes. */
  label: string;
  disabled: boolean;
  onAmountChange: (amount: number) => void;
}) {
  const scale = useScreenScale();
  const [trackWidth, setTrackWidth] = useState(1);

  const range = Math.max(1, state.maxRaise - state.minRaise);
  const progress = (amount - state.minRaise) / range;
  const fromEvent = (event: GestureResponderEvent) => {
    onAmountChange(
      state.minRaise + (event.nativeEvent.locationX / trackWidth) * range,
    );
  };
  return (
    <CoachTarget id="raise" style={styles.raiseRow}>
      <Text
        style={[styles.raiseLabel, scale !== 1 && { fontSize: 9 * scale }]}
      >
        {label}
      </Text>
      <View
        accessibilityActions={[
          { name: "increment", label: "Increase raise" },
          { name: "decrement", label: "Decrease raise" },
        ]}
        accessibilityLabel="Raise amount"
        accessibilityRole="adjustable"
        accessibilityValue={{
          min: state.minRaise,
          max: state.maxRaise,
          now: amount,
          text: `$${amount}`,
        }}
        onAccessibilityAction={(event) =>
          !disabled &&
          onAmountChange(
            amount +
              (event.nativeEvent.actionName === "increment"
                ? state.raiseStep
                : -state.raiseStep),
          )
        }
        onLayout={(event: LayoutChangeEvent) =>
          setTrackWidth(event.nativeEvent.layout.width)
        }
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={fromEvent}
        onResponderMove={fromEvent}
        onStartShouldSetResponder={() => !disabled}
        style={[styles.slider, scale !== 1 && { height: 3 * scale }]}
      >
        <View
          style={[
            styles.sliderFill,
            scale !== 1 && { height: 3 * scale },
            { width: `${progress * 100}%` },
          ]}
        />
        <View
          style={[
            styles.sliderThumb,
            scale !== 1 && {
              height: 14 * scale,
              marginLeft: -7 * scale,
              marginTop: -8.5 * scale,
              width: 14 * scale,
            },
            { left: `${progress * 100}%` },
          ]}
        />
      </View>
      <Text
        style={[
          styles.raiseAmount,
          scale !== 1 && { fontSize: 12 * scale, minWidth: 32 * scale },
        ]}
      >{`${amount.toLocaleString()}`}</Text>
    </CoachTarget>
  );
}

const styles = StyleSheet.create({
  raiseRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 30,
  },
  raiseLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  slider: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    flex: 1,
    height: 3,
    position: "relative",
  },
  sliderFill: { backgroundColor: colors.gold, borderRadius: 2, height: 3 },
  sliderThumb: {
    backgroundColor: colors.gold,
    borderColor: colors.onGold,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 14,
    marginLeft: -7,
    marginTop: -8.5,
    position: "absolute",
    width: 14,
  },
  raiseAmount: {
    color: colors.gold,
    fontFamily: fonts.monoBold,
    fontSize: 12,
    minWidth: 32,
    textAlign: "right",
  },
});
