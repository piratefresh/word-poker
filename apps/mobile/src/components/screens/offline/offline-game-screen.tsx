import { Button, Host } from "@expo/ui";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Dictionary } from "@wordpoker/game-rules";

import { ActionButton } from "@/components/screens/game/game-primitives";
import { GameScreen } from "@/components/screens/game/game-screen";
import type { GameScreenState } from "@/components/screens/game/game-types";
import { WordBuilder, WordHand, WordPreview, WordShuffleButton } from "@/components/word-builder";
import { border, colors, fonts, palette, radius, spacing, type } from "@/constants/theme";
import { pinnedSeed, randomSeed } from "@/lib/offline-seed";
import { useDictionary } from "@/lib/use-dictionary";
import { useOfflineGame } from "@/lib/use-offline-game";

/**
 * The offline table: a whole session played on the device with the server stopped.
 *
 * The screen is a shell around `GameScreen` — the felt, the seats, the HUD, the tiles, and
 * the countdown are the shipped hand rather than a copy of it — plus the word builder. The
 * felt's own rack is the strip the seat sorts from the first street on, with the draft read
 * above it as one line of text, so a seat can arrange its tiles while it waits.
 *
 * The felt's action row is the whole control surface: fold, check/call, the bet/raise slider
 * with the builder's shuffle at its head, and all-in with its own confirmation. The check
 * doubles as §19's confirm once the window opens — the word as it stands is locked in — so
 * there is no second row of word buttons to keep in step with it. The band under the felt
 * carries the payout's Deal and nothing else.
 *
 * A session ends: a busted hero, or fewer than two seats that can still pay (ADR 0002), gets
 * the end-of-session sheet — every seat's final stack and a New game that resets the table.
 *
 * The table holds off until the dictionary is in hand: the hand is judged against it, so a
 * table without one is not a table yet.
 *
 * The seed is the table's own: pinned by the URL when one names it (`/offline?seed=…` — how
 * the E2E flow and a bug report sit down at the hand they mean) and drawn fresh otherwise,
 * so every visit to offline play deals a hand nobody has played instead of replaying one
 * rehearsal. It is drawn once per table, because the whole session replays from it: every
 * hand after the first derives its seed from this one, and a render that drew again would
 * deal the table a second time mid-session.
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
  const params = useLocalSearchParams<{ seed?: string }>();
  // Once, on the way in: the session plays the seed this table was set with, and only the
  // URL can name a different one.
  const [seed] = useState(() => pinnedSeed(params.seed) ?? randomSeed());
  const { game, words, deal, fold, check, bet, call, raiseTo, allIn, setDraft, confirmWord, endChipFlight, sessionOver, newGame } =
    useOfflineGame({ seed, dictionary });
  const payout = game.phase === "payout";
  // §19's window turns the felt's check into the confirm: while the seat may still lock its
  // word in, the check is what locks it. On every other turn the same button is the engine's
  // own check or call, whichever the row armed.
  const checkOrCall = words?.confirmable ? confirmWord : game.betting.canCheck ? check : call;

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
          onAllIn={allIn}
          // The felt's wager control names its own action, so the engine actions line up with
          // it one to one: BET opens the round, RAISE answers it (§22).
          onBet={bet}
          onCheckOrCall={checkOrCall}
          onChipFlightEnd={endChipFlight}
          onFold={fold}
          onRaise={raiseTo}
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
        above the rack, and every control the round needs is the felt's own row — fold,
        check/call, the bet and the all-in, with the builder's shuffle at their head.
      */}
      {payout && !sessionOver ? (
        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Host colorScheme="dark" matchContents seedColor={colors.gold} style={styles.host}>
            <Button label="Deal" onPress={deal} variant="filled" />
          </Host>
        </View>
      ) : null}
      {sessionOver ? <SessionOver game={game} onNewGame={newGame} /> : null}
    </WordBuilder>
  );
}

/**
 * The session's end-state, over the felt it ended on: every seat's final Table Stack and the
 * one way out — a new session, with fresh stacks and a fresh seed (ADR 0002).
 */
function SessionOver({
  game,
  onNewGame,
}: {
  game: GameScreenState;
  onNewGame: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.overlayBackdrop}>
        <View style={[styles.overlay, { marginBottom: insets.bottom }]} testID="session-over">
          <Text style={styles.overlayTitle}>SESSION OVER</Text>
          <View style={styles.overlaySeats}>
            {game.players.map((player) =>
              player ? (
                <Text key={player.id} style={styles.overlaySeat}>
                  {`${player.name} · $${player.stack.toLocaleString()}`}
                </Text>
              ) : null,
            )}
          </View>
          <ActionButton gold label="NEW GAME" onPress={onNewGame} testID="new-game-button" />
        </View>
      </View>
    </Modal>
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
  // The session's end-state is the felt's own sheet, not an OS alert: the final stacks are
  // the table's last word, and they stay on the table.
  overlayBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(2,12,9,0.78)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  overlay: {
    alignItems: "stretch",
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    gap: spacing.sm,
    maxWidth: 320,
    padding: spacing.md,
    width: "100%",
  },
  overlayTitle: {
    color: colors.gold,
    fontFamily: fonts.serifBold,
    fontSize: 20,
    letterSpacing: 2,
    textAlign: "center",
  },
  overlaySeats: { gap: 2 },
  overlaySeat: {
    color: colors.textBright,
    fontFamily: fonts.mono,
    fontSize: 12,
    textAlign: "center",
  },
});
