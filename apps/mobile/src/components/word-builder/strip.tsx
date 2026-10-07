import type { Tile as TileData, TilePlay } from "@wordpoker/contracts";
import type { JSX, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { isSwappedTileId } from "@wordpoker/game-rules";

import {
  Tile,
  scaleTileMetrics,
  getTileAccessibilityLabel,
  type TileOwnership,
  type TileSide,
  type TileSize,
} from "@/components/game";
import {
  isCompactWindow,
  screenScale,
} from "@/components/screens/game/screen-scale";
import { colors, glow, spacing } from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

import { haptic } from "./haptics";
import { styles } from "./styles";

/** The widest gap the places take between them: a short hand sits at this and stays tight. */
const MAX_GAP = 10;

/** The bite taken at either end of the rack, so the hand does not run into the edge of the table. */
const RACK_INSET = 8;

/** A choice tile's chips, under it: the caption they print and the padding they wear it in. */
const FACE_HEIGHT = 24;

/**
 * A tile in the strip stays where the seat left it: the word is the tiles it has selected, read
 * left to right, so a tap toggles a tile in or out of the word without moving it and a drag is
 * only ever an order. The strip's grid is taken from the tile it draws — a place is one tile
 * plus the gap that separates it from the next, laid out from the strip's start — so the tile's
 * own metrics are what the places and the drag are measured in.
 */
export interface RackGeometry {
  /** The tile the rack draws: `medium`, grown by `scale` on a tablet or desktop window. */
  readonly size: TileSize;
  /** The screen scale the tile is grown by; 1 on a phone. */
  readonly scale: number;
  readonly itemWidth: number;
  /** How far apart two places sit on a rack with room to spare: the tile and `MAX_GAP`. */
  readonly maxStep: number;
  /**
   * The closest two places may come. A narrow phone gives up the gap first and then some of the
   * tile itself, so the end tiles overlap the way a hand held in one does — the hand stays on
   * screen and stays tappable rather than running off the edge of the table.
   */
  readonly minStep: number;
  /**
   * The strip's row height: a tile and, under a choice tile, its two faces. Every tile is laid
   * out absolutely inside the row, so the row is the one place the height is set.
   */
  readonly height: number;
}

function rackGeometry(size: TileSize, scale = 1): RackGeometry {
  const tile = scaleTileMetrics(size, scale);
  return {
    size,
    scale,
    itemWidth: tile.width,
    maxStep: tile.width + MAX_GAP,
    minStep: Math.round(tile.width * 0.72),
    height: tile.height + spacing.xs + FACE_HEIGHT * scale,
  };
}

/** The rack for a phone: the medium tile, drawn as it always was. */
export const RACK = {
  phone: rackGeometry("medium"),
  /** An iPhone SE-class window: the small tile, which frees height for the table. */
  compact: rackGeometry("small"),
} as const;

/**
 * The rack for a window: the medium tile grown by the window's screen scale, so the tiles keep
 * pace with the banner, the seats and the action row. Its shorter side decides, so a phone —
 * upright or on its side — gets the phone rack itself.
 */
export function rackFor(window: {
  width: number;
  height: number;
}): RackGeometry {
  const scale = screenScale(window);
  if (scale !== 1) return rackGeometry("medium", scale);
  return isCompactWindow(window) ? RACK.compact : RACK.phone;
}

/**
 * How far apart two places sit, given the room the rack was drawn in: the hand spreads into the
 * room it has — up to the tile and `MAX_GAP` — and closes back up when the room runs short,
 * giving up the gap first and then some of the tile itself. Nothing measured yet, or a lone
 * tile, lays out at the full step.
 */
export function stepFor(
  count: number,
  room: number,
  rack: RackGeometry,
): number {
  if (count < 2 || room <= 0) return rack.maxStep;
  const spread = (room - RACK_INSET * 2 - rack.itemWidth) / (count - 1);
  return Math.max(rack.minStep, Math.min(rack.maxStep, spread));
}

/** The width the places span: one tile, and a step for each of the rest. */
const rowWidth = (count: number, step: number, rack: RackGeometry): number =>
  count === 0 ? 0 : rack.itemWidth + (count - 1) * step;

/**
 * How far the pointer travels before a press becomes a drag: a few pixels, the way dnd-kit's
 * pointer sensor arms, so grabbing a tile and moving it is one motion rather than a press, a
 * hold, and then a move. A stationary press never crosses it, so a tap stays a tap.
 */
const DRAG_ACTIVATE_PX = 6;

/** How long after a drop a press on that tile is still read as the drag's own release. */
const DRAG_SETTLE_MS = 120;

/** A tile in the strip, with the side of the table it came from: the seat's, or the board's. */
export interface StripEntry {
  readonly tile: TileData;
  readonly ownership: TileOwnership;
}

/** The ids a list of entries is ordered by. */
const idsOf = (entries: readonly StripEntry[]): readonly string[] =>
  entries.map((entry) => entry.tile.id);

/** Fisher–Yates over a copy: every arrangement equally likely, the caller's list untouched. */
function shuffled<T>(items: readonly T[]): readonly T[] {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const held = next[index];
    const other = next[swap];
    if (held === undefined || other === undefined) continue;
    next[index] = other;
    next[swap] = held;
  }

  return next;
}

