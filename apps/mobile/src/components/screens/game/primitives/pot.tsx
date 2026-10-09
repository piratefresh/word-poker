import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ArcadeDigits } from "@/components/hud/top-bar/arcade-digits";
import { colors, fonts } from "@/constants/theme";

import { seatMetrics } from "../seat-metrics";
import { PotBowl } from "./pot-bowl";

/** How far the pot text rides up over the chip stacks, at the phone size. */
const STACK_OVERLAP = 26;

/** The pot's measures at the phone size, grown by the seats' factor on a larger table. */
function potStyles(scale: number) {
  return StyleSheet.create({
    // The pot's slot is a zero-width anchor, so the block carries its own width: without one,
    // the blinds line wraps a word at a time.
    pot: { width: 200 * scale },
    potLabel: { fontSize: 8 * scale, letterSpacing: 1.6 * scale },
    potAmount: { fontSize: 26 * scale, lineHeight: 30 * scale },
    blindsAmount: { fontSize: 8 * scale, letterSpacing: 1.4 * scale },
    sidePotAmount: { fontSize: 9 * scale, letterSpacing: 1 * scale },
  });
}

function usePotStyles(scale: number) {
  return useMemo(() => potStyles(scale), [scale]);
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
}: {
  amount: number;
  sidePots?: readonly number[];
  /** §30's Blinds: the table's two forced bets, drawn under the pot it opened. */
  blinds?: { smallBlind: number; bigBlind: number };
  /** The felt's width: the pot grows with the table by the seats' own factor. Phone size without it. */
  tableWidth?: number;
  tabletop?: boolean;
}) {
  const scale = tableWidth ? seatMetrics(tableWidth, tabletop).scale : 1;
  const scaled = usePotStyles(scale);
  return (
    <View pointerEvents="none" style={[styles.pot, scaled.pot]} testID="pot">
      {tabletop ? <PotBowl amount={amount} scale={scale} /> : null}
      <View
        style={
          tabletop
            ? [
                {
                  // Laid over the stacks' bottom rows, on a dark pill so the digits read on any chip colour.
                  alignItems: "center",
                  backgroundColor: "rgba(20, 12, 6, 0.6)",
                  borderRadius: 24 * scale,
                  marginTop: -STACK_OVERLAP * scale,
                  minWidth: 74 * scale,
                  paddingHorizontal: 12 * scale,
                  paddingVertical: 2 * scale,
                },
              ]
            : undefined
        }
      >
        <Text
          style={[
            styles.potLabel,
            scaled.potLabel,
            tabletop && {
              color: "#fff8e9",
              fontFamily: fonts.arcade,
              fontSize: 10 * scale,
              lineHeight: 11 * scale,
              letterSpacing: 0,
            },
          ]}
        >
          POT
        </Text>
        <ArcadeDigits
          style={{
            ...scaled.potAmount,
            ...(tabletop
              ? { fontSize: 26 * scale, lineHeight: 27 * scale }
              : {}),
          }}
        >
          {`$${amount.toLocaleString()}`}
        </ArcadeDigits>
      </View>
      {blinds ? (
        <Text
          style={[styles.blindsAmount, scaled.blindsAmount]}
          testID="felt-blinds"
        >
          {`BLINDS $${blinds.smallBlind.toLocaleString()} / $${blinds.bigBlind.toLocaleString()}`}
        </Text>
      ) : null}
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
  potLabel: { color: colors.textDim, fontFamily: fonts.mono },
  /** §30's Blinds, quiet under the pot: table information, not a headline. */
  blindsAmount: { color: "#fff", fontFamily: fonts.mono },
  sidePotAmount: { color: colors.textDim, fontFamily: fonts.mono },
});
