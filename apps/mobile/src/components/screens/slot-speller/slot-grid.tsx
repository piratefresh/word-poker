import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import {
  canHold,
  cellAt,
  holdLimit,
  isSwapLocked,
  type NudgeDirection,
  type SlotPremiumCell,
  type SlotCell,
  type SlotSpellerState,
  type SlotWord,
} from "@wordpoker/game-rules";

import { getTileAccessibilityLabel, Tile, TILE_METRICS } from "@/components/game/word-tile";
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

/**
 * A premium cell's marking, from the playable build: the two letter cells are blues and the two
 * word cells pink and red, and the pair in each differ in lightness too, so they read without hue.
 */
const CELL_COLOURS = {
  "letter-2": { fill: "#7fb7e8", ink: "#2a1d22" },
  "letter-3": { fill: "#2b63b0", ink: "#ffffff" },
  "word-2": { fill: "#e88fb4", ink: "#2a1d22" },
  "word-3": { fill: "#c23a30", ink: "#ffffff" },
} as const;

function cellColours(cell: Pick<SlotPremiumCell, "kind" | "multiplier">): { fill: string; ink: string } {
  const key = `${cell.kind}-${cell.multiplier >= 3 ? 3 : 2}` as keyof typeof CELL_COLOURS;
  return CELL_COLOURS[key];
}

/** The badge's text: `2L`, `3W`, with a diamond on a permanent cell. */
function cellBadge(cell: SlotPremiumCell): string {
  return `${cell.permanent ? "◆ " : ""}${cell.multiplier}${cell.kind === "letter" ? "L" : "W"}`;
}

/** How a screen reader names a cell: `on a double word cell`. */
function cellPhrase(cell: Pick<SlotPremiumCell, "kind" | "multiplier" | "permanent">): string {
  const times = cell.multiplier === 2 ? "double" : cell.multiplier === 3 ? "triple" : `${cell.multiplier}×`;
  return `${cell.permanent ? "permanent " : ""}${times} ${cell.kind} cell`;
}

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
  const holdsFull = holds.length >= holdLimit(state);

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
                const premium = cellAt(state.cells, [reel, row]);
                const swapLocked = premium !== undefined && isSwapLocked(state, [reel, row]);
                const label = [
                  getTileAccessibilityLabel(tile),
                  premium !== undefined ? `on a ${cellPhrase(premium)}` : null,
                  swapLocked ? "nudge only" : null,
                  locked ? "reel held" : null,
                ]
                  .filter((part) => part !== null)
                  .join(", ");
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
                      accessibilityLabel={label}
                      testID={`slot-tile-${reel}-${row}`}
                    />
                    {premium !== undefined ? (
                      <CellMarking cell={premium} swapLocked={swapLocked} scale={scale} reel={reel} row={row} />
                    ) : null}
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
                disabled={!locked && holdsFull}
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
  /** Every hold is in use on other reels. */
  disabled: boolean;
  onToggle: (reel: number) => void;
  unit: number;
  style: TargetStyle;
}

