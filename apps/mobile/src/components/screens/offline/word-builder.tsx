import { Button, Host, Row } from "@expo/ui";
import type {
  ChoiceTile,
  Tile as TileData,
  TilePlay,
  WordRejectionReason,
} from "@wordpoker/contracts";
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Draggable, DropProvider, Droppable } from "react-native-reanimated-dnd";

import {
  TILE_METRICS,
  Tile,
  getTileAccessibilityLabel,
  type TileOwnership,
} from "@/components/game";
import {
  border,
  colors,
  fonts,
  fontSize,
  opacity,
  radius,
  spacing,
  type,
} from "@/constants/theme";

/**
 * The offline draft: the word the hero is building out of the tiles they can see, and the
 * three taps that shape it — play a tile, take one back, clear, confirm (§10, §11, §19).
 *
 * The band reads top to bottom in the order the decision is made. Which words count comes
 * first, because §11 makes the dictionary part of the table's terms and it has to be
 * visible before the seat plays, not after they are refused. Then the draft itself: the
 * word in order, with each play drawn as the tile that made it. Then §11's reason, when
 * the draft cannot stand. Then the trays the tiles come from, and last the controls that
 * spend the window.
 *
 * Nothing here decides whether the word is legal: the engine owns that answer and hands it
 * back as `reason`. This component draws the draft it is given and reports the taps.
 *
 * Dragging is `react-native-reanimated-dnd`'s job, not this file's: a tile is a `Draggable`
 * and the word band is its `Droppable`, so a tile dropped on the band is played and the kit
 * owns every gesture in between. Tapping still plays, takes back, and confirms — a drag is
 * how a hand naturally moves a tile, and a tap is what a screen reader and a test can do.
 */
export interface WordBuilderProps {
  /** The draft in word order: what the hero has played so far. */
  plays: readonly TilePlay[];
  /** The letters those plays spell, uppercase; "" when nothing is played. */
  word: string;
  /** The hero's two private tiles, in rack order. */
  privateTiles: readonly TileData[];
  /** The board as it shows; unrevealed slots are null. */
  community: readonly (TileData | null)[];
  /** Why the draft cannot stand as a word (§11's reason), or null while it can. */
  reason: WordRejectionReason | null;
  /** True once the hero confirmed: the word is locked and no control is live (§19). */
  confirmed: boolean;
  /** The configured dictionary's display name, shown before the seat plays (§11). */
  dictionaryLabel: string | null;
  /** True while §19's window is open and the hero may still act. */
  open: boolean;
  /** Plays a tile, with the face it plays for a choice tile (§10). */
  onPlay: (tileId: string, chosenFace?: string) => void;
  /** Takes back one play, by its index in `plays`. */
  onRemove: (index: number) => void;
  /** Clears the draft (§19 lets a seat change its mind until it confirms). */
  onClear: () => void;
  /** Confirms the draft as the seat's word. */
  onConfirm: () => void;
}

/**
 * §11's refusal reasons as a seat reads them. The `Record` is exhaustive on purpose: a
 * reason added to the contract becomes a compile error here rather than a blank line on
 * screen. None of the copy is the wire string — `two-letter-split` names a branch in the
 * engine, not something to hand a player.
 */
const REASON_COPY: Record<WordRejectionReason, string> = {
  "empty-submission": "Play a tile before confirming",
  "too-short": "A word needs at least two letters",
  "too-long": "More letters than the tiles can spell",
  "uses-unavailable-letters": "Those letters are not in your tiles",
  "tile-reused": "Each tile plays once",
  "two-letter-split": "A two-letter tile keeps its letters together",
  "sequence-reversed": "A sequence tile plays in the order it prints",
  "not-in-dictionary": "Not in the dictionary",
  "timer-expired": "The window closed",
};

/**
 * The tile a play puts in the word row. A choice tile plays one letter at a time (§10), so
 * the played face is narrowed to a single-face tile before it reaches the renderer: A/E
 * played as E draws as an E. Every other shape plays as printed — a sequence keeps both
 * letters, and a multiplier keeps its badge — so it is handed over untouched.
 */
function playedFace(tile: TileData | undefined, play: TilePlay): TileData {
  if (tile === undefined) {
    // Only a desync can name a tile this seat does not hold. The row still draws a slot,
    // so the draft on screen and `plays` cannot disagree about how long the word is.
    return { id: play.tileId, letter: play.chosenFace ?? "?", points: 0 };
  }
  if (!("alternativeLetter" in tile)) {
    return tile;
  }
  const { alternativeLetter, alternativePoints, ...printed } = tile;
  return play.chosenFace === alternativeLetter
    ? { ...printed, letter: alternativeLetter, points: alternativePoints }
    : printed;
}

