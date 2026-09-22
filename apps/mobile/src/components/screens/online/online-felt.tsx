/**
 * online-felt.tsx — the live online hand on the shipped felt.
 *
 * The online counterpart of `offline-game-screen`'s felt: the same `GameScreen`, the same word
 * builder, the same action row, driven by `use-online-game` instead of the local engine. The
 * felt never learns it is online — it renders the `GameScreenState` and `WordDraft` the adapter
 * maps off the room, and the check doubles as §19's confirm exactly as it does offline.
 *
 * Authority is the server's: every control here dispatches to the room and waits for the
 * broadcast to reflect it. There is no deal, no new-game and no results overlay yet — the room
 * deals the next hand on its own clock, and the settled-hand surface is a later story; the felt
 * shows the payout state the broadcast carries. Leaving goes through the session so the seat is
 * released, then back to the lobby.
 */

import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Dictionary } from "@wordpoker/game-rules";

import { GameScreen } from "@/components/screens/game/game-screen";
import { WordBuilder, WordHand, WordPreview, WordShuffleButton } from "@/components/word-builder";
import { colors, fonts, fontSize, palette, radius, spacing } from "@/constants/theme";
import { useOnlineGame, type GameRoomLike } from "@/lib/use-online-game";
import { useRoomConnection, type RoomConnectionLike } from "@/lib/use-room-connection";

export function OnlineFelt({
  room,
  dictionary,
  onLeave,
}: {
  room: GameRoomLike & RoomConnectionLike;
  dictionary: Dictionary;
  /** Release the seat and leave the table — the felt's own way out (§3). */
  onLeave: () => void;
}) {
  const { game, words, fold, check, call, raiseTo, allIn, setDraft, confirmWord } = useOnlineGame({
    room,
    dictionary,
  });
  const connection = useRoomConnection(room);

  // §19's window turns the felt's check into the confirm; on every other turn it is the engine's
  // own check or call, whichever the row armed — the same choice the offline felt makes.
  const checkOrCall = useCallback(() => {
    if (words?.confirmable) confirmWord();
    else if (game?.betting.canCheck) check();
    else call();
  }, [call, check, confirmWord, game?.betting.canCheck, words?.confirmable]);

  const reconnecting = connection === "reconnecting";

  // The table has no hand to draw yet — a seat sat down but the deal is still waiting on the room.
  const body =
    game === null ? (
      <View style={styles.table} testID="online-felt-waiting" />
    ) : (
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
            onBack={onLeave}
            onCheckOrCall={checkOrCall}
            onFold={fold}
            onRaise={raiseTo}
            rack={
              <>
                <WordPreview />
                <WordHand />
              </>
            }
          />
        </View>
      </WordBuilder>
    );

  return (
    <View style={styles.root}>
      {body}
      {reconnecting ? <ReconnectingBanner /> : null}
    </View>
  );
}

/**
 * The line went quiet: the SDK is retrying against the server's hold (§29, STO-397), and the seat,
 * the rack and the draft come back with it. Non-blocking — it sits over the felt and swallows no
 * taps, so the moment the socket returns the hand is right where it was left.
 */
function ReconnectingBanner() {
  return (
    <View pointerEvents="none" style={styles.banner} testID="online-reconnecting">
      <Text style={styles.bannerText}>Reconnecting…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  table: { backgroundColor: palette.felt800, flex: 1, overflow: "hidden" },
  banner: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.goldDeep,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: "absolute",
    top: spacing.xxxl,
  },
  bannerText: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.small,
    letterSpacing: 1.4,
  },
});
