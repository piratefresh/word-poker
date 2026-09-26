/**
 * featured-table.tsx — the table the room is talking about: the one card that gets the felt.
 *
 * §3's browser asks a card for a table's name, its fixed buy-in, its players of its cap, and a way
 * in, and this carries all four: the buy-in in the corner it sits in on the design, the name and
 * the opening bet under it, the seats drawn on the felt the game rooms already draw, and one gold
 * button whose words are the featured pick's own read of the seat (`featuredAction` in
 * `parlor-view.ts`). The button is the only control on the card — a card that also swallowed taps
 * would make the join ambiguous with the scroll. It carries the table's full sentence rather than
 * its own two words, so the offer sounds the same whether it is met on the card or on a row.
 *
 * The felt is `PokerTable` — the same component the online and offline rooms sit around — with the
 * library's own seat renderer: a place the listing says is taken is a seat with no face on it (the
 * lobby is not told who is sitting there, so it shows a numbered place and nothing invented), and a
 * place that is free is the OPEN seat the game rooms show. What the card does not carry is the rest
 * of what a hand holds: no pot, no word just played, no countdown. The listing does not know them.
 */

import { LinearGradient } from "expo-linear-gradient";
import { type ReactElement, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatAmount } from "@/lib/format";

import {
  DefaultSeat,
  PokerTable,
  isSupportedSeatCount,
  type SeatCount,
  type SeatData,
} from "@/components/table";
import { GoldButton } from "@/components/ui/gold-button";
import { border, colors, elevation, fonts, fontSize, radius, spacing } from "@/constants/theme";
import { spokenTable, type FeaturedTable } from "./parlor-view";

/**
 * The card's wash: gold at the top, falling into the room's dark. One-off from the design, like
 * the felt's own wood — it is the card's surface, not a token anything else in the app paints with.
 */
const WASH = ["rgba(212,175,55,0.10)", "rgba(0,0,0,0.35)"] as const;
const WASH_START = { x: 0.5, y: 0 } as const;
const WASH_END = { x: 0.5, y: 1 } as const;

/**
 * The felt's box on the card: room for the felt *and* the chrome the seats wear outside it — a
 * 320×220 felt plus an inset on every side — and capped so the table stays the size of a table on
 * a desktop window instead of becoming a room-sized oval.
 */
const FELT_HEIGHT = 270;
const FELT_MAX_WIDTH = 400;

/** Space the seats' own labels and badges need around the felt inside that box. */
const FELT_CHROME = 32;

/**
 * The felt's geometry on the card, held still: the layout is memoised on these identities inside
 * `PokerTable`, so a card that re-renders on every listing push must not hand it new ones.
 */
const FELT_LAYOUT = { potY: 0.5 };
const NO_COMMUNITY: readonly never[] = [];
const NO_COMMUNITY_SLOT = () => null;

/**
 * The places the felt draws. A listing can only carry §5's 2–6 seats, but the felt places a fixed
 * set of counts without overlap — so an untrusted listing outside it is drawn at the nearest one
 * the table supports rather than as a pile of seats, and the figure in the middle still prints the
 * table's own numbers.
 */
function seatCountFor(maxClients: number): SeatCount {
  if (isSupportedSeatCount(maxClients)) return maxClients;
  return maxClients < 2 ? 2 : 9;
}

export interface FeaturedTableCardProps {
  readonly featured: FeaturedTable;
  readonly onJoin: () => void;
  /** A join is already in the air; the card keeps its words and stops taking taps. */
  readonly joining?: boolean;
}

