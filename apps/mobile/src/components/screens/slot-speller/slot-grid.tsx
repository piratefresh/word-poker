import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactElement } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

import type { NudgeDirection, SlotCell, SlotSpellerState, SlotWord } from "@wordpoker/game-rules";

import { Tile, TILE_METRICS } from "@/components/game/word-tile";
import { colors, opacity, radius, spacing } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

/** The large tile at full size; a wide grid scales it down to fit. */
const TILE = TILE_METRICS.large;
const GAP = 4;
const ARROW = 28;
const REEL_STAGGER_MS = 90;
const REEL_STOP_MS = 260;

export interface SlotGridProps {
  state: SlotSpellerState;
  /** Words whose tiles wear an outline: the live preview while moving. */
  outlined: readonly SlotWord[];
  /** Words whose tiles light gold: the payout revealed so far. */
  lit: readonly SlotWord[];
  selected: SlotCell | null;
  /** While the payout reveals, a tap anywhere on the grid skips to its end. */
  revealing: boolean;
  onTapCell: (cell: SlotCell) => void;
  onNudge: (reel: number, direction: NudgeDirection) => void;
  onSkipReveal: () => void;
}

const cellKey = (reel: number, row: number): string => `${reel}:${row}`;

/** Each word's played face per cell, so a choice tile prints the face it played. */
function facesByCell(words: readonly SlotWord[]): Map<string, string> {
  const faces = new Map<string, string>();
  for (const word of words) {
    word.cells.forEach(([reel, row], index) => {
      const face = word.faces[index];
      if (face !== undefined) faces.set(cellKey(reel, row), face);
    });
  }
  return faces;
}

/** The reels: one column each, nudge arrows above and below, tap two tiles to swap them. */
export function SlotGrid({
  state,
  outlined,
  lit,
  selected,
  revealing,
  onTapCell,
  onNudge,
  onSkipReveal,
}: SlotGridProps): ReactElement {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth - spacing.gutter * 2);
  const reduceMotion = useReducedMotion();

  const { reels, grid, phase, moves, spinCount } = state;
  const canMove = phase === "moving" && moves > 0;
  const scale = Math.min(1, (width - GAP * (reels - 1)) / reels / TILE.width);
  const tileWidth = TILE.width * scale;

  const outlinedFaces = facesByCell(outlined);
  const litFaces = facesByCell(lit);
  const animateSpin = !reduceMotion && spinCount > 0;

  return (
    <Pressable
      accessible={false}
      disabled={!revealing}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onPress={onSkipReveal}
      style={styles.grid}
    >
      {grid.map((column, reel) => (
        <View key={reel} style={[styles.reel, { width: tileWidth }]}>
          <NudgeArrow direction={-1} reel={reel} disabled={!canMove} onNudge={onNudge} />
          <Animated.View
            // A new spin remounts each column, so it stops in again, left to right.
            key={spinCount}
            entering={animateSpin ? FadeInDown.delay(reel * REEL_STAGGER_MS).duration(REEL_STOP_MS) : undefined}
            style={styles.column}
          >
            {column.map((tile, row) => {
              const key = cellKey(reel, row);
              const litFace = litFaces.get(key);
              const outlinedFace = outlinedFaces.get(key);
              const isSelected = selected !== null && selected[0] === reel && selected[1] === row;
              return (
                // Keyed by position: a swap and a nudge can put two copies of one tile id on screen.
                <View key={key} style={[styles.cell, outlinedFace !== undefined && styles.outlined]}>
                  <Tile
                    tile={tile}
                    side="front"
                    size="large"
                    scale={scale}
                    animation="none"
                    shadow={false}
                    chosenFace={litFace ?? outlinedFace}
                    fill={litFace !== undefined ? "gold" : "ivory"}
                    selected={isSelected}
                    interactive={canMove}
                    onPress={() => onTapCell([reel, row])}
                    testID={`slot-tile-${reel}-${row}`}
                  />
                </View>
              );
            })}
          </Animated.View>
          <NudgeArrow direction={1} reel={reel} disabled={!canMove} onNudge={onNudge} />
        </View>
      ))}
    </Pressable>
  );
}

interface NudgeArrowProps {
  direction: NudgeDirection;
  reel: number;
  disabled: boolean;
  onNudge: (reel: number, direction: NudgeDirection) => void;
}

function NudgeArrow({ direction, reel, disabled, onNudge }: NudgeArrowProps): ReactElement {
  const testID = `slot-nudge-${direction === -1 ? "up" : "down"}-${reel}`;
  return (
    <Pressable
      accessibilityLabel={`Nudge reel ${reel + 1} ${direction === -1 ? "up" : "down"}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      id={webTestID(testID)}
      onPress={() => onNudge(reel, direction)}
      style={({ pressed }) => [styles.arrow, disabled && styles.arrowDisabled, pressed && styles.arrowPressed]}
      testID={testID}
    >
      <Ionicons name={direction === -1 ? "chevron-up" : "chevron-down"} size={20} color={colors.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", justifyContent: "center", gap: GAP },
  reel: { alignItems: "center", gap: spacing.xs },
  column: { gap: GAP },
  cell: { borderRadius: radius.md, borderWidth: 2, borderColor: "transparent", margin: -2 },
  outlined: { borderColor: colors.successHi },
  arrow: {
    width: "100%",
    height: ARROW,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  arrowDisabled: { opacity: opacity.disabled },
  arrowPressed: { opacity: opacity.pressed },
});
