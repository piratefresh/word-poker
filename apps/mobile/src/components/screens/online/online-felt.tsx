/**
 * online-felt.tsx — the live online hand on the shipped felt.
 *
 * The online counterpart of `offline-game-screen`'s felt: the same `GameScreen`, the same word
 * builder, the same action row, driven by `use-online-game` instead of the local engine. The
 * felt never learns it is online — it renders the `GameScreenState` and `WordDraft` the adapter
 * maps off the room, and the check doubles as §19's confirm exactly as it does offline.
 *
 * Before the first deal the felt is already the table: the seats that have sat down, around an
 * empty board, with the action row holding the one thing a seat can do yet — say it is ready.
 * The room deals once every seat has (two at least), and the row turns into the betting controls.
 *
 * Authority is the server's: every control here dispatches to the room and waits for the
 * broadcast to reflect it. There is no deal and no new-game — the room deals the next hand on its
 * own clock. At payout the felt presents the same results surface the offline table does, off
 * the room's own reveal (STO-430): DEAL ANOTHER only closes it, since the deal is the room's,
 * and the next deal closes it anyway. Leaving goes through the session so the seat is released,
 * then back to the lobby.
 *
 * At a Wild table (§44) the felt carries the same power surfaces as the offline table — the Power
 * Draw over the felt, the held chip in the action row, the confirm, the "power used" card and the
 * rack's flip — fed by the adapter's `PowerView`, so none of them learns which table it is at.
 */

import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Dictionary } from "@wordpoker/game-rules";

import {
  PowerDrawReveal,
  PowerHeldChip,
  PowerUsePrompt,
  PowerUsedCard,
  swapFlipOf,
  usePowerTargeting,
} from "@/components/powers";
import { GameScreen } from "@/components/screens/game/game-screen";
import { ResultsScreen } from "@/components/screens/results/results-screen";
import { GameButton } from "@/components/ui/game-button";
import {
  WordBuilder,
  WordCheckButton,
  WordHand,
  WordPreview,
  WordShuffleButton,
} from "@/components/word-builder";
import {
  colors,
  fonts,
  fontSize,
  palette,
  radius,
  spacing,
} from "@/constants/theme";
import { useOnlineGame, type GameRoomLike } from "@/lib/use-online-game";
import {
  useRoomConnection,
  type RoomConnectionLike,
} from "@/lib/use-room-connection";

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
  const {
    game,
    results,
    words,
    wordCheck,
    waiting,
    setReady,
    fold,
    primary,
    allIn,
    wager,
    setDraft,
    checkWord,
    powers,
    pickPower,
    usePower,
    endPowerUsed,
  } = useOnlineGame({ room, dictionary });
  // §44's held power, from the chip to the confirm: the rack waits for a tile while choosing.
  const power = usePowerTargeting({ held: powers?.held, onUse: usePower });
  const choosing = power.targeting.stage === "picking";
  const flip = swapFlipOf(powers?.swap, power.discarded);
  const ownCardShowing = powers?.used.some((notice) => notice.mine) ?? false;
  // The hand whose results the seat has put away: the room keeps the payout on the felt until it
  // deals again, so a dismissed hand must not reopen on the next patch.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const connection = useRoomConnection(room);

  const reconnecting = connection === "reconnecting";

  // The table has no hand to draw yet — a seat sat down but the deal is still waiting on the room.
  const body =
    game === null ? (
      <View style={styles.table} testID="online-felt-waiting" />
    ) : waiting !== null ? (
      <View style={styles.table} testID="online-felt-waiting">
        <GameScreen
          game={game}
          onBack={onLeave}
          waiting={{
            stamp: "WAITING FOR PLAYERS",
            controls: <ReadyControls {...waiting} onReady={setReady} />,
          }}
        />
      </View>
    ) : (
      <WordBuilder
        community={game.community}
        wordCheck={wordCheck}
        onCheckWord={checkWord}
        confirmable={words?.confirmable ?? false}
        confirmed={words?.confirmed ?? false}
        onDraft={setDraft}
        open={words?.open ?? false}
        plays={words?.plays ?? []}
        privateTiles={game.privateTiles}
        reason={words?.reason ?? null}
        score={words?.score ?? null}
        word={words?.word ?? ""}
        onPickTile={choosing ? power.pick : undefined}
        // The new letter turns over once the felt's "power used" card for the hero's own use has
        // cleared (§44, Visibility): the table sees the use first, and only the hero the result.
        swapFlip={flip === null ? null : { ...flip, revealed: !ownCardShowing }}
      >
        <View style={styles.table}>
          <GameScreen
            bettingLeading={
              <>
                <WordShuffleButton />
                {powers === null ? null : (
                  <PowerHeldChip
                    active={power.targeting.stage !== "idle"}
                    held={powers.held}
                    onPress={power.toggle}
                  />
                )}
              </>
            }
            overFelt={
              powers === null ? null : (
                <>
                  <PowerDrawReveal draw={powers.draw} held={powers.held?.id ?? null} onPick={pickPower} />
                  <PowerUsePrompt
                    onCancel={power.cancel}
                    onConfirm={power.confirm}
                    power={powers.held?.id ?? null}
                    targeting={power.targeting}
                  />
                  <PowerUsedCard notices={powers.used} onDone={endPowerUsed} />
                </>
              )
            }
            bettingSlider={<WordCheckButton />}
            game={game}
            onAllIn={allIn}
            onBack={onLeave}
            onBet={wager}
            onCheckOrCall={primary}
            onFold={fold}
            onRaise={wager}
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
      {results !== null && results.hand !== dismissed ? (
        <ResultsScreen
          onDeal={() => setDismissed(results.hand)}
          onExit={onLeave}
          snapshot={results}
        />
      ) : null}
      {reconnecting ? <ReconnectingBanner /> : null}
    </View>
  );
}

/**
 * The waiting room's action row: how many seats are ready, and the hero's own toggle. A seat that
 * said ready can take it back until the deal — the button reads as the thing a tap will do.
 */
function ReadyControls({
  ready,
  seated,
  heroReady,
  onReady,
}: {
  ready: number;
  seated: number;
  heroReady: boolean;
  onReady: (ready: boolean) => void;
}) {
  const status =
    seated < 2
      ? "Waiting for another player to sit down"
      : `${ready} of ${seated} ready — the hand deals when everyone is`;
  return (
    <View style={styles.ready}>
      <Text style={styles.readyStatus} testID="online-ready-status">
        {status}
      </Text>
      <View style={styles.readyRow}>
        <GameButton
          label={heroReady ? "NOT READY" : "I'M READY"}
          onPress={() => onReady(!heroReady)}
          style={styles.readyButton}
          testID="action-ready"
          variant={heroReady ? "dark" : "gold"}
        />
      </View>
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
    <View
      pointerEvents="none"
      style={styles.banner}
      testID="online-reconnecting"
    >
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
  ready: { gap: spacing.xs, paddingTop: spacing.xs },
  readyStatus: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1,
    textAlign: "center",
  },
  readyRow: { flexDirection: "row" },
  readyButton: { flex: 1 },
  bannerText: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.small,
    letterSpacing: 1.4,
  },
});
