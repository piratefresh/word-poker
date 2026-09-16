import { Button, Host, Row } from "@expo/ui";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Tile, type TileData, type TileSide } from "@/components/game";
import { FOUR_PLAYER_FLOP_FIXTURE } from "@/components/screens/game/game-fixtures";
import {
  EmptyTile,
  PlayerSeat,
  Pot,
} from "@/components/screens/game/game-primitives";
import { PokerTable } from "@/components/table";
import {
  border,
  colors,
  duration,
  layout,
  radius,
  spacing,
  type,
} from "@/constants/theme";

const COMMUNITY_TILES: readonly TileData[] = [
  { id: "tutorial-community-ae", letter: "A", alternativeLetter: "E", points: 1 },
  { id: "tutorial-community-n", letter: "N", points: 2 },
  { id: "tutorial-community-o", letter: "O", points: 1 },
  { id: "tutorial-community-t", letter: "T", points: 1 },
  { id: "tutorial-community-s", letter: "S", points: 1 },
];

const COMMUNITY_TILE_SIZE = 34;
const DEAL_STAGGER_MS = 130;
const SETTLE_AFTER_LAST_FLIP_MS = duration.deal + 80;

/**
 * Placeholder for the first-run lesson. The hand walkthrough and the starting
 * chip grant land here later; the real table renders now so the lesson has its
 * final surface to be written against. Static by design — the lesson narrates
 * the hand, so the demo's betting controls and timer stay off this screen.
 */
