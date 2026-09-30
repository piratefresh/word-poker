import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { POWER_UPS, type PowerUpId } from "@wordpoker/contracts";

import { colors, fonts, palette } from "@/constants/theme";

import { PowerEmblem } from "./power-emblem";

/** A card's height for its width: a playing card's 5 : 7. */
export const POWER_CARD_ASPECT = 7 / 5;

/**
 * One power as a card: the gold frame, the power's art, its title on a banner and its one line
 * underneath. Every word on it is the catalog's (`POWER_UPS`), never the card's own, so the draw,
 * the held-power chip and the felt's "power used" card read the same copy.
 *
 * The card is only a face, sized by its width: whoever places it owns the press, the motion and
 * what it announces.
 */
export function PowerCard({ id, width }: { id: PowerUpId; width: number }) {
  const power = POWER_UPS[id];
  const height = width * POWER_CARD_ASPECT;
  const frame = Math.max(2, width * 0.035);

  return (
    <LinearGradient
      colors={[palette.gold100, palette.gold400, palette.gold600]}
      end={{ x: 1, y: 1 }}
      start={{ x: 0, y: 0 }}
      style={[styles.frame, { borderRadius: width * 0.08, height, padding: frame, width }]}
    >
      <LinearGradient
        colors={[palette.felt400, palette.felt500, palette.felt800]}
        style={[styles.face, { borderRadius: width * 0.065 }]}
      >
        <View style={[styles.art, { paddingTop: width * 0.06 }]}>
          <PowerEmblem icon={power.icon} size={width * 0.56} />
        </View>
        <View style={[styles.banner, { marginHorizontal: -frame, paddingVertical: width * 0.025 }]}>
          <Text
            adjustsFontSizeToFit
            numberOfLines={1}
            style={[styles.title, { fontSize: width * 0.11 }]}
          >
            {power.title.toUpperCase()}
          </Text>
        </View>
        <Text
          numberOfLines={3}
          style={[
            styles.description,
            { fontSize: width * 0.078, lineHeight: width * 0.1, paddingHorizontal: width * 0.07 },
          ]}
        >
          {power.description}
        </Text>
      </LinearGradient>
    </LinearGradient>
  );
}

/** What a screen reader hears for a card: its name, then what it does. */
export function powerCardLabel(id: PowerUpId): string {
  const power = POWER_UPS[id];
  return `${power.title}: ${power.description}`;
}

const styles = StyleSheet.create({
  frame: {
    shadowColor: "#000",
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  face: { alignItems: "stretch", flex: 1, overflow: "hidden" },
  art: { alignItems: "center", flex: 1, justifyContent: "center" },
  banner: {
    backgroundColor: palette.gold400,
    borderColor: palette.gold100,
    borderBottomWidth: 1,
    borderTopWidth: 1,
  },
  title: {
    color: colors.onGold,
    fontFamily: fonts.arcade,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  description: {
    color: colors.textBright,
    fontFamily: fonts.sansMedium,
    paddingBottom: 8,
    paddingTop: 6,
    textAlign: "center",
  },
});
