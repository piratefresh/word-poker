/**
 * tile-logo.tsx — the home screen's living logo (STO-568): nine letter tiles start scattered and
 * dimmed, then light up one at a time and spring into WORD over POKER. The finished tiles are
 * the logo; nothing replaces them.
 *
 * The box has a fixed height for two rows at the given width, so the cards below never move,
 * and every tile sits at its final place and moves by transforms alone. The intro plays once
 * per app session; with the OS's reduced motion on, the finished logo is drawn still.
 */

import { useFocusEffect } from "expo-router";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { LETTER_VALUES, type Letter } from "@wordpoker/game-rules";

import idleWords from "./idle-words.json";
import { TILE_METRICS, Tile } from "@/components/game/word-tile";
import { colors, fontSize, fonts, opacity, spacing } from "@/constants/theme";

/** The scattered tiles hold still this long before the first one lights. */
const SHUFFLE_MS = 1000;
/** Between one tile lighting and the next: nine tiles, done by about 4s. */
const STAGGER_MS = 300;
/** A lit tile's fade up from dimmed. */
const LIGHT_MS = 150;
const MOVE_SPRING = { damping: 13, stiffness: 160, mass: 0.9 } as const;
/** The pop a tile gives as it lands. */
const LAND_SCALE = 1.12;

const ROWS = ["WORD", "POKER"] as const;
/** The widest row sets the tiles' scale, so a narrow screen shrinks them rather than wrapping. */
const ROW_SLOTS = 5;
/** The tiles never grow past the large tile: a taller header pushes the menu down the screen. */
const MAX_SCALE = 1;
const TILE = TILE_METRICS.large;
const GAP = 6;
const ROW_GAP = 10;
const PAD_Y = spacing.xs;

/**
 * Where each tile waits before it lights, in reading order: x and y as fractions of the room the
 * box leaves a tile, and a tilt in degrees. Drawn fresh per mount, so every visit scatters differently.
 */
export function createLogoScatter(): (readonly [number, number, number])[] {
  return Array.from({ length: 9 }, () => [
    Math.random(),
    Math.random(),
    (Math.random() - 0.5) * 50,
  ]);
}

/** Once per app session: coming back from a game shows the finished logo. */
let introPlayed = false;

/** Share the original entrance without starting the optional word-building demo. */
export function useLogoIntro(): boolean {
  const reduceMotion = useReducedMotion();
  const [play] = useState(() => !introPlayed && !reduceMotion);
  useEffect(() => {
    if (play) introPlayed = true;
  }, [play]);
  return play;
}

interface Slot {
  key: string;
  letter: Letter;
  left: number;
  top: number;
  fromX: number;
  fromY: number;
  fromRotate: number;
  index: number;
}

/** The tiles' scale and the box's height at a width. */
function tileLogoLayout(width: number) {
  const rowWidth = ROW_SLOTS * TILE.width + (ROW_SLOTS - 1) * GAP;
  const scale = Math.min(MAX_SCALE, width / rowWidth);
  const height = 2 * TILE.height * scale + ROW_GAP * scale + PAD_Y * 2;
  return { scale, height };
}

function slots(
  width: number,
  scatter: readonly (readonly [number, number, number])[],
): Slot[] {
  const { scale, height } = tileLogoLayout(width);
  const w = TILE.width * scale;
  const h = TILE.height * scale;
  const out: Slot[] = [];
  ROWS.forEach((word, row) => {
    const rowWidth = word.length * w + (word.length - 1) * GAP * scale;
    [...word].forEach((letter, col) => {
      const index = out.length;
      const left = (width - rowWidth) / 2 + col * (w + GAP * scale);
      const top = PAD_Y + row * (h + ROW_GAP * scale);
      const [fx, fy, rotate] = scatter[index];
      out.push({
        key: `${word}-${col}`,
        letter: letter as Letter,
        left,
        top,
        fromX: fx * (width - w) - left,
        fromY: fy * (height - h) - top,
        fromRotate: rotate,
        index,
      });
    });
  });
  return out;
}

