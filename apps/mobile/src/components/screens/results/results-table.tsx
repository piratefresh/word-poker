/**
 * results-table.tsx — the settled hand, laid out the way it was sat (STO-960).
 *
 * You are at the bottom and everyone else keeps their side of the table, so a player can read who
 * bet what from where they sat. `MAX_SEATS` is four, so this is a plain arrangement of rows rather
 * than `PokerTable`'s ring: the seat plates are far wider than a nameplate and need the room.
 *
 * Landscape puts the side seats either side of the headline; portrait gives them a row of their own
 * above it. Seats keep their ladder order for the entrance, so the winner still lands first.
 */

import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { resultsEntrance, resultsTable, spacing } from "@/constants/theme";

import { ResultCard, type ResultCardSide } from "./result-card";
import { ResultsHeadlineView } from "./results-headline";
import type { ResultsSeat, ResultsSnapshot } from "./results-types";

export interface ResultsTableProps {
  readonly snapshot: ResultsSnapshot;
  readonly clock: SharedValue<number>;
  readonly landscape: boolean;
}

export function ResultsTable({ snapshot, clock, landscape }: ResultsTableProps): ReactElement {
  const others = snapshot.seats
    .filter((seat) => seat.seatIndex !== 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  // Clockwise from your left: one opponent faces you, two sit either side, three fill the table.
  const [left, top, right] =
    others.length === 1
      ? [undefined, others[0], undefined]
      : others.length === 2
        ? [others[0], undefined, others[1]]
        : others;
  const you = snapshot.seats.find((seat) => seat.seatIndex === 0);

  const place = (seat: ResultsSeat | undefined, side: ResultCardSide): ReactNode => {
    if (seat === undefined) return null;
    const index = snapshot.seats.indexOf(seat);
    return (
      <ResultCard
        key={seat.playerId}
        landscape={landscape}
        motion={{
          clock,
          // The winner is the ladder's first place (§20): it enters on its own beat and the
          // field follows it in, one seat after another.
          at:
            index === 0
              ? resultsEntrance.winner
              : resultsEntrance.cards + (index - 1) * resultsEntrance.cardStagger,
          winner: seat.takesPot,
        }}
        seat={seat}
        side={side}
      />
    );
  };

  const headline = <ResultsHeadlineView clock={clock} snapshot={snapshot} />;

  return (
    <LinearGradient
      colors={resultsTable.felt}
      end={{ x: 0.5, y: 1 }}
      start={{ x: 0.5, y: 0 }}
      style={styles.felt}
      testID="results-table"
    >
      <View pointerEvents="none" style={styles.stitch} />
      <View style={styles.row}>{place(top, "top")}</View>
      {landscape ? (
        <View style={styles.middle}>
          <View style={styles.side}>{place(left, "left")}</View>
          <View style={styles.centre}>{headline}</View>
          <View style={[styles.side, styles.sideEnd]}>{place(right, "right")}</View>
        </View>
      ) : (
        <>
          <View style={styles.middle}>
            <View style={styles.side}>{place(left, "left")}</View>
            <View style={[styles.side, styles.sideEnd]}>{place(right, "right")}</View>
          </View>
          {headline}
        </>
      )}
      <View style={styles.row}>{place(you, "bottom")}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  felt: {
    borderRadius: 28,
    gap: spacing.sm,
    overflow: "hidden",
    padding: spacing.md,
  },
  // The design's stitched edge, an inset dashed line round the whole felt.
  stitch: {
    borderColor: resultsTable.stitch,
    borderRadius: 20,
    borderStyle: "dashed",
    borderWidth: 1.5,
    bottom: spacing.xs,
    left: spacing.xs,
    position: "absolute",
    right: spacing.xs,
    top: spacing.xs,
  },
  row: { alignItems: "center" },
  middle: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  side: { flex: 1, minWidth: 0 },
  sideEnd: { alignItems: "flex-end" },
  centre: { flexShrink: 0, paddingHorizontal: spacing.xs },
});
