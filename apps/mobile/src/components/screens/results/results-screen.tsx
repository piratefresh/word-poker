/**
 * results-screen.tsx — the hand's payoff, over the felt it was played on.
 *
 * One screen, after every hand: the hand's number, the table with every seat still in its place
 * and the pot in the middle (STO-960), the two ways out, and a rating card. It is a scroll view
 * rather than a live surface — no timers of its own, no sockets, one frozen payload and one
 * entrance sequence (STO-379).
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
import { useState, type ReactElement } from "react";
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  colors,
  fonts,
  fontSize,
  radius,
  resultsTable,
  spacing,
} from "@/constants/theme";
import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";
import { useQuests } from "@/lib/quests/quests-provider";
import { useResultsEntrance } from "./use-results-entrance";

import { RatingCard } from "./rating-card";
import { ResultsActions } from "./results-actions";
import { ResultsHeader } from "./results-header";
import { ResultsTable } from "./results-table";
import { RiverReview, type RiverReviewProps } from "./river-review";
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
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
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
      supportedOrientations={MODAL_ORIENTATIONS}
      animationType="fade"
      onRequestClose={onExit}
      testID="results-modal"
      transparent
      visible
    >
      <View style={styles.surface}>
        <ResultsHeader hand={hand.hand} onBack={onExit} />
        <Animated.View style={[styles.body, content]}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              {
                paddingBottom: insets.bottom + spacing.huge,
                paddingLeft: Math.max(spacing.gutter, insets.left),
                paddingRight: Math.max(spacing.gutter, insets.right),
              },
            ]}
            testID="results-scroll">
            <ResultsTable clock={clock} landscape={landscape} snapshot={hand} />

            <View style={landscape ? styles.footerRow : styles.footer}>
              <Text style={[styles.summary, landscape && styles.summaryRow]} testID="results-summary">
                {hand.summary}
              </Text>
              <View style={[styles.actions, landscape && styles.actionsRow]}>
                <ResultsActions
                  clock={clock}
                  onDeal={onDeal}
                  onExit={onExit}
                  ready={ready}
                  replay={replay}
                />
              </View>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The wooden room the table stands in, opaque: the results are a surface over the live table.
  surface: { backgroundColor: resultsTable.room, flex: 1 },
  body: { flex: 1 },
  content: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    width: "100%",
  },
  footer: { flexDirection: "column-reverse", gap: spacing.sm },
  footerRow: { alignItems: "center", flexDirection: "row", gap: spacing.lg },
  summary: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.4,
  },
  summaryRow: { flex: 1 },
  actions: { alignSelf: "stretch" },
  actionsRow: { flex: 1 },
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
