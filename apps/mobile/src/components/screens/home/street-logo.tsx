import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";

const ROWS = ["WORD", "POKER"] as const;
const TILTS = [-4, -1, 2, 4, -2, 1, 3, -3, 2];

/** The menu's permanent title. The animated word-building demo remains in tile-logo.tsx. */
export function StreetLogo({ width }: { width: number }) {
  const tileWidth = (width - 4 * 6) / 5;
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="Word Poker"
      pointerEvents="none"
      style={[styles.logo, { width }]}
      testID="street-logo"
    >
      {ROWS.map((word, row) => (
        <View key={word} style={styles.row} aria-hidden>
          {[...word].map((letter, col) => (
            <View
              key={letter}
              testID={`street-logo-${letter}`}
              style={[
                styles.tile,
                letter === "K" && styles.wild,
                {
                  width: tileWidth,
                  height: tileWidth * 1.17,
                  transform: [{ rotate: `${TILTS[row * 4 + col]}deg` }],
                },
              ]}
            >
              <Text maxFontSizeMultiplier={1} style={[styles.letter, { fontSize: tileWidth * 0.68 }]}>{letter}</Text>
              <Text maxFontSizeMultiplier={1} style={[styles.points, { fontSize: tileWidth * 0.23 }]}>{LETTER_VALUES[letter as Letter]}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { gap: 10, alignItems: "center", paddingVertical: 6 },
  row: { flexDirection: "row", gap: 6 },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7e7c6",
    borderRadius: 6,
    borderBottomWidth: 5,
    borderBottomColor: "#bd8245",
    boxShadow: "0px 4px 5px rgba(0, 0, 0, 0.35)",
  },
  wild: { backgroundColor: "#8b9e6a", borderBottomColor: "#51613b" },
  letter: { color: "#302315", fontFamily: fonts.arcade },
  points: { position: "absolute", bottom: 2, right: 4, color: "#302315", fontFamily: fonts.arcade },
});
