import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { LinearTransition, useReducedMotion } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

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

/** A box in device px. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The reel window's chrome in artboard px, drawn to match G1's painted 5 × 3 window: a green panel
 * with gold corners, a band of nudge arrows above and below, and the felt inside a gold rim.
 */
const FRAME = { band: 40, side: 7, rim: 3, pad: 2, radius: 12, corner: 24, arrow: 30 } as const;
/** The window's chrome across, both sides, in artboard px: what the reels' columns don't get. */
export const FRAME_ACROSS = 2 * (FRAME.side + FRAME.rim + FRAME.pad);
/** A tile fills this much of its row's pitch (G1: 72 of 82.5) and at most this much of its column. */
const PITCH_FILL = 72 / 82.5;
const COLUMN_FILL = 0.84;
/** The tile's height at G1's 5 × 3, in artboard px: cell plates are measured against it. */
const TILE_HEIGHT = 72;
const FRAME_GOLD = "#eaa93b";
const FRAME_GOLD_DARK = "#a8661a";

/** Where the felt, the columns and the tiles fall inside a window `box` for this many reels and rows. */
export function reelWindowGeometry(box: Pick<Box, "width" | "height">, unit: number, reels: number, rows: number) {
  const band = FRAME.band * unit;
  const side = FRAME.side * unit;
  const inset = (FRAME.rim + FRAME.pad) * unit;
  const felt = { left: side, top: band, width: box.width - 2 * side, height: box.height - 2 * band };
  const inner = { left: felt.left + inset, top: felt.top + inset, width: felt.width - 2 * inset, height: felt.height - 2 * inset };
  const column = inner.width / reels;
  const pitch = inner.height / rows;
  const aspect = TILE_METRICS.large.height / TILE_METRICS.large.width;
  const tileHeight = Math.min(pitch * PITCH_FILL, column * COLUMN_FILL * aspect);
  return { band, felt, inner, column, pitch, tileHeight, tileWidth: tileHeight / aspect, scale: tileHeight / TILE_METRICS.large.height };
}

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
  /** The window's box on the stage, in device px. */
  box: Box;
  /** Artboard px to device px, for the window's chrome. */
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
 * The reel window and the reels inside it: one column each, a nudge arrow above and below, tap two
 * tiles to swap them. The window keeps its box; its columns and tiles size to the reels and rows,
 * and slide to their new places when a reel or row is bought.
 */