export function WordBuilder(props: WordBuilderProps): JSX.Element {
  return (
    <DropProvider>
      <BuilderPanel {...props} />
    </DropProvider>
  );
}

/**
 * What a tray tile carries while it is dragged: the play it would make if it lands (§10).
 * A choice tile is dragged for its first face — the chips below it are how the other one is
 * picked — because a drag has to commit to a letter before it starts.
 */
interface DraggedPlay {
  readonly tileId: string;
  readonly chosenFace?: string;
}

function BuilderPanel({
  plays,
  word,
  privateTiles,
  community,
  reason,
  confirmed,
  dictionaryLabel,
  open,
  onPlay,
  onRemove,
  onClear,
  onConfirm,
}: WordBuilderProps): JSX.Element {
  // The tiles a play can name, from either side of the table, keyed by the id the play
  // carries — the wire plays name tiles, never letters (docs/rules/tiles.md §10).
  const dealt = new Map<string, TileData>();
  for (const tile of privateTiles) {
    dealt.set(tile.id, tile);
  }
  for (const tile of community) {
    if (tile !== null) {
      dealt.set(tile.id, tile);
    }
  }
  // §11: each physical tile is played once, so a tile named by the draft is spent.
  const spent = new Set(plays.map((play) => play.tileId));
  // §19's window is the only thing that lets the hero act, and a confirmed word is locked.
  // Past either, nothing on this panel takes a tap and both controls are disabled.
  const live = open && !confirmed;
  const canClear = live && plays.length > 0;

  return (
    <View style={styles.builder} testID="word-builder">
      {dictionaryLabel === null ? null : (
        <View style={styles.header}>
          <Text style={styles.kicker}>Dictionary</Text>
          <Text style={styles.dictionary}>{dictionaryLabel}</Text>
          <Text style={styles.hint}>Words must be in this list to count</Text>
        </View>
      )}

      <Droppable<DraggedPlay>
        activeStyle={styles.bandActive}
        dropDisabled={!live}
        onDrop={(dragged) => onPlay(dragged.tileId, dragged.chosenFace)}
        style={styles.band}
      >
        <View style={styles.bandHeading}>
          <Text style={styles.kicker}>Your word</Text>
          {confirmed ? (
            <Text style={styles.locked}>Confirmed — locked</Text>
          ) : null}
        </View>
        {plays.length === 0 ? (
          <Text style={styles.prompt}>Drag a tile into this band, or tap it to play it</Text>
        ) : (
          <>
            <View
              accessibilityLabel={`Your word: ${word}`}
              style={styles.row}
              testID="word-builder-plays"
            >
              {plays.map((play, index) => {
                const face = playedFace(dealt.get(play.tileId), play);
                const label = `${getTileAccessibilityLabel(face)}, play ${index + 1}`;
                return (
                  <Tile
                    key={`${play.tileId}-${index}`}
                    accessibilityLabel={
                      live ? `${label}, tap to take it back` : label
                    }
                    interactive={live}
                    onPress={() => onRemove(index)}
                    side="front"
                    size="small"
                    testID={`word-builder-play-${index}`}
                    tile={face}
                  />
                );
              })}
            </View>
            <Text style={styles.word} testID="word-builder-word">
              {word.length > 0 ? word : "—"}
            </Text>
          </>
        )}
      </Droppable>

      {reason === null ? null : (
        <Text
          accessibilityRole="alert"
          style={styles.reason}
          testID="word-builder-reason"
        >
          {REASON_COPY[reason]}
        </Text>
      )}

      <View style={styles.band}>
        <Text style={styles.trayLabel}>Your tiles</Text>
        <View style={styles.row}>
          {privateTiles.map((tile) => (
            <TrayTile
              key={tile.id}
              live={live}
              onPlay={onPlay}
              ownership="private"
              spent={spent.has(tile.id)}
              tile={tile}
            />
          ))}
        </View>
      </View>

      <View style={styles.band}>
        <Text style={styles.trayLabel}>Board</Text>
        <View style={styles.row}>
          {community.map((tile, index) =>
            tile === null ? (
              // An unrevealed slot is a hole in the rack, not a tile: it holds the place
              // the street will fill.
              <View
                key={`board-empty-${index}`}
                style={styles.slot}
                testID={`word-builder-board-empty-${index}`}
              />
            ) : (
              <TrayTile
                key={tile.id}
                live={live}
                onPlay={onPlay}
                ownership="community"
                spent={spent.has(tile.id)}
                tile={tile}
              />
            ),
          )}
        </View>
      </View>

      <Host
        colorScheme="dark"
        matchContents
        seedColor={colors.gold}
        style={styles.controls}
      >
        <Row alignment="center" spacing={spacing.sm}>
          <Button
            disabled={!canClear}
            label="Clear"
            onPress={canClear ? onClear : undefined}
            testID="word-builder-clear"
            variant="outlined"
          />
          <Button
            disabled={!live}
            label="Confirm"
            onPress={live ? onConfirm : undefined}
            testID="word-builder-confirm"
            variant="filled"
          />
        </Row>
      </Host>
    </View>
  );
}

