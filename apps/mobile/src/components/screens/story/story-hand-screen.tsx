import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { POWER_UPS, type PowerUpId } from "@wordpoker/contracts";
import {
  STORY_RULES,
  chapterRecord,
  nodeThreshold,
  pickDraft,
  recordHand,
  skipDraft,
  storyChapter,
  storyNode,
  type Dictionary,
  type RecordedHand,
} from "@wordpoker/game-rules";

import { PowerCard, PowerDrawReveal, PowerHeldChip, PowerUsePrompt, PowerUsedCard, powerCardLabel, swapFlipOf, usePowerTargeting } from "@/components/powers";
import { FREE_PLAY } from "@/components/hud";
import { GameScreen } from "@/components/screens/game/game-screen";
import { SimpleWinResultOverlay } from "@/components/screens/results/simple-win-result-overlay";
import { useSimpleWinCelebration } from "@/components/screens/results/use-simple-win-celebration";
import { GameButton } from "@/components/ui/game-button";
import { WordBuilder, WordCheckButton, WordHand, WordShuffleButton } from "@/components/word-builder";
import { border, colors, fonts, palette, radius, spacing, type } from "@/constants/theme";
import { randomSeed } from "@/features/offline/offline-seed";
import { useOfflineGame } from "@/features/offline/use-offline-game";
import { challengeById, storySession, storyTable } from "@/features/story/challenges";
import { KITCHEN_TABLE, type MapNode } from "@/features/story/kitchen-table-map";
import { saveStoryProgress, storyProgress } from "@/features/story/story-progress";
import { useDictionary } from "@/features/table/use-dictionary";
import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";

const CHAPTER = storyChapter("kitchen-table");

/**
 * One story hand (STO-973): the offline table at a map node, opened on a Power Draw of the run's
 * drafted powers, then the run's verdict — the node's stars, the draft a hand opens, and a lost
 * boss hand dealt again. Every rule here is game-rules' `chapter-run.ts`; this screen plays the
 * hand and saves what the run says.
 */
export function StoryHandScreen({ node, onLeave }: { node: MapNode; onLeave: () => void }) {
  const dictionary = useDictionary();
  return (
    <View style={styles.screen}>
      {dictionary === null ? (
        <View style={styles.center}>
          <Text style={type.bodyDim}>Setting the table…</Text>
        </View>
      ) : (
        <StoryTable dictionary={dictionary} node={node} onLeave={onLeave} />
      )}
    </View>
  );
}

function StoryTable({ node, dictionary, onLeave }: { node: MapNode; dictionary: Dictionary; onLeave: () => void }) {
  // The powers the hand opens with are the run's as the hand is dealt; a boss replay keeps them.
  const [powersHeld] = useState(() => chapterRecord(storyProgress(), CHAPTER.id).powers);
  const session = useMemo(() => storySession(storyTable(node), dictionary, powersHeld), [node, dictionary, powersHeld]);
  const offline = useOfflineGame({ seed: 0, dictionary, session });
  const { game, words, results, powers } = offline;
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
  const coachLine = verdict?.coachHint ? KITCHEN_TABLE.bossHint : (challenge?.coach[game.phase] ?? "");

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
          node={node}
          threshold={threshold}
          verdict={verdict}
          word={results.seats.find((seat) => seat.isYou)?.word ?? null}
          score={results.seats.find((seat) => seat.isYou)?.total ?? 0}
          onReplay={replay}
          onLeave={onLeave}
        />
      ) : null}
    </WordBuilder>
  );
}

