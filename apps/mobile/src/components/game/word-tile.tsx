import type { LetterMultiplier, Tile as WireTile } from "@wordpoker/contracts";
import { LinearGradient } from "expo-linear-gradient";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import {
  border,
  colors,
  duration,
  easing as motionEasing,
  fonts,
  gradients,
  opacity,
  palette,
  tileMaterial,
} from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

import { TileChoiceBeam } from "./tile-choice-beam";

/**
 * The tile this component draws: the wire shape (contracts' `Tile`, aliased here because
 * this module's own `Tile` is the renderer). A tile is one of two shapes — a single letter, or
 * a choice pair (A/E) — and the component reads the second face from the choice shape.
 */
export type TileData = WireTile;
export type TileSide = "front" | "back";
export type TileSize = "small" | "medium" | "large";
export type TileOwnership = "private" | "community" | "neutral";
export interface TileProps {
  tile: TileData;
  side: TileSide;
  size?: TileSize;
  /** Grows the size's metrics by a factor, for a window larger than the size was drawn for. */
  scale?: number;
  ownership?: TileOwnership;
  selected?: boolean;
  /** The letter a selected choice tile is playing, used to highlight its point value. */
  chosenFace?: string;
  dimmed?: boolean;
  disabled?: boolean;
  interactive?: boolean;
  animation?: "none" | "flip" | "deal";
  /**
   * The beat a dealing tile waits on before it leaves the deck, in milliseconds. A row
   * staggers by handing each position its own beat; 0 is the undealt deal, as it was.
   */
  dealDelayMs?: number;
  onPress?: () => void;
  onFlipComplete?: (side: TileSide) => void;
  /**
   * §44: a power handed the seat this tile. Its face wears a small ⚡, in the rack and at
   * showdown, which says a power made the tile and nothing about what it replaced.
   */
  powered?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface TileMetrics {
  width: number;
  /** The whole tile, slab included: the box a place lays out, so the slab adds no height. */
  height: number;
  /** The slab under the face — the tile's thickness, about 11% of its height. */
  slab: number;
  radius: number;
  borderWidth: number;
  letterSize: number;
  alternateSize: number;
  pointSize: number;
  badgeSize: number;
  inset: number;
}
export const TILE_METRICS: Record<TileSize, TileMetrics> = {
  small: {
    width: 34,
    height: 40,
    slab: 4,
    radius: 5,
    borderWidth: 1,
    letterSize: 22,
    alternateSize: 15,
    pointSize: 9,
    badgeSize: 7,
    inset: 3,
  },
  medium: {
    width: 44,
    height: 52,
    slab: 6,
    radius: 7,
    borderWidth: 1.25,
    letterSize: 29,
    alternateSize: 19,
    pointSize: 11,
    badgeSize: 8,
    inset: 4,
  },
  large: {
    width: 58,
    height: 69,
    slab: 8,
    radius: 9,
    borderWidth: 1.5,
    letterSize: 38,
    alternateSize: 25,
    pointSize: 13,
    badgeSize: 10,
    inset: 5,
  },
};

/** A size's metrics grown by `factor`; a factor of 1 hands back the size's own object. */
export function scaleTileMetrics(size: TileSize, factor: number): TileMetrics {
  const base = TILE_METRICS[size];
  if (factor === 1) return base;
  const scaled = {} as TileMetrics;
  for (const key of Object.keys(base) as (keyof TileMetrics)[]) {
    scaled[key] = base[key] * factor;
  }
  return scaled;
}

/**
 * The contact shadow under a tile, in points of a medium tile (other sizes scale it). A lift adds
 * the `lift*` amounts — selected is a lift of 1, a flip's midpoint another — so the shadow widens
 * and fades as the tile rises off the table.
 */
const CONTACT_SHADOW = {
  offsetY: 3,
  blur: 4,
  alpha: 0.55,
  liftOffsetY: 3,
  liftBlur: 6,
  liftSpread: 1.5,
  liftFade: 0.2,
} as const;

/** The letter and its points: Lilita One's heavy round face, against the reference's lettering. */
const TILE_FONT = fonts.arcade;

const FLIP_EASING = Easing.bezier(...motionEasing.flip);
const DEAL_EASING = Easing.bezier(...motionEasing.deal);
const FLIP_PERSPECTIVE = 900;
// The reference rims every tile in dark brown; an owner's colour is kept, but a shade darker so
// it reads as an edge and not a highlight.
const OWNERSHIP_BORDER: Record<TileOwnership, string> = {
  private: "#b07a1c",
  community: "#5d7a45",
  neutral: "#7a4b27",
};
const MULTIPLIER_LABEL: Record<LetterMultiplier, string> = {
  "double-letter": "2L",
  "triple-letter": "3L",
};

/** §10's choice tiles wear an accent no single letter does: the pair is one tile, not two. */
const CHOICE_ACCENT = palette.violet400;

/**
 * The second face a choice tile prints — `E` for A/E — or null on a single-letter tile, which
 * has only the one face to show (§10).
 */
function secondFace(tile: TileData): string | null {
  return "alternativeLetter" in tile ? tile.alternativeLetter : null;
}

/**
 * What the face shows as the tile's value: the one value of a single letter, and a choice
 * tile's separate values only when its faces disagree — A/E showing `1`, a Q/K showing `10/5`.
 */
function facePoints(tile: TileData): readonly number[] {
  if ("alternativeLetter" in tile && tile.alternativePoints !== tile.points) {
    return [tile.points, tile.alternativePoints];
  }
  return [tile.points];
}

/** §39: a tile read aloud gives both faces of a choice tile, its points, and its multiplier. */
export function getTileAccessibilityLabel(tile: TileData): string {
  const second = secondFace(tile);
  const letters = second === null ? tile.letter : `${tile.letter} or ${second}`;
  const values = facePoints(tile);
  const points = values.length === 1 && values[0] === 1 ? "1 point" : `${values.join(" or ")} points`;
  return `${letters}, ${points}${tile.multiplier ? `, ${tile.multiplier.replace("-", " ")}` : ""}`;
}

/** The ⚡ a powered tile wears: a gold bolt with a dark rim, legible on the tile's cream face. */
function Bolt({ size }: { size: number }) {
  return (
    <Svg height={size} viewBox="0 0 12 12" width={size}>
      <Path
        d="M7.2 0.6 2 6.9h3.3L4.4 11.4 10 4.8H6.6z"
        fill={colors.gold}
        stroke="#5a3508"
        strokeLinejoin="round"
        strokeWidth={0.9}
      />
    </Svg>
  );
}

/** Canonical tile: consumers own position; this component owns faces and local feedback. */
export function Tile({
  tile,
  side,
  size = "medium",
  scale = 1,
  ownership = "neutral",
  selected = false,
  chosenFace,
  dimmed = false,
  disabled = false,
  interactive = false,
  animation = "flip",
  dealDelayMs = 0,
  powered = false,
  onPress,
  onFlipComplete,
  accessibilityLabel,
  style,
  testID,
}: TileProps) {
  const metrics = scaleTileMetrics(size, scale);
  const second = secondFace(tile);
  const reduceMotion = useReducedMotion();
  const target = side === "front" ? 1 : 0;
  const rotation = useSharedValue(target);
  const dealProgress = useSharedValue(
    animation === "deal" && side === "front" && !reduceMotion ? 0 : 1,
  );
  const pressScale = useSharedValue(1);
  const selectedProgress = useSharedValue(selected ? 1 : 0);
  const previousSide = useRef(side);
  const initialDealPending = useRef(
    animation === "deal" && side === "front" && !reduceMotion,
  );
  const latestSide = useRef(side);
  const activeTransitionSide = useRef<TileSide | null>(null);
  const transitionId = useRef(0);
  const mounted = useRef(true);
  const onFlipCompleteRef = useRef(onFlipComplete);
  const [publishedSide, setPublishedSide] = useState<TileSide>(side);
  const [revealing, setRevealing] = useState(false);

  const finishFlip = useCallback(
    (id: number, completedSide: TileSide) => {
      if (
        !mounted.current ||
        transitionId.current !== id ||
        latestSide.current !== completedSide
      )
        return;
      activeTransitionSide.current = null;
      setPublishedSide(completedSide);
      setRevealing(false);
      onFlipCompleteRef.current?.(completedSide);
    },
    [],
  );

  useLayoutEffect(() => {
    latestSide.current = side;
    onFlipCompleteRef.current = onFlipComplete;
  }, [onFlipComplete, side]);

  useEffect(() => {
    // React Strict Mode runs this setup/cleanup pair twice in development.
    mounted.current = true;
    return () => {
      mounted.current = false;
      transitionId.current += 1;
      cancelAnimation(rotation);
      cancelAnimation(dealProgress);
      cancelAnimation(pressScale);
      cancelAnimation(selectedProgress);
    };
  }, [dealProgress, pressScale, rotation, selectedProgress]);

  useEffect(() => {
    selectedProgress.set(
      withTiming(selected ? 1 : 0, {
        duration: duration.fast,
        easing: FLIP_EASING,
      }),
    );
  }, [selected, selectedProgress]);

  useEffect(() => {
    const immediate = animation === "none" || reduceMotion;
    const runDeal = (id: number) => {
      cancelAnimation(dealProgress);
      cancelAnimation(rotation);
      rotation.set(1);
      dealProgress.set(0);
      setRevealing(true);
      // The delay is the row's stagger and nothing else: the sequence is the deal it has
      // always been, and its completion still runs on the same clock, so a tile that waits
      // its beat stays busy until it has actually landed.
      dealProgress.set(
        withDelay(
          dealDelayMs,
          withSequence(
            withTiming(0.58, {
              duration: Math.round(duration.deal * 0.58),
              easing: DEAL_EASING,
            }),
            withTiming(
              1,
              {
                duration: Math.round(duration.deal * 0.42),
                easing: DEAL_EASING,
              },
              (finished) => {
                "worklet";
                if (finished) scheduleOnRN(finishFlip, id, side);
              },
            ),
          ),
        ),
      );
    };

    if (previousSide.current === side) {
      if (initialDealPending.current) {
        initialDealPending.current = false;
        const id = ++transitionId.current;
        activeTransitionSide.current = side;
        runDeal(id);
        return;
      }
      if (!immediate || activeTransitionSide.current !== side) return;
      const id = ++transitionId.current;
      cancelAnimation(rotation);
      rotation.set(target);
      finishFlip(id, side);
      return;
    }
    previousSide.current = side;
    const id = ++transitionId.current;
    activeTransitionSide.current = side;
    cancelAnimation(rotation);
    setRevealing(true);
    if (immediate) {
      cancelAnimation(dealProgress);
      dealProgress.set(1);
      rotation.set(target);
      finishFlip(id, side);
      return;
    }
    if (animation === "deal") {
      if (side === "front") {
        runDeal(id);
      } else {
        cancelAnimation(dealProgress);
        dealProgress.set(1);
        rotation.set(0);
        finishFlip(id, side);
      }
      return;
    }
    rotation.set(
      withTiming(
        target,
        { duration: duration.flip, easing: FLIP_EASING },
        (finished) => {
          "worklet";
          if (finished) scheduleOnRN(finishFlip, id, side);
        },
      ),
    );
  }, [
    animation,
    dealDelayMs,
    dealProgress,
    finishFlip,
    reduceMotion,
    rotation,
    side,
    target,
  ]);

  const shellMotion = useAnimatedStyle(() => {
    const selectedOffset = interpolate(
      selectedProgress.get(),
      [0, 1],
      [0, -4],
    );
    const selectedScale = interpolate(
      selectedProgress.get(),
      [0, 1],
      [1, 1.04],
    );

    if (animation === "deal") {
      const progress = dealProgress.get();
      return {
        opacity: interpolate(progress, [0, 0.58, 1], [0, 1, 1]),
        transform: [
          {
            translateY:
              selectedOffset +
              interpolate(progress, [0, 0.58, 1], [-52, 4, 0]),
          },
          {
            rotateX: `${interpolate(progress, [0, 0.58, 1], [76, -10, 0])}deg`,
          },
          {
            scale:
              pressScale.get() *
              selectedScale *
              interpolate(progress, [0, 0.58, 1], [0.92, 1.04, 1]),
          },
        ],
      };
    }

    const flipProgress = rotation.get();
    const flipLift = Math.round(metrics.height * 0.08);

    return {
      transform: [
        {
          translateY:
            selectedOffset +
            interpolate(flipProgress, [0, 0.5, 1], [0, -flipLift, 0]),
        },
        {
          scale:
            pressScale.get() *
            selectedScale *
            interpolate(flipProgress, [0, 0.5, 1], [1, 1.055, 1]),
        },
      ],
    };
  });
  // The shadow stays on the table while the tile lifts off it, so a lifted tile — selected, or
  // mid-flip — casts a wider, fainter one. A dealing tile has none until it has landed.
  const shadowUnit = metrics.height / TILE_METRICS.medium.height;
  const contactMotion = useAnimatedStyle(() => {
    const lift =
      selectedProgress.get() +
      (animation === "deal"
        ? 0
        : interpolate(rotation.get(), [0, 0.5, 1], [0, 1, 0]));
    const landed =
      animation === "deal"
        ? interpolate(dealProgress.get(), [0, 0.58, 1], [0, 1, 1])
        : 1;
    return {
      boxShadow: [
        {
          offsetX: 0,
          offsetY: (CONTACT_SHADOW.offsetY + lift * CONTACT_SHADOW.liftOffsetY) * shadowUnit,
          blurRadius: (CONTACT_SHADOW.blur + lift * CONTACT_SHADOW.liftBlur) * shadowUnit,
          spreadDistance: lift * CONTACT_SHADOW.liftSpread * shadowUnit,
          color: `rgba(38,18,0,${(CONTACT_SHADOW.alpha - lift * CONTACT_SHADOW.liftFade) * landed})`,
        },
      ],
    };
  });
  // The slab is the tile's body, so it turns with the face: ivory under the front, crimson under
  // the back. It flips colour as the tile goes edge-on, which is when neither face can be seen.
  const slabMotion = useAnimatedStyle(() => {
    const front = rotation.get() > 0.5;
    return {
      backgroundColor: front ? tileMaterial.slab : tileMaterial.back.slab,
      borderColor: front ? tileMaterial.edge : tileMaterial.back.edge,
    };
  });
  const dealGlintMotion = useAnimatedStyle(() => ({
    opacity:
      animation === "deal"
        ? interpolate(
            dealProgress.get(),
            [0, 0.3, 0.58, 0.78, 1],
            [0, 0, 0.32, 0.12, 0],
          )
        : 0,
  }));
  const frontMotion = useAnimatedStyle(() => ({
    transform: [
      { perspective: FLIP_PERSPECTIVE },
      { rotateY: `${interpolate(rotation.get(), [0, 1], [180, 360])}deg` },
    ],
  }));
  const backMotion = useAnimatedStyle(() => ({
    transform: [
      { perspective: FLIP_PERSPECTIVE },
      { rotateY: `${interpolate(rotation.get(), [0, 1], [0, 180])}deg` },
    ],
  }));
  const spokenLabel =
    side === "front" && publishedSide === side && !revealing
      ? (accessibilityLabel ?? getTileAccessibilityLabel(tile))
      : "Hidden letter tile";
  const multiplierLabel = tile.multiplier
    ? MULTIPLIER_LABEL[tile.multiplier]
    : null;
  const setPressed = (pressed: boolean) => {
    pressScale.set(
      withTiming(pressed ? 0.95 : 1, {
        duration: duration.instant,
        easing: FLIP_EASING,
      }),
    );
  };

  return (
    <Pressable
      accessibilityLabel={spokenLabel}
      accessibilityRole={interactive ? "button" : "image"}
      accessibilityState={{
        busy: revealing,
        disabled: disabled || undefined,
        selected: selected || undefined,
      }}
      disabled={!interactive || disabled}
      onPress={interactive && !disabled ? onPress : undefined}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.outer,
        { height: metrics.height, width: metrics.width },
        dimmed && styles.dimmed,
        disabled && styles.disabled,
        style,
      ]}
      // A tile a flow names carries its test id as the page's own id (webTestID): the strip's
      // tiles are the ones a word is built from, and the felt's copies pass no test id at all.
      id={webTestID(testID)}
      testID={testID}
    >
      {/* The shadow is a sibling under the shell, not the shell's own: it stays on the table
          while the shell lifts, and it is a view, so there is no canvas to cost a GL context. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.contact,
          { borderRadius: metrics.radius },
          contactMotion,
        ]}
      />
      <Animated.View
        style={[
          styles.shell,
          { height: metrics.height, width: metrics.width },
          shellMotion,
        ]}
      >
        {/* The slab: the tile's thickness, one static view under the face. It is the whole tile's
            size with rounded corners, so the face covers all of it but the foot. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.slab, { borderRadius: metrics.radius }, slabMotion]}
        />
        <View
          style={[
            styles.frame,
            {
              borderColor: selected ? colors.goldHi : OWNERSHIP_BORDER[ownership],
              borderRadius: metrics.radius,
              borderWidth: selected
                ? metrics.borderWidth + 1
                : metrics.borderWidth,
              height: metrics.height - metrics.slab,
            },
            selected && styles.selectedShell,
          ]}
        >
        <Animated.View
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.face,
            { borderRadius: metrics.radius - 1 },
            frontMotion,
          ]}
        >
          <LinearGradient {...gradients.tile} style={styles.faceFill}>
            {second === null ? null : (
              // §10: a choice tile has to look special. The pair wears an accent strip no
              // single letter does, over the tile's own ownership border.
              <View
                style={[styles.choiceAccent, { height: Math.max(2, metrics.badgeSize / 2) }]}
                testID="tile-choice-accent"
                pointerEvents="none"
              >
                <TileChoiceBeam
                  active={side === "front"}
                  color={CHOICE_ACCENT}
                  height={Math.max(2, metrics.badgeSize / 2)}
                />
              </View>
            )}
            {powered ? (
              // A swapped tile is always plain (§44), so the ⚡ takes the corner a multiplier
              // badge would otherwise hold.
              <View
                pointerEvents="none"
                style={[styles.poweredBadge, { left: metrics.inset, top: metrics.inset }]}
                testID={testID === undefined ? undefined : `${testID}-powered`}
              >
                <Bolt size={metrics.badgeSize + 3} />
              </View>
            ) : null}
            {multiplierLabel ? (
              <View
                style={[
                  styles.multiplierBadge,
                  tile.multiplier === "triple-letter" && styles.tripleBadge,
                  { left: metrics.inset, top: metrics.inset },
                ]}
              >
                <Text
                  style={[styles.multiplier, { fontSize: metrics.badgeSize }]}
                >
                  {multiplierLabel}
                </Text>
              </View>
            ) : null}
            {/* A badge in the corner would sit on a wide letter's arm, so the letter steps down. */}
            <View
              style={[
                styles.letters,
                (multiplierLabel || powered) && { marginTop: Math.round(metrics.badgeSize * 0.5) },
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.2}
                style={[
                  styles.letter,
                  {
                    fontSize: second === null
                      ? metrics.letterSize
                      : metrics.alternateSize,
                  },
                ]}
              >
                {tile.letter}
              </Text>
              {second === null ? null : (
                <>
                  <Text
                    maxFontSizeMultiplier={1.2}
                    style={[styles.slash, { fontSize: metrics.alternateSize }]}
                  >
                    /
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.2}
                    style={[styles.letter, { fontSize: metrics.alternateSize }]}
                  >
                    {second}
                  </Text>
                </>
              )}
            </View>
            <Text
              maxFontSizeMultiplier={1.2}
              style={[
                styles.points,
                {
                  bottom: metrics.inset - 1,
                  fontSize: metrics.pointSize,
                  right: metrics.inset,
                },
              ]}
            >
              {"alternativeLetter" in tile ? (
                <>
                  <Text
                    style={{
                      color: selected && chosenFace === tile.letter
                        ? colors.goldHi
                        : styles.points.color,
                    }}
                  >
                    {tile.points}
                  </Text>
                  /
                  <Text
                    style={{
                      color: selected && chosenFace === tile.alternativeLetter
                        ? colors.goldHi
                        : styles.points.color,
                    }}
                  >
                    {tile.alternativePoints}
                  </Text>
                </>
              ) : tile.points}
            </Text>
          </LinearGradient>
        </Animated.View>
        <Animated.View
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.face,
            { borderRadius: metrics.radius - 1 },
            backMotion,
          ]}
        >
          {/* Crimson, with a lighter line set just inside the edge and a lighter diamond in the
              middle: the back is all views, with no monogram to read. */}
          <LinearGradient
            colors={tileMaterial.back.gradient}
            end={{ x: 0.85, y: 1 }}
            start={{ x: 0.1, y: 0 }}
            style={styles.backFill}
          >
            <View
              style={[
                styles.backInset,
                { borderRadius: Math.max(2, metrics.radius - 3) },
              ]}
            >
              <View style={styles.backDiamond} />
            </View>
          </LinearGradient>
        </Animated.View>
        {animation === "deal" ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.dealGlint,
              { borderRadius: metrics.radius - 1 },
              dealGlintMotion,
            ]}
          />
        ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { overflow: "visible" },
  contact: { ...StyleSheet.absoluteFill },
  shell: { overflow: "visible" },
  // The dark rim shows only where the face does not cover the slab: its foot and corners.
  slab: { ...StyleSheet.absoluteFill, borderWidth: border.hairline },
  /** The face's frame: the ownership border, sitting above the slab it leaves the foot of. */
  frame: { width: "100%" },
  face: {
    backfaceVisibility: "hidden",
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  faceFill: { alignItems: "center", flex: 1, justifyContent: "center" },
  choiceAccent: {
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  letters: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "center",
  },
  letter: {
    color: tileMaterial.ink,
    fontFamily: TILE_FONT,
  },
  slash: {
    color: "rgba(21,17,13,0.5)",
    fontFamily: TILE_FONT,
    marginHorizontal: 1,
  },
  points: {
    color: tileMaterial.ink,
    fontFamily: TILE_FONT,
    position: "absolute",
  },
  poweredBadge: { position: "absolute" },
  multiplierBadge: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: 3,
    minWidth: 16,
    paddingHorizontal: 3,
    paddingVertical: 1,
    position: "absolute",
  },
  tripleBadge: { backgroundColor: colors.danger },
  multiplier: {
    color: colors.onGold,
    fontFamily: fonts.monoBold,
    lineHeight: 11,
  },
  backFill: { flex: 1, padding: 3 },
  backInset: {
    alignItems: "center",
    borderColor: tileMaterial.back.inset,
    borderWidth: border.hairline,
    flex: 1,
    justifyContent: "center",
  },
  backDiamond: {
    aspectRatio: 1,
    backgroundColor: tileMaterial.back.diamond,
    transform: [{ rotate: "45deg" }],
    width: "46%",
  },
  selectedShell: {
    shadowColor: colors.goldHi,
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  dealGlint: {
    backgroundColor: "#ffffff",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  dimmed: { opacity: opacity.muted },
  disabled: { opacity: opacity.disabled },
});
