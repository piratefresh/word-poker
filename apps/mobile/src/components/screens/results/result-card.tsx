/**
 * result-card.tsx — one seat's hand, as the results draw it: who it was, what it played, what that
 * was worth, and the tiles it was worth that on.
 *
 * The payload already decided everything the card prints (`results-types.ts`), so this is drawing
 * and nothing else: no sum, no rank, no dictionary, no engine. The one thing the seat cannot read
 * off a wire shape is §11's reason its word never stood, so that comes from the copy table the word
 * builder refuses a draft with — one sentence, two surfaces.
 *
 * The card is also one accessibility element (STO-387). A composed label says the whole seat in one
 * breath, and the badge and the row of tiles are hidden from the tree underneath it: six tile labels
 * read out beside the sentence that already names the word is noise, not information.
 *
 * Motion is passed in, never owned: with a `motion` prop the card reads the screen's one clock
 * inside `useAnimatedStyle`, and without one it draws its final state — which is what a component
 * test renders, and why nothing here is gated on an animated value.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { Tile } from "@/components/game/word-tile";
import {
  border,
  colors,
  fonts,
  fontSize,
  glow,
  gradients,
  layout,
  palette,
  radius,
  resultsEntrance,
  spacing,
} from "@/constants/theme";
import { beatProgress } from "@/lib/use-results-entrance";
import { WORD_REJECTION_COPY } from "@/lib/word-rejection-copy";

import type { ResultsSeat } from "./results-types";

export interface ResultCardMotion {
  /** The shared sequence clock. */
  readonly clock: SharedValue<number>;
  /** Where this card's beat starts, in ms from the sequence's start. */
  readonly at: number;
  /** Whether this card is the winner's: its ring pulse and its tiles' stagger. */
  readonly winner: boolean;
}

/**
 * The winner's pill and avatar sit on gold rather than on the felt, and `colors.onGold` is the ink
 * on both: the same colour at 15% and 18%, which the token set has no pair of alphas for.
 */
const ON_GOLD_WASH = "rgba(26,18,8,0.15)";
const ON_GOLD_FILL = "rgba(26,18,8,0.18)";
/** `gradients.goldButton`'s ramp turned to face the top edge: the design draws the gold downward. */
const GOLD_DOWN = { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } } as const;
/** How far the card rises into place (§3's beat), and how far its ring travels back out of it. */
const RISE = 14;
const RING_OUT = 1.06;
/** A tile's entrance overshoots the mark and settles, which is what a spring would have done. */
const TILE_SCALE = [0.8, 1.06, 1];
/** The words a seat with no word shows when there is no §11 reason behind it: §26's fold-out. */
const NO_WORD = "NO WORD";

/**
 * One seat's card. `motion` is the screen's sequence; a card without it is drawn settled.
 */
export function ResultCard({
  seat,
  motion,
}: {
  seat: ResultsSeat;
  /** The card's beat of the screen's entrance, or absent for a card that is simply there. */
  motion?: ResultCardMotion;
}): ReactElement {
  const winner = seat.takesPot;

  const enter = useAnimatedStyle(() => {
    if (motion === undefined) return { opacity: 1, transform: [{ translateY: 0 }] };
    const progress = beatProgress(motion.clock, motion.at, resultsEntrance.rise);
    return {
      opacity: progress,
      transform: [{ translateY: interpolate(progress, [0, 1], [RISE, 0]) }],
    };
  });

  // The winner's one ring, behind the card and out of it: a second beat, after the card has landed.
  const ring = useAnimatedStyle(() => {
    if (motion === undefined) return { opacity: 0, transform: [{ scale: 1 }] };
    const progress = beatProgress(
      motion.clock,
      motion.at + resultsEntrance.rise,
      resultsEntrance.pulse,
    );
    return {
      opacity: interpolate(progress, [0, 1], [0.35, 0]),
      transform: [{ scale: interpolate(progress, [0, 1], [1, RING_OUT]) }],
    };
  });

  // STO-387's one sentence for the whole card: the word (or the reason there is none), §7's three
  // numbers, the score they add up to, and the pot when the pot's this seat's.
  const label = [
    seat.isYou ? `${seat.name} (you)` : seat.name,
    seat.word ?? "no word",
    `${seat.total} points`,
    `base ${seat.base}`,
    `mult +${seat.mult}`,
    `rack +${seat.rack}`,
    ...(winner ? ["takes the pot"] : []),
  ].join(", ");

  const identity = (
    <View style={styles.row}>
      <View style={[styles.avatar, winner ? styles.winnerAvatar : { backgroundColor: seat.color }]}>
        <Text
          allowFontScaling
          style={[styles.initials, winner ? styles.onGoldInk : styles.fieldInk]}
        >
          {seat.initials}
        </Text>
      </View>

      <View style={styles.column}>
        <View style={styles.head}>
          {/* A long name gives up its tail; the score never moves off the card for it. */}
          <Text
            allowFontScaling
            ellipsizeMode="tail"
            numberOfLines={1}
            style={[styles.name, winner && styles.onGoldInk]}
          >
            {seat.name}
            {seat.isYou ? (
              <Text allowFontScaling style={styles.you}>
                {" (you)"}
              </Text>
            ) : null}
          </Text>
          <View style={styles.score}>
            <Text allowFontScaling style={[styles.total, winner && styles.onGoldInk]}>
              {seat.total}
            </Text>
            <Text allowFontScaling style={[styles.points, winner && styles.onGoldInk]}>
              PTS
            </Text>
          </View>
        </View>

        <Text
          allowFontScaling
          style={[
            seat.word === null ? styles.reason : styles.word,
            winner && styles.onGoldInk,
          ]}
        >
          {seat.word ?? (seat.reason === null ? NO_WORD : WORD_REJECTION_COPY[seat.reason])}
        </Text>

        {/* §7's three numbers, all three of them: `Mult +0` and `Rack +0` say what did not happen. */}
        <Text allowFontScaling style={[styles.breakdown, winner && styles.onGoldInk]}>
          {`Base ${seat.base} · Mult +${seat.mult} · Rack +${seat.rack}`}
        </Text>
      </View>
    </View>
  );

  const badge = winner ? (
    <View style={styles.badgeRow}>
      {/* The card's label already says the pot is this seat's, so the pill is drawn, not spoken. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.badge}
      >
        <Text allowFontScaling style={styles.badgeText}>
          ★ TAKES THE POT
        </Text>
      </View>
    </View>
  ) : null;

  const tiles =
    seat.tiles.length === 0 ? null : (
      // A row of tile labels beside the card's own sentence is noise, so the row is one picture
      // the reader never lands on — and it is still what a sighted reader counts the word on.
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.tiles}
        testID={`result-card-${seat.playerId}-tiles`}
      >
        {seat.tiles.map((tile, index) => (
          <ResultTile
            index={index}
            key={tile.id}
            motion={motion}
            testID={`result-card-${seat.playerId}-tile-${index}`}
            tile={tile}
          />
        ))}
      </View>
    );

  return (
    <Animated.View
      accessibilityLabel={label}
      accessibilityRole="text"
      accessible
      style={enter}
      testID={`result-card-${seat.playerId}`}
    >
      {motion !== undefined && motion.winner ? (
        <Animated.View pointerEvents="none" style={[styles.ring, ring]} />
      ) : null}

      {winner ? (
        <LinearGradient
          {...gradients.goldButton}
          end={GOLD_DOWN.end}
          start={GOLD_DOWN.start}
          style={[styles.card, styles.winner]}
        >
          {/* The design's 1px light along the top edge: gold needs a highlight to look raised. */}
          <View style={styles.inset} />
          {badge}
          {identity}
          {tiles}
        </LinearGradient>
      ) : (
        <View style={[styles.card, styles.field]}>
          {identity}
          {tiles}
        </View>
      )}
    </Animated.View>
  );
}

