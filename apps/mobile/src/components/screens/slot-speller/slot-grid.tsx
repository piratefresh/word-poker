import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import {
  canHold,
  type NudgeDirection,
  type SlotCell,
  type SlotSpellerState,
  type SlotWord,
} from "@wordpoker/game-rules";

import { Tile, TILE_METRICS } from "@/components/game/word-tile";
import { haptic } from "@/components/word-builder/haptics";
import { colors, opacity, radius, spacing } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

import { SlotReelRoll } from "./slot-reel-roll";

/** The large tile at full size; a wide grid scales it down to fit. */
const TILE = TILE_METRICS.large;
const GAP = 4;
/** A wide grid (more than this many reels) tightens its gaps to keep the tiles big enough to read. */
const WIDE_REELS = 8;
const WIDE_GAP = 2;
const ARROW = 28;

/** A spin being rolled on screen: the grid it left, and the reels still rolling. */
interface SpinRoll {
  spin: number;
  from: SlotSpellerState["grid"];
  rolling: readonly number[];
}

export interface SlotGridProps {
  state: SlotSpellerState;
  /** Words whose tiles wear an outline: the live preview while moving. */
  outlined: readonly SlotWord[];
  /** Words whose tiles light gold: the payout revealed so far. */
  lit: readonly SlotWord[];
  selected: SlotCell | null;
  /** Reels held through the last spin: they stay still rather than stop in again. */
  held: readonly number[];
  /** While the payout reveals, a tap anywhere on the grid skips to its end. */
  revealing: boolean;
  onTapCell: (cell: SlotCell) => void;
  onNudge: (reel: number, direction: NudgeDirection) => void;
  /** Hold or release a reel for the next spin. */
  onToggleLock: (reel: number) => void;
  onSkipReveal: () => void;
  /** Called with the spin's number once every reel of that spin has landed (at once when none roll). */
  onSpinLanded?: (spinCount: number) => void;
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
  held,
  revealing,
  onTapCell,
  onNudge,
  onToggleLock,
  onSkipReveal,
  onSpinLanded,
}: SlotGridProps): ReactElement {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth - spacing.gutter * 2);
  const reduceMotion = useReducedMotion();

  const { reels, grid, phase, moves, spinCount, holds, strips, top } = state;
  const canMove = phase === "moving" && moves > 0;
  const lockable = canHold(state);
  const gap = reels > WIDE_REELS ? WIDE_GAP : GAP;
  const scale = Math.min(1, (width - gap * (reels - 1)) / reels / TILE.width);
  const tileWidth = TILE.width * scale;

  const outlinedFaces = facesByCell(outlined);
  const litFaces = facesByCell(lit);

  // The grid as last drawn, so a new spin knows the letters it rolls away from. Adjusted while
  // rendering (not in an effect) so the dealt tiles never flash before their reel starts rolling.
  const [seen, setSeen] = useState({ spin: spinCount, grid });
  const [roll, setRoll] = useState<SpinRoll | null>(null);
  if (seen.spin !== spinCount) {
    setSeen({ spin: spinCount, grid });
    const rolling = grid
      .map((_, reel) => reel)
      .filter((reel) => !held.includes(reel));
    setRoll(
      !reduceMotion && spinCount > 0 && seen.grid.length === grid.length
        ? { spin: spinCount, from: seen.grid, rolling }
        : null,
    );
  } else if (seen.grid !== grid) {
    setSeen({ spin: spinCount, grid });
  }
  const onLanded = useCallback((reel: number) => {
    haptic("settle");
    setRoll((current) => {
      if (current === null) return null;
      const rolling = current.rolling.filter((each) => each !== reel);
      return rolling.length === 0 ? null : { ...current, rolling };
    });
  }, []);
  // Keyed on the spin too: a spin that rolls nothing (reduced motion, every reel held) still reports.
  const anyRolling = roll !== null;
  useEffect(() => {
    if (!anyRolling) onSpinLanded?.(spinCount);
  }, [anyRolling, spinCount, onSpinLanded]);

  return (
    <Pressable
      accessible={false}
      disabled={!revealing}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onPress={onSkipReveal}
      style={[styles.grid, { gap }]}
    >
      {grid.map((column, reel) => {
        const locked = holds.includes(reel);
        const rolling = roll !== null && roll.rolling.includes(reel);
        return (
          <View key={reel} style={[styles.reel, { width: tileWidth }]}>
            <NudgeArrow
              direction={-1}
              reel={reel}
              disabled={!canMove || rolling}
              onNudge={onNudge}
            />
            <View>
              <View
                pointerEvents={rolling ? "none" : "auto"}
                // The real tiles wait under the roll, hidden, and show the moment it lands on them.
                style={[
                  styles.column,
                  { gap },
                  locked && styles.locked,
                  rolling && styles.hidden,
                ]}
              >
                {column.map((tile, row) => {
                  const key = cellKey(reel, row);
                  const litFace = litFaces.get(key);
                  const outlinedFace = outlinedFaces.get(key);
                  const isSelected =
                    selected !== null &&
                    selected[0] === reel &&
                    selected[1] === row;
                  return (
                    // Keyed by position: a swap and a nudge can put two copies of one tile id on screen.
                    <View
                      key={key}
                      style={[
                        styles.cell,
                        outlinedFace !== undefined && styles.outlined,
                      ]}
                    >
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
              </View>
              {rolling ? (
                <SlotReelRoll
                  // A new spin starts a fresh roll from the letters the last one left.
                  key={roll.spin}
                  reel={reel}
                  reels={reels}
                  from={roll.from[reel] ?? column}
                  to={column}
                  strip={strips[reel] ?? column}
                  top={top[reel] ?? 0}
                  scale={scale}
                  gap={gap}
                  onLanded={onLanded}
                />
              ) : null}
            </View>
            {lockable ? (
              <LockToggle reel={reel} locked={locked} onToggle={onToggleLock} />
            ) : (
              <NudgeArrow
                direction={1}
                reel={reel}
                disabled={!canMove}
                onNudge={onNudge}
              />
            )}
          </View>
        );
      })}
    </Pressable>
  );
}

interface NudgeArrowProps {
  direction: NudgeDirection;
  reel: number;
  disabled: boolean;
  onNudge: (reel: number, direction: NudgeDirection) => void;
}

function NudgeArrow({
  direction,
  reel,
  disabled,
  onNudge,
}: NudgeArrowProps): ReactElement {
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
      style={({ pressed }) => [
        styles.arrow,
        disabled && styles.arrowDisabled,
        pressed && styles.arrowPressed,
      ]}
      testID={testID}
    >
      <Ionicons
        name={direction === -1 ? "chevron-up" : "chevron-down"}
        size={20}
        color={colors.gold}
      />
    </Pressable>
  );
}

interface LockToggleProps {
  reel: number;
  locked: boolean;
  onToggle: (reel: number) => void;
}

/** A reel's hold/held switch, in the down arrow's place between spins. */
function LockToggle({ reel, locked, onToggle }: LockToggleProps): ReactElement {
  const testID = `slot-lock-${reel}`;
  return (
    <Pressable
      accessibilityLabel={`${locked ? "Release" : "Hold"} reel ${reel + 1}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: locked }}
      hitSlop={6}
      id={webTestID(testID)}
      onPress={() => onToggle(reel)}
      style={({ pressed }) => [
        styles.arrow,
        locked && styles.lockOn,
        pressed && styles.arrowPressed,
      ]}
      testID={testID}
    >
      <Ionicons
        name={locked ? "lock-closed" : "lock-open-outline"}
        size={18}
        color={locked ? colors.onGold : colors.gold}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", justifyContent: "center" },
  reel: { alignItems: "center", gap: spacing.xs },
  column: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
    margin: -2,
  },
  locked: { borderColor: colors.gold },
  hidden: { opacity: 0 },
  cell: {
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
    margin: -2,
  },
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
  lockOn: { backgroundColor: colors.gold },
});
