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
import { StyleSheet, View } from "react-native";

import type { Dictionary } from "@wordpoker/game-rules";

import { GameScreen } from "@/components/screens/game/game-screen";
import { WordBuilder, WordHand, WordPreview, WordShuffleButton } from "@/components/word-builder";
import { palette } from "@/constants/theme";
import { useOnlineGame, type GameRoomLike } from "@/lib/use-online-game";

export function OnlineFelt({
  room,
  dictionary,
  onLeave,
}: {
  room: GameRoomLike;
  dictionary: Dictionary;
  /** Release the seat and leave the table — the felt's own way out (§3). */
  onLeave: () => void;
}) {
  const { game, words, fold, check, call, raiseTo, allIn, setDraft, confirmWord } = useOnlineGame({
    room,
    dictionary,
  });

  // §19's window turns the felt's check into the confirm; on every other turn it is the engine's
  // own check or call, whichever the row armed — the same choice the offline felt makes.
  const checkOrCall = useCallback(() => {
    if (words?.confirmable) confirmWord();
    else if (game?.betting.canCheck) check();
    else call();
  }, [call, check, confirmWord, game?.betting.canCheck, words?.confirmable]);

  // The table has no hand to draw yet — a seat sat down but the deal is still waiting on the room.
  if (game === null) return <View style={styles.table} testID="online-felt-waiting" />;

  return (
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
}

const styles = StyleSheet.create({
  table: { backgroundColor: palette.felt800, flex: 1, overflow: "hidden" },
});