/**
 * One physical tile of the seat's word, in word order.
 *
 * Its own component because each tile carries its own beat — the row's stagger is one clock read
 * per tile, and a hook cannot be called from inside a loop.
 */
function ResultTile({
  tile,
  index,
  motion,
  testID,
}: {
  tile: ResultsSeat["tiles"][number];
  index: number;
  motion?: ResultCardMotion;
  testID: string;
}): ReactElement {
  const enter = useAnimatedStyle(() => {
    if (motion === undefined || !motion.winner) return { transform: [{ scale: 1 }] };
    const progress = beatProgress(
      motion.clock,
      resultsEntrance.tiles + index * resultsEntrance.tileStagger,
      resultsEntrance.tileIn,
    );
    return { transform: [{ scale: interpolate(progress, [0, 0.7, 1], TILE_SCALE) }] };
  });

  return (
    <Animated.View style={enter}>
      <Tile animation="none" side="front" size="small" testID={testID} tile={tile} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The winner's card is the gold surface; a field card is the felt's own dark pane.
  card: {
    borderRadius: radius.card,
    borderWidth: border.hairline,
    padding: spacing.lg,
  },
  winner: {
    borderColor: palette.gold600,
    // `glow()` is the app's winner glow at full strength; the bloom is the same gold and radius,
    // turned down to the design's 0.18 and to a 6pt Android lift.
    ...glow(colors.gold),
    elevation: 6,
    shadowOpacity: 0.18,
  },
  field: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  inset: {
    backgroundColor: "rgba(255,255,255,0.35)",
    height: border.hairline,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  // Behind the card, one hairline of gold: the winner's only ornament that is not the gold itself.
  ring: {
    borderColor: colors.gold,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },

  badgeRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.sm,
  },
  badge: {
    backgroundColor: ON_GOLD_WASH,
    borderRadius: radius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  badgeText: {
    color: colors.onGold,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.micro,
    letterSpacing: 2,
  },

  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
  },
  avatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: layout.minTouch,
    justifyContent: "center",
    width: layout.minTouch,
  },
  winnerAvatar: {
    backgroundColor: ON_GOLD_FILL,
  },
  initials: {
    fontFamily: fonts.sansBlack,
    fontSize: fontSize.bodyLg,
  },
  // The seat's own colour is the avatar's fill, so its letters have to read against an accent
  // rather than against the felt: the darkest token, which is the design's `#0c1410` in our ramps.
  fieldInk: {
    color: palette.felt800,
  },
  onGoldInk: {
    color: colors.onGold,
  },

  column: {
    flex: 1,
  },
  head: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  name: {
    color: colors.textBright,
    flexShrink: 1,
    fontFamily: fonts.serif,
    fontSize: fontSize.bodyLg,
  },
  you: {
    fontStyle: "italic",
    opacity: 0.65,
  },
  score: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.xs,
  },
  total: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h3,
  },
  points: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.6,
    opacity: 0.7,
  },

  // The word is a stamp on the card: mono, upper, spaced out. The reason a word is missing is a
  // sentence, so it keeps the slot and gives up the stamp.
  word: {
    color: colors.text,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
    letterSpacing: 2.4,
    marginTop: spacing.xs,
    textTransform: "uppercase",
  },
  reason: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.4,
    marginTop: spacing.xs,
  },
  // The design sets this line at 10pt, which the ramp has no token for: `micro` keeps it a step
  // under the word's `caption`, which is the step the design draws.
  breakdown: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 0.8,
    marginTop: spacing.xs,
    opacity: 0.65,
  },

  // Wrapping, not clipping: a long word runs onto a second row of tiles inside the card.
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
});
