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
 * broadcast to reflect it. At payout the felt presents the same results surface the offline
 * table does, off the room's own reveal (STO-430). PLAY ANOTHER shows the live replay count
 * and moves just that player to I'M READY. Others keep their scores open until they choose
 * to continue too; the server waits for every remaining seat to leave results and ready up.
 * Leaving goes through the session so the seat is released,
 * then back to the lobby.
 *
 * At a Wild table (§44) the felt carries the same power surfaces as the offline table — the Power
 * Draw over the felt, the held chip beside the hero, the confirm, the "power used" card and the
 * rack's flip — fed by the adapter's `PowerView`, so none of them learns which table it is at.
 */

import { router } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { GAME_MESSAGES } from "@wordpoker/contracts";
import type { Dictionary } from "@wordpoker/game-rules";

import {
  PowerDrawReveal,
  PowerHeldChip,
  PowerUsePrompt,
  PowerUsedCard,
  swapFlipOf,
  usePowerTargeting,
} from "@/components/powers";
import { authClient } from "@/auth/client/auth-client";
import { GameScreen } from "@/components/screens/game/game-screen";
import { ResultsScreen } from "@/components/screens/results/results-screen";
import { SimpleWinResultOverlay } from "@/components/screens/results/simple-win-result-overlay";
import { useSimpleWinCelebration } from "@/components/screens/results/use-simple-win-celebration";
import { useXpResultOverlay } from "@/components/screens/results/use-xp-result-overlay";
import { XpResultOverlay } from "@/components/screens/results/xp-result-overlay";
import { GameButton } from "@/components/ui/game-button";
import {
  WordBuilder,
  WordCheckButton,
  WordHand,
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
import { useOnlineGame, type GameRoomLike } from "@/features/online/use-online-game";
import {
  useRoomConnection,
  type RoomConnectionLike,
} from "@/features/online/use-room-connection";
import { useBalanceView } from "@/lib/use-balance-view";

import { InviteSheet } from "./invite-sheet";
import { SaveProgressSheet } from "./save-progress-sheet";

export function OnlineFelt({
  room,
  roomId,
  dictionary,
  onLeave,
}: {
  room: GameRoomLike & RoomConnectionLike;
  /** The table's id, for the waiting room's invite (STO-581). */
  roomId?: string;
  dictionary: Dictionary;
  /** Release the seat and leave the table — the felt's own way out (§3). */
  onLeave: () => void;
}) {
  const {
    game,
    results,
    replay,
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
  // The header's chip is the signed-in player's Wallet (STO-562) — the one economy a real
  // online table touches. The read follows the hand: dealt, and again when it reaches payout
  // and the pot posts. STO-444's payouts replace the re-read with the real grant event.
  const balance = useBalanceView(
    game === null ? null : `${game.handId}:${game.phase === "payout" ? "paid" : "live"}`,
  );
  // The signed-out chip is the one balance control, and its tap is the way in.
  const goToSignIn = useCallback(() => router.push("/sign-in"), []);
  // §44's held power, from the chip to the confirm: the rack waits for a tile while choosing.
  const power = usePowerTargeting({ held: powers?.held, onUse: usePower });
  const choosing = power.targeting.stage === "picking";
  const flip = swapFlipOf(powers?.swap, power.discarded);
  const ownCardShowing = powers?.used.some((notice) => notice.mine) ?? false;
  const { active: celebratingWin, complete: finishWinCelebration } =
    useSimpleWinCelebration(results);
  const connection = useRoomConnection(room);
  const [inviting, setInviting] = useState(false);
  // A guest is asked once, at the first results screen, whether to keep what they played.
  const { data: session } = authClient.useSession();
  const [saveDismissed, setSaveDismissed] = useState(false);

  // One quest claim per hand (STO-525), and the XP overlay a lost showdown opens on it (STO-573):
  // `powers` is non-null only at a Wild table (`use-online-game.ts`), so it doubles as the
  // wild-table flag without a room message of its own. A mounted felt is one session.
  const xp = useXpResultOverlay(results, 0, {
    wildTable: powers !== null,
    heroUsedPower: powers?.held?.used === true,
  });

  const reconnecting = connection === "reconnecting";

  // The table has no hand to draw yet — a seat sat down but the deal is still waiting on the room.
  const body =
    game === null ? (
      <View style={styles.table} testID="online-felt-waiting" />
    ) : waiting !== null ? (
      <View style={styles.table} testID="online-felt-waiting">
        <GameScreen
          balance={balance}
          game={game}
          onBack={onLeave}
          onBalancePress={goToSignIn}
          waiting={{
            stamp: "WAITING FOR PLAYERS",
            controls: (
              <ReadyControls
                {...waiting}
                onInvite={roomId === undefined ? undefined : () => setInviting(true)}
                onReady={setReady}
              />
            ),
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
            winOverlay={
              xp.hero !== null ? (
                <XpResultOverlay hero={xp.hero} key={results?.hand} onComplete={xp.complete} report={xp.report} />
              ) : celebratingWin && results !== null ? (
                <SimpleWinResultOverlay
                  key={results.hand}
                  onComplete={finishWinCelebration}
                  snapshot={results}
                />
              ) : null
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
            game={game}
            balance={balance}
            heroSideAccessory={
              powers === null ? null : (
                <PowerHeldChip
                  active={power.targeting.stage !== "idle"}
                  held={powers.held}
                  onPress={power.toggle}
                />
              )
            }
            onAllIn={allIn}
            onBack={onLeave}
            onBalancePress={goToSignIn}
            onBet={wager}
            onCheckOrCall={primary}
            onFold={fold}
            onRaise={wager}
            rack={
              <>
                <WordHand
                  actions={
                    <>
                      <WordShuffleButton />
                      <WordCheckButton />
                    </>
                  }
                />
              </>
            }
          />
        </View>
      </WordBuilder>
    );

  const showingResults = waiting === null && results !== null && !celebratingWin && xp.hero === null;

  return (
    <View style={styles.root}>
      {body}
      {showingResults ? (
        <ResultsScreen
          onDeal={() => {
            room.send(GAME_MESSAGES.resultsSeen);
          }}
          onExit={onLeave}
          replay={replay ?? undefined}
          snapshot={results}
        />
      ) : null}
      <SaveProgressSheet
        onClose={() => setSaveDismissed(true)}
        visible={!saveDismissed && showingResults && !!session?.user.isAnonymous}
      />
      {reconnecting ? <ReconnectingBanner /> : null}
      {roomId === undefined ? null : (
        <InviteSheet onClose={() => setInviting(false)} roomId={roomId} visible={inviting} />
      )}
    </View>
  );
}

/**
 * The waiting room's action row: how many seats are ready, and the hero's own toggle. A seat that
 * said ready can take it back until the deal — the button reads as the thing a tap will do. The
 * invite lives here too: the server seats nobody mid-hand, so the waiting room is when it works.
 */
function ReadyControls({
  ready,
  seated,
  heroReady,
  onReady,
  onInvite,
}: {
  ready: number;
  seated: number;
  heroReady: boolean;
  onReady: (ready: boolean) => void;
  onInvite?: () => void;
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
        {onInvite === undefined ? null : (
          <GameButton
            label="INVITE A FRIEND"
            onPress={onInvite}
            style={styles.readyButton}
            testID="action-invite"
            variant="dark"
          />
        )}
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
  readyRow: { flexDirection: "row", gap: spacing.xs },
  readyButton: { flex: 1 },
  bannerText: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.small,
    letterSpacing: 1.4,
  },
});