/** The strip with the tile at `from` moved so it sits at `to`; a place it has not got is a no-op. */
export function move(
  entries: readonly StripEntry[],
  from: number,
  to: number,
): readonly StripEntry[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= entries.length ||
    to >= entries.length
  ) {
    return entries;
  }

  const next = [...entries];
  const [held] = next.splice(from, 1);
  if (held === undefined) return entries;
  next.splice(to, 0, held);
  return next;
}

/**
 * The order the kit's positions describe: `{ id: place }` read back into the ids in place order.
 * A drop hands the strip its whole arrangement this way, so the seat's order is rebuilt from the
 * places rather than tracked move by move.
 */
export function orderFromPositions(
  positions: Readonly<Record<string, number>>,
): readonly string[] {
  return Object.entries(positions)
    .sort(([, a], [, b]) => a - b)
    .map(([id]) => id);
}

/** The plays a strip holds, in the order the strip shows them: the word is that order. */
export function inStripOrder(
  strip: readonly StripEntry[],
  plays: readonly TilePlay[],
): readonly TilePlay[] {
  const byTile = new Map(plays.map((play) => [play.tileId, play]));

  return strip.flatMap((entry) => {
    const play = byTile.get(entry.tile.id);
    return play === undefined ? [] : [play];
  });
}

/** Whether two drafts are the same submission: the same tiles, in the order, playing the faces. */
export function sameDraft(
  draft: readonly TilePlay[],
  other: readonly TilePlay[],
): boolean {
  return (
    draft.length === other.length &&
    draft.every((play, index) => {
      const against = other[index];
      return (
        against !== undefined &&
        play.tileId === against.tileId &&
        play.chosenFace === against.chosenFace
      );
    })
  );
}

/**
 * The strip with the tiles the word does not hold rearranged among the places they hold: the
 * draft the seat has built is not something a shuffle should undo, so the word's tiles keep the
 * places they sit in and only the rest are dealt around them.
 */
export function shuffleUnheld(
  strip: readonly StripEntry[],
  held: ReadonlySet<string>,
): readonly StripEntry[] {
  const queue = [
    ...shuffled(strip.filter((entry) => !held.has(entry.tile.id))),
  ];

  return strip.map((entry) =>
    held.has(entry.tile.id) ? entry : (queue.shift() ?? entry),
  );
}

/**
 * The tiles the table has dealt, in the order the seat arranged: order kept by id, a tile the
 * table no longer has replaced in place by one it has just dealt, the rest of the new ones
 * appended.
 *
 * The replacement in place is §44's swap: the new tile takes the place the discarded one sat in,
 * however the seat had arranged the rack.
 */
export function arrangedStrip(
  order: readonly string[],
  entries: readonly StripEntry[],
): readonly StripEntry[] {
  const byId = new Map(entries.map((entry) => [entry.tile.id, entry]));
  const ordered = new Set(order);
  // Tiles the arrangement has never seen, in the table's order; each hole takes the first of them.
  const fresh = entries.filter((entry) => !ordered.has(entry.tile.id));
  const placed = new Set<string>();
  const next: StripEntry[] = [];

  for (const id of order) {
    if (placed.has(id)) continue;
    placed.add(id);
    const entry = byId.get(id) ?? fresh.shift();
    if (entry !== undefined) next.push(entry);
  }
  next.push(...fresh);

  return next;
}

