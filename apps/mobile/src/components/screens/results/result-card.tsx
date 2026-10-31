/**
 * result-card.tsx — one seat at the results table: who sat there, what the hand did to them, and
 * the word they played (STO-960).
 *
 * The payload already decided everything the card prints (`results-types.ts`), so this is drawing
 * and nothing else: no sum, no rank, no dictionary, no engine. The one thing the seat cannot read
 * off a wire shape is §11's reason its word never stood, so that comes from the copy table the word
 * builder refuses a draft with — one sentence, two surfaces.
 *
 * The card is also one accessibility element (STO-387). A composed label says the whole seat in one
 * breath, and the row of tiles is hidden from the tree underneath it: six tile labels read out
 * beside the sentence that already names the word is noise, not information.
 *
 * Motion is passed in, never owned: with a `motion` prop the card reads the screen's one clock
 * inside `useAnimatedStyle`, and without one it draws its final state — which is what a component
 * test renders, and why nothing here is gated on an animated value.
 */

import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { isSwappedTileId } from "@wordpoker/game-rules";

import { Tile } from "@/components/game/word-tile";
import { styles as builderStyles } from "@/components/word-builder/styles";
import {
  border,
  colors,
  fonts,
  fontSize,
  glow,
  layout,
  palette,
  radius,
  resultsEntrance,
  resultsTable,
  spacing,
} from "@/constants/theme";
import { WORD_REJECTION_COPY } from "@/features/table/word-rejection-copy";
import { formatAmount } from "@/lib/ui/format";
import { beatProgress } from "./use-results-entrance";

import { formatNet, placeCopy, SEAT_TAG_COPY } from "./results-copy";
import type { ResultsSeat } from "./results-types";

export interface ResultCardMotion {
  /** The shared sequence clock. */
  readonly clock: SharedValue<number>;
  /** Where this card's beat starts, in ms from the sequence's start. */
  readonly at: number;
  /** Whether this card is the winner's: its ring pulse and its tiles' stagger. */
  readonly winner: boolean;
}

/** Which edge of the table the seat is on: it decides where the avatar sits against the plate. */
export type ResultCardSide = "left" | "top" | "right" | "bottom";

/** How far the card rises into place (§3's beat), and how far its ring travels back out of it. */
const RISE = 14;
const RING_OUT = 1.06;
/** A tile's entrance overshoots the mark and settles, which is what a spring would have done. */
const TILE_SCALE = [0.8, 1.06, 1];
/** The plate's mini tiles: seven have to fit a side seat without wrapping. */
const TILE_SCALE_ON_PLATE = 0.62;
/** The words a seat with no word shows when there is no §11 reason behind it: §26's fold-out. */
const NO_WORD = "NO WORD";

/**
 * One seat's card. `motion` is the screen's sequence; a card without it is drawn settled.
 */
