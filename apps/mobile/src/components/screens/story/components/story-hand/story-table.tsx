import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { chapterRecord, nodeThreshold, recordHand, storyChapter, storyNode, type Dictionary, type RecordedHand } from "@wordpoker/game-rules";

import { PowerDrawReveal, PowerHeldChip, PowerUsePrompt, PowerUsedCard, swapFlipOf, usePowerTargeting } from "@/components/powers";
import { FREE_PLAY } from "@/components/hud";
import { GameScreen } from "@/components/screens/game/game-screen";
import { SimpleWinResultOverlay } from "@/components/screens/results/simple-win-result-overlay";
import { useSimpleWinCelebration } from "@/components/screens/results/use-simple-win-celebration";
import { WordBuilder, WordCheckButton, WordHand, WordShuffleButton } from "@/components/word-builder";
import { colors, fonts, radius, spacing } from "@/constants/theme";
import { randomSeed } from "@/features/offline/offline-seed";
import { useOfflineGame } from "@/features/offline/use-offline-game";
import { BOSS_COPY, bossCoachLine } from "@/features/story/bosses";
import { challengeById, storySession, storyTable } from "@/features/story/challenges";
import type { MapNode } from "@/features/story/kitchen-table-map";
import { saveStoryProgress, storyProgress } from "@/features/story/story-progress";

import { BossTell } from "./boss-tell";
import { StoryVerdict } from "./story-verdict";

const CHAPTER = storyChapter("kitchen-table");

export interface StoryTableProps {
  node: MapNode;
  dictionary: Dictionary;
  onLeave: () => void;
}

/** The offline table at a map node, with the node's coach line over the felt, and the run's verdict once it settles. */
export function StoryTable({ node, dictionary, onLeave }: StoryTableProps): ReactElement {
  // The powers the hand opens with are the run's as the hand is dealt; a boss replay keeps them.
  const [powersHeld] = useState(() => chapterRecord(storyProgress(), CHAPTER.id).powers);
  const session = useMemo(() => storySession(storyTable(node), dictionary, powersHeld), [node, dictionary, powersHeld]);
  const offline = useOfflineGame({ seed: 0, dictionary, session });
  const { game, words, results, powers, bossTells } = offline;
  const tell = bossTells[0];
  const { active: celebratingWin, complete: finishWinCelebration } = useSimpleWinCelebration(results);
  const power = usePowerTargeting({ held: powers?.held, onUse: offline.usePower });
  const flip = swapFlipOf(powers?.swap, power.discarded);
  const ownCardShowing = powers?.used.some((notice) => notice.mine) ?? false;

  // The run hears about each settled hand once: a boss replay deals a fresh one.
  const [verdict, setVerdict] = useState<RecordedHand | null>(null);
  const recorded = useRef<typeof results>(null);
  useEffect(() => {
    if (results === null || recorded.current === results) return;
    recorded.current = results;
    const hero = results.seats.find((seat) => seat.isYou);
    const outcome = { won: hero?.takesPot ?? false, score: hero?.total ?? 0 };
    const next = recordHand(storyProgress(), CHAPTER.id, node.id, outcome, randomSeed());
    saveStoryProgress(next.progress);
    setVerdict(next);
  }, [node.id, results]);

  const replay = () => {
    setVerdict(null);
    offline.newGame();
  };

  const challenge = challengeById(node.challengeId);
  const threshold = nodeThreshold(CHAPTER, storyNode(CHAPTER, node.id));
  const goal = node.kind === "boss" ? `Take the pot with ${threshold}+ points.` : (challenge?.goal ?? `Win the pot. ${threshold}+ points for ★★.`);
  // A boss hand opens on the coach's pointer at the tell; a second loss in a row earns the hint.
  const bossLine = tell === undefined ? "" : game.phase === "preflop" ? bossCoachLine(tell.style, tell.boss === "dealer") : "";
  const coachLine = verdict?.coachHint && tell !== undefined ? BOSS_COPY[tell.style].hint : (challenge?.coach[game.phase] ?? bossLine);

  return (
    <WordBuilder
      community={game.community}
      wordCheck={offline.wordCheck}
      onCheckWord={offline.checkWord}
      confirmable={words?.confirmable ?? false}
      confirmed={words?.confirmed ?? false}
      onDraft={offline.setDraft}
      open={words?.open ?? false}
      plays={words?.plays ?? []}
      privateTiles={game.privateTiles}
      reason={words?.reason ?? null}
      score={words?.score ?? null}
      word={words?.word ?? ""}
      onPickTile={power.ownPick}
      swapFlip={flip === null ? null : { ...flip, revealed: !ownCardShowing }}
    >
      <View style={styles.table}>
        <GameScreen
          balance={FREE_PLAY}
          game={game}
          onPickCommunityTile={power.tablePick}
          heroSideAccessory={
            powers === null ? null : (
              <PowerHeldChip active={power.targeting.stage !== "idle"} held={powers.held} onPress={power.toggle} />
            )
          }
          winOverlay={
            celebratingWin && results !== null ? (
              <SimpleWinResultOverlay key={results.hand} onComplete={finishWinCelebration} snapshot={results} />
            ) : null
          }
          onAllIn={offline.allIn}
          onBet={offline.wager}
          onCheckOrCall={offline.primary}
          onChipFlightEnd={offline.endChipFlight}
          onFold={offline.fold}
          onRaise={offline.wager}
          hidePot={powers?.draw != null}
          modal={powers === null ? null : <PowerDrawReveal draw={powers.draw} held={powers.held?.id ?? null} onPick={offline.pickPower} />}
          overFelt={
            <>
              <View pointerEvents="none" style={styles.coach} testID="story-coach">
                <Text style={styles.coachTitle}>{`${node.title.toUpperCase()} · ${goal}`}</Text>
                {coachLine === "" ? null : <Text style={styles.coachLine}>{coachLine}</Text>}
                {tell === undefined ? null : <BossTell tell={tell} />}
              </View>
              {powers === null ? null : (
                <>
                  <PowerUsePrompt onCancel={power.cancel} onConfirm={power.confirm} power={powers.held?.id ?? null} targeting={power.targeting} />
                  <PowerUsedCard notices={powers.used} onDone={offline.endPowerUsed} />
                </>
              )}
            </>
          }
          rack={
            <WordHand
              actions={
                <>
                  <WordShuffleButton />
                  <WordCheckButton />
                </>
              }
            />
          }
        />
      </View>
      {game.phase === "payout" && results !== null && verdict !== null && !celebratingWin ? (
        <StoryVerdict
          chapterId={CHAPTER.id}
          node={node}
          threshold={threshold}
          verdict={verdict}
          hint={tell === undefined ? null : BOSS_COPY[tell.style].hint}
          word={results.seats.find((seat) => seat.isYou)?.word ?? null}
          score={results.seats.find((seat) => seat.isYou)?.total ?? 0}
          onReplay={replay}
          onLeave={onLeave}
        />
      ) : null}
    </WordBuilder>
  );
}

const styles = StyleSheet.create({
  table: { flex: 1, overflow: "hidden" },
  coach: {
    gap: 4,
    backgroundColor: "rgba(2,12,9,0.78)",
    borderRadius: radius.card,
    left: spacing.md,
    padding: spacing.sm,
    position: "absolute",
    right: spacing.md,
    top: spacing.lg,
  },
  coachTitle: { color: colors.gold, fontFamily: fonts.mono, fontSize: 11, textAlign: "center" },
  coachLine: { color: colors.textBright, fontFamily: fonts.mono, fontSize: 13, textAlign: "center" },
});
