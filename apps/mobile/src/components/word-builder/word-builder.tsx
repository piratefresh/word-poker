import type {
  PrivateWordCheckState,
  Tile as TileData,
  TilePlay,
  WordRejectionReason,
  WordScore,
} from "@wordpoker/contracts";
import { WORD_CHECKS_PER_HAND } from "@wordpoker/contracts";
import type { JSX, ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { AccessibilityInfo, Platform, Text, View } from "react-native";

import { GameButton } from "@/components/ui/game-button";

import { useCompactControls } from "@/components/screens/game/screen-scale";
import { DraftLine } from "./draft-line";
import {
  inStripOrder,
  sameDraft,
  shuffleUnheld,
  TileStrip,
  useStripOrder,
  type StripEntry,
  type SwapFlip,
} from "./strip";
import { styles } from "./styles";

/**
 * The draft as §19's window holds it, and the shape every mode's adapter speaks.
 *
 * A table's own vocabulary — Colyseus events online, the offline engine's hand here — is the
 * adapter's business; what the builder needs is this: what the seat has played, what it
 * spells, what §7 says that is worth, whether §11 would refuse it, and whether the seat may
 * still act. Nothing in here is derived from a socket, a phase name, or a mode.
 */
export interface WordDraft {
  /** The draft in word order: what the seat has played so far. */
  readonly plays: readonly TilePlay[];
  /** The letters those plays spell, uppercase; "" when nothing is played. */
  readonly word: string;
  /** §7's score for the draft as it stands, or null while it does not spell a word yet. */
  readonly score: WordScore | null;
  /** Why the draft cannot be built from the available tiles, or null while it can. */
  readonly reason: WordRejectionReason | null;
  /** True once the seat confirmed: the word is locked and no control is live (§19). */
  readonly confirmed: boolean;
  /** True while the seat may still build its word — play tiles, take them back, sort them. This
   *  runs the whole hand: the word is shaped in parallel with the betting, not only at the end. */
  readonly open: boolean;
  /** True while confirming the word is legal: §19's window is open and waiting on this seat. The
   *  seat can build before the window, but only the window locks the word in. */
  readonly confirmable: boolean;
}

/**
 * The word builder: the tiles a seat can see, the word it is building out of them, and the taps
 * and drags that shape it — play a tile, take one back, reorder the word, shuffle the rest
 * (§10, §11, §19).
 *
 * It is two placements of one draft, because the tiles belong where the seat's hand already is:
 * `WordHand` is the strip and goes in the felt's rack slot with `WordPreview` above it, the
 * draft as one line of text. `WordBuilder` itself owns the draft they share — the strip's
 * order, which is the word's order — so a mode composes the two and never a copy of them:
 *
 * ```tsx
 * <WordBuilder {...window}>
 *   <GameScreen game={game} rack={<><WordPreview /><WordHand /></>} />
 * </WordBuilder>
 * ```
 *
 * The strip is the whole working surface, and that is the point: the tiles are sorted where
 * they lie and there is no second row of played tiles to spend the screen on. A tap toggles a
 * tile in or out of the word, a drag moves it through the strip, and the draft is one line —
 * the letters and what §7 makes them worth, which is all a seat needs while it is choosing.
 *
 * The controls belong to the table, not to this component: the shuffle is a button of the
 * felt's action row (`WordShuffleButton`) and the confirm is that row's own check, which locks
 * the draft in while §19's window is open. So the builder draws the draft and reports the
 * edits, and a mode decides which of its controls spends them.
 *
 * Nothing here decides whether the word is legal, or what it scores: the table's engine owns
 * both answers and hands them over as `reason` and `score` (§7, §11). This component draws the
 * draft it is given and reports the draft the seat has built — which is what makes it one
 * builder for every mode, offline or seated, rather than a copy per screen.
 *
 * Dragging is `react-native-reanimated-dnd`'s job, not this file's. Every place in the strip is
 * a `Droppable` and every tile a `Draggable`, so a drop names the place it landed on and the
 * strip is reordered from that. It is not the kit's `Sortable` because that keeps its own copy
 * of the list and cannot be told that a tile was played or taken back, while a draft is edited
 * from outside itself on every tap.
 */
export interface WordBuilderProps extends WordDraft {
  /** The seat's own tiles, in the order the deal gave them. */
  privateTiles: readonly TileData[];
  /** The board as it shows; unrevealed slots are null, and bring no tile to the strip yet. */
  community: readonly (TileData | null)[];
  /** Private server/engine quota and latest explicit lookup. */
  wordCheck?: PrivateWordCheckState;
  /** Runs the current draft through the mode's authoritative check path. */
  onCheckWord?: () => void;
  /** The draft the seat has built, as one submission: the engine judges the whole of it (§19). */
  onDraft: (plays: readonly TilePlay[]) => void;
  /**
   * Set while the seat is choosing a private tile for its power (§44): the strip's own tiles pulse
   * and a tap on one hands it here instead of playing it; the board's tiles dim and nothing drags.
   */
  onPickTile?: (tile: TileData) => void;
  /** The swap the strip turns over in place once the seat has used its power (§44). */
  swapFlip?: SwapFlip | null;
  /** The felt and the panel, in whatever places the mode draws them. */
  children: ReactNode;
}

/** What `WordHand`, `WordPreview`, and the felt's shuffle read: one draft, and the edits. */
export interface WordBuilderScope {
  readonly strip: readonly StripEntry[];
  readonly held: ReadonlyMap<string, string | undefined>;
  readonly live: boolean;
  readonly sortable: boolean;
  readonly draft: WordDraft;
  readonly wordCheck?: PrivateWordCheckState;
  readonly onCheckWord?: () => void;
  readonly canShuffle: boolean;
  readonly toggle: (entry: StripEntry, face?: string) => void;
  readonly reorder: (orderedIds: readonly string[]) => void;
  readonly shuffle: () => void;
  readonly pickTile?: (tile: TileData) => void;
  readonly swapFlip: SwapFlip | null;
}

const Scope = createContext<WordBuilderScope | null>(null);

/**
 * The draft and the edits that change it, for the parts of a screen placed outside this
 * component — the felt's action row takes the shuffle this way.
 */
export function useWordBuilderScope(): WordBuilderScope {
  const scope = useContext(Scope);
  if (scope === null) {
    throw new Error(
      "the word builder's hand and panel render inside <WordBuilder>",
    );
  }
  return scope;
}

/** The first face a tile prints: what a choice tile plays when its body is tapped (§10). */
function firstFace(tile: TileData): string | undefined {
  return "alternativeLetter" in tile ? tile.letter : undefined;
}

export function WordBuilder({
  plays,
  word,
  score,
  reason,
  confirmed,
  open,
  confirmable,
  privateTiles,
  community,
  wordCheck,
  onCheckWord,
  onDraft,
  onPickTile,
  swapFlip = null,
  children,
}: WordBuilderProps): JSX.Element {
  // The seat builds its word the whole hand, so playing and taking back tiles is live from the
  // deal until it confirms; only §19's window lets it lock the word in, so confirming is the
  // narrower gate. Sorting is looser still — the seat arranges its rack whenever it holds one.
  const live = open && !confirmed;
  const sortable = !confirmed;

  // Every physical tile the seat may play: its own first, then the board's as the streets open.
  // The board's unrevealed slots are not tiles and do not appear — the felt above already
  // counts them, and a hole in a sortable strip is a place nothing can be dropped on.
  const dealt = useMemo<readonly StripEntry[]>(
    () => [
      ...privateTiles.map((tile) => ({ tile, ownership: "private" as const })),
      ...community.flatMap((tile) =>
        tile === null ? [] : [{ tile, ownership: "community" as const }],
      ),
    ],
    [privateTiles, community],
  );

  const { strip, arrange } = useStripOrder(dealt);
  const held = useMemo(
    () => new Map(plays.map((play) => [play.tileId, play.chosenFace])),
    [plays],
  );
  const playedIds = useMemo(() => new Set(held.keys()), [held]);
  const rest = useMemo(
    () => strip.filter((entry) => !playedIds.has(entry.tile.id)),
    [strip, playedIds],
  );

  /**
   * A tap on a tile: it joins the word, leaves it, or — a choice tile tapped by one of its
   * faces — plays that letter for it.
   *
   * The tile does not move: a tap only changes whether the word holds it, and the word reads
   * the tiles it holds in the order they sit in the strip. So a joined tile takes its place in
   * the word from where it already lies, and reordering is a drag rather than a tap.
   */
  const toggle = useCallback(
    (entry: StripEntry, face?: string) => {
      const inWord = playedIds.has(entry.tile.id);
      const playing = face ?? firstFace(entry.tile);
      const play: TilePlay =
        playing === undefined
          ? { tileId: entry.tile.id }
          : { tileId: entry.tile.id, chosenFace: playing };

      if (inWord && face === undefined) {
        onDraft(
          plays.filter((candidate) => candidate.tileId !== entry.tile.id),
        );
        return;
      }

      if (inWord) {
        // The same tile playing its other face keeps the place it holds in the word.
        onDraft(
          plays.map((candidate) =>
            candidate.tileId === entry.tile.id ? play : candidate,
          ),
        );
        return;
      }

      // A newly played tile takes its place in the word from where it lies in the strip.
      onDraft(inStripOrder(strip, [...plays, play]));
    },
    [onDraft, playedIds, plays, strip],
  );

  /**
   * A drag hands back the strip's whole order after the drop; the word follows the strip, so it
   * is re-read from the new arrangement and only reported when it actually changed.
   */
  const reorder = useCallback(
    (orderedIds: readonly string[]) => {
      const byId = new Map(strip.map((entry) => [entry.tile.id, entry]));
      const next = orderedIds.flatMap((id) => {
        const entry = byId.get(id);
        return entry === undefined ? [] : [entry];
      });

      arrange(next);
      const draft = inStripOrder(next, plays);
      if (!sameDraft(draft, plays)) onDraft(draft);
    },
    [arrange, onDraft, plays, strip],
  );

  // Shuffling rearranges the tiles the word does not hold, among the places they sit: the draft
  // the seat has built is not something a shuffle should undo, so the word's tiles stay put and
  // its reading order is unchanged.
  const shuffle = useCallback(
    () => arrange(shuffleUnheld(strip, playedIds)),
    [arrange, strip, playedIds],
  );

  const scope: WordBuilderScope = {
    strip,
    held,
    live,
    sortable,
    draft: { plays, word, score, reason, confirmed, open, confirmable },
    wordCheck,
    onCheckWord,
    canShuffle: live && rest.length > 1,
    toggle,
    reorder,
    shuffle,
    pickTile: onPickTile,
    swapFlip,
  };

  return <Scope.Provider value={scope}>{children}</Scope.Provider>;
}

/**
 * The hand, for the felt's rack slot: the tiles the seat sorts and taps, where the seat's tiles
 * already are.
 */
export function WordHand(): JSX.Element {
  const { strip, held, live, sortable, toggle, reorder, pickTile, swapFlip } =
    useWordBuilderScope();

  return (
    <TileStrip
      flip={swapFlip}
      held={held}
      live={live}
      onPick={pickTile}
      onReorder={reorder}
      onToggle={toggle}
      sortable={sortable}
      strip={strip}
    />
  );
}

/**
 * The draft as the seat reads it, for the line above the rack: the letters the strip spells,
 * what §7 makes them worth, and §11's reason when the word cannot stand.
 *
 * It is text and nothing else — the tiles below are the whole working surface, and a sheet
 * drawn around one line spent the felt's room on nothing — and it draws nothing at all until
 * there is a word or a refusal to show.
 */
export function WordPreview(): JSX.Element | null {
  const { draft, wordCheck } = useWordBuilderScope();
  const tight = useCompactControls();

  const result = wordCheck?.result ?? null;
  const checkedResult =
    result !== null && sameSubmission(result.submission.plays, draft.plays)
      ? result
      : null;

  // The slot is kept while the line is empty, so the first letter played does not move the felt.
  if (draft.word.length === 0 && draft.reason === null)
    return (
      <View
        style={[styles.previewAnchor, tight && styles.previewAnchorTight]}
      />
    );

  return (
    <View style={[styles.previewAnchor, tight && styles.previewAnchorTight]}>
      <View
        style={[styles.previewRow, tight && styles.previewRowTight]}
        testID="word-preview"
      >
        <View style={styles.previewLine}>
          <View style={styles.previewContent}>
            <Text
              style={[styles.word, tight && styles.wordTight]}
              testID="word-builder-word"
            >
              {draft.word}
            </Text>
          </View>
        </View>
        <DraftLine
          checkedResult={checkedResult}
          reason={draft.reason}
          score={draft.score}
          word={draft.word}
        />
      </View>
    </View>
  );
}

/**
 * The explicit dictionary lookup, for the felt's bet row (`GameScreen`'s `bettingSlider` prop):
 * it sits beside the slider, and draws nothing in a mode without a check path.
 */
export function WordCheckButton(): JSX.Element | null {
  const { draft, wordCheck, onCheckWord } = useWordBuilderScope();

  const remaining = wordCheck?.checksRemaining ?? 0;
  const canCheck =
    onCheckWord !== undefined &&
    wordCheck !== undefined &&
    draft.open &&
    !draft.confirmed &&
    draft.word.length >= 2 &&
    draft.word.length <= 7 &&
    remaining > 0;

  // `canCheck` mirrors the adapters' own guards, so a press that gets this far spends a check:
  // the count left is known here, without waiting for the result to come back.
  const handleCheck = () => {
    onCheckWord?.();
    if (Platform.OS !== "ios") return;
    const left = remaining - 1;
    AccessibilityInfo.announceForAccessibility(
      left === 0
        ? "No checks remaining this hand."
        : `You have ${left} check${left === 1 ? "" : "s"} remaining.`,
    );
  };

  if (onCheckWord === undefined) return null;

  return (
    <GameButton
      disabled={!canCheck}
      label={`CHECK ${remaining}/${WORD_CHECKS_PER_HAND}`}
      onPress={handleCheck}
      style={{ height: 32 }}
      testID="word-check-button"
    />
  );
}

function sameSubmission(
  left: readonly TilePlay[],
  right: readonly TilePlay[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((play, index) => {
    const candidate = right[index];
    return (
      candidate?.tileId === play.tileId &&
      candidate?.chosenFace === play.chosenFace
    );
  });
}
