import { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { ArcadeDigits } from "@/components/hud/top-bar/arcade-digits";
import { colors, fonts, layout } from "@/constants/theme";

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

/**
 * The chips in the middle. A hand whose all-ins differ splits them into layers (§25); the
 * main pot is the headline and every side pot is a line under it, because each is contested
 * by a different set of seats and a single merged total would claim otherwise.
 */
export function Pot({
  amount,
  sidePots = [],
  blinds,
  tableWidth,
  tabletop = false,
  beside = false,
}: {
  amount: number;
  sidePots?: readonly number[];
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
          {`POT $${amount.toLocaleString()}`}
        </Text>
      ) : (
        <>
          <Text style={[styles.potLabel, scaled.potLabel]}>POT</Text>
          <ArcadeDigits style={scaled.potAmount} testID="pot-total">
            {`$${amount.toLocaleString()}`}
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
  return (
    <View pointerEvents="none" style={[styles.pot, scaled.pot]} testID="pot">
      {chipsBesidePot ? (
        <View style={[styles.sideBySide, { gap: 4 * scale }]}>
          {plaque}
          {bowl}
        </View>
      ) : (
        <>
          {bowl}
          {plaque}
        </>
      )}
      {sidePots.map((side, index) => (
        <Text
          key={`side-pot-${index}`}
          style={[styles.sidePotAmount, scaled.sidePotAmount]}
          testID={`side-pot-${index}`}
        >
          {`SIDE POT $${side.toLocaleString()}`}
        </Text>
      ))}
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
  sidePotAmount: { color: colors.textDim, fontFamily: fonts.mono },
});
