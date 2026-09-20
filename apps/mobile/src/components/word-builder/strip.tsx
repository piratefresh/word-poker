import type { Tile as TileData, TilePlay } from "@wordpoker/contracts";
import type { JSX } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import {
  Tile,
  TILE_METRICS,
  getTileAccessibilityLabel,
  type TileOwnership,
  type TileSize,
} from "@/components/game";
import { spacing } from "@/constants/theme";

import { haptic } from "./haptics";
import { styles } from "./styles";

/**
 * A tile in the strip stays where the seat left it: the word is the tiles it has selected, read
 * left to right, so a tap toggles a tile in or out of the word without moving it and a drag is
 * only ever an order. The strip's grid is taken from the tile it draws — a place is one tile
 * plus the gap that separates it from the next, laid out from the strip's start — so the tile's
 * own metrics are what the places and the drag are measured in.
 */
const RACK_TILE_SIZE: TileSize = "medium";
const TILE = TILE_METRICS[RACK_TILE_SIZE];
const ITEM_WIDTH = TILE.width;

/** The widest gap the places take between them: a short hand sits at this and stays tight. */
const MAX_GAP = 10;

/** How far apart two places sit on a rack with room to spare: the tile and that daylight. */
const MAX_STEP = ITEM_WIDTH + MAX_GAP;

/**
 * The closest two places may come. A narrow phone gives up the gap first and then some of the
 * tile itself, so the end tiles overlap the way a hand held in one does — the hand stays on
 * screen and stays tappable rather than running off the edge of the table.
 */
const MIN_STEP = Math.round(ITEM_WIDTH * 0.72);

/** The bite taken at either end of the rack, so the hand does not run into the edge of the table. */
const RACK_INSET = 8;

/** A choice tile's chips, under it: the caption they print and the padding they wear it in. */
const FACE_HEIGHT = 24;

/**
 * The strip's row height: a tile and, under a choice tile, its two faces. Every tile is laid out
 * absolutely inside the row, so the row is the one place the height is set.
 */
const RACK_HEIGHT = TILE.height + spacing.xs + FACE_HEIGHT;

/**
 * How far apart two places sit, given the room the rack was drawn in: the hand spreads into the
 * room it has — up to the tile and `MAX_GAP` — and closes back up when the room runs short,
 * giving up the gap first and then some of the tile itself. Nothing measured yet, or a lone
 * tile, lays out at the full step.
 */
function stepFor(count: number, room: number): number {
  if (count < 2 || room <= 0) return MAX_STEP;
  const spread = (room - RACK_INSET * 2 - ITEM_WIDTH) / (count - 1);
  return Math.max(MIN_STEP, Math.min(MAX_STEP, spread));
}

/** The width the places span: one tile, and a step for each of the rest. */
const rowWidth = (count: number, step: number): number =>
  count === 0 ? 0 : ITEM_WIDTH + (count - 1) * step;

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
  if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) {
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
export function orderFromPositions(positions: Readonly<Record<string, number>>): readonly string[] {
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
export function sameDraft(draft: readonly TilePlay[], other: readonly TilePlay[]): boolean {
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
  const queue = [...shuffled(strip.filter((entry) => !held.has(entry.tile.id)))];

  return strip.map((entry) =>
    held.has(entry.tile.id) ? entry : (queue.shift() ?? entry),
  );
}

/**
 * The strip as the seat has arranged it: the order is the ids it holds, the tiles are the ones
 * the table has dealt.
 *
 * The table owns which tiles are there and what they print; the seat owns the order it reads
 * them in, which is local, unsubmitted, and survives every draft — order kept by id, tiles the
 * table no longer has dropped, tiles it has just dealt appended — so an arrangement is not
 * undone by the next tap.
 */
export function useStripOrder(entries: readonly StripEntry[]): {
  strip: readonly StripEntry[];
  arrange: (entries: readonly StripEntry[]) => void;
} {
  const [order, setOrder] = useState<readonly string[]>([]);

  const strip = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.tile.id, entry]));
    const placed = new Set<string>();
    const next: StripEntry[] = [];

    for (const id of order) {
      const entry = byId.get(id);
      if (entry === undefined || placed.has(id)) continue;
      placed.add(id);
      next.push(entry);
    }
    for (const entry of entries) {
      if (!placed.has(entry.tile.id)) next.push(entry);
    }

    return next;
  }, [order, entries]);

  const arrange = useCallback(
    (arranged: readonly StripEntry[]) => setOrder(idsOf(arranged)),
    [],
  );

  return { strip, arrange };
}

