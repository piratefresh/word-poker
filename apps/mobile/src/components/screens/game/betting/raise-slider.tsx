import { useState, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import { CoachTarget } from "@/components/ui/coach";
import { colors, fonts, palette, radius } from "@/constants/theme";

import type { BettingState } from "../game-types";
import { useCompactControls, useScreenScale } from "../screen-scale";

/** The wager row's slider: its label, the track, and the amount. */
export function RaiseSlider({
  state,
  amount,
  label,
  disabled,
  onAmountChange,
  children,
}: {
  /** Drawn after the amount box: the panel's All In. */
  children?: ReactNode;
  state: BettingState;
  amount: number;
  /** BET or RAISE — the action the wager button takes. */
  label: string;
  disabled: boolean;
  onAmountChange: (amount: number) => void;
}) {
  const scale = useScreenScale();
  const tight = useCompactControls();
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
      <Text style={[styles.raiseLabel, scale !== 1 && { fontSize: 9 * scale }]}>
        {label === "BET" ? label : `${label} TO`}
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
        style={[
          styles.touchArea,
          tight && { height: 28 },
          scale !== 1 && { height: 36 * scale },
        ]}
      >
        {/* The touch area is the tall hit target; pointerEvents none keeps locationX measured on
            it (same width as the track), not on the fill or thumb. */}
        <View
          pointerEvents="none"
          style={[styles.slider, scale !== 1 && { height: 6 * scale }]}
        >
          <View
            style={[
              styles.sliderFill,
              scale !== 1 && { height: 6 * scale },
              { width: `${progress * 100}%` },
            ]}
          />
          <View
            style={[
              styles.sliderThumb,
              scale !== 1 && {
                height: 24 * scale,
                marginLeft: -12 * scale,
                marginTop: -9 * scale,
                width: 24 * scale,
              },
              { left: `${progress * 100}%` },
            ]}
          />
        </View>
      </View>
      <View style={styles.amountBox}>
        <Text
          style={[
            styles.raiseAmount,
            scale !== 1 && { fontSize: 13 * scale, minWidth: 40 * scale },
          ]}
        >{`${amount.toLocaleString()}`}</Text>
      </View>
      {children}
    </CoachTarget>
  );
}

/** Dark brown ink for the cream panel. */
const WOOD_INK = "#3c240c";

const styles = StyleSheet.create({
  raiseRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 30,
  },
  raiseLabel: {
    color: WOOD_INK,
    fontFamily: fonts.arcade,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  touchArea: { flex: 1, height: 36, justifyContent: "center" },
  slider: {
    backgroundColor: "rgba(60,36,12,0.5)",
    borderRadius: 4,
    boxShadow:
      "inset 0px 1px 2px rgba(0,0,0,0.6), 0px 1px 0px rgba(255,255,255,0.6)",
    height: 6,
    position: "relative",
  },
  sliderFill: {
    backgroundColor: colors.gold,
    borderRadius: 4,
    boxShadow: "inset 0px 1px 0px rgba(255,248,220,0.8)",
    height: 6,
  },
  sliderThumb: {
    backgroundColor: colors.gold,
    borderColor: "#8a5a0c",
    borderRadius: radius.pill,
    borderWidth: 2,
    boxShadow:
      "0px 2px 3px rgba(40,20,0,0.55), inset 0px 2px 0px rgba(255,248,220,0.8)",
    height: 24,
    marginLeft: -12,
    marginTop: -9,
    position: "absolute",
    width: 24,
  },
  amountBox: {
    backgroundColor: palette.cream100,
    borderColor: "rgba(60,36,12,0.4)",
    borderRadius: radius.sm,
    borderWidth: 1,
    boxShadow:
      "inset 0px 2px 3px rgba(80,50,10,0.3), 0px 1px 0px rgba(255,255,255,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  raiseAmount: {
    color: WOOD_INK,
    fontFamily: fonts.monoBold,
    fontSize: 13,
    minWidth: 40,
    textAlign: "right",
  },
});