export function SlotGrid({
  state,
  box,
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
  const rows = grid[0]?.length ?? 3;
  const canMove = phase === "moving" && moves > 0;
  const lockable = canHold(state);
  const holdsFull = holds.length >= holdLimit(state);

  const { band, inner, column, pitch, tileWidth, tileHeight, scale } = reelWindowGeometry(box, unit, reels, rows);
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

  const targetHeight = Math.max(band, MIN_TARGET);
  const upTop = (band - targetHeight) / 2;
  const downTop = box.height - band + (band - targetHeight) / 2;
  const arrowSize = Math.min(FRAME.arrow * unit, column * 0.62);
  const layout = reduceMotion ? undefined : LinearTransition.duration(320);

  return (
    <Pressable
      accessible={false}
      disabled={!revealing}
      onPress={onSkipReveal}
      style={[styles.window, box]}
      testID="slot-window"
    >
      <ReelWindowFrame box={box} unit={unit} reels={reels} layout={layout} />
      {grid.map((tiles, reel) => {
        const locked = holds.includes(reel);
        const rolling = roll !== null && roll.rolling.includes(reel);
        const left = inner.left + reel * column;
        const tileLeft = (column - tileWidth) / 2;
        const tilesTop = inner.top + gap / 2;
        return (
          <Animated.View key={reel} layout={layout} pointerEvents="box-none" style={[styles.reel, { left, width: column, height: box.height }]}>
            <NudgeTarget
              direction={-1}
              reel={reel}
              disabled={!canMove || rolling}
              onNudge={onNudge}
              arrowSize={arrowSize}
              style={{ top: upTop, height: targetHeight, width: column }}
            />
            <View
              pointerEvents={rolling ? "none" : "box-none"}
              // The real tiles wait under the roll, hidden, and show the moment it lands on them.
              style={[
                styles.column,
                { left: tileLeft - 3, top: tilesTop - 3, width: tileWidth + 6, height: pitch * rows - gap + 6 },
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
                    {premium !== undefined ? (
                      <CellPlate cell={premium} swapLocked={swapLocked} scale={scale} reel={reel} row={row} />
                    ) : null}
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
                      <CellBadge cell={premium} scale={scale} />
                    ) : null}
                  </View>
                );
              })}
            </View>
            {rolling ? (
              <View pointerEvents="none" style={[styles.roll, { left: tileLeft, top: tilesTop }]}>
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
                style={{ top: downTop, height: targetHeight, width: column }}
              />
            ) : (
              <NudgeTarget
                direction={1}
                reel={reel}
                disabled={!canMove}
                onNudge={onNudge}
                arrowSize={arrowSize}
                style={{ top: downTop, height: targetHeight, width: column }}
              />
            )}
          </Animated.View>
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
  arrowSize: number;
  onNudge: (reel: number, direction: NudgeDirection) => void;
  style: TargetStyle;
}

/** A reel's nudge arrow and its hit target, in the window's band above or below the reel. */
function NudgeTarget({ direction, reel, disabled, arrowSize, onNudge, style }: NudgeTargetProps): ReactElement {
  const testID = `slot-nudge-${direction === -1 ? "up" : "down"}-${reel}`;
  return (
    <Pressable
      accessibilityLabel={`Nudge reel ${reel + 1} ${direction === -1 ? "up" : "down"}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      id={webTestID(testID)}
      onPress={() => onNudge(reel, direction)}
      style={({ pressed }) => [styles.target, styles.centred, style, pressed && styles.pressed]}
      testID={testID}
    >
      <NudgeArrow size={arrowSize} direction={direction} />
    </Pressable>
  );
}

/** G1's gold arrow: a chunky up arrow with an orange outline, turned over for down. */
function NudgeArrow({ size, direction }: { size: number; direction: NudgeDirection }): ReactElement {
  return (
    <Svg aria-hidden height={size} style={direction === 1 ? styles.flipped : undefined} viewBox="0 0 30 30" width={size}>
      <Path d="M15 2.5 L28 15.5 H20.5 V27 H9.5 V15.5 H2 Z" fill="#c46a12" stroke="#7a3d08" strokeLinejoin="round" strokeWidth={2} />
      <Path d="M15 4.5 L25 14 H18.8 V24.5 H11.2 V14 H5 Z" fill="#ffc93c" />
      <Path d="M15 6.5 L21.5 12.5 H17 V16 H13 V12.5 H8.5 Z" fill="#fff0a8" />
    </Svg>
  );
}

interface ReelWindowFrameProps {
  box: Box;
  unit: number;
  reels: number;
  layout: LinearTransition | undefined;
}

/** The window's chrome: the green panel, its gold corners, the felt in its gold rim, and a gold rule between reels. */
function ReelWindowFrame({ box, unit, reels, layout }: ReelWindowFrameProps): ReactElement {
  const { felt, inner, column } = reelWindowGeometry(box, unit, reels, 1);
  const corner = FRAME.corner * unit;
  const rule = Math.max(1, 1.5 * unit);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={["#2a7d52", "#1d6040", "#1a5638"]}
        style={[StyleSheet.absoluteFill, { borderRadius: FRAME.radius * unit, borderWidth: 2 * unit, borderColor: "#0e3423" }]}
      />
      <LinearGradient
        colors={["#1a3526", "#284f39", "#1a3526"]}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={[styles.felt, felt, { borderRadius: 9 * unit, borderWidth: FRAME.rim * unit }]}
      />
      {Array.from({ length: reels - 1 }, (_, index) => (
        <Animated.View
          key={index}
          layout={layout}
          style={[styles.rule, { left: inner.left + (index + 1) * column - rule / 2, top: felt.top + FRAME.rim * unit, width: rule, height: felt.height - 2 * FRAME.rim * unit }]}
        />
      ))}
      {([[0, 0], [1, 0], [1, 1], [0, 1]] as const).map(([right, bottom]) => (
        <Svg
          key={`${right}${bottom}`}
          aria-hidden
          height={corner}
          style={[
            styles.corner,
            { left: right ? box.width - corner : 0, top: bottom ? box.height - corner : 0, transform: [{ scaleX: right ? -1 : 1 }, { scaleY: bottom ? -1 : 1 }] },
          ]}
          viewBox="0 0 24 24"
          width={corner}
        >
          <Path d="M2 22 V8 Q2 2 8 2 H22 L18 7 H10 Q7 7 7 10 V18 Z" fill={FRAME_GOLD} stroke={FRAME_GOLD_DARK} strokeLinejoin="round" strokeWidth={1.4} />
        </Svg>
      ))}
    </View>
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

/** Narrower than this, a reel's hold pill drops its word and keeps the padlock. */
const LOCK_WORD_WIDTH = 60;

/** A reel's Hold / Held switch between spins, in place of its down arrow. */
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
        {style.width < LOCK_WORD_WIDTH * unit ? null : (
        <Text
          maxFontSizeMultiplier={1}
          style={[styles.lockText, { fontSize: 11 * unit }, locked && styles.lockTextOn, disabled && styles.lockTextFull]}
        >
          {locked ? "HELD" : "HOLD"}
        </Text>
        )}
      </View>
    </Pressable>
  );
}

/** How far a cell's plate reaches past its tile, in artboard px at full size: most of the gap between tiles. */
const PLATE_REACH = 4.5;

interface CellPlateProps {
  cell: SlotPremiumCell;
  swapLocked: boolean;
  /** The tile's scale, so the plate shrinks with it. */
  scale: number;
  reel: number;
  row: number;
}

/**
 * A premium cell as a square of the board: a tinted plate behind the tile that shows as a coloured
 * rim around it. The rim is dashed when the cell refuses swaps and thicker when it is permanent. It
 * belongs to the grid position, so a nudge or swap slides letters over it.
 */
function CellPlate({ cell, swapLocked, scale, reel, row }: CellPlateProps): ReactElement {
  const { fill } = cellColours(cell);
  const reach = PLATE_REACH * (scale / (TILE_HEIGHT / TILE_METRICS.large.height));
  return (
    <View
      pointerEvents="none"
      testID={`slot-cell-${reel}-${row}`}
      style={[
        styles.plate,
        {
          top: -reach,
          left: -reach,
          right: -reach,
          bottom: -reach,
          borderRadius: radius.md * scale + reach,
          borderColor: fill,
          borderWidth: Math.max(2, reach * (cell.permanent ? 0.75 : 0.5)),
          borderStyle: swapLocked ? "dashed" : "solid",
          backgroundColor: `${fill}59`,
        },
      ]}
    />
  );
}

/** The cell's tab on the top edge of its plate: `2L`, `◆ 3W`. */
function CellBadge({ cell, scale }: { cell: SlotPremiumCell; scale: number }): ReactElement {
  const { fill, ink } = cellColours(cell);
  const size = TILE_METRICS.large.width * scale;
  const height = size * 0.24;
  const reach = PLATE_REACH * (scale / (TILE_HEIGHT / TILE_METRICS.large.height));
  return (
    <View pointerEvents="none" style={[styles.badgeRow, { top: -reach - height / 2 }]}>
      <Text
        maxFontSizeMultiplier={1}
        style={[
          styles.badge,
          {
            backgroundColor: fill,
            color: ink,
            fontSize: size * 0.17,
            lineHeight: height,
            height,
            paddingHorizontal: size * 0.07,
            borderRadius: height / 2,
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
  /** The key's line on the stage, in device px. */
  box: Box;
}

/** The cell kinds in play, one chip each, under the reels; swap-locked kinds say `nudge only`. */
export function SlotCellKey({ state, unit, box }: SlotCellKeyProps): ReactElement | null {
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
    <View pointerEvents="none" style={[styles.key, { left: box.left, top: box.top, width: box.width, gap: 4 * unit }]} testID="slot-cell-key">
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
  felt: { position: "absolute", borderColor: FRAME_GOLD },
  rule: { position: "absolute", backgroundColor: "rgba(234,169,59,0.55)" },
  corner: { position: "absolute" },
  centred: { alignItems: "center", justifyContent: "center" },
  flipped: { transform: [{ rotate: "180deg" }] },
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
  lockFull: { backgroundColor: "#5e3a17", borderColor: "#a98a6a" },
  lockText: { color: "#fffaf0", fontWeight: "800", letterSpacing: 0.5 },
  lockTextOn: { color: "#5a3004" },
  lockTextFull: { color: "#a98a6a" },
  plate: { position: "absolute" },
  badgeRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  badge: { fontWeight: "800", overflow: "hidden", letterSpacing: 0.3 },
  key: { position: "absolute", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center" },
  keyBadge: { fontWeight: "800", overflow: "hidden" },
  keyText: { color: "#fffaf0", fontWeight: "600" },
});