/**
 * The strip as the seat has arranged it: the order is the ids it holds, the tiles are the ones
 * the table has dealt.
 *
 * The table owns which tiles are there and what they print; the seat owns the order it reads
 * them in, which is local, unsubmitted, and survives every draft (`arrangedStrip`), so an
 * arrangement is not undone by the next tap.
 */
export function useStripOrder(entries: readonly StripEntry[]): {
  strip: readonly StripEntry[];
  arrange: (entries: readonly StripEntry[]) => void;
} {
  const [order, setOrder] = useState<readonly string[]>([]);

  const strip = useMemo(() => arrangedStrip(order, entries), [order, entries]);

  const arrange = useCallback(
    (arranged: readonly StripEntry[]) => setOrder(idsOf(arranged)),
    [],
  );

  return { strip, arrange };
}

/**
 * §44's swap as the rack shows it: the tile a power handed the seat, and the tile it turns over
 * from. While `revealed` is false the place still shows `from` — the felt's "power used" card is
 * on screen — and once it is true the tile flips over to the new letter, once.
 */
export interface SwapFlip {
  readonly tileId: string;
  readonly from: TileData;
  readonly revealed: boolean;
}

/** What the strip hands each place: the tile, whether the word holds it, and the face it plays. */
interface StripDatum {
  readonly id: string;
  readonly entry: StripEntry;
  readonly held: boolean;
  readonly chosenFace: string | undefined;
  /**
   * While the seat is choosing a tile for its power: `target` for a tile it may choose (its own),
   * `off` for one it may not. `null` the rest of the time, when a tap plays the tile.
   */
  readonly pick: "target" | "off" | null;
  /** The swap flip this tile still has to play, or null. */
  readonly flip: {
    readonly from: TileData;
    readonly revealed: boolean;
    readonly onDone: () => void;
  } | null;
}

/**
 * The tiles the seat can play, as one strip it sorts by dragging: §7's two private tiles and the
 * board's revealed ones, each where the seat has left it.
 *
 * A tap toggles a tile in or out of the word; a drag moves a tile along the strip, which is how
 * the word is reordered — the word's order *is* the strip's order. The seat's order is
 * authoritative: a drop reports the whole arrangement and the strip is rebuilt from that, so the
 * tiles are drawn from one list and a tile is never left behind in a private copy of it.
 *
 * The places run straight across and spread into the room the rack was given, closing in on each
 * other when that room is narrower than the row — a hand of seven stays on screen and stays
 * tappable rather than running off the edge of the table.
 *
 * When the seat cannot sort — the word is confirmed and locked — the strip is the same places in
 * the same bow, drawn still: there is no gesture to arm and nothing to drag.
 */
