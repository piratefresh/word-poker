import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { StyleSheet, View } from "react-native";

import {
  chapterRecord,
  bestWordToTeach,
  topWords,
  nodeStarGoals,
  nodeStars,
  recordHand,
  storyChapter,
  storyNode,
  type Dictionary,
  type RecordedHand,
} from "@wordpoker/game-rules";

import { PowerDrawReveal, PowerHeldChip, PowerUsePrompt, PowerUsedCard, swapFlipOf, usePowerTargeting } from "@/components/powers";
import { FREE_PLAY, PHASE_LABEL } from "@/components/hud";
import { GameScreen } from "@/components/screens/game/game-screen";
import { WordBuilder, WordCheckButton, WordHand, WordShuffleButton } from "@/components/word-builder";
import { randomSeed } from "@/features/offline/offline-seed";
import { useOfflineGame } from "@/features/offline/use-offline-game";
import { challengeById, storySession, storyTable } from "@/features/story/challenges";
import { bestUnusedTile, storyCoachLine } from "@/features/story/story-coach";
import { FRIENDS, KITCHEN_TABLE, type Expression, type FriendId, type MapNode } from "@/features/story/kitchen-table-map";
import { saveStoryProgress, storyProgress } from "@/features/story/story-progress";

import { StoryMeter } from "./story-meter";
import { StoryRoom } from "./story-room";
import { StorySpeech } from "./story-speech";
import { StoryVerdict, type BuiltWord } from "./story-verdict";

const CHAPTER = storyChapter("kitchen-table");

