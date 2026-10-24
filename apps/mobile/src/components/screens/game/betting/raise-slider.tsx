import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import Animated, { SlideInRight, SlideOutRight } from "react-native-reanimated";

import { CoachTarget } from "@/components/ui/coach";
import { webTestID } from "@/lib/ui/web-id";
import { fonts, palette, radius } from "@/constants/theme";

import type { BettingState } from "../game-types";
import { formatCompactAmount } from "./format-amount";

/** The tube's height, and the gap that keeps the knob inside it at either end. */
const TUBE_HEIGHT = 300;
const TRACK_INSET = 15;
/** Presets closer than this would overlap their pills. */
const PILL_GAP = 32;

/**
 * The collapsible wager slider: a vertical tube floating over the table's right edge, presets
 * beside it. `amount` 0 is "untouched" (the knob rests at the floor and the action row still
 * offers CLOSE); any positive amount is the round total the RAISE button would commit.
 */
export function RaiseSlider({
  state,
  amount,
  pot,
  open,
  onAmountChange,
  tubeHeight: height = TUBE_HEIGHT,
}: {
  state: BettingState;
  amount: number;
  /** The chips currently in the pot, including this round's commitments. */
  pot: number;
  open: boolean;
  onAmountChange: (amount: number) => void;
  /** The tube's height: shorter where the screen is (a phone on its side). */
  tubeHeight?: number;
}) {
  if (!open) return null;

  const { minRaise, maxRaise } = state;
  const span = Math.max(1, maxRaise - minRaise);
  const usable = height - 2 * TRACK_INSET;
  const progress = amount === 0 ? 0 : Math.max(0, Math.min(1, (amount - minRaise) / span));
  const offset = (fraction: number) => TRACK_INSET + fraction * usable;
  const potAfterCall = pot + (state.callAmount ?? 0);
  const wagerPhrase = state.wager === "bet" ? "bet" : "raise to";

  const amounts = [
    { id: "minimum", label: "MIN", name: "Minimum", amount: minRaise },
    ...POT_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      name: preset.name,
      // Slider amounts are round totals (§22): a fraction of the pot after calling, on top of the
      // current round total.
      amount: state.currentBet + potAfterCall * preset.multiplier,
    })),
    { id: "all-in", label: "ALL IN", name: "All in", amount: maxRaise },
  ].map((preset) => {
    const stepped = Math.round(preset.amount / state.raiseStep) * state.raiseStep;
    const clamped = Math.max(minRaise, Math.min(maxRaise, stepped));
    return { ...preset, amount: clamped, selected: amount === clamped };
  });

  // Bottom-up, push each pill clear of the one below; then top-down, pull any that ran off the
  // top back under it.
  const ys = amounts.map((preset) => offset((preset.amount - minRaise) / span));
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + PILL_GAP);
  ys[ys.length - 1] = Math.min(ys[ys.length - 1], height - TRACK_INSET);
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - PILL_GAP);

  const fromEvent = (event: GestureResponderEvent) => {
    const fraction = 1 - (event.nativeEvent.locationY - TRACK_INSET) / usable;
    onAmountChange(minRaise + Math.max(0, Math.min(1, fraction)) * span);
  };

  return (
    <Animated.View
      entering={SlideInRight.duration(320)}
      exiting={SlideOutRight.duration(200)}
      pointerEvents="box-none"
      style={[styles.panel, { height }]}
    >
      <CoachTarget id="raise" style={{ height }}>
        <View style={[styles.tag, { bottom: height + 6 }]}>
          <Text style={styles.tagText}>{formatCompactAmount(amount === 0 ? minRaise : amount)}</Text>
        </View>
        <View
          testID="wager-slider"
          id={webTestID("wager-slider")}
          accessibilityActions={[
            { name: "increment", label: "Increase wager" },
            { name: "decrement", label: "Decrease wager" },
          ]}
          accessibilityLabel="Wager amount"
          accessibilityRole="adjustable"
          accessibilityValue={{
            min: 0,
            max: maxRaise,
            now: amount,
            text: amount === 0 ? "No wager" : amount >= maxRaise ? `All in, $${amount}` : `$${amount}`,
          }}
          onAccessibilityAction={(event) =>
            onAmountChange(
              event.nativeEvent.actionName === "increment"
                ? (amount === 0 ? minRaise : amount + state.raiseStep)
                : (amount <= minRaise ? 0 : amount - state.raiseStep),
            )
          }
          onMoveShouldSetResponder={() => true}
          onResponderGrant={fromEvent}
          onResponderMove={fromEvent}
          onStartShouldSetResponder={() => true}
          style={[styles.touchArea, { height }]}
        >
          {/* pointerEvents none keeps locationY measured on the touch area, not on the fill or knob. */}
          <View pointerEvents="none" style={[styles.track, { height: height - 2 * TRACK_INSET + 8 }]}>
            <View style={[styles.fill, { height: offset(progress) - TRACK_INSET + 4 }]} />
          </View>
          <View
            pointerEvents="none"
            style={[styles.knob, { bottom: offset(progress) - KNOB / 2 }]}
          />
        </View>
        {amounts.map((preset, i) => (
          <Pressable
            key={preset.label}
            accessibilityLabel={`${preset.name} ${wagerPhrase} ${formatCompactAmount(preset.amount)}`}
            accessibilityRole="button"
            accessibilityState={{ selected: preset.selected }}
            hitSlop={{ top: 4, bottom: 4, right: 4 }}
            id={webTestID(`wager-preset-${preset.id}`)}
            onPress={() => onAmountChange(preset.amount)}
            style={[styles.pill, { bottom: ys[i] - 14 }, preset.selected && styles.pillSelected]}
            testID={`wager-preset-${preset.id}`}
          >
            <Text style={[styles.pillText, preset.selected && styles.pillTextSelected]}>
              {preset.label}
            </Text>
          </Pressable>
        ))}
      </CoachTarget>
    </Animated.View>
  );
}

