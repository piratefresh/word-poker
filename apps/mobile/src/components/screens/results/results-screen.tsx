/**
 * results-screen.tsx — the hand's payoff, over the felt it was played on.
 *
 * One screen, after every hand: the hand's number, a headline with its one gold span, the
 * pot, the two ways out, a card per seat dealt into the hand, and a rating card. It is a
 * scroll view over the felt rather than a live surface — no timers of its own, no sockets, one
 * frozen payload and one entrance sequence (STO-379).
 *
 * It is not a route. The engine lives in `useOfflineGame`, owned by the offline screen, and a
 * pushed route would need the adapter hoisted or bridged — that is STO-277's store. This is a
 * full-screen surface the offline screen presents over the felt, the `SessionOver` pattern,
 * fed by the adapter it already holds. Moving it to a route when the store lands is mechanical.
 *
 * The payload is frozen the moment it is handed over: the table can advance behind this
 * surface (a deal, a bot's beat), and nothing rendered here may follow it — a scoreboard that
 * re-rendered mid-entrance would show a hand nobody played.
 */

import { QUEST_CATALOG } from "@wordpoker/game-rules";
import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactElement } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  colors,
  fonts,
  fontSize,
  gradients,
  layout,
  radius,
  resultsEntrance,
  spacing,
} from "@/constants/theme";
import { useQuests } from "@/lib/quests/quests-provider";
import { useResultsEntrance } from "./use-results-entrance";

import { RatingCard } from "./rating-card";
import { ResultCard } from "./result-card";
import { ResultsActions } from "./results-actions";
import { ResultsHeader } from "./results-header";
import { RiverReview, type RiverReviewProps } from "./river-review";
import { ResultsHeadlineView } from "./results-headline";
import type { ResultsSnapshot } from "./results-types";

export interface ResultsScreenProps {
  /** The settled hand, mapped once by `buildResultsSnapshot`. */
  readonly snapshot: ResultsSnapshot;
  /** Leaves for the next hand (the engine's own `deal`). */
  readonly replay?: { readonly requested: number; readonly total: number };
  /** River Review (§44), for the seat that holds it: drawn under the scoreboard. */
  readonly review?: RiverReviewProps;
  readonly onDeal: () => void;
  /** Leaves the table for the home tabs — what the back control shares. */
  readonly onExit: () => void;
}

export function ResultsScreen({ snapshot, replay, review, onDeal, onExit }: ResultsScreenProps): ReactElement {
  const insets = useSafeAreaInsets();
  // Frozen here, once: the surface renders the hand it was opened on, whatever the table does
  // next (STO-380's acceptance criterion, and the reason this is a `useState` and not a prop).
  const [hand] = useState(() => snapshot);
  const { lastCompletions } = useQuests();

  const heroWon = hand.seats.some((seat) => seat.isYou && seat.takesPot);
  const { clock, fade, ready } = useResultsEntrance({ heroWon });

  const content = useAnimatedStyle(() => ({ opacity: fade.get() }));

  return (
    // `onRequestClose` is Android's hardware back: it does exactly what `Main menu` does, and
    // never backs into a hand that has already paid out (STO-383).
    <Modal
      animationType="fade"
      onRequestClose={onExit}
      testID="results-modal"
      transparent
      visible
    >
      <LinearGradient {...gradients.felt} style={styles.surface}>
        <ResultsHeader hand={hand.hand} onBack={onExit} />
        <Animated.View style={[styles.body, content]}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + spacing.huge },
            ]}
            testID="results-scroll">
            <ResultsHeadlineView clock={clock} snapshot={hand} />

            <View style={styles.actions}>
              <ResultsActions
                clock={clock}
                onDeal={onDeal}
                onExit={onExit}
                ready={ready}
                replay={replay}
              />
            </View>

            <View style={styles.boardHead}>
              <Text style={styles.boardLabel}>SCOREBOARD</Text>
              <Text style={styles.boardSummary} testID="results-summary">
                {hand.summary}
              </Text>
            </View>

            <View style={styles.cards}>
              {hand.seats.map((seat, index) => (
                <ResultCard
                  key={seat.playerId}
                  motion={{
                    clock,
                    // The winner is the ladder's first place (§20), so it enters on its own
                    // beat and the field follows it in, one card after another.
                    at:
                      index === 0
                        ? resultsEntrance.winner
                        : resultsEntrance.cards + (index - 1) * resultsEntrance.cardStagger,
                    winner: seat.takesPot,
                  }}
                  seat={seat}
                />
              ))}
            </View>

            {review === undefined ? null : <RiverReview {...review} />}

            {/* The quests this hand completed (STO-525); nothing renders when none did, so
                `.maestro/offline-hand.yaml` sees the same screen it always has. */}
            {lastCompletions.length > 0 ? (
              <View style={styles.questChips} testID="quest-completions">
                {lastCompletions.map((id) => {
                  const def = QUEST_CATALOG.find((candidate) => candidate.id === id);
                  if (def === undefined) return null;
                  return (
                    <View key={id} style={styles.questChip} testID={`quest-complete-${id}`}>
                      <Text style={styles.questChipText}>{`★ ${def.title} · +${def.reward}`}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* A rating is only worth its replay: a table that keeps its seed has no card. */}
            {hand.seed !== null ? (
              <View style={styles.rating}>
                <RatingCard handNo={hand.hand} seed={hand.seed} />
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The felt's own ramp, opaque: the results are a surface over the table, not a pane on it.
  surface: { flex: 1 },
  body: { flex: 1 },
  content: {
    // Every screen in the app is the same column width, and the results are no exception.
    alignSelf: "center",
    gap: spacing.lg,
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.xl,
    width: "100%",
  },
  actions: { marginTop: spacing.xs },
  boardHead: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  boardLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 2,
  },
  boardSummary: {
    color: colors.textFaint,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.4,
  },
  // Tight under the head they belong to: the cards are one scoreboard, not a list of screens.
  cards: { gap: spacing.md, marginTop: -spacing.xs },
  // The rating is the afterthought of the payoff: under the scoreboard, spaced off it.
  rating: { marginTop: spacing.md },
  questChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  questChip: {
    backgroundColor: colors.goldDeep,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  questChipText: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
    letterSpacing: 1,
  },
});
