import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
import { colors, radius } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

import { SlotReelRoll } from "./slot-reel-roll";

/**
 * The painted reel window on the G1 art, in artboard px (390 × 844): five columns of 68.5 and three
 * rows of 82.5, a 58 × 72 tile centred in each, nudge arrows painted above and below.
 */
export const REEL_WINDOW = { left: 24.4, top: 291.9, column: 68.5, row: 82.5, reels: 5, rows: 3 } as const;
const TILE_HEIGHT = 72;
/** The painted arrows' tops, from the window's top. */
const ARROW_UP = 255 - REEL_WINDOW.top;
const ARROW_DOWN = 542 - REEL_WINDOW.top;
const ARROW_HEIGHT = 30;
/** Every control is at least this tall to the finger. */
const MIN_TARGET = 44;

/** A spin being rolled on screen: the grid it left, and the reels still rolling. */
interface SpinRoll {
  spin: number;
  from: SlotSpellerState["grid"];
  rolling: readonly number[];
}

export interface SlotGridProps {
  state: SlotSpellerState;
  /** Artboard px to device px. */
  unit: number;
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

/**
 * The reels inside the painted window: one column each, hit targets over the painted nudge arrows,
 * tap two tiles to swap them. A grid past 5 × 3 shrinks to fit the same window until STO-1184
 * grows it.
 */
export function SlotGrid({
  state,
  unit,
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
  const reduceMotion = useReducedMotion();
  const { reels, grid, phase, moves, spinCount, holds, strips, top } = state;
  const rows = grid[0]?.length ?? REEL_WINDOW.rows;
  const canMove = phase === "moving" && moves > 0;
  const lockable = canHold(state);

  const column = (REEL_WINDOW.column * REEL_WINDOW.reels * unit) / Math.max(reels, REEL_WINDOW.reels);
  const pitch = (REEL_WINDOW.row * REEL_WINDOW.rows * unit) / Math.max(rows, REEL_WINDOW.rows);
  const fit = Math.min(column / (REEL_WINDOW.column * unit), pitch / (REEL_WINDOW.row * unit));
  const scale = (TILE_HEIGHT * unit * fit) / TILE_METRICS.large.height;
  const tileWidth = TILE_METRICS.large.width * scale;
  const tileHeight = TILE_METRICS.large.height * scale;
  const gap = pitch - tileHeight;

  const outlinedFaces = facesByCell(outlined);
  const litFaces = facesByCell(lit);

  // The grid as last drawn, so a new spin knows the letters it rolls away from. Adjusted while
  // rendering (not in an effect) so the dealt tiles never flash before their reel starts rolling.
  const [seen, setSeen] = useState({ spin: spinCount, grid });
  const [roll, setRoll] = useState<SpinRoll | null>(null);
  if (seen.spin !== spinCount) {
    setSeen({ spin: spinCount, grid });
    const rolling = grid.map((_, reel) => reel).filter((reel) => !held.includes(reel));
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

  const targetHeight = Math.max(ARROW_HEIGHT * unit, MIN_TARGET);
  const arrowTop = (paintedTop: number): number => paintedTop * unit + (ARROW_HEIGHT * unit - targetHeight) / 2;

  return (
    <Pressable
      accessible={false}
      disabled={!revealing}
      onPress={onSkipReveal}
      style={[
        styles.window,
        {
          left: REEL_WINDOW.left * unit,
          top: REEL_WINDOW.top * unit,
          width: column * reels,
          height: pitch * rows,
        },
      ]}
    >
      {grid.map((tiles, reel) => {
        const locked = holds.includes(reel);
        const rolling = roll !== null && roll.rolling.includes(reel);
        const left = reel * column;
        const tileLeft = (column - tileWidth) / 2;
        return (
          <View key={reel} pointerEvents="box-none" style={[styles.reel, { left, width: column, height: pitch * rows }]}>
            <NudgeTarget
              direction={-1}
              reel={reel}
              disabled={!canMove || rolling}
              onNudge={onNudge}
              style={{ top: arrowTop(ARROW_UP), height: targetHeight, width: column }}
            />
            <View
              pointerEvents={rolling ? "none" : "box-none"}
              // The real tiles wait under the roll, hidden, and show the moment it lands on them.
              style={[
                styles.column,
                { left: tileLeft - 3, top: gap / 2 - 3, width: tileWidth + 6, height: pitch * rows - gap + 6 },
                locked && styles.locked,
                rolling && styles.hidden,
              ]}
            >
              {tiles.map((tile, row) => {
                const key = cellKey(reel, row);
                const litFace = litFaces.get(key);
                const outlinedFace = outlinedFaces.get(key);
                const isSelected = selected !== null && selected[0] === reel && selected[1] === row;
                return (
                  // Keyed by position: a swap and a nudge can put two copies of one tile id on screen.
                  <View
                    key={key}
                    style={[
                      styles.cell,
                      { top: row * pitch, borderRadius: radius.md * scale },
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
              <View pointerEvents="none" style={[styles.roll, { left: tileLeft, top: gap / 2 }]}>
                <SlotReelRoll
                  // A new spin starts a fresh roll from the letters the last one left.
                  key={roll.spin}
                  reel={reel}
                  reels={reels}
                  from={roll.from[reel] ?? tiles}
                  to={tiles}
                  strip={strips[reel] ?? tiles}
                  top={top[reel] ?? 0}
                  scale={scale}
                  gap={gap}
                  onLanded={onLanded}
                />
              </View>
            ) : null}
            {lockable ? (
              <LockToggle
                reel={reel}
                locked={locked}
                onToggle={onToggleLock}
                unit={unit}
                style={{ top: arrowTop(ARROW_DOWN), height: targetHeight, width: column }}
              />
            ) : (
              <NudgeTarget
                direction={1}
                reel={reel}
                disabled={!canMove}
                onNudge={onNudge}
                style={{ top: arrowTop(ARROW_DOWN), height: targetHeight, width: column }}
              />
            )}
          </View>
        );
      })}
    </Pressable>
  );
}

interface TargetStyle {
  top: number;
  height: number;
  width: number;
}

interface NudgeTargetProps {
  direction: NudgeDirection;
  reel: number;
  disabled: boolean;
  onNudge: (reel: number, direction: NudgeDirection) => void;
  style: TargetStyle;
}

/** A hit target over a painted nudge arrow; the art draws the arrow. */
function NudgeTarget({ direction, reel, disabled, onNudge, style }: NudgeTargetProps): ReactElement {
  const testID = `slot-nudge-${direction === -1 ? "up" : "down"}-${reel}`;
  return (
    <Pressable
      accessibilityLabel={`Nudge reel ${reel + 1} ${direction === -1 ? "up" : "down"}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      id={webTestID(testID)}
      onPress={() => onNudge(reel, direction)}
      style={({ pressed }) => [styles.target, style, pressed && styles.pressed]}
      testID={testID}
    />
  );
}

interface LockToggleProps {
  reel: number;
  locked: boolean;
  onToggle: (reel: number) => void;
  unit: number;
  style: TargetStyle;
}

/** A reel's hold switch between spins, a padlock over its painted down arrow. */
function LockToggle({ reel, locked, onToggle, unit, style }: LockToggleProps): ReactElement {
  const testID = `slot-lock-${reel}`;
  const size = 30 * unit;
  return (
    <Pressable
      accessibilityLabel={`${locked ? "Release" : "Hold"} reel ${reel + 1}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: locked }}
      id={webTestID(testID)}
      onPress={() => onToggle(reel)}
      style={({ pressed }) => [styles.target, styles.lockTarget, style, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={[styles.lock, { width: size, height: size, borderRadius: size / 2 }, locked && styles.lockOn]}>
        <Ionicons name={locked ? "lock-closed" : "lock-open"} size={16 * unit} color={locked ? "#5a3004" : "#fffaf0"} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  window: { position: "absolute" },
  reel: { position: "absolute", top: 0 },
  column: {
    position: "absolute",
    borderRadius: radius.md,
    borderWidth: 3,
    borderColor: "transparent",
  },
  locked: { borderColor: "#ffd25a", backgroundColor: "rgba(255,210,90,0.18)" },
  hidden: { opacity: 0 },
  cell: { position: "absolute", left: 0, borderWidth: 2, borderColor: "transparent", margin: -2 },
  outlined: { borderColor: colors.successHi },
  roll: { position: "absolute" },
  target: { position: "absolute", left: 0 },
  pressed: { backgroundColor: "rgba(255,250,240,0.18)", borderRadius: radius.md },
  lockTarget: { alignItems: "center", justifyContent: "center" },
  lock: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8a4b12",
    borderWidth: 2,
    borderColor: "#fffaf0",
  },
  lockOn: { backgroundColor: "#ffd25a" },
});
