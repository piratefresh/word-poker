import { Button, Host } from "@expo/ui";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Dictionary } from "@wordpoker/game-rules";

import { GameScreen } from "@/components/screens/game/game-screen";
import { WordBuilder, WordHand, WordPreview, WordShuffleButton } from "@/components/word-builder";
import { border, colors, palette, spacing, type } from "@/constants/theme";
import { useDictionary } from "@/lib/use-dictionary";
import { useOfflineGame } from "@/lib/use-offline-game";

/**
 * The offline table: a whole hand played on the device with the server stopped.
 *
 * The screen is a shell around `GameScreen` — the felt, the seats, the HUD, the tiles, and
 * the countdown are the shipped hand rather than a copy of it — plus the word builder. The
 * felt's own rack is the strip the seat sorts from the first street on, with the draft read
 * above it as one line of text, so a seat can arrange its tiles while it waits.
 *
 * The felt's action row is the whole control surface: the shuffle is the builder's, and the
 * check is the round — the tap that takes the seat's turn and rolls the street, and, once
 * §19's window is open, the confirm that locks the word in. There is no second row of
 * Advance/Confirm buttons to keep in step with it, and the band under the felt carries
 * nothing but the payout's Deal.
 *
 * The table holds off until the dictionary is in hand: the hand is judged against it, so a
 * table without one is not a table yet.
 *
 * Betting is out of scope (STO-280), so fold and the bet stay refused. The handlers are wired
 * rather than omitted because the felt keeps its final shape: the controls are the ones the
 * betting slice will arm, and a screen that renders them differently here would be previewing
 * a table that does not exist.
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
  const { game, words, deal, advance, setDraft, confirmWord } = useOfflineGame({ dictionary });
  const payout = game.phase === "payout";
  // §19's window turns the felt's check into the confirm: while the seat may still lock its
  // word in, the check is what locks it; on every earlier street it is the tap that takes the
  // seat's turn and rolls the street.
  const check = words?.confirmable ? confirmWord : advance;

  return (
    // §19's window is the felt's rack made playable: the hand the seat is dealt is the hand it
    // sorts, so the felt draws the builder's strip in the rack's own place and the band under
    // it keeps the draft. One hand, one row.
    <WordBuilder
      community={game.community}
      confirmable={words?.confirmable ?? false}
      confirmed={words?.confirmed ?? false}
      onDraft={setDraft}
      open={words?.open ?? false}
      plays={words?.plays ?? []}
      privateTiles={game.privateTiles}
      reason={words?.reason ?? null}
      score={words?.score ?? null}
      word={words?.word ?? ""}
    >
      <View style={styles.table}>
        <GameScreen
          bettingLeading={<WordShuffleButton />}
          game={game}
          onCheckOrCall={check}
          rack={
            // The draft reads above the rack it is built from: one line of text over the
            // strip, drawn by the builder and placed by the felt's own rack slot.
            <>
              <WordPreview />
              <WordHand />
            </>
          }
        />
      </View>
      {/*
        The band under the felt carries the payout's Deal and nothing else: the draft lives
        above the rack, and every control the round needs is the felt's own row — fold, check
        and the bet, with the builder's shuffle at their head.
      */}
      {payout ? (
        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Host colorScheme="dark" matchContents seedColor={colors.gold} style={styles.host}>
            <Button label="Deal" onPress={deal} variant="filled" />
          </Host>
        </View>
      ) : null}
    </WordBuilder>
  );
}

const styles = StyleSheet.create({
  // The felt's gradient lands on `felt800`, so the band under it paints that same colour
  // and the two surfaces read as one table.
  screen: { backgroundColor: palette.felt800, flex: 1 },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  loadingText: { ...type.bodyDim },
  table: { flex: 1, overflow: "hidden" },
  // §19's builder is a sheet under the felt, not a floating panel: it paints the felt's own
  // colour so nothing shows through it, and the felt above is clipped to the room it has.
  controls: {
    alignItems: "center",
    backgroundColor: palette.felt800,
    borderTopColor: colors.borderFaint,
    borderTopWidth: border.hairline,
    paddingTop: spacing.sm * 2,
  },
  // `@expo/ui`'s host hugs its parent's start edge by default, so the pill asks for the
  // centre itself rather than relying on the row's alignment.
  host: { alignSelf: "center" },
});
