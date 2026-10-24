import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import type { PrivateWordCheckState, Tile as TileData, TilePlay } from "@wordpoker/contracts";
import {
  availableTiles,
  resolveSubmission,
  scoreWord,
  spellSubmission,
  startTutorial,
  type Dictionary,
} from "@wordpoker/game-rules";

import {
  WordBuilder,
  WordCheckButton,
  WordHand,
  WordShuffleButton,
} from "@/components/word-builder";
import { colors } from "@/constants/theme";
import { useDictionary } from "@/features/table/use-dictionary";

/**
 * Development stage for the lesson's "Spell your word" clip: the tutorial's own deal (H and L in
 * hand, the whole board out) on the real word builder, with nothing else on screen, so a recording
 * of the taps and the drag crops to the rack alone. Renders nothing in a release build.
 */
export default function DevWordDemo() {
  const dictionary = useDictionary();
  if (!__DEV__) return null;
  return (
    <View style={styles.screen} testID="word-demo">
      {dictionary === null ? null : <Stage dictionary={dictionary} showMultiTiles />}
      <Finger />
    </View>
  );
}

/**
 * A recording carries no pointer, so on the web the stage draws one: a dot where the pointer is,
 * filled while it is pressed. Nothing on a device.
 */
function Finger() {
  const [pointer, setPointer] = useState<{ x: number; y: number; down: boolean } | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const track = (down: boolean | null) => (event: PointerEvent) =>
      setPointer((last) => ({
        x: event.clientX,
        y: event.clientY,
        down: down ?? last?.down ?? false,
      }));
    const onMove = track(null);
    const onDown = track(true);
    const onUp = track(false);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, []);
  if (pointer === null) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.finger,
        pointer.down && styles.fingerDown,
        { left: pointer.x - FINGER / 2, top: pointer.y - FINGER / 2 },
      ]}
    />
  );
}

const FINGER = 34;

/** A hand with every check left, for a stage that shows the word's controls. */
const FULL_CHECKS: PrivateWordCheckState = { checksRemaining: 5, result: null };

const PRIVATE_MULTI_TILE: TileData = {
  id: "SL-1",
  letter: "S",
  points: 1,
  alternativeLetter: "L",
  alternativePoints: 2,
};
const PRIVATE_HIGH_MULTI_TILE: TileData = {
  id: "JH-1",
  letter: "J",
  points: 8,
  alternativeLetter: "H",
  alternativePoints: 5,
};

/**
 * The tutorial's deal on the real word builder. `showMultiTiles` places two choice tiles next to
 * each other and a Triple Letter tile beside them for this route's preview; the tabletop kit
 * keeps the lesson's own deal. `revealed` is how much of the board is out — 3 is the flop, 5 the
 * river — and `actions` draws Shuffle and Check Word under the rack, as the felt does.
 */
export function Stage({
  dictionary,
  revealed = 5,
  actions = false,
  flush = false,
  showMultiTiles = false,
}: {
  dictionary: Dictionary;
  revealed?: number;
  actions?: boolean;
  /** Places two adjacent choice tiles and a Triple Letter tile in the demo route. */
  showMultiTiles?: boolean;
  /** Drops the stage's side padding, so the rack has the room the felt's rack slot gives it. */
  flush?: boolean;
}) {
  const deal = useMemo(() => startTutorial({ dictionary, nowMs: 0 }).state, [dictionary]);
  const demoDeal = useMemo(() => {
    if (!showMultiTiles) return deal;
    return {
      ...deal,
      seats: deal.seats.map((seat, seatIndex) =>
        seatIndex === 0
          ? {
              ...seat,
              privateTiles: seat.privateTiles.map((tile, tileIndex) =>
                tileIndex === 0
                  ? {
                      ...PRIVATE_HIGH_MULTI_TILE,
                      ...(tile.multiplier === undefined ? {} : { multiplier: tile.multiplier }),
                    }
                  : tileIndex === 1
                    ? PRIVATE_MULTI_TILE
                    : tile,
              ),
            }
          : seat,
      ),
      community: deal.community.map((tile, tileIndex) =>
        tileIndex === 0 ? { ...tile, multiplier: "triple-letter" } : tile,
      ),
    };
  }, [deal, showMultiTiles]);
  const hero = demoDeal.seats[0];
  const available = availableTiles(demoDeal, 0);
  const [plays, setPlays] = useState<readonly TilePlay[]>([]);
  const community = useMemo(
    () => demoDeal.community.map((tile, index) => (index < revealed ? tile : null)),
    [demoDeal, revealed],
  );

  const submission = { plays: [...plays] };
  const resolution = resolveSubmission({ available, submission });

  return (
    <WordBuilder
      community={community}
      confirmable={false}
      confirmed={false}
      onCheckWord={actions ? noop : undefined}
      onDraft={setPlays}
      open
      plays={plays}
      privateTiles={hero?.privateTiles ?? []}
      reason={null}
      score={resolution.ok ? scoreWord(resolution.tiles) : null}
      word={spellSubmission({ available, submission })}
      wordCheck={actions ? FULL_CHECKS : undefined}
    >
      <View style={[styles.rack, flush && styles.rackFlush]} testID="word-demo-rack">
        <WordHand />
        {actions ? (
          <View style={styles.actions}>
            <WordShuffleButton />
            <WordCheckButton />
          </View>
        ) : null}
      </View>
    </WordBuilder>
  );
}

const noop = () => {};

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
  },
  rack: { paddingHorizontal: 16, paddingVertical: 12, width: "100%" },
  rackFlush: { paddingHorizontal: 0 },
  actions: { flexDirection: "row", gap: 12, justifyContent: "center", marginTop: 12 },
  finger: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.85)",
    borderRadius: FINGER / 2,
    borderWidth: 2,
    height: FINGER,
    position: "absolute",
    width: FINGER,
    zIndex: 10,
  },
  fingerDown: {
    backgroundColor: "rgba(255,255,255,0.45)",
    transform: [{ scale: 0.85 }],
  },
});