export function LogoTileEntrance({
  slot,
  play,
  tilt = 0,
  children,
  testID,
}: {
  slot: Pick<Slot, "left" | "top" | "fromX" | "fromY" | "fromRotate" | "index">;
  play: boolean;
  tilt?: number;
  children: ReactNode;
  testID: string;
}) {
  const progress = useSharedValue(play ? 0 : 1);
  const lit = useSharedValue(play ? opacity.muted : 1);
  const pop = useSharedValue(1);
  const delay = SHUFFLE_MS + slot.index * STAGGER_MS;

  useEffect(() => {
    if (!play) return;
    progress.set(withDelay(delay, withSpring(1, MOVE_SPRING)));
    lit.set(withDelay(delay, withTiming(1, { duration: LIGHT_MS })));
    pop.set(
      withDelay(
        delay,
        withSequence(
          withTiming(LAND_SCALE, { duration: LIGHT_MS }),
          withSpring(1, MOVE_SPRING),
        ),
      ),
    );
    return () => {
      cancelAnimation(progress);
      cancelAnimation(lit);
      cancelAnimation(pop);
    };
  }, [delay, lit, play, pop, progress]);

  const motion = useAnimatedStyle(() => {
    const away = 1 - progress.get();
    return {
      opacity: lit.get(),
      transform: [
        { translateX: slot.fromX * away },
        { translateY: slot.fromY * away },
        { rotate: `${slot.fromRotate * away + tilt * progress.get()}deg` },
        { scale: pop.get() },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.tile, { left: slot.left, top: slot.top }, motion]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

function LogoTile({ slot, scale, play }: { slot: Slot; scale: number; play: boolean }) {
  return (
    <LogoTileEntrance slot={slot} play={play} testID={`tile-logo-${slot.key}`}>
      <Tile
        animation="none"
        interactive={false}
        scale={scale}
        side="front"
        size="large"
        tile={{
          id: slot.key,
          letter: slot.letter,
          points: LETTER_VALUES[slot.letter],
        }}
      />
    </LogoTileEntrance>
  );
}

/**
 * The idle words (STO-569), in idle-words.json: `start` is how the word's tiles begin, unsorted,
 * and `sorts` the slot swaps that then put the word right. Steps run: light one tile each (in
 * `activate` order), then one swap each, so the order reads like a player picking.
 */
export interface IdleWord {
  readonly word: string;
  readonly start: string;
  /** Indexes into `start`, in the order the tiles light. */
  readonly activate: readonly number[];
  readonly sorts: readonly (readonly number[])[];
}
export const WORD_POOL = idleWords as readonly IdleWord[];

/** The tile (index into `start`) in each slot after `step` swaps. */
export function orderAt(entry: IdleWord, step: number): number[] {
  const swaps = Math.max(0, step - entry.word.length);
  const order = [...entry.start].map((_, i) => i);
  for (const [a, b] of entry.sorts.slice(0, swaps)) {
    [order[a], order[b]] = [order[b], order[a]];
  }
  return order;
}

/** The logo holds this long (after its intro) before it turns into the demo. */
const HOLD_LOGO_MS = 2000;
/** The unsorted tiles show this long before the first swap. */
const START_MS = 1200;
/** Between one tile lighting and the next. */
const LIGHT_STEP_MS = 600;
/** Between swaps, and the beat after the last tile lights so the wrong order reads. */
const SORT_MS = 1200;
/** The finished word holds this long. */
const HOLD_WORD_MS = 2400;
/** The intro's last tile has landed by about here. */
const INTRO_MS = SHUFFLE_MS + 9 * STAGGER_MS + 700;
const MAX_WORD = 7;
/** The logo and the idle word cross-fade over this long, and the wordmark fades in with it. */
const FADE_MS = 400;

/** A tile: dimmed until it is lit, then lit; slides when a swap moves it. */
function DemoTile({
  left,
  top,
  letter,
  on,
  scale,
}: {
  left: number;
  top: number;
  letter: Letter;
  on: boolean;
  scale: number;
}) {
  const x = useSharedValue(left);
  const lit = useSharedValue<number>(opacity.muted);

  useEffect(() => {
    x.set(withSpring(left, MOVE_SPRING));
    lit.set(withTiming(on ? 1 : opacity.muted, { duration: LIGHT_MS }));
  }, [left, lit, on, x]);

  const motion = useAnimatedStyle(() => ({
    opacity: lit.get(),
    transform: [{ translateX: x.get() }],
  }));

  return (
    <Animated.View style={[styles.tile, { left: 0, top }, motion]}>
      <Tile
        animation="none"
        interactive={false}
        scale={scale}
        side="front"
        size="large"
        tile={{
          id: `demo-${letter}`,
          letter,
          points: LETTER_VALUES[letter],
        }}
      />
    </Animated.View>
  );
}

function IdleWordRow({
  entry,
  step,
  height,
  scale,
  width,
}: {
  entry: IdleWord;
  step: number;
  height: number;
  scale: number;
  width: number;
}) {
  // One scale for every word, so the tiles never resize between words.
  const demoScale = Math.min(
    scale,
    width / (MAX_WORD * TILE.width + (MAX_WORD - 1) * GAP),
  );
  const w = TILE.width * demoScale;
  const gap = GAP * demoScale;
  const rowLeft =
    (width - (entry.word.length * w + (entry.word.length - 1) * gap)) / 2;
  const top = (height - TILE.height * demoScale) / 2;
  const order = orderAt(entry, step);

  return (
    <Animated.View
      entering={FadeIn.duration(FADE_MS)}
      exiting={FadeOut.duration(FADE_MS)}
      style={StyleSheet.absoluteFill}
      testID="tile-logo-rack"
    >
      {[...entry.start].map((letter, tile) => {
        const slot = order.indexOf(tile);
        return (
          <DemoTile
            key={`${entry.word}-${tile}`}
            left={rowLeft + slot * (w + gap)}
            letter={letter as Letter}
            on={entry.activate.indexOf(tile) < step}
            scale={demoScale}
            top={top}
          />
        );
      })}
    </Animated.View>
  );
}

/** The name as text, for when the idle words have replaced the logo tiles. Keeps its space while hidden. */
export function Wordmark({
  visible,
}: {
  readonly visible: boolean;
}): ReactElement {
  const fade = useAnimatedStyle(
    () => ({ opacity: withTiming(visible ? 1 : 0, { duration: FADE_MS }) }),
    [visible],
  );
  return (
    <Animated.Text aria-hidden style={[styles.wordmark, fade]}>
      Word Poker
    </Animated.Text>
  );
}

export function TileLogo({
  width,
  onIdleChange,
}: {
  readonly width: number;
  /** Told when the idle word loop takes over from the logo and when it hands back. */
  readonly onIdleChange?: (idle: boolean) => void;
}): ReactElement {
  const reduceMotion = useReducedMotion();
  // Read once per mount: a re-render mid-intro must not snap the tiles home.
  const play = useLogoIntro();
  const [scatter] = useState(createLogoScatter);
  const [demo, setDemo] = useState<{ index: number; step: number } | null>(
    null,
  );
  const idle = demo !== null;

  useEffect(() => {
    onIdleChange?.(idle);
  }, [idle, onIdleChange]);

  // One timer chain: logo -> unsorted word -> swaps -> hold -> next word. Blur or unmount clears it.
  useFocusEffect(
    useCallback(() => {
      if (reduceMotion) return;
      let timer: ReturnType<typeof setTimeout>;
      const advance = (index: number, step: number) => {
        setDemo({ index, step });
        const entry = WORD_POOL[index];
        if (step >= entry.word.length + entry.sorts.length) {
          timer = setTimeout(
            () => showWord((index + 1) % WORD_POOL.length),
            HOLD_WORD_MS,
          );
        } else {
          timer = setTimeout(
            () => advance(index, step + 1),
            step < entry.word.length ? LIGHT_STEP_MS : SORT_MS,
          );
        }
      };
      const showWord = (index: number) => {
        setDemo({ index, step: 0 });
        timer = setTimeout(() => advance(index, 1), START_MS);
      };
      timer = setTimeout(
        () => showWord(0),
        HOLD_LOGO_MS + (play ? INTRO_MS : 0),
      );
      return () => {
        clearTimeout(timer);
        setDemo(null);
      };
    }, [play, reduceMotion]),
  );

  const fade = useAnimatedStyle(
    () => ({ opacity: withTiming(idle ? 0 : 1, { duration: FADE_MS }) }),
    [idle],
  );
  const { scale, height } = tileLogoLayout(width);

  return (
    <View
      accessibilityLabel="Word Poker"
      accessibilityRole="header"
      accessible
      // The scatter can overhang the box; it must never take a tap meant for the menu.
      pointerEvents="none"
      style={{ height, width }}
      testID="tile-logo"
    >
      <Animated.View aria-hidden style={[StyleSheet.absoluteFill, fade]}>
        {slots(width, scatter).map((slot) => (
          <LogoTile key={slot.key} play={play} scale={scale} slot={slot} />
        ))}
      </Animated.View>
      {demo ? (
        <View aria-hidden style={StyleSheet.absoluteFill}>
          <IdleWordRow
            entry={WORD_POOL[demo.index]}
            step={demo.step}
            height={height}
            key={demo.index}
            scale={scale}
            width={width}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { position: "absolute" },
  wordmark: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h2,
    lineHeight: 36,
  },
});