/** A reel's Hold / Held switch between spins, over its painted down arrow. */
function LockToggle({ reel, locked, disabled, onToggle, unit, style }: LockToggleProps): ReactElement {
  const testID = `slot-lock-${reel}`;
  return (
    <Pressable
      accessibilityLabel={locked ? `Reel ${reel + 1} held` : `Hold reel ${reel + 1}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: locked, disabled }}
      disabled={disabled}
      id={webTestID(testID)}
      onPress={() => onToggle(reel)}
      style={({ pressed }) => [styles.target, styles.lockTarget, style, pressed && styles.pressed]}
      testID={testID}
    >
      <View
        style={[
          styles.lock,
          { height: 26 * unit, paddingHorizontal: 7 * unit, gap: 3 * unit, borderRadius: 13 * unit },
          locked && styles.lockOn,
          disabled && styles.lockFull,
        ]}
      >
        <Ionicons name={locked ? "lock-closed" : "lock-open"} size={12 * unit} color={locked ? "#5a3004" : "#fffaf0"} />
        <Text
          maxFontSizeMultiplier={1}
          style={[styles.lockText, { fontSize: 11 * unit }, locked && styles.lockTextOn, disabled && styles.lockTextFull]}
        >
          {locked ? "HELD" : "HOLD"}
        </Text>
      </View>
    </Pressable>
  );
}

interface CellMarkingProps {
  cell: SlotPremiumCell;
  swapLocked: boolean;
  /** The tile's scale, so the border and badge shrink with it. */
  scale: number;
  reel: number;
  row: number;
}

/**
 * A premium cell drawn over its tile: a border in the cell's colour (dashed when it refuses swaps,
 * thicker when permanent) and a badge in the top-right corner. It belongs to the grid position, so
 * a nudge or swap slides letters under it.
 */
function CellMarking({ cell, swapLocked, scale, reel, row }: CellMarkingProps): ReactElement {
  const { fill, ink } = cellColours(cell);
  const size = TILE_METRICS.large.width * scale;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`slot-cell-${reel}-${row}`}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            margin: 2,
            borderColor: fill,
            borderRadius: radius.md * scale,
            borderWidth: size * (cell.permanent ? 0.11 : 0.06),
            borderStyle: swapLocked ? "dashed" : "solid",
          },
        ]}
      />
      <Text
        maxFontSizeMultiplier={1}
        style={[
          styles.badge,
          {
            backgroundColor: fill,
            color: ink,
            top: 2 + size * 0.06,
            right: 2 + size * 0.07,
            fontSize: size * 0.17,
            lineHeight: size * 0.2,
            paddingHorizontal: size * 0.05,
            borderRadius: size * 0.05,
          },
        ]}
      >
        {cellBadge(cell)}
      </Text>
    </View>
  );
}

export interface SlotCellKeyProps {
  state: SlotSpellerState;
  unit: number;
  /** Where the key's top sits, in artboard px. */
  top: number;
  width: number;
}

/** The cell kinds in play, one chip each, under the reels; swap-locked kinds say `nudge only`. */
export function SlotCellKey({ state, unit, top, width }: SlotCellKeyProps): ReactElement | null {
  const kinds = new Map<string, SlotPremiumCell>();
  for (const cell of state.cells) {
    if (cell.reel >= state.reels) continue;
    kinds.set(cellBadge(cell), cell);
  }
  if (kinds.size === 0) return null;
  const order = [...kinds.values()].sort(
    (a, b) => Number(a.permanent ?? false) - Number(b.permanent ?? false) || a.kind.localeCompare(b.kind) || a.multiplier - b.multiplier,
  );
  // Badges only, so even six kinds fit one line between the hint and the deck; the note names
  // the kinds that refuse swaps.
  const lockedKinds = new Set(order.filter((cell) => isSwapLocked(state, [cell.reel, cell.row])).map((cell) => cell.kind));
  const note =
    lockedKinds.size === 0 ? null : lockedKinds.size === 2 ? "all cells: nudge only" : `${[...lockedKinds][0]} cells: nudge only`;
  return (
    <View pointerEvents="none" style={[styles.key, { top: top * unit, width, gap: 4 * unit }]} testID="slot-cell-key">
      {order.map((cell) => {
        const { fill, ink } = cellColours(cell);
        const locked = isSwapLocked(state, [cell.reel, cell.row]);
        return (
          <Text
            key={cellBadge(cell)}
            accessibilityLabel={`${cellBadge(cell).replace("◆ ", "")}: ${cellPhrase(cell)}${locked ? ", nudge only" : ""}`}
            maxFontSizeMultiplier={1}
            style={[styles.keyBadge, { backgroundColor: fill, color: ink, fontSize: 9 * unit, paddingHorizontal: 3 * unit, borderRadius: 3 * unit }]}
          >
            {cellBadge(cell)}
          </Text>
        );
      })}
      {note !== null ? (
        <Text maxFontSizeMultiplier={1.2} style={[styles.keyText, { fontSize: 10 * unit, marginLeft: 2 * unit }]}>
          {note}
        </Text>
      ) : null}
    </View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8a4b12",
    borderWidth: 2,
    borderColor: "#fffaf0",
  },
  lockOn: { backgroundColor: "#ffd25a" },
  // Solid, not see-through: the painted arrow under it must not show.
  lockFull: { backgroundColor: "#5e3a17", borderColor: "#a98a6a" },
  lockText: { color: "#fffaf0", fontWeight: "800", letterSpacing: 0.5 },
  lockTextOn: { color: "#5a3004" },
  lockTextFull: { color: "#a98a6a" },
  badge: { position: "absolute", fontWeight: "800", overflow: "hidden" },
  key: { position: "absolute", left: 0, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  keyBadge: { fontWeight: "800", overflow: "hidden" },
  keyText: { color: "#fffaf0", fontWeight: "600" },
});
