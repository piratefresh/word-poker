/**
 * balance-chip.tsx — the header's balance. It is the only quantity up there that can be
 * unknown, and each way of not knowing it reads differently to a player: a stalled fetch
 * painted as `$0` would tell them they are broke. So every unknown state gets its own
 * wording, and only the signed-out chip is a control.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  border,
  colors,
  fonts,
  fontSize,
  layout,
  opacity,
  radius,
  spacing,
} from "@/constants/theme";
import { formatAmount, formatAmountCompact } from "@/lib/format";

import type { BalanceView } from "../hud-types";
import { GLASS_EDGE, GLASS_FILL } from "./glass";

const CHIP_HEIGHT = 30;
const CHIP_MAX_WIDTH = 92;

/** Loading needs a placeholder that cannot be mistaken for a figure. */
const LOADING_PLACEHOLDER = "···";
const UNAVAILABLE_PLACEHOLDER = "—";

export function BalanceChip({
  balance,
  onPress,
}: {
  balance: BalanceView;
  onPress?: () => void;
}) {
  if (balance.state === "signed-out") {
    // No handler means no destination, and a chip that looks tappable but does nothing
    // is worse than no chip at all.
    if (!onPress) return null;
    return (
      <Pressable
        accessibilityLabel="Sign in to see your balance"
        accessibilityRole="button"
        hitSlop={layout.hitSlop}
        onPress={onPress}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      >
        <Text style={styles.chipActionText}>SIGN IN</Text>
      </Pressable>
    );
  }

  const ready = balance.state === "ready";
  return (
    <View
      accessibilityLabel={balanceLabel(balance)}
      accessibilityRole="text"
      accessible
      style={styles.chip}
    >
      <Text
        numberOfLines={1}
        style={[styles.chipValue, !ready && styles.chipPlaceholder]}
      >
        {balanceText(balance)}
      </Text>
    </View>
  );
}

/** Spoken balance. The compact value is on screen; the exact one is never dropped. */
function balanceLabel(
  balance: Exclude<BalanceView, { state: "signed-out" }>,
): string {
  switch (balance.state) {
    case "ready":
      return `Balance ${formatAmount(balance.amount)}`;
    case "loading":
      return "Balance loading";
    case "unavailable":
      return "Balance unavailable";
  }
}

function balanceText(
  balance: Exclude<BalanceView, { state: "signed-out" }>,
): string {
  switch (balance.state) {
    case "ready":
      return formatAmountCompact(balance.amount);
    case "loading":
      return LOADING_PLACEHOLDER;
    case "unavailable":
      return UNAVAILABLE_PLACEHOLDER;
  }
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    backgroundColor: GLASS_FILL,
    borderColor: GLASS_EDGE,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    height: CHIP_HEIGHT,
    justifyContent: "center",
    maxWidth: CHIP_MAX_WIDTH,
    paddingHorizontal: spacing.sm,
  },
  chipValue: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.small,
    letterSpacing: 0.5,
  },
  chipPlaceholder: { color: colors.textDim },
  chipActionText: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.2,
  },
  pressed: { opacity: opacity.pressed },
});