/** Which face the opponent wears: determined when betting, thinking while the player builds a word, and a smile or a wink at the end. */
function expressionAt({ status, phase, building, heroWon }: { status: string; phase: string; building: boolean; heroWon: boolean | null }): Expression {
  if (phase === "payout" && heroWon !== null) return heroWon ? "wink" : "happy";
  if (status === "bet" || status === "raise" || status === "all-in") return "determined";
  return building ? "thinking" : "neutral";
}
/** Where the coach's bubble starts down the felt: below the opponent's seat. */
const COACH_TOP = 115;

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
  const { game, words, results, powers } = offline;
  const power = usePowerTargeting({ held: powers?.held, onUse: offline.usePower });
  const flip = swapFlipOf(powers?.swap, power.discarded);
  const ownCardShowing = powers?.used.some((notice) => notice.mine) ?? false;

  // The run hears about each settled hand once: a boss replay deals a fresh one.
  const [verdict, setVerdict] = useState<RecordedHand | null>(null);
  // The word on the rack as the hand ended: a fold-out has no submitted word, but the player still built one.
  const builtRef = useRef<BuiltWord | null>(null);
  const [built, setBuilt] = useState<BuiltWord | null>(null);
  const recorded = useRef<typeof results>(null);
  useEffect(() => {
    if (results === null || recorded.current === results) return;
    recorded.current = results;
    const hero = results.seats.find((seat) => seat.isYou);
    const outcome = { won: hero?.takesPot ?? false, score: hero?.total ?? 0 };
    const next = recordHand(storyProgress(), CHAPTER.id, node.id, outcome, randomSeed());
    saveStoryProgress(next.progress);
    setBuilt(builtRef.current);
    setVerdict(next);
  }, [node.id, results]);

  const replay = () => {
    setVerdict(null);
    setBuilt(null);
    offline.newGame();
  };

  const challenge = challengeById(node.challengeId);
  const goals = nodeStarGoals(CHAPTER, storyNode(CHAPTER, node.id));
  // The coach reads the word on the rack; the authored line for the street is what it says before there is one.
  const handTiles = [...game.privateTiles, ...game.community.filter((tile) => tile !== null)];
  const wordIsReal = dictionary.isWord(words?.word ?? "");
  const builtScore = wordIsReal ? (words?.score?.total ?? null) : null;
  const builtWord = words?.word ?? "";
  const builtPlays = words?.plays;
  useEffect(() => {
    if (results !== null || builtScore === null || builtPlays === undefined) return;
    const tiles = builtPlays.flatMap((play) => handTiles.filter((tile) => tile.id === play.tileId));
    builtRef.current = { word: builtWord, score: builtScore, tiles };
    // handTiles is rebuilt each render from the same dealt tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builtPlays, builtScore, builtWord, results]);
  const coachLine = verdict?.coachHint
    ? KITCHEN_TABLE.bossHint
    : storyCoachLine({
        street: challenge?.coach[game.phase] ?? "",
        word: words?.word ?? "",
        score: words?.score?.total ?? null,
        valid: dictionary.isWord(words?.word ?? ""),
        goals,
        unused: bestUnusedTile(handTiles, words?.plays ?? []),
      });

  // What the player's own tiles could have made, for the coach to name once the hand is lost.
  const hero = results?.seats.find((seat) => seat.isYou) ?? null;
  const winner = results?.seats.find((seat) => seat.takesPot && !seat.isYou) ?? null;
  const teach = useMemo(() => {
    if (results === null) return null;
    // Ties are common (BANKS, BONKS, KNOBS): the lesson's own word where it is among the best, else the rule's pick.
    const own = new Set(game.privateTiles.map((tile) => tile.id));
    const rule = bestWordToTeach({ available: handTiles, dictionary }, own);
    if (rule === null) return null;
    const lesson = challenge?.teachWord;
    const named = lesson === undefined ? undefined : topWords({ available: handTiles, dictionary }, Number.MAX_SAFE_INTEGER).find((word) => word.word === lesson && word.score === rule.score);
    const best = named ?? rule;
    const rival = results.seats.find((seat) => !seat.isYou)?.total ?? 0;
    const beats = best.score > rival;
    return { word: best.word, score: best.score, beats, stars: beats ? nodeStars(goals.two, { won: true, score: best.score }) : 0 };
    // handTiles is rebuilt each render from the same settled hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, dictionary, goals.two, challenge?.teachWord]);
  const hands = KITCHEN_TABLE.nodes.filter((entry) => entry.kind === "hand");
  const following = hands[hands.indexOf(node) + 1];
  const into = following === undefined ? KITCHEN_TABLE.boss : `Hand ${hands.indexOf(following) + 1}`;

  // A friend with art shows it in their seat, in the face the moment calls for.
  const players = game.players.map((player) => {
    const faces = player === null ? undefined : FRIENDS[player.id as FriendId]?.faces;
    if (player === null || faces === undefined) return player;
    return { ...player, face: faces[expressionAt({ status: player.status, phase: game.phase, building: wordIsReal, heroWon: hero?.takesPot ?? null })] };
  });

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
          backdrop={<StoryRoom room={node.room} />}
          balance={FREE_PLAY}
          lesson={{ stamp: `${PHASE_LABEL[game.phase]} · ${node.title.toUpperCase()}` }}
          game={{ ...game, players }}
          onPickCommunityTile={power.tablePick}
          heroSideAccessory={
            powers === null ? null : (
              <PowerHeldChip active={power.targeting.stage !== "idle"} held={powers.held} onPress={power.toggle} />
            )
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
              {game.phase === "payout" ? null : (
                <View pointerEvents="none" style={styles.coach}>
                  <StorySpeech line={coachLine} />
                </View>
              )}
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
              footer={<StoryMeter goals={goals} score={wordIsReal ? (words?.score?.total ?? 0) : 0} />}
            />
          }
        />
      </View>
      {game.phase === "payout" && results !== null && verdict !== null ? (
        <StoryVerdict
          chapterId={CHAPTER.id}
          node={node}
          hero={hero}
          built={built}
          into={into}
          teach={teach}
          verdict={verdict}
          winner={winner}
          onReplay={replay}
          onLeave={onLeave}
        />
      ) : null}
    </WordBuilder>
  );
}

const styles = StyleSheet.create({
  table: { flex: 1, overflow: "hidden" },
  // Under the opponent's seat, clear of its avatar and its blind badges.
  coach: { left: 24, position: "absolute", right: 24, top: COACH_TOP },
});