function StoryVerdict({
  node,
  threshold,
  verdict,
  word,
  score,
  onReplay,
  onLeave,
}: {
  node: MapNode;
  threshold: number;
  verdict: RecordedHand;
  word: string | null;
  score: number;
  onReplay: () => void;
  onLeave: () => void;
}) {
  // The draft waits in the save, so it survives leaving here; picking settles it.
  const [draft, setDraft] = useState(verdict.draft);
  const [replacing, setReplacing] = useState<PowerUpId | null>(null);
  const held = chapterRecord(storyProgress(), CHAPTER.id).powers;
  const full = held.length >= STORY_RULES.heldPowerCap;

  const pick = (id: PowerUpId) => {
    if (full && replacing === null) {
      setReplacing(id);
      return;
    }
    saveStoryProgress(pickDraft(storyProgress(), CHAPTER.id, replacing ?? id, replacing === null ? undefined : id));
    setDraft(null);
    setReplacing(null);
  };
  const skip = () => {
    saveStoryProgress(skipDraft(storyProgress(), CHAPTER.id));
    setDraft(null);
  };

  const title = verdict.bossBeaten ? `${KITCHEN_TABLE.boss.toUpperCase()} BEATEN` : verdict.replayBoss ? "NOT THIS TIME" : node.title.toUpperCase();

  return (
    <Modal supportedOrientations={MODAL_ORIENTATIONS} animationType="fade" transparent visible>
      <ScrollView contentContainerStyle={styles.backdrop}>
        <View style={styles.card} testID="story-verdict">
          <Text style={styles.kicker}>{title}</Text>
          {verdict.replayBoss ? null : (
            <Text accessibilityLabel={`${verdict.stars} of 3 stars`} style={styles.stars}>
              {"★".repeat(verdict.stars) + "☆".repeat(3 - verdict.stars)}
            </Text>
          )}
          <Text style={styles.coachLine}>{`${word ?? "No word"} · ${score} PTS`}</Text>
          <Text style={styles.coachTitle}>
            {node.kind === "boss"
              ? `Take the pot with ${threshold}+ points`
              : `★ win · ★★ ${threshold}+ · ★★★ ${Math.ceil(threshold * (1 + STORY_RULES.threeStarMargin))}+`}
          </Text>
          {verdict.coachHint ? <Text style={styles.hint}>{KITCHEN_TABLE.bossHint}</Text> : null}

          {draft !== null ? (
            <View style={styles.draft} testID="story-draft">
              <Text style={styles.kicker}>
                {replacing === null ? (full ? "PICK A POWER, THEN ONE TO SWAP OUT" : "PICK A POWER") : `SWAP OUT WHICH FOR ${POWER_UPS[replacing].title.toUpperCase()}?`}
              </Text>
              <View style={styles.offers}>
                {(replacing === null ? draft : held).map((id, index) => (
                  <Pressable
                    accessibilityLabel={powerCardLabel(id)}
                    accessibilityRole="button"
                    key={`${id}-${index}`}
                    onPress={() => pick(id)}
                    testID={`story-draft-${id}`}
                  >
                    <PowerCard id={id} width={88} />
                  </Pressable>
                ))}
              </View>
              <GameButton label={replacing === null ? "SKIP" : "KEEP MINE"} onPress={replacing === null ? skip : () => setReplacing(null)} variant="dark" />
            </View>
          ) : verdict.replayBoss ? (
            <>
              <GameButton label="PLAY AGAIN" onPress={onReplay} testID="story-replay" variant="gold" />
              <GameButton label="MAP" onPress={onLeave} variant="dark" />
            </>
          ) : (
            <GameButton label="BACK TO MAP" onPress={onLeave} testID="story-back" variant="gold" />
          )}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.felt800, flex: 1 },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  table: { flex: 1, overflow: "hidden" },
  coach: {
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
  hint: { color: colors.textBright, fontFamily: fonts.serifBold, fontSize: 15, textAlign: "center" },
  backdrop: { alignItems: "center", backgroundColor: "rgba(2,12,9,0.78)", flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  card: {
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    gap: spacing.sm,
    maxWidth: 340,
    padding: spacing.md,
    width: "100%",
  },
  kicker: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 16, textAlign: "center" },
  stars: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 32, textAlign: "center" },
  draft: { gap: spacing.sm, marginTop: spacing.sm },
  offers: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
});
