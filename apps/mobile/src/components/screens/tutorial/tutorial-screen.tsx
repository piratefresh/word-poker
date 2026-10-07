import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import type { Dictionary } from "@wordpoker/game-rules";

import { HELPER_TOUR } from "@/components/onboarding/tours";
import { GameScreen } from "@/components/screens/game/game-screen";
import { ResultsScreen } from "@/components/screens/results/results-screen";
import { SimpleWinResultOverlay } from "@/components/screens/results/simple-win-result-overlay";
import { useSimpleWinCelebration } from "@/components/screens/results/use-simple-win-celebration";
import { CoachProvider, useCoachTour } from "@/components/ui/coach";
import {
  WordBuilder,
  WordCheckButton,
  WordHand,
  WordShuffleButton,
} from "@/components/word-builder";
import { colors, type } from "@/constants/theme";
import { useDictionary } from "@/features/table/use-dictionary";
import { useTutorialGame } from "@/features/tutorial/use-tutorial-game";

/**
 * The guided first hand (STO-251): the offline table, played to a script, with the coach pointing
 * at the real controls.
 *
 * Nothing here is a copy of the game. The felt is `GameScreen`, the rack and the draft are the
 * shared word builder, the action row is the felt's own, and the payoff is the results surface —
 * the same pieces `/offline` assembles. What the lesson adds is `useTutorialGame`: the scripted
 * deal and opponents, and a clock that stands still while the coach explains. The felt's How to
 * play still opens its tour of the controls, and holds the lesson while it is up.
 *
 * Practice chips only: the lesson touches no wallet and needs no server once the screen is open.
 */
export function TutorialScreen() {
  const dictionary = useDictionary();

  return (
    <View style={styles.screen}>
      {dictionary === null ? (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Setting the table…</Text>
        </View>
      ) : (
        <TutorialTable dictionary={dictionary} />
      )}
    </View>
  );
}

function TutorialTable({ dictionary }: { dictionary: Dictionary }) {
  const help = useCoachTour("helper", HELPER_TOUR);
  const lesson = useTutorialGame({ dictionary, paused: help.tour !== null });
  const { game, words, results } = lesson;
  const { active: celebratingWin, complete: finishWinCelebration } =
    useSimpleWinCelebration(results);

  return (
    <WordBuilder
      community={game.community}
      wordCheck={lesson.wordCheck}
      onCheckWord={lesson.checkWord}
      confirmable={words?.confirmable ?? false}
      confirmed={words?.confirmed ?? false}
      onDraft={lesson.setDraft}
      open={words?.open ?? false}
      plays={words?.plays ?? []}
      privateTiles={game.privateTiles}
      reason={words?.reason ?? null}
      score={words?.score ?? null}
      word={words?.word ?? ""}
    >
      <CoachProvider style={styles.table} tour={help.tour ?? lesson.coach}>
        <GameScreen
          actionsLocked={lesson.actionsLocked}
          clockHeld={lesson.held}
          game={game}
          winOverlay={
            celebratingWin && results !== null ? (
              <SimpleWinResultOverlay
                key={results.hand}
                onComplete={finishWinCelebration}
                snapshot={results}
              />
            ) : null
          }
          onAllIn={lesson.allIn}
          onBet={lesson.wager}
          onCheckOrCall={lesson.primary}
          onChipFlightEnd={lesson.endChipFlight}
          onFold={lesson.fold}
          onHelp={help.open}
          onRaise={lesson.wager}
          onRaiseAmountChange={lesson.changeRaise}
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
      </CoachProvider>
      {/* The lesson's payoff is the real one: the settled hand, its words and its pot. Its deal
          replays the lesson from the start (STO-510 grows this into the hand-off to practice). */}
      {game.phase === "payout" && results !== null && !celebratingWin ? (
        <ResultsScreen onDeal={lesson.restart} onExit={leave} snapshot={results} />
      ) : null}
    </WordBuilder>
  );
}

/** A deep link can land here with nothing behind it, so fall back to home. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  table: { flex: 1, overflow: "hidden" },
  loading: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    ...type.label,
  },
});