export function TileStrip({
  strip,
  held,
  live,
  sortable,
  onToggle,
  onReorder,
  onPick,
  flip = null,
  places = 0,
}: {
  /** The tiles in the seat's order. */
  strip: readonly StripEntry[];
  /**
   * How many places the row lays out, when the hand may grow into them: the tiles take the first
   * ones and the rest are drawn as dashed slots, at the step a full row would have, so a tile
   * dealt later lands where its slot was. 0 lays out the tiles alone.
   */
  places?: number;
  /** The face the word plays each tile it holds, by tile id; absent for the tiles it does not. */
  held: ReadonlyMap<string, string | undefined>;
  /** True while §19's window is open and a tap may play a tile. */
  live: boolean;
  /** True while the seat may reorder the strip, whether or not it may yet play a tile. */
  sortable: boolean;
  /** Plays a tile, takes it back out, or names the other face of a choice tile. */
  onToggle: (entry: StripEntry, face?: string) => void;
  /** Reports the strip's whole order after a drop. */
  onReorder: (orderedIds: readonly string[]) => void;
  /**
   * Set while the seat is choosing a private tile for its power (§44): a tap on one of its own
   * tiles picks it instead of playing it, the board's tiles take no tap, and nothing drags.
   */
  onPick?: (tile: TileData) => void;
  /** The swap the rack still has to turn over, if the seat has used its power. */
  flip?: SwapFlip | null;
}): JSX.Element {
  const picking = onPick !== undefined;
  // A flip plays once: a later remount of the live strip — a drag, a shuffle — shows the new tile.
  const [flipped, setFlipped] = useState<string | null>(null);

  // The room the rack was given, measured off the row rather than assumed: the step the places
  // are laid out at is whatever fits this hand into it.
  const [room, setRoom] = useState(0);
  const measure = useCallback((event: LayoutChangeEvent) => {
    setRoom(Math.round(event.nativeEvent.layout.width));
  }, []);

  // True from a drag's start until a beat after its drop: the kit's pan does not cancel the
  // tile's own press on the web — the pointer never leaves the tile, since the tile travels with
  // it — so the release that ends a drag is read as a press too. That first press is the drop
  // and nothing else; a beat later, a press is a press again.
  const dragging = useRef(false);
  const settle = useCallback(() => {
    setTimeout(() => {
      dragging.current = false;
    }, DRAG_SETTLE_MS);
  }, []);
  const toggle = useCallback(
    (entry: StripEntry, face?: string) => {
      if (dragging.current) return;
      if (onPick !== undefined) {
        if (entry.ownership === "private") onPick(entry.tile);
        return;
      }
      onToggle(entry, face);
    },
    [onPick, onToggle],
  );

  const data = useMemo<readonly StripDatum[]>(
    () =>
      strip.map((entry) => ({
        id: entry.tile.id,
        entry,
        held: held.has(entry.tile.id),
        chosenFace: held.get(entry.tile.id),
        pick: picking ? (entry.ownership === "private" ? "target" : "off") : null,
        flip:
          flip !== null && flip.tileId === entry.tile.id && flipped !== flip.tileId
            ? {
                from: flip.from,
                revealed: flip.revealed,
                onDone: () => setFlipped(flip.tileId),
              }
            : null,
      })),
    [strip, held, picking, flip, flipped],
  );

  const rack = rackFor(useWindowDimensions());
  const hasChoice = strip.some(({ tile }) => "alternativeLetter" in tile);
  const stripHeight = hasChoice ? rack.height : rack.height - FACE_HEIGHT * rack.scale;
  // A hand never holds more than the places (§7's seven), but cap the empties at 0 rather than
  // trust it: a negative count would draw nothing and shift every step.
  const laidOut = Math.max(places, data.length);
  const empty = laidOut - data.length;
  const step = stepFor(laidOut, room, rack);

  return (
    <View
      accessibilityLabel="Your letter rack"
      onLayout={measure}
      style={[styles.strip, rack === RACK.compact && styles.stripTight]}
      testID="word-builder-strip"
    >
      {/*
        Every tile is laid out absolutely in this row, so the row is where the strip's own size
        is set: a tile at each end, a step between the places, and the height the bow and a
        choice tile's chips take.
      */}
      <View
        style={[
          styles.stripContent,
          { height: stripHeight, width: rowWidth(laidOut, step, rack) },
        ]}
      >
        {Array.from({ length: empty }, (_, index) => (
          <EmptyPlace
            key={`empty-${data.length + index}`}
            left={(data.length + index) * step}
            rack={rack}
            step={step}
            testID={`word-builder-place-${data.length + index}`}
          />
        ))}
        {sortable && !picking ? (
          /*
            The strip seeds its places once, from the order it is first handed, so the live
            strip is remounted whenever that order changes — a drop, a shuffle, a freshly dealt
            tile, or a rack that took a different step — and the seat's order stays the one
            source of truth. A tap changes only which tiles the word holds, not their order, so
            it re-renders in place without a remount.
          */
          <SortableStrip
            data={data}
            key={`${rack.scale}:${step}:${data.map((datum) => datum.id).join("-")}`}
            live={live}
            onDragStart={() => {
              dragging.current = true;
              haptic("lift");
            }}
            onDrop={(order) => {
              haptic("settle");
              settle();
              onReorder(order);
            }}
            onToggle={toggle}
            rack={rack}
            step={step}
          />
        ) : (
          // There is nothing to sort once the word is locked in, so the rack is the same places
          // drawn still.
          data.map((datum, index) => (
            <View
              key={datum.id}
              style={[
                styles.place,
                { left: index * step, width: rack.itemWidth },
              ]}
            >
              <TileContent
                datum={datum}
                live={live}
                onToggle={toggle}
                size={rack.size}
                scale={rack.scale}
              />
            </View>
          ))
        )}
      </View>
    </View>
  );
}

/**
 * A place no tile has been dealt to yet: a dashed outline the size of a tile, in the row at the
 * step a full hand would sit at. A slot is not a drop target — the drag runs over the tiles only —
 * so it takes no touch.
 */