export function FeaturedTableCard({
  featured,
  onJoin,
  joining = false,
}: FeaturedTableCardProps): ReactElement {
  const { room, status, action } = featured;
  const inHand = status === "in-hand";

  // One place per seat the felt draws: the first `clients` of them taken, the rest the OPEN seats
  // the rooms draw. The list is as long as the table is drawn, not as long as the listing claims.
  const places = useMemo<(SeatData | null)[]>(() => {
    const seats = seatCountFor(room.maxClients);

    return Array.from({ length: seats }, (_, index) =>
      index < room.clients
        ? {
            name: `Seat ${index + 1}`,
            glyph: String(index + 1),
            color: colors.players[index % colors.players.length],
          }
        : null,
    );
  }, [room.clients, room.maxClients]);

  return (
    <View style={styles.card} testID="parlor-featured">
      <LinearGradient
        colors={WASH}
        end={WASH_END}
        start={WASH_START}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.top}>
        <View style={styles.status}>
          <View style={[styles.dot, inHand ? styles.dotLive : styles.dotOpen]} />
          <Text style={[styles.statusText, inHand ? styles.live : styles.open]}>
            {inHand ? "IN HAND" : "WAITING"}
          </Text>
        </View>

        <View style={styles.stakes}>
          <Text style={styles.stakesLabel}>BUY-IN</Text>
          <Text style={styles.buyIn}>{formatAmount(room.metadata.buyIn)}</Text>
        </View>
      </View>

      <Text numberOfLines={1} style={styles.name}>
        {room.metadata.name}
      </Text>
      <Text style={styles.terms}>{`${formatAmount(room.metadata.smallBlind)} / ${formatAmount(room.metadata.bigBlind)} BLINDS`}</Text>

      <View style={styles.felt}>
        <PokerTable
          chromeInset={FELT_CHROME}
          community={NO_COMMUNITY}
          layoutConfig={FELT_LAYOUT}
          railWidth={3}
          renderCommunity={NO_COMMUNITY_SLOT}
          renderPot={() => (
            <View style={styles.pot}>
              <Text style={styles.feltLabel}>SEATS TAKEN</Text>
              <Text style={styles.feltFigure}>
                {room.clients} / {room.maxClients}
              </Text>
            </View>
          )}
          renderSeat={(slot) => <DefaultSeat {...slot} />}
          seatCount={seatCountFor(room.maxClients)}
          seats={places}
          style={styles.table}
          testID="parlor-featured-felt"
        />
      </View>

      <GoldButton
        accessibilityLabel={spokenTable(room, featured.yours)}
        disabled={!action.enabled || joining}
        label={joining ? "TAKING YOUR SEAT…" : action.label}
        onPress={onJoin}
        testID="parlor-featured-join"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...elevation.card,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    marginHorizontal: spacing.gutter,
    overflow: "hidden",
    padding: spacing.lg,
  },
  top: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  status: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  dot: {
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  dotLive: {
    backgroundColor: colors.danger,
  },
  dotOpen: {
    backgroundColor: colors.successHi,
  },
  statusText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.6,
  },
  live: {
    color: colors.danger,
  },
  open: {
    color: colors.successHi,
  },
  stakes: {
    alignItems: "flex-end",
  },
  stakesLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.4,
  },
  buyIn: {
    color: colors.gold,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.title,
  },
  name: {
    color: colors.textBright,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h3,
    letterSpacing: -0.4,
    marginTop: spacing.sm,
  },
  terms: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.2,
    marginTop: spacing.xs,
  },
  felt: {
    paddingVertical: spacing.sm,
  },
  /**
   * The felt draws itself into this box; the card is its frame, so it brings no skin of its own.
   * The basis is the height because the component's own style is `flex: 1` — a flex item asking to
   * fill a card that has no height of its own would measure zero and draw nothing.
   */
  table: {
    alignSelf: "center",
    backgroundColor: "transparent",
    flexBasis: FELT_HEIGHT,
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: FELT_MAX_WIDTH,
    width: "100%",
  },
  /**
   * The felt centres its slots on a zero-sized anchor, so the figure has to bring its own width or
   * its text wraps at nothing.
   */
  pot: {
    alignItems: "center",
    width: 170,
  },
  feltLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.4,
  },
  feltFigure: {
    color: colors.gold,
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h3,
    letterSpacing: -0.4,
  },
});
