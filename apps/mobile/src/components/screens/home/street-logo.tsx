import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/theme";

import { LogoTilt } from "./logo-tilt";
import { createLogoScatter, LogoTileEntrance, useLogoIntro } from "./tile-logo";

const ROWS = ["WORD", "POKER"] as const;
const TILTS = [-4, -1, 2, 4, -2, 1, 3, -3, 2];

/** The menu's permanent title. The animated word-building demo remains in tile-logo.tsx. */
export function StreetLogo({ width }: { width: number }) {
  const tileWidth = (width - 4 * 6) / 5;
  const tileHeight = tileWidth * 1.17;
  const height = tileHeight * 2 + 22;
  const play = useLogoIntro();
  const [scatter] = useState(createLogoScatter);
  return (
    <LogoTilt width={width}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel="Word Poker"
        pointerEvents="none"
        style={{ width, height }}
        testID="street-logo"
      >
        <View aria-hidden style={StyleSheet.absoluteFill}>
          {ROWS.flatMap((word, row) => [...word].map((letter, col) => {
            const index = row * 4 + col;
            const rowWidth = word.length * tileWidth + (word.length - 1) * 6;
            const left = (width - rowWidth) / 2 + col * (tileWidth + 6);
            const top = 6 + row * (tileHeight + 10);
            const [x, y, rotate] = scatter[index];
            return (
              <LogoTileEntrance
                key={`${word}-${col}`}
                play={play}
                tilt={TILTS[index]}
                testID={`street-logo-motion-${word}-${col}`}
                slot={{
                  left, top, index,
                  fromX: x * (width - tileWidth) - left,
                  fromY: y * (height - tileHeight) - top,
                  fromRotate: rotate,
                }}
              >
                <View
                  testID={`street-logo-${word}-${col}`}
                  style={[styles.tile, letter === "K" && styles.wild, { width: tileWidth, height: tileHeight }]}
                >
                  <Text maxFontSizeMultiplier={1} style={[styles.letter, { fontSize: tileWidth * 0.68 }]}>{letter}</Text>
                  <Text maxFontSizeMultiplier={1} style={[styles.points, { fontSize: tileWidth * 0.23 }]}>{LETTER_VALUES[letter as Letter]}</Text>
                </View>
              </LogoTileEntrance>
            );
          }))}
        </View>
      </View>
    </LogoTilt>
  );
}

const styles = StyleSheet.create({
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
