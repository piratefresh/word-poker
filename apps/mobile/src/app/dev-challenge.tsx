import { Link, router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import type { Dictionary } from "@wordpoker/game-rules";

import { FREE_PLAY } from "@/components/hud";
import { GameScreen } from "@/components/screens/game/game-screen";
import { SimpleWinResultOverlay } from "@/components/screens/results/simple-win-result-overlay";
import { useSimpleWinCelebration } from "@/components/screens/results/use-simple-win-celebration";
import { GameButton } from "@/components/ui/game-button";
import { WordBuilder, WordCheckButton, WordHand, WordShuffleButton } from "@/components/word-builder";
import { border, colors, fonts, palette, radius, spacing, type } from "@/constants/theme";
import { useOfflineGame } from "@/features/offline/use-offline-game";
import { CHALLENGES, challengeById, challengeSession, starsFor, type Challenge } from "@/features/story/challenges";
import { useDictionary } from "@/features/table/use-dictionary";

/**
 * Development stage for story-mode challenges (STO-860): `/dev-challenge?id=first-hand`. The
 * offline table on the challenge's authored deal, a coach line for the street, and a result card
 * with the hero's score and stars. No id lists the challenges. Renders nothing in a release build.
 */
export default function DevChallenge() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const dictionary = useDictionary();
  if (!__DEV__) return null;

  const challenge = challengeById(id);
  if (challenge === undefined) {
    return (
      <View style={[styles.screen, styles.center]}>
        {CHALLENGES.map((entry) => (
          <Link key={entry.id} href={{ pathname: "/dev-challenge", params: { id: entry.id } }} style={styles.link}>
            {entry.title}
          </Link>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      {dictionary === null ? (
        <View style={styles.center}>
          <Text style={type.bodyDim}>Setting the table…</Text>
        </View>
      ) : (
        <ChallengeTable key={challenge.id} challenge={challenge} dictionary={dictionary} />
      )}
    </View>
  );
}

function ChallengeTable({ challenge, dictionary }: { challenge: Challenge; dictionary: Dictionary }) {
  const session = useMemo(() => challengeSession(challenge, dictionary), [challenge, dictionary]);
  const offline = useOfflineGame({ seed: 0, dictionary, session });
  const { game, words, results } = offline;
  const { active: celebratingWin, complete: finishWinCelebration } = useSimpleWinCelebration(results);
  const score = results?.seats.find((seat) => seat.isYou)?.total ?? 0;
  const stars = starsFor(challenge, score);

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
    >
      <View style={styles.table}>
        <GameScreen
          balance={FREE_PLAY}
          game={game}
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
          overFelt={
            <View pointerEvents="none" style={styles.coach}>
              <Text style={styles.coachTitle}>{challenge.title.toUpperCase()} · {challenge.goal}</Text>
              <Text style={styles.coachLine}>{challenge.coach[game.phase] ?? ""}</Text>
            </View>
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
      {game.phase === "payout" && results !== null && !celebratingWin ? (
        <Modal animationType="fade" transparent visible>
          <View style={styles.backdrop}>
            <View style={styles.card} testID="challenge-result">
              <Text style={styles.cardTitle}>{"★".repeat(stars) + "☆".repeat(3 - stars)}</Text>
              <Text style={styles.coachLine}>
                {results.seats.find((seat) => seat.isYou)?.word ?? "No word"} · {score} PTS
              </Text>
              <Text style={styles.coachTitle}>
                ★ {challenge.stars[0]} · ★★ {challenge.stars[1]} · ★★★ {challenge.stars[2]}
              </Text>
              <GameButton label="REPLAY" onPress={offline.newGame} variant="gold" />
              <GameButton label="BACK" onPress={() => router.replace("/dev-challenge")} variant="dark" />
            </View>
          </View>
        </Modal>
      ) : null}
    </WordBuilder>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.felt800, flex: 1 },
  center: { alignItems: "center", flex: 1, gap: spacing.md, justifyContent: "center" },
  link: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 20 },
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
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(2,12,9,0.78)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    gap: spacing.sm,
    maxWidth: 320,
    padding: spacing.md,
    width: "100%",
  },
  cardTitle: { color: colors.gold, fontFamily: fonts.serifBold, fontSize: 32, textAlign: "center" },
});
