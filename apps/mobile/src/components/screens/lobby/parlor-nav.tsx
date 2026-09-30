/**
 * parlor-nav.tsx — the room's top rail: the way back, the room's name, and whose seat this is.
 *
 * The lobby is pushed from the menu, so the chevron is a way back to it rather than a tab root's
 * ornament. Both ends are drawn at the size the design gives them and are padded out to a 44pt
 * touch with `hitSlop`, because a 32pt circle is a target a thumb misses.
 */

import { type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  border,
  colors,
  fonts,
  fontSize,
  layout,
  palette,
  radius,
  spacing,
} from "@/constants/theme";

export interface ParlorNavProps {
  onBack: () => void;
  /** The signed-in player, as the session names them; absent while there is no session. */
  me?: string | null;
}

export function ParlorNav({ onBack, me }: ParlorNavProps): ReactElement {
  const name = me?.trim();
  const initial =
    name === undefined || name.length === 0
      ? null
      : name.charAt(0).toUpperCase();

  return (
    <View style={styles.nav}>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        hitSlop={layout.hitSlop}
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        testID="parlor-back"
      >
        <Svg height={13} viewBox="0 0 9 13" width={9}>
          <Path
            d="M7 1L2 6.5L7 12"
            fill="none"
            stroke={colors.gold}
            strokeLinecap="round"
            strokeWidth={1.5}
          />
        </Svg>
      </Pressable>

      <View
        accessibilityLabel={
          initial === null ? "Signed out" : `Signed in as ${name}`
        }
        accessibilityRole="image"
        accessible
        style={styles.avatar}
        testID="parlor-avatar"
      >
        <Text style={styles.initial}>{initial ?? "·"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.gutter,
  },
  back: {
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  pressed: {
    opacity: 0.7,
  },
  eyebrow: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 2,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: palette.gold300,
    borderRadius: radius.pill,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  initial: {
    color: colors.onGold,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small,
  },
});