/** What the strip hands each place: the tile, whether the word holds it, and the face it plays. */
interface StripDatum {
  readonly id: string;
  readonly entry: StripEntry;
  readonly held: boolean;
  readonly chosenFace: string | undefined;
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
}: {
  /** The tiles in the seat's order. */
  strip: readonly StripEntry[];
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
}): JSX.Element {
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
      onToggle(entry, face);
    },
    [onToggle],
  );

  const data = useMemo<readonly StripDatum[]>(
    () =>
      strip.map((entry) => ({
        id: entry.tile.id,
        entry,
        held: held.has(entry.tile.id),
        chosenFace: held.get(entry.tile.id),
      })),
    [strip, held],
  );

  const step = stepFor(data.length, room);

  return (
    <View
      accessibilityLabel="Your letter rack"
      onLayout={measure}
      style={styles.strip}
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
          { height: RACK_HEIGHT, width: rowWidth(data.length, step) },
        ]}
      >
        {sortable ? (
          /*
            The strip seeds its places once, from the order it is first handed, so the live
            strip is remounted whenever that order changes — a drop, a shuffle, a freshly dealt
            tile, or a rack that took a different step — and the seat's order stays the one
            source of truth. A tap changes only which tiles the word holds, not their order, so
            it re-renders in place without a remount.
          */
          <SortableStrip
            data={data}
            key={`${step}:${data.map((datum) => datum.id).join("-")}`}
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
            step={step}
          />
        ) : (
          // There is nothing to sort once the word is locked in, so the rack is the same places
          // drawn still.
          data.map((datum, index) => (
            <View
              key={datum.id}
              style={[styles.place, { left: index * step, width: ITEM_WIDTH }]}
            >
              <TileContent datum={datum} live={live} onToggle={toggle} />
            </View>
          ))
        )}
      </View>
    </View>
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
  step,
  onToggle,
  onDragStart,
  onDrop,
}: {
  data: readonly StripDatum[];
  live: boolean;
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
      const target = Math.max(0, Math.min(count - 1, Math.round(left.get() / step)));
      const places = positions.get();
      const current = places[id];
      if (current === undefined || current === target) return;

      const next: Record<string, number> = {};
      for (const key in places) {
        const place = places[key];
        if (key === id) next[key] = target;
        else if (current < target) next[key] = place > current && place <= target ? place - 1 : place;
        else next[key] = place >= target && place < current ? place + 1 : place;
      }
      positions.set(next);
    })
    .onEnd(() => {
      left.set(withSpring((positions.get()[id] ?? 0) * step, { damping: 22, stiffness: 240 }));
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
        { scale: withSpring(active ? 1.08 : 1, { damping: 18, stiffness: 260 }) },
      ],
      zIndex: active ? 10 : 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.place, { width: ITEM_WIDTH }, animatedStyle]}>
        <TileContent datum={datum} live={live} onToggle={onToggle} />
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
  onToggle,
}: {
  datum: StripDatum;
  live: boolean;
  onToggle: (entry: StripEntry, face?: string) => void;
}): JSX.Element {
  const { entry, held, chosenFace } = datum;
  const { tile, ownership } = entry;
  const choice = "alternativeLetter" in tile ? tile : null;
  const label = held
    ? `${getTileAccessibilityLabel(tile)}, in your word, tap to take it back`
    : `${getTileAccessibilityLabel(tile)}, tap to play it`;

  return (
    <View style={styles.entry}>
      <Tile
        accessibilityLabel={label}
        dimmed={live && !held}
        interactive={live}
        onPress={() => {
          haptic("settle");
          onToggle(entry);
        }}
        ownership={ownership}
        selected={held}
        side="front"
        size={RACK_TILE_SIZE}
        testID={`word-builder-tile-${tile.id}`}
        tile={tile}
      />
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
              playable={live}
              tile={choice}
            />
          ))}
        </View>
      )}
    </View>
  );
}

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
  return (
    <Pressable
      accessibilityLabel={`Play the ${tile.letter}/${tile.alternativeLetter} tile as ${face}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !playable, selected: chosen }}
      disabled={!playable}
      onPress={onPress}
      style={[styles.chip, chosen && styles.chipChosen, !playable && styles.chipSpent]}
      testID={`word-builder-face-${tile.id}-${face}`}
    >
      <Text style={styles.chipFace}>{face}</Text>
    </Pressable>
  );
}
