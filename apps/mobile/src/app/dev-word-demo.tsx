import { useEffect, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import type { TilePlay } from "@wordpoker/contracts";
import {
  availableTiles,
  resolveSubmission,
  scoreWord,
  spellSubmission,
  startTutorial,
  type Dictionary,
} from "@wordpoker/game-rules";

import { WordBuilder, WordHand, WordPreview } from "@/components/word-builder";
import { colors } from "@/constants/theme";
import { useDictionary } from "@/features/table/use-dictionary";

/**
 * Development stage for the lesson's "Spell your word" clip: the tutorial's own deal (W and B in
 * hand, the whole board out) on the real word builder, with nothing else on screen, so a recording
 * of the taps and the drag crops to the rack alone. Renders nothing in a release build.
 */
export default function DevWordDemo() {
  const dictionary = useDictionary();
  if (!__DEV__) return null;
  return (
    <View style={styles.screen} testID="word-demo">
      {dictionary === null ? null : <Stage dictionary={dictionary} />}
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

function Stage({ dictionary }: { dictionary: Dictionary }) {
  const deal = useMemo(() => startTutorial({ dictionary, nowMs: 0 }).state, [dictionary]);
  const hero = deal.seats[0];
  const available = availableTiles(deal, 0);
  const [plays, setPlays] = useState<readonly TilePlay[]>([]);

  const submission = { plays: [...plays] };
  const resolution = resolveSubmission({ available, submission });

  return (
    <WordBuilder
      community={deal.community}
      confirmable={false}
      confirmed={false}
      onDraft={setPlays}
      open
      plays={plays}
      privateTiles={hero?.privateTiles ?? []}
      reason={null}
      score={resolution.ok ? scoreWord(resolution.tiles) : null}
      word={spellSubmission({ available, submission })}
    >
      <View style={styles.rack} testID="word-demo-rack">
        <WordPreview />
        <WordHand />
      </View>
    </WordBuilder>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: colors.bg,
    flex: 1,
    justifyContent: "center",
  },
  rack: { paddingHorizontal: 16, paddingVertical: 12, width: "100%" },
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