function EmptyPlace({
  left,
  rack,
  step,
  testID,
}: {
  left: number;
  rack: RackGeometry;
  step: number;
  testID: string;
}): JSX.Element {
  const tile = scaleTileMetrics(rack.size, rack.scale);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.emptyPlace,
        {
          borderRadius: tile.radius,
          // A hand squeezed past a tile's width lays its places closer than a tile; the outline
          // gives up the same room rather than draw over its neighbour.
          height: tile.height,
          left,
          width: Math.min(rack.itemWidth, step - 2),
        },
      ]}
      testID={testID}
    />
  );
}

/**
 * The strip's live arrangement.
 *
 * AGENTS.md keeps drag-and-drop on `react-native-reanimated-dnd` and forbids a hand-rolled pan
 * everywhere else; this one strip is the documented exception. The kit's horizontal sortable is
 * the only thing that animates the other tiles out of a dragged tile's way, but it arms its drag
 * with a 200ms long-press that cannot be turned off — on the web, with a pointer, that reads as
 * a tile that will not move. So the strip drives its own pan: it arms on a few pixels of travel
 * (`DRAG_ACTIVATE_PX`), like dnd-kit's pointer sensor, and slides the rest of the tiles aside as
 * the dragged one crosses their places. It stays on Reanimated and gesture-handler — the same
 * ground the kit stands on — and nowhere else in the app grows a second copy of it.
 *
 * `positions` is the one source of truth for the drag: `{ id: place }`, seeded from the order
 * the strip is handed. This is remounted whenever that order changes (see `TileStrip`), so the
 * shared value is always born in step with the data and the drop only has to report the order it
 * settled on.
 */
function SortableStrip({
  data,
  live,
  rack,
  step,
  onToggle,
  onDragStart,
  onDrop,
}: {
  data: readonly StripDatum[];
  live: boolean;
  rack: RackGeometry;
  /** How far apart the places sit, as the room the rack was given allows. */
  step: number;
  onToggle: (entry: StripEntry, face?: string) => void;
  onDragStart: () => void;
  onDrop: (orderedIds: readonly string[]) => void;
}): JSX.Element {
  const count = data.length;
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(data.map((datum, index) => [datum.id, index])),
  );
  const activeId = useSharedValue<string | null>(null);

  const settle = useCallback(
    (order: Record<string, number>) => onDrop(orderFromPositions(order)),
    [onDrop],
  );

  return (
    <>
      {data.map((datum) => (
        <DragTile
          activeId={activeId}
          count={count}
          datum={datum}
          key={datum.id}
          live={live}
          onDragStart={onDragStart}
          onDrop={settle}
          onToggle={onToggle}
          positions={positions}
          rack={rack}
          step={step}
        />
      ))}
    </>
  );
}

/**
 * One tile of the live strip: it draws itself at the place `positions` gives it, follows the
 * pointer while it is the dragged one, and springs aside when another tile takes its place.
 */