const KNOB = 26;
const POT_PRESETS = [
  { id: "half-pot", label: "½ POT", name: "Half pot", multiplier: 0.5 },
  { id: "pot", label: "POT", name: "Pot", multiplier: 1 },
  { id: "double-pot", label: "2× POT", name: "Two times pot", multiplier: 2 },
] as const;

const styles = StyleSheet.create({
  /** Sits over the table's right edge, bottom-aligned to the action row it opens from. */
  panel: { width: 132 },
  touchArea: { alignItems: "center", justifyContent: "flex-end", width: 36 },
  track: {
    backgroundColor: "#1a0d06",
    borderColor: "rgba(224,178,90,0.35)",
    borderRadius: 6,
    borderWidth: 1.5,
    bottom: 0,
    justifyContent: "flex-end",
    overflow: "hidden",
    position: "absolute",
    top: TRACK_INSET - 4,
    width: 10,
  },
  fill: { backgroundColor: palette.gold300, width: "100%" },
  knob: {
    backgroundColor: palette.gold300,
    borderColor: "#6b430a",
    borderRadius: radius.pill,
    borderWidth: 2.5,
    boxShadow: "0px 3px 4px rgba(40,20,0,0.65), inset 0px 2px 0px rgba(255,248,220,0.8)",
    height: KNOB,
    left: 5,
    position: "absolute",
    width: KNOB,
  },
  tag: {
    alignSelf: "flex-start",
    backgroundColor: "#1f4a33",
    borderColor: "#e0b25a",
    borderRadius: radius.pill,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 2,
    position: "absolute",
  },
  tagText: { color: palette.cream100, fontFamily: fonts.sansBlack, fontSize: 14 },
  // The pills stand clear of the tube: any overlap steals a drag that starts beside the knob.
  pill: {
    backgroundColor: "#2a1408",
    borderColor: "#e0b25a",
    borderRadius: 8,
    borderWidth: 2,
    left: 40,
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: "absolute",
  },
  pillSelected: { backgroundColor: palette.gold300, borderColor: palette.gold100 },
  pillText: { color: "#f7e7b5", fontFamily: fonts.sansBlack, fontSize: 12, lineHeight: 16 },
  pillTextSelected: { color: "#2a1906" },
});
