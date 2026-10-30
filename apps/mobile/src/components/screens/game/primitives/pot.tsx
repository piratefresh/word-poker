import { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { ArcadeDigits } from "@/components/hud/top-bar/arcade-digits";
import { colors, fonts, layout } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

import type { GamePlayer, GamePot } from "../game-types";
import { seatMetrics } from "../seat-metrics";
import { PotBowl } from "./pot-bowl";

/** How far the pot text rides up over the chip stacks, at the phone size. */
const STACK_OVERLAP = 26;
const SIDE_BOWL_SCALE = 0.82;

/** The pot's measures at the phone size, grown by the seats' factor on a larger table. */
function potStyles(scale: number, chipsBesidePot: boolean) {
  return StyleSheet.create({
    // The pot's slot is a zero-width anchor, so the block carries its own width: without one,
    // the blinds line wraps a word at a time.
    pot: { width: (chipsBesidePot ? 260 : 200) * scale },
    potLabel: { fontSize: 8 * scale, letterSpacing: 1.6 * scale },
    potAmount: { fontSize: 26 * scale, lineHeight: 30 * scale },
    blindsAmount: { fontSize: 8 * scale, letterSpacing: 1.4 * scale },
    sidePotAmount: { fontSize: 9 * scale, letterSpacing: 1 * scale },
  });
}

function usePotStyles(scale: number, chipsBesidePot: boolean) {
  return useMemo(() => potStyles(scale, chipsBesidePot), [scale, chipsBesidePot]);
}

/** Plate label by layer: `POT`, `MAIN POT` / `SIDE POT`, then `MAIN` / `SIDE 1` … from three up. */
export function potLabel(index: number, count: number): string {
  if (count === 1) return "POT";
  if (count === 2) return index === 0 ? "MAIN POT" : "SIDE POT";
  return index === 0 ? "MAIN" : `SIDE ${index}`;
}

/** The plate's amount size: 24 for one pot, 22 for two, 19 for three or four. */
function plateAmountSize(count: number): number {
  return count === 1 ? 24 : count === 2 ? 22 : 19;
}

/** Screen-reader sentence for one plate: `Side pot, 140 chips. Bree and Cam can win it.` */
export function potSentence(label: string, amount: number, names: readonly string[]): string {
  const title = label === "POT" ? "Pot" : label.charAt(0) + label.slice(1).toLowerCase();
  const who =
    names.length === 0
      ? ""
      : names.length === 1
        ? `${names[0]} can win it.`
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} can win it.`;
  return `${title}, ${amount.toLocaleString()} chips. ${who}`.trim();
}

/**
 * The chips in the middle. A hand whose all-ins differ splits them into layers (§25): one cream
 * plate per layer, each showing only its own chips and the initials of the seats that can win
 * it, because a single merged total would claim every seat is playing for all of it. `amount`
 * is every chip on the table and only sizes the bowl.
 */
export function Pot({
  amount,
  pots = [],
  players = [],
  blinds,
  tableWidth,
  tabletop = false,
  beside = false,
}: {
  amount: number;
  /** §25's layers, main pot first. */
  pots?: readonly GamePot[];
  /** Seats, to draw each plate's who-can-win discs. */
  players?: readonly (GamePlayer | null)[];
  /** §30's Blinds: the table's two forced bets, drawn under the pot it opened. */
  blinds?: { smallBlind: number; bigBlind: number };
  /** The felt's width: the pot grows with the table by the seats' own factor. Phone size without it. */
  tableWidth?: number;
  tabletop?: boolean;
  /** Landscape: the chips sit beside the plaque, the pair drawn next to the board. */
  beside?: boolean;
}) {
  const window = useWindowDimensions();
  const scale = tableWidth ? seatMetrics(tableWidth, tabletop).scale : 1;
  const chipsBesidePot =
    tabletop && (beside || Math.min(window.width, window.height) < layout.wideShortSide);
  const scaled = usePotStyles(scale, chipsBesidePot);
  const bowl = tabletop ? (
    <View
      style={[
        styles.bowl,
        !chipsBesidePot && { transform: [{ translateY: -20 * scale }] },
      ]}
      testID="pot-chips"
    >
      <PotBowl amount={amount} scale={scale * (chipsBesidePot ? SIDE_BOWL_SCALE : 1)} />
    </View>
  ) : null;
  const plates = pots.length > 0 ? pots : [{ amount, eligible: [] as string[] }];
  const headline = plates[0]?.amount ?? amount;
  const plaque = (
    <View
      style={
        tabletop
          ? [
              styles.plaque,
              {
                borderRadius: 5 * scale,
                marginTop: chipsBesidePot ? 0 : -STACK_OVERLAP * scale,
                minWidth: 110 * scale,
                paddingHorizontal: 12 * scale,
                paddingVertical: 5 * scale,
              },
            ]
          : undefined
      }
    >
      {tabletop ? (
        <Text
          style={[styles.plaqueTitle, { fontSize: 20 * scale, lineHeight: 23 * scale }]}
          testID="pot-total"
        >
          {`POT $${headline.toLocaleString()}`}
        </Text>
      ) : (
        <>
          <Text style={[styles.potLabel, scaled.potLabel]}>POT</Text>
          <ArcadeDigits style={scaled.potAmount} testID="pot-total">
            {`$${headline.toLocaleString()}`}
          </ArcadeDigits>
        </>
      )}
      {blinds ? (
        <Text
          style={[styles.blindsAmount, scaled.blindsAmount, tabletop && {
            color: "#775033",
            fontFamily: fonts.sansBlack,
            fontSize: 9 * scale,
            lineHeight: 12 * scale,
            letterSpacing: 0,
          }]}
          testID="felt-blinds"
        >
          {`BLINDS $${blinds.smallBlind.toLocaleString()} / $${blinds.bigBlind.toLocaleString()}`}
        </Text>
      ) : null}
    </View>
  );
  const plateRow = (
    <View style={[styles.plateRow, { gap: 10 * scale }]}>
      {plates.map((pot, index) => {
        const label = potLabel(index, plates.length);
        const plateId = index === 0 ? "pot-plate-main" : `side-pot-${index - 1}`;
        const winners = pot.eligible.flatMap((id) => {
          const seat = players.find((candidate) => candidate?.id === id);
          return seat ? [seat] : [];
        });
        return (
          <View
            key={`pot-${index}`}
            accessible
            accessibilityLabel={potSentence(label, pot.amount, winners.map((seat) => seat.name))}
            id={webTestID(plateId)}
            style={styles.plateColumn}
            testID={plateId}
          >
            <View
              style={[
                styles.plate,
                { borderRadius: 8 * scale, paddingHorizontal: 12 * scale, paddingTop: 5 * scale, paddingBottom: 6 * scale },
              ]}
            >
              <Text style={[styles.plateLabel, { fontSize: 9.5 * scale }]}>{label}</Text>
              <Text
                style={[
                  styles.plateAmount,
                  { fontSize: plateAmountSize(plates.length) * scale, lineHeight: (plateAmountSize(plates.length) + 3) * scale },
                ]}
                testID={index === 0 ? "pot-total" : `side-pot-amount-${index - 1}`}
              >
                {pot.amount.toLocaleString()}
              </Text>
            </View>
            {winners.length > 0 ? (
              <View style={[styles.discRow, { gap: 3 * scale, marginTop: 4 * scale }]}>
                {winners.map((seat) => (
                  <View
                    key={seat.id}
                    style={[
                      styles.disc,
                      { backgroundColor: seat.color, borderRadius: 9 * scale, height: 18 * scale, width: 18 * scale },
                    ]}
                  >
                    <Text style={[styles.discInitial, { fontSize: 10 * scale }]}>{seat.initials}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
  // Under the plate on a portrait felt; landscape reads it to the right of the chips instead.
  const blindsLine = blinds ? (
    <Text
      style={[styles.plateBlinds, { fontSize: (chipsBesidePot ? 17 : 9) * scale }, !chipsBesidePot && { marginTop: 4 * scale }]}
      numberOfLines={1}
      testID="felt-blinds"
    >
      {`BLINDS ${blinds.smallBlind.toLocaleString()} / ${blinds.bigBlind.toLocaleString()}`}
    </Text>
  ) : null;
  return (
    <View pointerEvents="none" style={[styles.pot, scaled.pot]} testID="pot">
      {tabletop ? (
        chipsBesidePot ? (
          <View style={[styles.sideBySide, { gap: 4 * scale }]}>
            {plateRow}
            {bowl}
            {blindsLine}
          </View>
        ) : (
          <>
            {bowl}
            <View style={{ marginTop: -STACK_OVERLAP * scale }}>{plateRow}</View>
          </>
        )
      ) : (
        plaque
      )}
      {tabletop && !chipsBesidePot && plates.length === 1 ? blindsLine : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Sized by `potStyles`. */
  pot: { alignItems: "center" },
  sideBySide: { alignItems: "center", flexDirection: "row", justifyContent: "center" },
  bowl: { elevation: 2, zIndex: 2 },
  plaque: { alignItems: "center", backgroundColor: "#fff0d8" },
  plaqueTitle: { color: "#3e281a", fontFamily: fonts.arcade },
  potLabel: { color: colors.textDim, fontFamily: fonts.mono },
  /** §30's Blinds, quiet under the pot: table information, not a headline. */
  blindsAmount: { color: "#fff", fontFamily: fonts.mono },
  plateRow: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  plateColumn: { alignItems: "center" },
  plate: {
    alignItems: "center",
    backgroundColor: "#fbefd6",
    elevation: 3,
    shadowColor: "#b8703a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  plateLabel: { color: "#7a5634", fontFamily: fonts.sansBlack, letterSpacing: 1 },
  plateAmount: { color: "#3a2210", fontFamily: fonts.arcade },
  plateBlinds: { color: "#fbefd6", flexShrink: 0, fontFamily: fonts.sansBlack },
  discRow: { flexDirection: "row" },
  disc: { alignItems: "center", justifyContent: "center" },
  discInitial: { color: "#14251b", fontFamily: fonts.sansBlack },
});