function DragTile({
  datum,
  count,
  rack,
  step,
  positions,
  activeId,
  live,
  onToggle,
  onDragStart,
  onDrop,
}: {
  datum: StripDatum;
  count: number;
  rack: RackGeometry;
  /** How far apart the places sit, as the room the rack was given allows. */
  step: number;
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string | null>;
  live: boolean;
  onToggle: (entry: StripEntry, face?: string) => void;
  onDragStart: () => void;
  onDrop: (order: Record<string, number>) => void;
}): JSX.Element {
  const id = datum.id;
  const left = useSharedValue((positions.get()[id] ?? 0) * step);
  const dragBase = useSharedValue(0);

  // A tile the seat is not holding springs to whatever place it now sits in — this is the
  // reflow, the rest of the strip opening a gap for the dragged tile and closing behind it.
  useAnimatedReaction(
    () => positions.get()[id],
    (place) => {
      if (place === undefined || activeId.get() === id) return;
      left.set(withSpring(place * step, { damping: 22, stiffness: 240 }));
    },
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
    .onStart(() => {
      activeId.set(id);
      dragBase.set((positions.get()[id] ?? 0) * step);
      runOnJS(onDragStart)();
    })
    .onUpdate((event) => {
      left.set(dragBase.get() + event.translationX);

      // The place the tile's middle is over now, and, if it moved, the strip shifted so the
      // tiles between here and there slide by one to make room — an insert, never a swap.
      const target = Math.max(
        0,
        Math.min(count - 1, Math.round(left.get() / step)),
      );
      const places = positions.get();
      const current = places[id];
      if (current === undefined || current === target) return;

      const next: Record<string, number> = {};
      for (const key in places) {
        const place = places[key];
        if (key === id) next[key] = target;
        else if (current < target)
          next[key] = place > current && place <= target ? place - 1 : place;
        else next[key] = place >= target && place < current ? place + 1 : place;
      }
      positions.set(next);
    })
    .onEnd(() => {
      left.set(
        withSpring((positions.get()[id] ?? 0) * step, {
          damping: 22,
          stiffness: 240,
        }),
      );
    })
    .onFinalize(() => {
      if (activeId.get() !== id) return;
      activeId.set(null);
      runOnJS(onDrop)({ ...positions.get() });
    });

  const animatedStyle = useAnimatedStyle(() => {
    const active = activeId.get() === id;
    return {
      left: left.get(),
      transform: [
        {
          scale: withSpring(active ? 1.08 : 1, { damping: 18, stiffness: 260 }),
        },
      ],
      zIndex: active ? 10 : 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.place, { width: rack.itemWidth }, animatedStyle]}
      >
        <TileContent
          datum={datum}
          live={live}
          onToggle={onToggle}
          size={rack.size}
          scale={rack.scale}
        />
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * One tile in the strip: the tile itself, and — under a choice tile — the two faces that name
 * which letter §10 plays it for. A tap plays the tile or takes it back; the drag lives on the
 * `SortableItem` around this, so the press is only ever a play.
 */
function TileContent({
  datum,
  live,
  size,
  scale,
  onToggle,
}: {
  datum: StripDatum;
  live: boolean;
  size: TileSize;
  scale: number;
  onToggle: (entry: StripEntry, face?: string) => void;
}): JSX.Element {
  const { entry, held, chosenFace, pick, flip } = datum;
  const { tile, ownership } = entry;
  // Choosing a tile for a power: the seat's own tiles are the only ones that answer a tap.
  const picking = pick !== null;
  const choice = "alternativeLetter" in tile ? tile : null;
  // §39: a tile read aloud gives both faces of a choice tile and which one is played, so a
  // held choice tile says the face the word is playing and not only the pair it prints.
  const playing =
    choice !== null && held && chosenFace !== undefined
      ? `, playing ${chosenFace}`
      : "";
  const powered = isSwappedTileId(tile.id);
  // What the place says: the face it shows — the discarded tile, while a swap is still to turn
  // over — and what a tap on it would do.
  const labelFor = (face: TileData): string => {
    const mark = face === tile && powered ? ", from your power" : "";
    const spoken = `${getTileAccessibilityLabel(face)}${mark}${playing}`;
    if (pick === "target") return `${spoken}, tap to swap it`;
    return held ? `${spoken}, in your word, tap to take it back` : `${spoken}, tap to play it`;
  };
  const tileProps = {
    chosenFace,
    dimmed: picking ? pick === "off" : live && !held,
    interactive: picking ? pick === "target" : live,
    onPress: () => {
      haptic("settle");
      onToggle(entry);
    },
    ownership,
    scale,
    selected: held && !picking,
    shadow: false,
    size,
    testID: `word-builder-tile-${tile.id}`,
  };

  return (
    <View style={styles.entry}>
      <PickPulse active={pick === "target"}>
        {flip === null ? (
          <Tile
            {...tileProps}
            accessibilityLabel={labelFor(tile)}
            powered={powered}
            side="front"
            tile={tile}
          />
        ) : (
          <SwapReveal
            flip={flip}
            render={(face, side, onFlipComplete) => (
              <Tile
                {...tileProps}
                accessibilityLabel={labelFor(face)}
                onFlipComplete={onFlipComplete}
                powered={face === tile && powered}
                side={side}
                tile={face}
              />
            )}
            scale={scale}
            size={size}
            tile={tile}
          />
        )}
      </PickPulse>
      {choice === null ? null : (
        <View style={styles.faces}>
          {[choice.letter, choice.alternativeLetter].map((face) => (
            <FaceChip
              key={face}
              chosen={chosenFace === face}
              face={face}
              onPress={() => {
                haptic("settle");
                onToggle(entry, face);
              }}
              playable={live && !picking}
              tile={choice}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * A private tile the seat may choose for its power (§44): it breathes, with a gold ring, so the
 * rack says which tiles the tap is waiting on. Under reduced motion the ring holds still.
 */
function PickPulse({ active, children }: { active: boolean; children: ReactNode }): JSX.Element {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (active && !reduceMotion) {
      pulse.set(
        withRepeat(
          withSequence(withTiming(1, { duration: 520 }), withTiming(0, { duration: 520 })),
          -1,
        ),
      );
      return;
    }
    cancelAnimation(pulse);
    pulse.set(active ? 1 : 0);
  }, [active, pulse, reduceMotion]);

  const breathe = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.get() * 0.06 }],
  }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.45 + pulse.get() * 0.55 }));

  return (
    <Animated.View style={active ? breathe : undefined}>
      {children}
      {active ? (
        <Animated.View pointerEvents="none" style={[styles.pickRing, glow(colors.gold, 8), ring]} />
      ) : null}
    </Animated.View>
  );
}

/**
 * The swap turning over in its place (§44): the tile the seat discarded shows until the swap is
 * `revealed`, then turns face down and back up as the new letter. Under reduced motion the two
 * cross-fade instead. `render` draws the one tile the place shows at each beat.
 */
function SwapReveal({
  flip,
  tile,
  size,
  scale,
  render,
}: {
  flip: NonNullable<StripDatum["flip"]>;
  tile: TileData;
  size: TileSize;
  scale: number;
  render: (
    face: TileData,
    side: TileSide,
    onFlipComplete?: (side: TileSide) => void,
  ) => JSX.Element;
}): JSX.Element {
  const reduceMotion = useReducedMotion();
  // `from`: the old face, waiting. `hiding`: turning face down. `showing`: up again, the new tile.
  const [beat, setBeat] = useState<"from" | "hiding" | "showing">("from");
  const { revealed, onDone } = flip;

  // A beat after the old face is drawn, never during the render that mounts it: the tile has to
  // be face up before it can turn over, and a tile mounted face down has no turn to report.
  useEffect(() => {
    if (!revealed || beat !== "from") return;
    const timer = setTimeout(() => setBeat(reduceMotion ? "showing" : "hiding"), SWAP_TURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [beat, reduceMotion, revealed]);

  // The cross-fade is the whole reveal: the flip is done once the fade has had its beat.
  useEffect(() => {
    if (!reduceMotion || beat !== "showing") return;
    const timer = setTimeout(onDone, SWAP_FADE_MS);
    return () => clearTimeout(timer);
  }, [beat, onDone, reduceMotion]);

  if (reduceMotion) {
    const metrics = scaleTileMetrics(size, scale);
    return (
      <View style={{ height: metrics.height, width: metrics.width }}>
        {beat === "from" ? (
          <Animated.View exiting={FadeOut.duration(SWAP_FADE_MS)} key="from" style={styles.swapFace}>
            {render(flip.from, "front")}
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(SWAP_FADE_MS)} key="to" style={styles.swapFace}>
            {render(tile, "front")}
          </Animated.View>
        )}
      </View>
    );
  }

  if (beat === "from") return render(flip.from, "front");
  if (beat === "hiding") {
    return render(flip.from, "back", (side) => {
      if (side === "back") setBeat("showing");
    });
  }
  return render(tile, "front", (side) => {
    if (side === "front") onDone();
  });
}

/** How long a swap's cross-fade takes under reduced motion. */
const SWAP_FADE_MS = 240;

/** How long the discarded face holds once revealed, so the eye sees what turns over. */
const SWAP_TURN_DELAY_MS = 150;

/** One face of a choice tile, as the tap that plays the tile for that letter (§10). */
function FaceChip({
  tile,
  face,
  chosen,
  playable,
  onPress,
}: {
  tile: TileData & { alternativeLetter: string };
  face: string;
  /** True while the word plays this tile for this face. */
  chosen: boolean;
  playable: boolean;
  onPress: () => void;
}): JSX.Element {
  const testID = `word-builder-face-${tile.id}-${face}`;
  return (
    <Pressable
      accessibilityLabel={`Play the ${tile.letter}/${tile.alternativeLetter} tile as ${face}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !playable, selected: chosen }}
      disabled={!playable}
      // The chip's label names the letters, not this face of them: a flow names the face by
      // its test id, which is the page's own id on the web (webTestID).
      id={webTestID(testID)}
      onPress={onPress}
      style={[
        styles.chip,
        chosen && styles.chipChosen,
        !playable && styles.chipSpent,
      ]}
      testID={testID}
    >
      <Text style={styles.chipFace}>{face}</Text>
    </Pressable>
  );
}
