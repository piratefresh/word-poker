import type { LetterMultiplier, Tile as WireTile } from "@wordpoker/contracts";
import { LinearGradient } from "expo-linear-gradient";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Image,
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
  elevation,
  fonts,
  gradients,
  opacity,
  palette,
} from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

import { TileChoiceBeam } from "./tile-choice-beam";
import { useTileTexture } from "./tile-texture/use-tile-texture";

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
  height: number;
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
    radius: 5,
    borderWidth: 1,
    letterSize: 18,
    alternateSize: 13,
    pointSize: 8,
    badgeSize: 7,
    inset: 3,
  },
  medium: {
    width: 44,
    height: 52,
    radius: 7,
    borderWidth: 1.25,
    letterSize: 24,
    alternateSize: 17,
    pointSize: 10,
    badgeSize: 8,
    inset: 4,
  },
  large: {
    width: 58,
    height: 69,
    radius: 9,
    borderWidth: 1.5,
    letterSize: 32,
    alternateSize: 22,
    pointSize: 12,
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

const FLIP_EASING = Easing.bezier(...motionEasing.flip);
const DEAL_EASING = Easing.bezier(...motionEasing.deal);
const FLIP_PERSPECTIVE = 900;
const OWNERSHIP_BORDER: Record<TileOwnership, string> = {
  private: colors.gold,
  community: "#76955f",
  neutral: "rgba(120,80,20,0.34)",
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
  const texture = useTileTexture(tile.id, metrics.width, metrics.height);
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
      <Animated.View
        style={[
          styles.shell,
          {
            borderColor: selected ? colors.goldHi : OWNERSHIP_BORDER[ownership],
            borderRadius: metrics.radius,
            borderWidth: selected
              ? metrics.borderWidth + 1
              : metrics.borderWidth,
            height: metrics.height,
            width: metrics.width,
          },
          selected && styles.selectedShell,
          shellMotion,
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
          {/* STO-479: the pixel-art face once Skia has painted it; the gradient until then. */}
          <FaceFill texture={texture}>
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
            <View style={styles.letters}>
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
                  <Text style={[styles.slash, { fontSize: metrics.badgeSize }]}>/</Text>
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
              {facePoints(tile).join("/")}
            </Text>
          </FaceFill>
        </Animated.View>
        <Animated.View
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.face,
            { borderRadius: metrics.radius - 1 },
            backMotion,
          ]}
        >
          <LinearGradient
            colors={[palette.felt400, palette.felt700, palette.felt900]}
            end={{ x: 0.85, y: 1 }}
            start={{ x: 0.1, y: 0 }}
            style={styles.backFill}
          >
            <View style={styles.backInset}>
              <View style={styles.backDiamond}>
                <Text
                  style={[
                    styles.backMonogram,
                    { fontSize: metrics.letterSize * 0.55 },
                  ]}
                >
                  W
                </Text>
              </View>
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
      </Animated.View>
    </Pressable>
  );
}

/** The front face's ground: the painted texture under the letters, or the gradient fallback. */
function FaceFill({ texture, children }: { texture: string | null; children: ReactNode }) {
  if (texture === null) {
    return (
      <LinearGradient {...gradients.tile} style={styles.faceFill}>
        <View style={styles.paperHighlight} />
        {children}
      </LinearGradient>
    );
  }
  return (
    <View style={styles.faceFill}>
      <Image source={{ uri: texture }} style={styles.texture} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { overflow: "visible" },
  shell: { ...elevation.tile },
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
  texture: { height: "100%", left: 0, position: "absolute", top: 0, width: "100%" },
  paperHighlight: {
    backgroundColor: "rgba(255,255,255,0.35)",
    height: "38%",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
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
    color: colors.onTile,
    fontFamily: fonts.sansBlack,
    letterSpacing: -0.8,
  },
  slash: {
    color: "rgba(43,24,16,0.5)",
    fontFamily: fonts.serifBold,
    marginHorizontal: 1,
  },
  points: {
    color: "#704511",
    fontFamily: fonts.monoBold,
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
    borderColor: "rgba(231,199,90,0.58)",
    borderRadius: 5,
    borderWidth: border.hairline,
    flex: 1,
    justifyContent: "center",
  },
  backDiamond: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "rgba(212,165,74,0.13)",
    borderColor: "rgba(247,223,122,0.52)",
    borderWidth: border.hairline,
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
    width: "48%",
  },
  backMonogram: {
    color: colors.goldHi,
    fontFamily: fonts.serifBold,
    opacity: 0.9,
    transform: [{ rotate: "-45deg" }],
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