/**
 * One dealt tile in a tray. A single-letter or sequence tile plays itself, so the tile is
 * the control. A choice tile has no face to play on its own (§10 plays one letter at a
 * time), so it is drawn inert with a chip per printed face, and only the chips take taps.
 * A spent tile stays visible — the seat has to see which tile the word already used — but
 * it is dimmed and out of reach.
 */
function TrayTile({
  tile,
  ownership,
  spent,
  live,
  onPlay,
}: {
  tile: TileData;
  ownership: TileOwnership;
  spent: boolean;
  live: boolean;
  onPlay: (tileId: string, chosenFace?: string) => void;
}) {
  const choice: ChoiceTile | null = "alternativeLetter" in tile ? tile : null;
  const playable = live && !spent;

  return (
    <View style={styles.entry}>
      <Draggable<DraggedPlay>
        data={choice === null ? { tileId: tile.id } : { tileId: tile.id, chosenFace: choice.letter }}
        dragDisabled={!playable}
        preDragDelay={120}
      >
        <Tile
          dimmed={!playable}
          interactive={playable && choice === null}
          onPress={() => onPlay(tile.id)}
          ownership={ownership}
          side="front"
          size={ownership === "private" ? "medium" : "small"}
          testID={`word-builder-tile-${tile.id}`}
          tile={tile}
        />
      </Draggable>
      {choice === null ? null : (
        <View style={styles.faces}>
          {[choice.letter, choice.alternativeLetter].map((face) => (
            <FaceChip
              key={face}
              face={face}
              onPress={() => onPlay(tile.id, face)}
              playable={playable}
              tile={choice}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/** One face of a choice tile, as the tap that plays the tile for that letter. */
function FaceChip({
  tile,
  face,
  playable,
  onPress,
}: {
  tile: ChoiceTile;
  face: string;
  playable: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Play the ${tile.letter}/${tile.alternativeLetter} tile as ${face}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !playable }}
      disabled={!playable}
      onPress={onPress}
      style={[styles.chip, !playable && styles.chipSpent]}
      testID={`word-builder-face-${tile.id}-${face}`}
    >
      <Text style={styles.chipFace}>{face}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A panel over the felt rather than a band of it: the draft is the hero's own work, and
  // the seat it belongs to is under it.
  builder: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  header: { gap: spacing.xxs },
  kicker: { ...type.kicker },
  dictionary: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.title,
  },
  hint: { ...type.bodyDim },
  band: { gap: spacing.sm },
  // What the band looks like while a tile is over it: the kit reports the hover, the theme
  // says what it should look like.
  bandActive: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.gold,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
  },
  bandHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  locked: {
    color: colors.success,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
    letterSpacing: 1.2,
  },
  prompt: {
    color: colors.textFaint,
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
  },
  row: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  word: { ...type.numeric, fontSize: fontSize.title, letterSpacing: 3 },
  reason: {
    color: colors.warning,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.small,
    lineHeight: 19,
  },
  trayLabel: { ...type.label },
  entry: { alignItems: "center", gap: spacing.xs },
  faces: { flexDirection: "row", gap: spacing.xxs },
  chip: {
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  chipSpent: { opacity: opacity.disabled },
  chipFace: {
    color: colors.textBright,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
  },
  // A slot the board has not filled yet: the size the tile will be, with nothing in it.
  slot: {
    backgroundColor: colors.surface,
    borderColor: colors.borderFaint,
    borderRadius: radius.tile,
    borderStyle: "dashed",
    borderWidth: border.hairline,
    height: TILE_METRICS.small.height,
    width: TILE_METRICS.small.width,
  },
  // `@expo/ui`'s host hugs its parent's start edge by default, so the control row asks for
  // the centre itself rather than relying on the column's alignment.
  controls: { alignSelf: "center" },
});
