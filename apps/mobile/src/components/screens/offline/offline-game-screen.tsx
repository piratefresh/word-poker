import { Button, Host } from "@expo/ui";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Dictionary } from "@wordpoker/game-rules";

import { GameScreen } from "@/components/screens/game/game-screen";
import { WordBuilder } from "@/components/screens/offline/word-builder";
import { colors, palette, spacing, type } from "@/constants/theme";
import { useDictionary } from "@/lib/use-dictionary";
import { useOfflineGame } from "@/lib/use-offline-game";

/**
 * The offline table: a whole hand played on the device with the server stopped.
 *
 * The screen is a shell around `GameScreen` — the felt, the seats, the HUD, the tiles, and
 * the countdown are the shipped hand rather than a copy of it — plus the two controls this
 * slice adds: the tap that walks the round, and, once the river closes, the word builder that
 * takes its place for §19's window.
 *
 * The table holds off until the dictionary is in hand. §11 wants it on screen before play,
 * and the hand is judged against it at the payout, so a table without one is not a table yet.
 *
 * Betting is out of scope (STO-280), so the mapped state disables all three betting controls
 * and the handlers below are inert. They are wired rather than omitted because the felt keeps
 * its final shape: the controls are the ones the betting slice will arm, and a screen that
 * renders them differently here would be previewing a table that does not exist.
 */
export function OfflineGameScreen() {
  const dictionary = useDictionary();

  return (
    <View style={styles.screen}>
      {dictionary === null ? <LoadingTable /> : <OfflineTable dictionary={dictionary} />}
    </View>
  );
}

/** The felt's own colours while the word list loads: the table is coming, not missing. */
function LoadingTable() {
  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>Setting the table…</Text>
    </View>
  );
}

function OfflineTable({ dictionary }: { dictionary: Dictionary }) {
  const insets = useSafeAreaInsets();
  const { game, words, deal, advance, play, removePlay, clearDraft, confirmWord } = useOfflineGame({
    dictionary,
  });
  const payout = game.phase === "payout";
  // §19's window owns the band while it is open; the deal control takes it back at payout,
  // which is the state the reveal and the next hand are started from.
  const building = words !== null && !payout;

  return (
    <>
      <View style={styles.table}>
        <GameScreen
          game={game}
          onCheckOrCall={noBetting}
          onFold={noBetting}
          onRaise={noBetting}
        />
      </View>
      {/*
        The round's own control gets a band under the felt rather than a layer over it:
        every floating position on the felt lands on a seat, the rack, or the board, and
        the betting row that would otherwise share this space is disabled offline.
      */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.sm }]}>
        {building && words !== null ? (
          <WordBuilder
            plays={words.plays}
            word={words.word}
            privateTiles={game.privateTiles}
            community={game.community}
            reason={words.reason}
            confirmed={words.confirmed}
            dictionaryLabel={dictionary.label}
            open={words.open}
            onPlay={play}
            onRemove={removePlay}
            onClear={clearDraft}
            onConfirm={confirmWord}
          />
        ) : (
          <Host colorScheme="dark" matchContents seedColor={colors.gold} style={styles.host}>
            <Button
              label={payout ? "Deal" : "Advance"}
              onPress={payout ? deal : advance}
              variant="filled"
            />
          </Host>
        )}
      </View>
    </>
  );
}

/** Offline has no betting: the mapped state disables the controls that would call this. */
function noBetting() {}

const styles = StyleSheet.create({
  // The felt's gradient lands on `felt800`, so the band under it paints that same colour
  // and the two surfaces read as one table.
  screen: { backgroundColor: palette.felt800, flex: 1 },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  loadingText: { ...type.bodyDim },
  table: { flex: 1 },
  controls: { alignItems: "center", paddingTop: spacing.sm * 2 },
  // `@expo/ui`'s host hugs its parent's start edge by default, so the pill asks for the
  // centre itself rather than relying on the row's alignment.
  host: { alignSelf: "center" },
});