export function TutorialScreen() {
  const insets = useSafeAreaInsets();
  const [handSide, setHandSide] = useState<TileSide>("back");
  const [dealtCount, setDealtCount] = useState(0);
  const [isDealing, setIsDealing] = useState(false);
  const dealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const handIsVisible = handSide === "front";
  const phase = communityPhase(dealtCount);

  const clearDealTimers = () => {
    dealTimers.current.forEach(clearTimeout);
    dealTimers.current = [];
  };

  useEffect(
    () => () => {
      dealTimers.current.forEach(clearTimeout);
    },
    [],
  );

  const resetCommunity = () => {
    clearDealTimers();
    setIsDealing(false);
    setDealtCount(0);
  };

  const dealCommunity = () => {
    if (isDealing) return;
    if (dealtCount >= COMMUNITY_TILES.length) {
      resetCommunity();
      return;
    }

    clearDealTimers();
    setIsDealing(true);
    const target = dealtCount < 3 ? 3 : dealtCount + 1;
    const cardsToDeal = target - dealtCount;

    for (let offset = 0; offset < cardsToDeal; offset += 1) {
      const nextCount = dealtCount + offset + 1;
      const mountDelay = offset * DEAL_STAGGER_MS;
      dealTimers.current.push(
        setTimeout(() => setDealtCount(nextCount), mountDelay),
      );
    }

    const lastMountDelay = (cardsToDeal - 1) * DEAL_STAGGER_MS;
    dealTimers.current.push(
      setTimeout(() => {
        setIsDealing(false);
        dealTimers.current = [];
      }, lastMountDelay + SETTLE_AFTER_LAST_FLIP_MS),
    );
  };

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}>
      <Host
        colorScheme="dark"
        matchContents
        seedColor={colors.gold}
        style={styles.backHost}>
        <Button label="Back" onPress={leave} variant="outlined" />
      </Host>

      <View style={styles.body}>
        <Text style={[type.kicker, styles.centered]}>Tutorial</Text>
        <Text style={[type.headline, styles.centered]}>Learn the hands</Text>
        <Host colorScheme="dark" matchContents seedColor={colors.gold}>
          <Row alignment="center" spacing={spacing.sm}>
            <Button
              disabled={isDealing}
              label={communityActionLabel(dealtCount, isDealing)}
              onPress={dealCommunity}
              variant="filled"
            />
            <Button
              disabled={dealtCount === 0 && !isDealing}
              label="Reset board"
              onPress={resetCommunity}
              variant="text"
            />
          </Row>
        </Host>
      </View>

      <View style={styles.tableRegion}>
        <PokerTable
          chromeInset={42}
          community={COMMUNITY_TILES}
          hud={
            <View pointerEvents="none" style={styles.communityStatus}>
              <Text style={styles.communityStatusText}>
                {`${phase} · COMMUNITY ${dealtCount}/5`}
              </Text>
            </View>
          }
          layoutConfig={{ seatRadius: { x: 0.98, y: 0.96 }, potY: 0.5 }}
          railWidth={3}
          renderCommunity={({ anchor, card }) =>
            card && anchor.index < dealtCount ? (
              <Tile
                animation="deal"
                ownership="community"
                side="front"
                size="small"
                testID={`tutorial-community-tile-${card.id}`}
                tile={card}
              />
            ) : (
              <EmptyTile size={COMMUNITY_TILE_SIZE} />
            )
          }
          renderPot={() => <Pot amount={FOUR_PLAYER_FLOP_FIXTURE.pot} />}
          renderSeat={PlayerSeat}
          seatCount={FOUR_PLAYER_FLOP_FIXTURE.seatCount}
          seats={FOUR_PLAYER_FLOP_FIXTURE.players}
          style={styles.table}
          testID="tutorial-poker-table"
        />
      </View>

      <View accessibilityLabel="Your private hand" style={styles.handDock}>
        <View style={styles.handHeading}>
          <View>
            <Text style={styles.handKicker}>YOUR HAND</Text>
            <Text style={styles.handHint}>Private tiles only you can see</Text>
          </View>
          <Host
            colorScheme="dark"
            matchContents
            seedColor={colors.gold}
            style={styles.revealHost}>
            <Button
              label={handIsVisible ? "Hide" : "Reveal"}
              onPress={() => setHandSide(handIsVisible ? "back" : "front")}
              variant="text"
            />
          </Host>
        </View>

        <View style={styles.handTiles}>
          {FOUR_PLAYER_FLOP_FIXTURE.privateTiles.map((tile, index) => (
            <Tile
              animation="flip"
              key={tile.id}
              ownership="private"
              selected={handIsVisible && index === 0}
              side={handSide}
              size="large"
              testID={`tutorial-hand-tile-${tile.id}`}
              tile={tile}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** A deep link can land here with nothing behind it, so fall back to the picker. */
function leave() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/");
}

function communityPhase(dealtCount: number) {
  if (dealtCount >= 5) return "RIVER";
  if (dealtCount >= 4) return "TURN";
  if (dealtCount >= 1) return "FLOP";
  return "PRE-FLOP";
}

function communityActionLabel(dealtCount: number, isDealing: boolean) {
  if (isDealing) return "Dealing…";
  if (dealtCount < 3) return "Deal flop";
  if (dealtCount === 3) return "Deal turn";
  if (dealtCount === 4) return "Deal river";
  return "Replay board";
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  backHost: {
    alignSelf: "flex-start",
    marginLeft: spacing.gutter,
  },
  body: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
  },
  /* PokerTable measures itself, so the region must bound a real height. It
     spans the full width like the game screen does, so the seats sitting on
     the felt edge are never clipped by the screen gutter. */
  tableRegion: {
    flex: 1,
    minHeight: 260,
    marginBottom: -spacing.lg,
    paddingHorizontal: spacing.sm,
    width: "100%",
  },
  table: {
    backgroundColor: "transparent",
  },
  communityStatus: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: "25%",
  },
  communityStatusText: {
    ...type.kicker,
    color: colors.goldHi,
    fontSize: 8,
    letterSpacing: 1.6,
  },
  centered: {
    textAlign: "center",
  },
  handDock: {
    alignSelf: "center",
    backgroundColor: "rgba(2,10,7,0.94)",
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    flexDirection: "row",
    gap: spacing.lg,
    marginHorizontal: spacing.gutter,
    maxWidth: layout.maxContentWidth,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    width: "90%",
  },
  handHeading: {
    flex: 1,
    justifyContent: "space-between",
    minWidth: 100,
  },
  handKicker: {
    ...type.kicker,
    color: colors.goldHi,
  },
  handHint: {
    ...type.bodyDim,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xs,
  },
  handTiles: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  revealHost: {
    alignSelf: "flex-start",
  },
});