export function ResultCard({
  seat,
  motion,
  side = "bottom",
  landscape = false,
}: {
  seat: ResultsSeat;
  /** The card's beat of the screen's entrance, or absent for a card that is simply there. */
  motion?: ResultCardMotion;
  side?: ResultCardSide;
  landscape?: boolean;
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

  // The winner's one ring, behind the plate and out of it: a second beat, after it has landed.
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

  // A fold-out has no ladder (§26): its winner has no `decidedBy`, and so no place to print.
  const placed = !seat.folded && seat.decidedBy !== null ? placeCopy(seat.place) : null;
  const cap = seat.folded
    ? "FOLD"
    : [placed, seat.allIn ? "ALL-IN" : null].filter((part) => part !== null).join(" · ");

  const stats = seat.folded
    ? `IN ${formatAmount(seat.committed)}`
    : `${seat.total} PTS · IN ${formatAmount(seat.committed)}`;

  // STO-387's one sentence for the whole card: the word (or the reason there is none), §7's three
  // numbers, the score they add up to, what the hand did to the seat, and the pot if it took one.
  const label = [
    seat.isYou ? `${seat.name} (you)` : seat.name,
    ...(seat.folded
      ? ["folded"]
      : [
          seat.word ?? "no word",
          `${seat.total} points`,
          `base ${seat.base}`,
          `mult +${seat.mult}`,
          `rack +${seat.rack}`,
        ]),
    ...(placed === null ? [] : [`${placed.toLowerCase()} place`]),
    `net ${formatNet(seat.net)}`,
    `in ${formatAmount(seat.committed)}`,
    ...(seat.tag === null || seat.folded ? [] : [SEAT_TAG_COPY[seat.tag].toLowerCase()]),
    ...(seat.capped === null ? [] : [seat.capped.toLowerCase()]),
    ...(winner ? ["takes the pot"] : []),
  ].join(", ");

  const avatar = (
    <View style={styles.avatarSlot}>
      <View style={[styles.avatar, { backgroundColor: seat.color }, winner && styles.avatarWinner]}>
        <Text allowFontScaling style={styles.initials}>
          {seat.initials}
        </Text>
      </View>
      {cap === "" ? null : (
        <View style={styles.cap}>
          <Text allowFontScaling numberOfLines={1} style={styles.capText}>
            {cap}
          </Text>
        </View>
      )}
    </View>
  );

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
            // Each tile covers the one letter it played, so the word's letter at its index is
            // the face a choice tile played (§10).
            face={seat.word?.[index]}
          />
        ))}
      </View>
    );

  const plate = (
    <View style={[styles.plate, winner && styles.plateWinner]}>
      {motion !== undefined && motion.winner ? (
        <Animated.View pointerEvents="none" style={[styles.ring, ring]} />
      ) : null}

      <View style={styles.head}>
        {/* A long name gives up its tail; the net never moves off the card for it. */}
        <Text allowFontScaling ellipsizeMode="tail" numberOfLines={1} style={styles.name}>
          {seat.isYou ? "You" : seat.name}
        </Text>
        <Text
          allowFontScaling
          style={[styles.net, seat.net > 0 && styles.netUp, seat.net < 0 && styles.netDown]}
        >
          {formatNet(seat.net)}
        </Text>
      </View>

      {tiles}

      {!seat.folded && seat.word === null ? (
        <Text allowFontScaling style={styles.reason}>
          {seat.reason === null ? NO_WORD : WORD_REJECTION_COPY[seat.reason]}
        </Text>
      ) : null}

      <View style={styles.foot}>
        <Text allowFontScaling style={styles.stats}>
          {stats}
        </Text>
        {seat.tag === null ? null : (
          <View style={[styles.tag, { backgroundColor: resultsTable.tag[seat.tag].background }]}>
            <Text allowFontScaling style={[styles.tagText, { color: resultsTable.tag[seat.tag].ink }]}>
              {SEAT_TAG_COPY[seat.tag]}
            </Text>
          </View>
        )}
      </View>

      {seat.capped === null ? null : (
        <Text allowFontScaling style={styles.capped}>
          {seat.capped}
        </Text>
      )}
    </View>
  );

  return (
    <Animated.View
      accessibilityLabel={label}
      accessibilityRole="text"
      accessible
      style={[
        landscape ? styles.beside : styles.stacked,
        side === "right" && landscape && styles.besideReversed,
        enter,
      ]}
      testID={`result-card-${seat.playerId}`}
    >
      {avatar}
      {plate}
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
  face,
}: {
  tile: ResultsSeat["tiles"][number];
  index: number;
  motion?: ResultCardMotion;
  testID: string;
  /** The letter the word played this tile for. */
  face?: string;
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

  // A choice tile shows the one face it played, with the strip's face chips under it, settled:
  // both letters printed on the tile read as both played.
  const choice = "alternativeLetter" in tile && face !== undefined ? tile : null;
  const shown =
    choice === null
      ? tile
      : {
          id: choice.id,
          letter: face as string,
          points: face === choice.letter ? choice.points : choice.alternativePoints,
          multiplier: choice.multiplier,
        };

  return (
    <Animated.View style={[builderStyles.entry, enter]}>
      <Tile
        animation="none"
        // §44: a tile a power handed the seat shows the table its ⚡, and nothing it replaced.
        powered={isSwappedTileId(tile.id)}
        scale={TILE_SCALE_ON_PLATE}
        side="front"
        size="small"
        testID={testID}
        tile={shown}
      />
      {choice === null ? null : (
        <View style={[builderStyles.faces, styles.tileFaces]}>
          {[choice.letter, choice.alternativeLetter].map((letter) => (
            <View
              key={letter}
              style={[
                builderStyles.chip,
                styles.tileChip,
                letter === face ? builderStyles.chipChosen : builderStyles.chipSpent,
              ]}
              testID={`${testID}-face-${letter}`}
            >
              <Text allowFontScaling style={[builderStyles.chipFace, styles.tileChipFace]}>
                {letter}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const AVATAR = layout.minTouch;

const styles = StyleSheet.create({
  stacked: { alignItems: "center", gap: spacing.xs },
  beside: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  besideReversed: { flexDirection: "row-reverse" },

  avatarSlot: { alignItems: "center" },
  avatar: {
    alignItems: "center",
    borderColor: palette.cream100,
    borderRadius: AVATAR / 2,
    borderWidth: border.thin,
    height: AVATAR,
    justifyContent: "center",
    width: AVATAR,
  },
  avatarWinner: { borderColor: colors.gold, ...glow(colors.gold) },
  initials: {
    color: palette.felt800,
    fontFamily: fonts.arcade,
    fontSize: fontSize.bodyLg,
  },
  // The cap sits on the avatar's top edge and runs wider than it, so it is out of the flow.
  cap: {
    backgroundColor: palette.felt800,
    borderColor: palette.cream100,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.sm,
    position: "absolute",
    top: -spacing.xs,
  },
  capText: {
    color: palette.cream100,
    fontFamily: fonts.ui,
    fontSize: fontSize.micro,
    letterSpacing: 0.6,
  },

  plate: {
    backgroundColor: resultsTable.plate,
    borderColor: resultsTable.plateEdge,
    borderRadius: radius.card,
    borderWidth: border.thin,
    flexShrink: 1,
    gap: spacing.xs,
    minWidth: 132,
    padding: spacing.sm,
  },
  plateWinner: { borderColor: colors.gold },
  // Behind the plate, one line of gold: the winner's pulse.
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

  head: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  name: {
    color: palette.cream100,
    flexShrink: 1,
    fontFamily: fonts.uiMedium,
    fontSize: fontSize.body,
  },
  net: {
    color: palette.cream100,
    fontFamily: fonts.arcade,
    fontSize: fontSize.body,
    fontVariant: ["tabular-nums"],
  },
  netUp: { color: resultsTable.gain },
  netDown: { color: resultsTable.loss },

  // Wrapping, not clipping: a long word runs onto a second row of tiles inside the plate.
  tiles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xxs,
  },
  // The word builder's face chips, cut down to sit under a mini tile rather than widen its column.
  tileFaces: { borderRadius: 4, borderWidth: 1, marginTop: 1 },
  tileChip: { height: 12, width: 9.5 },
  tileChipFace: { fontSize: 7 },
  reason: {
    color: resultsTable.meta,
    fontFamily: fonts.uiMedium,
    fontSize: fontSize.caption,
  },

  foot: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  stats: {
    color: resultsTable.meta,
    fontFamily: fonts.uiMedium,
    fontSize: fontSize.caption,
    fontVariant: ["tabular-nums"],
  },
  tag: {
    borderRadius: radius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  tagText: {
    fontFamily: fonts.ui,
    fontSize: fontSize.caption,
    letterSpacing: 0.6,
  },
  capped: {
    color: resultsTable.meta,
    fontFamily: fonts.uiMedium,
    fontSize: fontSize.micro,
  },
});
